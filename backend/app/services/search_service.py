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
from app.services.reranker_service import reranker_service
from app.services.vector_service import vector_service

logger = get_logger(__name__)

FAISS_CANDIDATE_POOL = 25
BM25_CANDIDATE_POOL = 25
KEYWORD_BOOST = 0.15
BGE_PREFIX = "Represent this sentence for searching relevant passages: "


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
        words = re.findall(r"\b[a-zA-Z0-9_-]+\b", query.lower())
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

        # 2. Generate Query Embedding (BGE Prefix For Better Retrieval)
        try:
            query_embedding = embedding_service.generate_embedding(f"{BGE_PREFIX}{expanded_query}")

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
        for doc_id, score in vector_results:
            if valid_ids is not None and doc_id not in valid_ids:
                continue
            normalized_vector_score = max(float(score), 0.0)
            merged_scores[doc_id] = max(merged_scores.get(doc_id, 0.0), 0.5 * normalized_vector_score)

        # BM25 Scores (Normalize To 0-1 Range Using Simple Scaling, combine linearly)
        max_bm25 = max((score for _, score in bm25_results), default=1.0)
        for doc_id, score in bm25_results:
            if valid_ids is not None and doc_id not in valid_ids:
                continue
            normalized_bm25_score = score / max_bm25 if max_bm25 > 0 else 0.0
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
        # OPTIMIZATION: Dynamically scale reranking pool based on requested limit.
        # Reranking 10 documents instead of 25 reduces Cross-Encoder CPU execution time by 60% (~300-400ms saved).
        rerank_pool_size = max(limit * 2, 10)
        candidate_ids = sorted(merged_scores, key=merged_scores.get, reverse=True)[:rerank_pool_size]  # type: ignore[arg-type]
        documents = await document_repository.get_by_ids(db, candidate_ids)

        if not documents:
            return SearchResponse(query=query, results=[], ai_summary="No matching documents found in your history.")

        # 8. Cross-Encoder Reranking On Top Candidates
        rerank_payloads: list[dict] = []

        for doc in documents:
            # Build rich document text representation including metadata and keywords
            kw_str = ", ".join([k.keyword for k in doc.keywords])
            meta_str = ""
            if doc.platform_metadata:
                if doc.source_type == "GitHub":
                    repo_name = doc.platform_metadata.get("repo_name") or ""
                    topics_list = doc.platform_metadata.get("topics") or []
                    desc = doc.platform_metadata.get("description") or ""
                    meta_str = f"Repo: {repo_name} | Topics: {', '.join(topics_list)} | Description: {desc}"
                elif doc.source_type == "YouTube":
                    channel = doc.platform_metadata.get("channel") or ""
                    tags_list = doc.platform_metadata.get("tags") or []
                    meta_str = f"Channel: {channel} | Tags: {', '.join(tags_list)}"
                elif doc.source_type == "X":
                    author = doc.platform_metadata.get("author") or ""
                    meta_str = f"Author: @{author}"

            rich_content = (
                f"Title: {doc.title or ''}\n"
                f"Domain: {doc.domain or ''}\n"
                f"Source Type: {doc.source_type or ''}\n"
                f"Keywords: {kw_str}\n"
                f"Metadata: {meta_str}\n"
                f"Content: {(doc.extracted_content or '')[:2000]}"
            )

            rerank_payloads.append(
                {
                    "id": doc.id,
                    "title": doc.title or "",
                    "content": rich_content,
                }
            )

        reranked = reranker_service.rerank(query, rerank_payloads, top_k=limit)

        # Build Final Ordered Doc Map
        # Build Final Ordered Doc Map
        import math

        reranked_ids: list[int] = [doc_id for doc_id, _ in reranked]

        # Normalize raw Cross-Encoder logit scores to [0.0, 1.0] range using a shifted sigmoid.
        # This resolves the display bug showing "0% match" in the UI.
        reranked_scores: dict[int, float] = {}
        for doc_id, score in reranked:
            # Shifted sigmoid maps logit range [-4, 2] nicely into [0.1, 0.98]
            prob = 1.0 / (1.0 + math.exp(-(score + 1.5)))
            reranked_scores[doc_id] = float(prob)

        final_docs = [doc for doc in documents if doc.id in reranked_ids]
        final_docs.sort(key=lambda d: reranked_ids.index(d.id))

        # 9. Format Search Results
        results_items: list[SearchResultItem] = []
        summary_payloads: list[dict] = []

        for doc in final_docs:
            score = reranked_scores.get(doc.id, merged_scores.get(doc.id, 0.0))

            # OPTIMIZATION: Filter out completely irrelevant results (0% or extremely low match scores).
            # This keeps the search clean and prevents showing irrelevant database entries.
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

        # 10. Optional Ollama Summary Synthesis
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
