from datetime import datetime
import re
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.logging import get_logger
from app.repositories.document_repository import document_repository
from app.schemas.document import KeywordResponse, SearchResponse, SearchResultItem
from app.services.bm25_service import bm25_service
from app.services.embedding_service import embedding_service
from app.services.keyword_extractor import keyword_extractor
from app.services.ollama_service import ollama_service
from app.services.vector_service import vector_service

logger = get_logger(__name__)

FAISS_CANDIDATE_POOL = 30
BM25_CANDIDATE_POOL = 40
KEYWORD_BOOST = 0.15
# BGE prefix removed - not compatible with embeddinggemma:300m
QUERY_PREFIX = ""


class SearchService:
    """Orchestrates Hybrid Search (BM25 + Vector) With Keyword Boosting, Query Expansion, And Cross-Encoder Reranking."""

    def _extract_query_keywords(self, query: str) -> list[str]:
        """Extracts significant keywords from short queries using a fast stopword list."""
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
    ) -> SearchResponse:
        """Runs A Full Hybrid Retrieval Pipeline: Query Expansion -> BM25 + Vector -> Keyword Boost -> Rerank -> Results."""

        logger.info(f"Received Search Request: '{query}' (Limit={limit}, StartTime={start_time}, EndTime={end_time})")

        if not query.strip():
            return SearchResponse(query=query, results=[], ai_summary="Search query cannot be empty.")

        # Record search query history for intent analytics tracking
        try:
            await document_repository.record_search_query(db, query)
            await db.commit()
        except Exception as e:
            logger.warning(f"Failed to record search query analytics: {e}")

        # 1. Query Expansion — Extract Keywords From The Query
        query_keywords: list[str] = []
        expanded_query = query

        try:
            # OPTIMIZATION: Short queries split by spaces of length <= 8 use a lightweight, instant stopword filter.
            # This completely eliminates KeyBERT model latency (saving ~150-200ms of CPU execution time).
            if len(query.split()) <= 8:
                query_keywords = self._extract_query_keywords(query)
            else:
                kw_results = keyword_extractor.extract_keywords(query, top_n=3)
                query_keywords = [kw for kw, _ in kw_results]

            if query_keywords:
                expanded_query = f"{query} {' '.join(query_keywords)}"
                logger.debug(f"Expanded Query: '{expanded_query}'")

        except Exception as e:
            logger.warning(f"Query Expansion Failed: {e}. Using Original Query.")

        # 2. Generate Query Embedding
        try:
            query_embedding = embedding_service.generate_embedding(f"{QUERY_PREFIX}{expanded_query}")

        except Exception as e:
            logger.error(f"Failed To Generate Query Embedding: {e}", exc_info=True)
            return SearchResponse(
                query=query,
                results=[],
                ai_summary="Error generating embedding for search query.",
            )

        # 3. FAISS Vector Search — Get Top Candidates
        vector_results = vector_service.search_similar(query_embedding, limit=FAISS_CANDIDATE_POOL)

        # 4. BM25 Lexical Search — Get Top Candidates
        bm25_results = bm25_service.search(expanded_query, limit=BM25_CANDIDATE_POOL)

        # 5. Keyword Search — Find Documents With Matching Stored Keywords
        keyword_docs = await document_repository.search_by_keywords(db, query_keywords, limit=25)

        # Build Keyword Boost Map
        keyword_match_ids: set[int] = {doc.id for doc in keyword_docs}

        # 6. Fetch Document IDs matching Time Window (If window is specified)
        valid_ids: Optional[set[int]] = None
        if start_time or end_time:
            valid_ids = await document_repository.get_ids_by_time_window(db, start_time, end_time)

        # 7. Merge And Score Candidates
        merged_scores: dict[int, float] = {}

        # FAISS Scores (Normalized Cosine Similarity, 0-1 Range)
        vector_scores: dict[int, float] = {}
        for doc_id, score in vector_results:
            if valid_ids is not None and doc_id not in valid_ids:
                continue
            normalized_vector_score = max(float(score), 0.0)
            vector_scores[doc_id] = normalized_vector_score
            merged_scores[doc_id] = max(merged_scores.get(doc_id, 0.0), 0.5 * normalized_vector_score)

        # BM25 Scores (Normalize To 0-1 Range Using Simple Scaling, combine linearly)
        max_bm25 = max((score for _, score in bm25_results), default=1.0)
        bm25_scores: dict[int, float] = {}
        for doc_id, score in bm25_results:
            if valid_ids is not None and doc_id not in valid_ids:
                continue
            normalized_bm25_score = score / max_bm25 if max_bm25 > 0 else 0.0
            bm25_scores[doc_id] = normalized_bm25_score
            merged_scores[doc_id] = merged_scores.get(doc_id, 0.0) + 0.5 * normalized_bm25_score

        # Keyword Boost & baseline score for direct SQLite keyword matches
        for doc_id in keyword_match_ids:
            if valid_ids is not None and doc_id not in valid_ids:
                continue
            if doc_id in merged_scores:
                # Add a strong keyword boost if already in candidates
                merged_scores[doc_id] = min(merged_scores[doc_id] + KEYWORD_BOOST, 1.5)
            else:
                # Baseline keyword score for documents matching keywords but missing from top 25 vector/BM25
                merged_scores[doc_id] = 0.3 + KEYWORD_BOOST

        if not merged_scores:
            logger.info(f"No Matches Found For: '{query}'")
            return SearchResponse(query=query, results=[], ai_summary="No matching documents found in your history.")

        # 8. Retrieve Candidate Documents From SQLite
        rerank_pool_size = max(limit * 3, 15)
        candidate_ids = sorted(merged_scores, key=merged_scores.get, reverse=True)[:rerank_pool_size]  # type: ignore[arg-type]
        documents = await document_repository.get_by_ids(db, candidate_ids)

        if not documents:
            return SearchResponse(query=query, results=[], ai_summary="No matching documents found in your history.")

        # 9. Compute Final Weighted Score For Each Document
        import math
        from datetime import timezone

        # Retrieve clicks for dynamic learning-to-rank search analytics boost
        clicks = await document_repository.get_clicks_for_query(db, query)
        click_counts: dict[int, int] = {}
        for click in clicks:
            click_counts[click.document_id] = click_counts.get(click.document_id, 0) + 1

        scored_documents: list[tuple[Document, float]] = []

        for doc in documents:
            v_score = vector_scores.get(doc.id, 0.0)
            b_score = bm25_scores.get(doc.id, 0.0)

            # Title Score (proportion of query keywords matching document title, splitting hyphens)
            title_words = set(re.findall(r"\b[a-zA-Z0-9_]+\b", (doc.title or "").replace("-", " ").lower()))
            if query_keywords:
                overlap = len(title_words.intersection(query_keywords))
                title_score = overlap / len(query_keywords)
            else:
                title_score = 1.0 if (query.lower() in (doc.title or "").lower()) else 0.0

            # Keyword Score (proportion of query keywords matching document keywords)
            doc_kw_set = {k.keyword.lower() for k in doc.keywords}
            if query_keywords:
                overlap = len(doc_kw_set.intersection(query_keywords))
                k_score = overlap / len(query_keywords)
            else:
                k_score = 0.0

            # Metadata Match Score (repo name, description, topics overlap with query keywords)
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

            # Recency Score (decay based on last visited timestamp, reduced weight)
            last_visit = max((visit.visited_at for visit in doc.visits), default=doc.created_at)
            now = datetime.now(timezone.utc) if last_visit.tzinfo else datetime.now()
            days_since_last_visit = max((now - last_visit).total_seconds() / 86400.0, 0.0)
            # 30-day half-life decay
            r_score = math.exp(-days_since_visit / 30.0) if 'days_since_visit' in locals() else math.exp(-days_since_last_visit / 30.0)

            # Source Type Score (boosting developer-oriented sources)
            s_score = 0.0
            if doc.source_type == "GitHub":
                s_score = 1.0
            elif doc.source_type in ("YouTube", "Reddit", "X"):
                s_score = 0.5

            # Weighted scoring formula with metadata match signal and rebalanced weights
            final_score = (
                0.45 * v_score +
                0.25 * b_score +
                0.10 * title_score +
                0.05 * k_score +
                0.05 * repo_name_score +
                0.02 * r_score +
                0.03 * s_score
            )
            
            # Click analytics boost (capped at +0.30 max boost)
            click_boost = min(click_counts.get(doc.id, 0) * 0.10, 0.30)
            final_score = min(final_score + click_boost, 1.0)

            # If YouTube, try to locate the matching segment timestamp
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
                        if doc.title:
                            if "(Found at" not in doc.title:
                                doc.title = f"{doc.title} (Found at {timestamp})"
                        else:
                            doc.title = f"YouTube Video (Found at {timestamp})"

            scored_documents.append((doc, final_score))

        # Sort documents by final score descending
        scored_documents.sort(key=lambda x: x[1], reverse=True)
        top_scored = scored_documents[:limit]

        # 10. Format Search Results
        results_items: list[SearchResultItem] = []
        summary_payloads: list[dict] = []

        for doc, score in top_scored:
            # Filter out completely irrelevant results (less than 15% match)
            if score < 0.15:
                logger.info(f"Filtering out irrelevant document ID {doc.id} with low score {score:.4f}")
                continue

            # Find The Most Recent Visit Timestamp
            last_visit = max((visit.visited_at for visit in doc.visits), default=doc.created_at)

            # Map Keywords
            keywords_response = [
                KeywordResponse(keyword=kw.keyword, score=kw.score)
                for kw in sorted(doc.keywords, key=lambda k: k.score, reverse=True)
            ]

            item = SearchResultItem(
                id=doc.id,
                url=doc.url,
                domain=doc.domain,
                title=doc.title,
                summary=doc.summary,
                score=score,
                published_date=doc.published_date,
                last_visited_at=last_visit,
                keywords=keywords_response,
                source_type=doc.source_type,
            )
            results_items.append(item)

            # Build Data Payloads For Collective Ollama Synthesis
            summary_payloads.append(
                {
                    "title": doc.title,
                    "url": doc.url,
                    "extracted_content": doc.extracted_content,
                }
            )

        # 11. Optional Ollama Summary Synthesis
        ai_summary: Optional[str] = None  # noqa: UP045

        if generate_summary and results_items:
            logger.info("Collective AI Synthesis Requested. Querying Local Ollama...")

            if await ollama_service.check_health():
                ai_summary = await ollama_service.generate_collective_summary(query, summary_payloads)
                logger.info("Collective AI Synthesis Complete.")

            else:
                logger.warning("Ollama Is Not Running Or Required Model Is Missing. Skipping Summary.")
                ai_summary = "Collective summary unavailable. (Local Ollama is offline or model is missing)"

        return SearchResponse(
            query=query,
            results=results_items,
            ai_summary=ai_summary,
        )


# Singleton Instance
search_service = SearchService()
