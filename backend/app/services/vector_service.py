import os

import faiss
import numpy as np

from app.core.config import settings
from app.core.exceptions import VectorStoreError
from app.core.logging import get_logger

logger = get_logger(__name__)


class VectorService:
    """Service To Handle High-Performance FAISS Local Vector Similarity Search And Index Persistence."""

    def __init__(self) -> None:
        self.index_path: str = settings.FAISS_INDEX_PATH
        self.dimension: int = settings.EMBEDDING_DIMENSION
        self._index: faiss.Index | None = None
        self._load_index()

    def _load_index(self) -> None:
        """Loads FAISS Index From Disk, Or Initializes A New IndexIDMap Wrapping IndexFlatIP."""

        try:
            if os.path.exists(self.index_path) and os.path.getsize(self.index_path) > 0:
                logger.info(f"Loading Existing FAISS Index From {self.index_path}...")
                self._index = faiss.read_index(self.index_path)
                logger.info(f"FAISS Index Loaded. Total Vectors: {self._index.ntotal}.")

            else:
                logger.info("Initializing A New FAISS Index With L2-Normalized Inner Product...")

                # Flat Inner Product Index For Cosine Similarity (Vectors Normalized Before Add/Search)
                flat_index = faiss.IndexFlatIP(self.dimension)

                # Map Arbitrary Database IDs To Vectors
                self._index = faiss.IndexIDMap(flat_index)
                self.save()

        except Exception as e:
            logger.error(f"Failed To Initialize FAISS Index: {e}", exc_info=True)
            raise VectorStoreError(f"FAISS Index Initialization Failed: {e}") from e

    def save(self) -> None:
        """Saves The Current State Of The FAISS Index To Disk."""

        if self._index is None:
            raise VectorStoreError("Cannot save uninitialized index.")

        try:
            # Ensure The Directory Exists
            os.makedirs(os.path.dirname(self.index_path), exist_ok=True)
            faiss.write_index(self._index, self.index_path)
            logger.debug(f"FAISS Index Saved Successfully To {self.index_path}.")

        except Exception as e:
            logger.error(f"Failed To Write FAISS Index To Disk: {e}", exc_info=True)
            raise VectorStoreError(f"Failed To Save FAISS Index: {e}") from e

    def add_document(self, document_id: int, embedding: np.ndarray) -> None:
        """Adds A Document Vector To The FAISS Index Mapped To The Document's Database ID."""

        if self._index is None:
            raise VectorStoreError("Index not initialized.")

        try:
            # Reshape Vector To 2D Array: (1, Dimension)
            vector = np.array(embedding, dtype=np.float32).reshape(1, -1)

            # L2 Normalize The Vector To Ensure Inner Product Calculates Cosine Similarity
            faiss.normalize_L2(vector)

            # Add With Specific Database ID
            ids = np.array([document_id], dtype=np.int64)
            self._index.add_with_ids(vector, ids)
            self.save()
            logger.info(f"Added Vector For Document ID {document_id} To FAISS. Index Total: {self._index.ntotal}.")

        except Exception as e:
            logger.error(f"Failed To Add Vector For Document {document_id}: {e}", exc_info=True)
            raise VectorStoreError(f"Failed To Add Vector To FAISS: {e}") from e

    def add_document_chunks(self, document_id: int, embeddings: np.ndarray) -> None:
        """Adds Multiple Vector Chunks For A Single Document To FAISS."""

        if self._index is None:
            raise VectorStoreError("Index not initialized.")

        try:
            # Reshape And Convert To float32
            vectors = np.array(embeddings, dtype=np.float32)
            if len(vectors.shape) == 1:
                vectors = vectors.reshape(1, -1)

            # L2 Normalize
            faiss.normalize_L2(vectors)

            # Generate IDs Array
            num_vectors = vectors.shape[0]
            ids = np.full(num_vectors, document_id, dtype=np.int64)

            self._index.add_with_ids(vectors, ids)
            self.save()
            logger.info(f"Added {num_vectors} Vector Chunks For Document ID {document_id} To FAISS. Index Total: {self._index.ntotal}.")

        except Exception as e:
            logger.error(f"Failed To Add Chunks For Document {document_id}: {e}", exc_info=True)
            raise VectorStoreError(f"Failed To Add Chunks To FAISS: {e}") from e

    def search_similar(self, query_embedding: np.ndarray, limit: int = 5) -> list[tuple[int, float]]:
        """Searches The FAISS Index For Similar Vectors. Returns List Of Tuples (Document_Id, Cosine_Similarity)."""

        if self._index is None:
            raise VectorStoreError("Index not initialized.")

        if self._index.ntotal == 0:
            return []

        try:
            # Reshape Query To 2D: (1, Dimension)
            query = np.array(query_embedding, dtype=np.float32).reshape(1, -1)

            # Normalize Query Vector
            faiss.normalize_L2(query)

            # Perform Search
            # Distances Represent The Inner Product (Cosine Similarity) Because Vectors Are Normalized
            distances, indices = self._index.search(query, limit)

            results = []

            for idx, dist in zip(indices[0], distances[0]):
                # FAISS Returns -1 For Indices If Not Enough Matches Are Found
                if idx != -1:
                    results.append((int(idx), float(dist)))

            return results

        except Exception as e:
            logger.error(f"FAISS Search Operation Failed: {e}", exc_info=True)
            raise VectorStoreError(f"Search Failed: {e}") from e

    def delete_document(self, document_id: int) -> None:
        """Removes A Document's Vector From The FAISS Index."""

        if self._index is None:
            raise VectorStoreError("Index not initialized.")

        try:
            ids_to_remove = np.array([document_id], dtype=np.int64)

            # Remove_Ids Returns The Number Of Removed Vectors
            removed_count = self._index.remove_ids(ids_to_remove)

            if removed_count > 0:
                self.save()
                logger.info(f"Removed Vector For Document ID {document_id} From FAISS. Removed Count: {removed_count}.")

            else:
                logger.debug(f"Document ID {document_id} Not Found In FAISS Index To Delete.")

        except Exception as e:
            logger.error(f"Failed To Delete Vector For Document {document_id}: {e}", exc_info=True)
            raise VectorStoreError(f"Failed To Delete Vector From FAISS: {e}") from e


# Singleton Instance
vector_service = VectorService()
