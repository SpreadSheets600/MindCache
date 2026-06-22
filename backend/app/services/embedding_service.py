import numpy as np
from sentence_transformers import SentenceTransformer

from app.core.config import settings
from app.core.logging import get_logger
from app.core.exceptions import EmbeddingGenerationError

logger = get_logger(__name__)


class EmbeddingService:
    """Generates semantic dense vector embeddings using a local Sentence-Transformers model."""

    def __init__(self) -> None:
        self.provider: str = "local"
        self.model_name: str = settings.EMBEDDING_MODEL_NAME
        self._model: SentenceTransformer | None = None
        self._dimension: int | None = None
        self._cache: dict[str, np.ndarray] = {}

    def _load_model(self) -> SentenceTransformer:
        if self._model is None:
            local_path = settings.BASE_DIR / settings.EMBEDDING_MODEL_PATH
            if local_path.exists():
                model_source = str(local_path)
                logger.info(f"Loading embedding model from {model_source}...")
            else:
                model_source = settings.EMBEDDING_MODEL_NAME
                logger.info(f"Downloading embedding model {model_source} on first load...")
            self._model = SentenceTransformer(model_source)
            self._dimension = self._model.get_embedding_dimension()
            logger.info(f"Embedding model loaded. Dimension: {self._dimension}")
        return self._model

    def get_dimension(self):
        if self._dimension is not None:
            return self._dimension
        self._load_model()
        return self._dimension

    async def check_health(self) -> bool:
        try:
            self._load_model()
            return True
        except Exception as e:
            logger.debug(f"Embedding model load failed: {e}")
            return False

    def generate_embedding(self, text: str) -> np.ndarray:
        if not text.strip():
            raise EmbeddingGenerationError("Cannot generate embedding for empty text.")

        if text in self._cache:
            logger.debug(f"Query Embedding Cache Hit for text snippet: '{text[:30]}...'")
            return self._cache[text]

        try:
            model = self._load_model()
            vector = model.encode(text, prompt_name="query").astype(np.float32)

            if len(self._cache) >= 512:
                first_key = next(iter(self._cache))
                del self._cache[first_key]

            self._cache[text] = vector
            return vector

        except Exception as e:
            logger.error(f"Embedding Generation Failed: {e}", exc_info=True)
            raise EmbeddingGenerationError(f"Failed To Encode Text: {e}") from e

    def generate_embeddings(self, texts: list[str]) -> np.ndarray:
        if not texts:
            return np.empty((0, self.get_dimension()), dtype=np.float32)

        try:
            model = self._load_model()
            return model.encode(texts).astype(np.float32)

        except Exception as e:
            logger.error(f"Batch Embedding Generation Failed: {e}", exc_info=True)
            raise EmbeddingGenerationError(f"Failed To Encode Batch: {e}") from e


# Singleton Instance
embedding_service = EmbeddingService()
