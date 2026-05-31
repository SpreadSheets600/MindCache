#!/usr/bin/env python
"""Migration Script: Re-Index All Existing Documents With The New BGE Embedding Model And BM25 Index.

Usage:
    uv run python scratch/reindex.py
"""

import os
import sqlite3
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.config import settings
from app.core.logging import get_logger, setup_logging

setup_logging()
logger = get_logger("migration.reindex")


def reindex() -> None:
    """Re-Indexes All Documents With The New BGE Embedding Model And Populates BM25."""

    db_path = settings.DATABASE_URL.replace("sqlite:///", "")

    if not os.path.exists(db_path):
        logger.error(f"Database Not Found: {db_path}")
        sys.exit(1)

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row

    # 1. Fetch All Documents
    rows = conn.execute("SELECT id, url, domain, title, extracted_content, source_type, platform_metadata FROM documents").fetchall()
    logger.info(f"Found {len(rows)} Documents To Re-Index.")

    if not rows:
        logger.info("No Documents Found. Nothing To Migrate.")
        conn.close()
        return

    # 2. Fetch Keywords For Each Document
    doc_keywords: dict[int, list[str]] = {}

    for row in rows:
        kw_rows = conn.execute("SELECT keyword FROM keywords WHERE document_id = ? ORDER BY score DESC", (row["id"],)).fetchall()
        doc_keywords[row["id"]] = [kw["keyword"] for kw in kw_rows]

    conn.close()

    # 3. Wipe Old Indices
    logger.info("Wiping Old FAISS And BM25 Indices...")

    if os.path.exists(settings.FAISS_INDEX_PATH):
        os.remove(settings.FAISS_INDEX_PATH)
        logger.info("Old FAISS Index Deleted.")

    from app.services.bm25_service import BM25_INDEX_PATH

    if os.path.exists(BM25_INDEX_PATH):
        os.remove(BM25_INDEX_PATH)
        logger.info("Old BM25 Index Deleted.")

    # 4. Initialize Embedding Service (uses Ollama)
    from app.services.embedding_service import embedding_service

    logger.info(f"Embedding Service Ready (Model: {settings.EMBEDDING_MODEL_NAME}).")

    # 5. Initialize FAISS Index
    import faiss
    import numpy as np

    dimension = embedding_service.get_dimension()
    logger.info(f"Embedding Dimension: {dimension}")
    flat_index = faiss.IndexFlatIP(dimension)
    faiss_index = faiss.IndexIDMap(flat_index)

    # 6. Re-Index All Documents
    import json
    from app.services.bm25_service import bm25_service

    bm25_service._doc_ids = []
    bm25_service._corpus = []

    for i, row in enumerate(rows, 1):
        doc_id = row["id"]
        title = row["title"] or ""
        content = row["extracted_content"]
        domain = row["domain"]
        source_type = row["source_type"]
        kw_list = doc_keywords.get(doc_id, [])

        # Parse platform_metadata from JSON
        platform_metadata = None
        raw_meta = row["platform_metadata"]
        if raw_meta:
            try:
                platform_metadata = json.loads(raw_meta) if isinstance(raw_meta, str) else raw_meta
            except (json.JSONDecodeError, TypeError):
                platform_metadata = None

        # Chunk the content up to a high limit (e.g. 40,000 characters)
        content_to_chunk = content[:40000]
        chunk_size = 3000
        overlap = 500
        chunks = []
        if len(content_to_chunk) <= chunk_size:
            chunks = [content_to_chunk]
        else:
            start = 0
            while start < len(content_to_chunk):
                end = start + chunk_size
                chunks.append(content_to_chunk[start:end])
                if end >= len(content_to_chunk):
                    break
                start += chunk_size - overlap

        chunk_texts = []
        for j, chunk in enumerate(chunks):
            chunk_text = (
                f"Title: {title}\n\n"
                f"Domain: {domain}\n\n"
                f"Source Type: {source_type}\n\n"
                f"Keywords: {', '.join(kw_list)}\n\n"
                f"Content (Chunk {j+1}/{len(chunks)}):\n{chunk}"
            )
            chunk_texts.append(chunk_text)

        # Generate Embeddings via Ollama
        vectors = embedding_service.generate_embeddings(chunk_texts)
        vectors = np.array(vectors, dtype=np.float32)
        if len(vectors.shape) == 1:
            vectors = vectors.reshape(1, -1)
        
        faiss.normalize_L2(vectors)

        # Add all chunks with same doc_id
        num_vectors = vectors.shape[0]
        ids = np.full(num_vectors, doc_id, dtype=np.int64)
        faiss_index.add_with_ids(vectors, ids)

        # Index Into BM25
        bm25_service.add_document(doc_id, title, content, kw_list, platform_metadata)

        logger.info(f"  [{i}/{len(rows)}] Re-Indexed Document ID {doc_id} with {num_vectors} chunks: {title[:60]}")

    # 7. Save Everything
    os.makedirs(os.path.dirname(settings.FAISS_INDEX_PATH), exist_ok=True)
    faiss.write_index(faiss_index, settings.FAISS_INDEX_PATH)
    logger.info(f"FAISS Index Saved ({faiss_index.ntotal} Vectors).")

    bm25_service.save()
    logger.info(f"BM25 Index Saved ({len(bm25_service._doc_ids)} Documents).")

    logger.info("Re-Index Migration Complete.")


if __name__ == "__main__":
    reindex()
