import numpy as np
from sentence_transformers import SentenceTransformer

from app.core.config import settings
from app.core.exceptions import EmbeddingGenerationError
from app.core.logging import get_logger

logger = get_logger(__name__)


class EmbeddingService:
    """Service To Generate Semantic Dense Vector Embeddings Using Local SentenceTransformers."""

    def __init__(self) -> None:
        self.model_name: str = settings.EMBEDDING_MODEL_NAME
        self._model: SentenceTransformer | None = None
        self._cache: dict[str, np.ndarray] = {}  # In-memory query embedding cache

    @property
    def model(self) -> SentenceTransformer:
        """Lazily Load And Return The SentenceTransformer Model."""

        if self._model is None:
            logger.info(f"Loading SentenceTransformer Model '{self.model_name}'...")

            try:
                self._model = SentenceTransformer(self.model_name)
                logger.info("SentenceTransformer Model Loaded Successfully.")

            except Exception as e:
                logger.error(f"Failed To Load SentenceTransformer Model: {e}", exc_info=True)
                raise EmbeddingGenerationError(f"Model Initialization Failed: {e}") from e

        return self._model

    def generate_embedding(self, text: str) -> np.ndarray:
        """Generates A Dense Vector Embedding For A Text String."""

        if not text.strip():
            raise EmbeddingGenerationError("Cannot generate embedding for empty text.")

        # Cache lookup to bypass CPU inference for identical strings
        if text in self._cache:
            logger.debug(f"Query Embedding Cache Hit for text snippet: '{text[:30]}...'")
            return self._cache[text]

        try:
            # Generate Embedding; Result Will Be A Numpy Array
            embedding = self.model.encode(text, show_progress_bar=False)
            vector = np.array(embedding, dtype=np.float32)

            # Evict oldest item if the cache reaches 512 entries (FIFO fallback)
            if len(self._cache) >= 512:
                first_key = next(iter(self._cache))
                del self._cache[first_key]

            self._cache[text] = vector
            return vector

        except Exception as e:
            logger.error(f"Embedding Generation Failed: {e}", exc_info=True)
            raise EmbeddingGenerationError(f"Failed To Encode Text: {e}") from e

    def generate_embeddings(self, texts: list[str]) -> np.ndarray:
        """Generates Dense Vector Embeddings For A Batch Of Text Strings."""

        if not texts:
            return np.empty((0, settings.EMBEDDING_DIMENSION), dtype=np.float32)

        try:
            embeddings = self.model.encode(texts, show_progress_bar=False)
            return np.array(embeddings, dtype=np.float32)

        except Exception as e:
            logger.error(f"Batch Embedding Generation Failed: {e}", exc_info=True)
            raise EmbeddingGenerationError(f"Failed To Encode Batch: {e}") from e


# Singleton Instance To Be Shared Across Services
embedding_service = EmbeddingService()
