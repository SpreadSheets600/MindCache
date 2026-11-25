import json
import os
from pathlib import Path

import faiss
import numpy as np

from app.core.config import settings
from app.core.exceptions import VectorStoreError
from app.core.logging import get_logger
from app.services.embedder import DIMENSION, SIGNATURE

logger = get_logger(__name__)


class VectorService:

    def __init__(self):
        self.index_path: str = settings.FAISS_INDEX_PATH
        self.dimension: int = DIMENSION
        self.needs_reindexing: bool = False
        self._index: faiss.Index | None = None
        self._load_index()
        self.ensure_current()

    @property
    def signature_path(self):
        return Path(self.index_path).with_name("index-embedding.json")

    def mark_current(self):
        self.signature_path.write_text(json.dumps({"signature": SIGNATURE}), encoding="utf-8")
        self.needs_reindexing = False

    def ensure_current(self):
        path = self.signature_path
        current = path.exists() and json.loads(path.read_text(encoding="utf-8")).get("signature") == SIGNATURE
        if current and self._index.d == DIMENSION:
            return
        stale = self._index.ntotal > 0
        self.dimension = DIMENSION
        self._index = faiss.IndexIDMap(faiss.IndexFlatIP(DIMENSION))
        self.save()
        if stale:
            self.needs_reindexing = True
            logger.warning("Embedding model changed; vector index reset and a reindex is required.")
        else:
            self.mark_current()

    def _load_index(self):

        try:
            if os.path.exists(self.index_path) and os.path.getsize(self.index_path) > 0:
                logger.info(f"Loading Existing FAISS Index From {self.index_path}...")
                loaded_index = faiss.read_index(self.index_path)

                self._index = loaded_index
                self.dimension = loaded_index.d
                logger.info("FAISS index loaded with %s vectors (dimension %s).", loaded_index.ntotal, loaded_index.d)

            else:
                logger.info("Initializing A New FAISS Index With L2-Normalized Inner Product...")

                flat_index = faiss.IndexFlatIP(self.dimension)

                self._index = faiss.IndexIDMap(flat_index)
                self.save()

        except Exception as e:
            logger.error(f"Failed To Initialize FAISS Index: {e}", exc_info=True)
            raise VectorStoreError(f"FAISS Index Initialization Failed: {e}") from e

    def save(self):

        if self._index is None:
            raise VectorStoreError("Cannot save uninitialized index.")

        try:
            os.makedirs(os.path.dirname(self.index_path), exist_ok=True)
            faiss.write_index(self._index, self.index_path)
            logger.debug(f"FAISS Index Saved Successfully To {self.index_path}.")

        except Exception as e:
            logger.error(f"Failed To Write FAISS Index To Disk: {e}", exc_info=True)
            raise VectorStoreError(f"Failed To Save FAISS Index: {e}") from e

    def _ensure_dimension(self, dimension: int):
        if dimension == self.dimension:
            return
        if self._index is not None and self._index.ntotal:
            raise VectorStoreError("Embedding dimension changed; rebuild the index before using this model.")
        self.dimension = dimension
        self._index = faiss.IndexIDMap(faiss.IndexFlatIP(dimension))

    def add_document(self, document_id: int, embedding: np.ndarray):

        if self._index is None:
            raise VectorStoreError("Index not initialized.")

        try:
            vector = np.array(embedding, dtype=np.float32).reshape(1, -1)
            self._ensure_dimension(vector.shape[1])

            faiss.normalize_L2(vector)

            ids = np.array([document_id], dtype=np.int64)
            self._index.add_with_ids(vector, ids)
            self.save()
            logger.info(f"Added Vector For Document ID {document_id} To FAISS. Index Total: {self._index.ntotal}.")

        except Exception as e:
            logger.error(f"Failed To Add Vector For Document {document_id}: {e}", exc_info=True)
            raise VectorStoreError(f"Failed To Add Vector To FAISS: {e}") from e

    def add_document_chunks(self, document_id: int, embeddings: np.ndarray):

        if self._index is None:
            raise VectorStoreError("Index not initialized.")

        try:
            vectors = np.array(embeddings, dtype=np.float32)
            if len(vectors.shape) == 1:
                vectors = vectors.reshape(1, -1)

            self._ensure_dimension(vectors.shape[1])

            faiss.normalize_L2(vectors)

            num_vectors = vectors.shape[0]
            ids = np.full(num_vectors, document_id, dtype=np.int64)

            self._index.add_with_ids(vectors, ids)
            self.save()
            logger.info(f"Added {num_vectors} Vector Chunks For Document ID {document_id} To FAISS. Index Total: {self._index.ntotal}.")

        except Exception as e:
            logger.error(f"Failed To Add Chunks For Document {document_id}: {e}", exc_info=True)
            raise VectorStoreError(f"Failed To Add Chunks To FAISS: {e}") from e

    def search_similar(self, query_embedding: np.ndarray, limit: int = 5):

        if self._index is None:
            raise VectorStoreError("Index not initialized.")

        if self._index.ntotal == 0:
            return []

        try:
            query = np.array(query_embedding, dtype=np.float32).reshape(1, -1)

            if query.shape[1] != self.dimension:
                raise VectorStoreError("Embedding dimension differs from the stored index; rebuild required.")

            faiss.normalize_L2(query)

            distances, indices = self._index.search(query, limit)

            results = []

            for idx, dist in zip(indices[0], distances[0], strict=False):
                if idx != -1:
                    results.append((int(idx), float(dist)))

            return results

        except Exception as e:
            logger.error(f"FAISS Search Operation Failed: {e}", exc_info=True)
            raise VectorStoreError(f"Search Failed: {e}") from e

    def delete_document(self, document_id: int):

        if self._index is None:
            raise VectorStoreError("Index not initialized.")

        try:
            ids_to_remove = np.array([document_id], dtype=np.int64)

            removed_count = self._index.remove_ids(ids_to_remove)

            if removed_count > 0:
                self.save()
                logger.info(f"Removed Vector For Document ID {document_id} From FAISS. Removed Count: {removed_count}.")

            else:
                logger.debug(f"Document ID {document_id} Not Found In FAISS Index To Delete.")

        except Exception as e:
            logger.error(f"Failed To Delete Vector For Document {document_id}: {e}", exc_info=True)
            raise VectorStoreError(f"Failed To Delete Vector From FAISS: {e}") from e


vector_service = VectorService()
