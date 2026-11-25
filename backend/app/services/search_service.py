from datetime import datetime, UTC
import re
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.api.privacy import get_preferences
from app.core.logging import get_logger
from app.models.document import Document
from app.repositories.document_repository import document_repository
from app.schemas.document import KeywordResponse, SearchResponse, SearchResultItem
from app.services.bm25_service import bm25_service
from app.services.excerpts import matching_excerpt
from app.services.embedder import embedder
from app.services.keyword_extractor import keyword_extractor
from app.services.vector_service import vector_service

logger = get_logger(__name__)

FAISS_CANDIDATE_POOL = 30
BM25_CANDIDATE_POOL = 40
KEYWORD_BOOST = 0.15


class SearchService:

    def _extract_query_keywords(self, query: str):
        STOP_WORDS = {
            "a",
            "about",
            "above",
            "after",
            "again",
            "against",
            "all",
            "am",
            "an",
            "and",
            "any",
            "are",
            "as",
            "at",
            "be",
            "because",
            "been",
            "before",
            "being",
            "below",
            "between",
            "both",
            "but",
            "by",
            "can",
            "cannot",
            "could",
            "did",
            "do",
            "does",
            "doing",
            "down",
            "during",
            "each",
            "few",
            "for",
            "from",
            "further",
            "had",
            "has",
            "have",
            "having",
            "he",
            "her",
            "here",
            "hers",
            "herself",
            "him",
            "himself",
            "his",
            "how",
            "i",
            "if",
            "in",
            "into",
            "is",
            "it",
            "its",
            "itself",
            "me",
            "more",
            "most",
            "my",
            "myself",
            "no",
            "nor",
            "not",
            "of",
            "off",
            "on",
            "once",
            "only",
            "or",
            "other",
            "our",
            "ours",
            "ourselves",
            "out",
            "over",
            "own",
            "same",
            "she",
            "should",
            "so",
            "some",
            "such",
            "than",
            "that",
            "the",
            "their",
            "theirs",
            "them",
            "themselves",
            "then",
            "there",
            "these",
            "they",
            "this",
            "those",
            "through",
            "to",
            "too",
            "under",
            "until",
            "up",
            "very",
            "was",
            "we",
            "were",
            "what",
            "when",
            "where",
            "which",
            "while",
            "who",
            "whom",
            "why",
            "with",
            "would",
            "you",
            "your",
            "yours",
            "yourself",
            "yourselves",
        }
        words = re.findall(r"\b[a-zA-Z0-9_]+\b", query.replace("-", " ").lower())
        return [w for w in words if w not in STOP_WORDS and len(w) > 2]

    async def search(
        self,
        db: AsyncSession,
        query: str,
        limit: int = 5,
        generate_summary: bool = False,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None,
    ):

        logger.info("Received search request (limit=%s)", limit)

        if not query.strip():
            return SearchResponse(query=query, results=[], ai_summary="Search query cannot be empty.")

        preferences = await get_preferences(db)
        if preferences.save_search_history:
            try:
                await document_repository.record_search_query(db, query)
                await db.commit()
            except Exception as e:
                logger.warning("Failed to record search query analytics: %s", e)
                await db.rollback()

        query_keywords: list[str] = []
        expanded_query = query
        bm25_expanded_query = query

        try:
            if len(query.split()) <= 8:
                query_keywords = self._extract_query_keywords(query)
            else:
                kw_results = await keyword_extractor.extract_keywords(query, top_n=3)
                query_keywords = [kw for kw, _ in kw_results]

            if query_keywords:
                expanded_query = f"{query} {' '.join(query_keywords)}"
                bm25_expanded_query = expanded_query
                logger.debug("Expanded search query")

        except Exception as e:
            logger.warning(f"Query Expansion Failed: {e}. Using Original Query.")

        vector_results = []
        try:
            query_embedding = embedder.embed_query(expanded_query)
            vector_results = vector_service.search_similar(query_embedding, limit=FAISS_CANDIDATE_POOL)
        except Exception as e:
            logger.warning("Semantic search unavailable; continuing with lexical search: %s", e)

        bm25_results = bm25_service.search(bm25_expanded_query, limit=BM25_CANDIDATE_POOL)

        keyword_docs = await document_repository.search_by_keywords(db, query_keywords, limit=25)

        keyword_match_ids: set[int] = {doc.id for doc in keyword_docs}

        valid_ids: Optional[set[int]] = None
        if start_time or end_time:
            valid_ids = await document_repository.get_ids_by_time_window(db, start_time, end_time)

        merged_scores: dict[int, float] = {}

        vector_scores: dict[int, float] = {}
        for doc_id, score in vector_results:
            if valid_ids is not None and doc_id not in valid_ids:
                continue
            normalized_vector_score = max(float(score), 0.0)
            vector_scores[doc_id] = normalized_vector_score
            merged_scores[doc_id] = max(merged_scores.get(doc_id, 0.0), 0.5 * normalized_vector_score)

        max_bm25 = max((score for _, score in bm25_results), default=1.0)
        bm25_scores: dict[int, float] = {}
        for doc_id, score in bm25_results:
            if valid_ids is not None and doc_id not in valid_ids:
                continue
            normalized_bm25_score = score / max_bm25 if max_bm25 > 0 else 0.0
            bm25_scores[doc_id] = normalized_bm25_score
            merged_scores[doc_id] = merged_scores.get(doc_id, 0.0) + 0.5 * normalized_bm25_score

        for doc_id in keyword_match_ids:
            if valid_ids is not None and doc_id not in valid_ids:
                continue
            if doc_id in merged_scores:
                merged_scores[doc_id] = min(merged_scores[doc_id] + KEYWORD_BOOST, 1.5)
            else:
                merged_scores[doc_id] = 0.3 + KEYWORD_BOOST

        if not merged_scores:
            logger.info("No matches found")
            return SearchResponse(query=query, results=[], ai_summary="No matching documents found in your history.")

        rerank_pool_size = max(limit * 3, 15)
        candidate_ids = sorted(merged_scores, key=merged_scores.get, reverse=True)[:rerank_pool_size]
        documents = await document_repository.get_by_ids(db, candidate_ids)

        if not documents:
            return SearchResponse(query=query, results=[], ai_summary="No matching documents found in your history.")

        import math

        clicks = await document_repository.get_clicks_for_query(db, query) if preferences.learn_from_clicks else []
        click_counts: dict[int, int] = {}
        for click in clicks:
            click_counts[click.document_id] = click_counts.get(click.document_id, 0) + 1

        scored_documents: list[tuple[Document, float, list[str], str | None]] = []

        for doc in documents:
            v_score = vector_scores.get(doc.id, 0.0)
            b_score = bm25_scores.get(doc.id, 0.0)

            title_words = set(re.findall(r"\b[a-zA-Z0-9_]+\b", (doc.title or "").replace("-", " ").lower()))
            if query_keywords:
                overlap = len(title_words.intersection(query_keywords))
                title_score = overlap / len(query_keywords)
            else:
                title_score = 1.0 if (query.lower() in (doc.title or "").lower()) else 0.0

            doc_kw_set = {k.keyword.lower() for k in doc.keywords}
            if query_keywords:
                overlap = len(doc_kw_set.intersection(query_keywords))
                k_score = overlap / len(query_keywords)
            else:
                k_score = 0.0

            repo_name_score = 0.0
            if doc.platform_metadata and query_keywords:
                meta_tokens = set()
                repo_name = doc.platform_metadata.get('repo_name', '')
                if repo_name:
                    meta_tokens.update(re.findall(r'\b[a-zA-Z0-9_]+\b', repo_name.replace('-', ' ').lower()))
                desc = doc.platform_metadata.get('description', '')
                if desc:
                    meta_tokens.update(re.findall(r'\b[a-zA-Z0-9_]+\b', desc.replace('-', ' ').lower()))
                topics = doc.platform_metadata.get('topics', [])
                if topics:
                    for t in topics:
                        meta_tokens.update(re.findall(r'\b[a-zA-Z0-9_]+\b', t.replace('-', ' ').lower()))
                if meta_tokens:
                    overlap = len(meta_tokens.intersection(set(query_keywords)))
                    repo_name_score = min(overlap / len(query_keywords), 1.0)

            last_visit = max((visit.visited_at for visit in doc.visits), default=doc.created_at)
            now = datetime.now(UTC) if last_visit.tzinfo else datetime.now()
            days_since_last_visit = max((now - last_visit).total_seconds() / 86400.0, 0.0)
            r_score = math.exp(-days_since_last_visit / 30.0)

            s_score = 0.0
            if doc.source_type == "GitHub":
                s_score = 1.0
            elif doc.source_type in ("YouTube", "Reddit", "X"):
                s_score = 0.5

            final_score = (
                0.45 * v_score +
                0.25 * b_score +
                0.10 * title_score +
                0.05 * k_score +
                0.05 * repo_name_score +
                0.02 * r_score +
                0.03 * s_score
            )

            quality_boost = getattr(doc, "quality_score", 0.0)
            final_score = final_score * (1.0 + quality_boost * 0.05)

            click_boost = min(click_counts.get(doc.id, 0) * 0.10, 0.30)
            final_score = min(final_score + click_boost, 1.0)

            display_title = doc.title
            if doc.source_type == "YouTube" and doc.extracted_content:
                content_lower = doc.extracted_content.lower()
                best_pos = -1
                search_terms = query_keywords if query_keywords else [query]
                for term in search_terms:
                    pos = content_lower.find(term.lower())
                    if pos != -1:
                        best_pos = pos
                        break

                if best_pos != -1:
                    snippet_before = doc.extracted_content[:best_pos]
                    matches = list(re.finditer(r"\[([0-9]{2,}:[0-9]{2})\]", snippet_before))
                    if matches:
                        timestamp = matches[-1].group(1)
                        if display_title:
                            if "(Found at" not in display_title:
                                display_title = f"{display_title} (Found at {timestamp})"
                        else:
                            display_title = f"YouTube Video (Found at {timestamp})"

            reasons = []
            if title_score > 0:
                reasons.append("title")
            if k_score > 0:
                reasons.append("keyword")
            if repo_name_score > 0:
                reasons.append("metadata")
            if b_score > 0:
                reasons.append("lexical")
            if v_score > 0:
                reasons.append("semantic")
            scored_documents.append((doc, final_score, reasons, display_title))

        scored_documents.sort(key=lambda x: x[1], reverse=True)
        top_scored = scored_documents[:limit]

        results_items: list[SearchResultItem] = []

        for doc, score, reasons, display_title in top_scored:
            if score < 0.15:
                logger.info(f"Filtering out irrelevant document ID {doc.id} with low score {score:.4f}")
                continue

            last_visit = max((visit.visited_at for visit in doc.visits), default=doc.created_at)

            keywords_response = [
                KeywordResponse(keyword=kw.keyword, score=kw.score)
                for kw in sorted(doc.keywords, key=lambda k: k.score, reverse=True)
            ]

            item = SearchResultItem(
                id=doc.id,
                url=doc.url,
                domain=doc.domain,
                title=display_title,
                summary=doc.summary,
                score=score,
                published_date=doc.published_date,
                last_visited_at=last_visit,
                total_dwell_time=doc.total_dwell_time,
                keywords=keywords_response,
                source_type=doc.source_type,
                match_reasons=reasons,
                excerpt=matching_excerpt(doc.extracted_content, query_keywords or [query]),
            )
            results_items.append(item)

        ai_summary: Optional[str] = None

        return SearchResponse(
            query=query,
            results=results_items,
            ai_summary=ai_summary,
        )


search_service = SearchService()
