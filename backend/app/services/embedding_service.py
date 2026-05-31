import httpx
import numpy as np

from app.core.config import settings
from app.core.exceptions import EmbeddingGenerationError
from app.core.logging import get_logger

logger = get_logger(__name__)


class EmbeddingService:
    """Service To Generate Semantic Dense Vector Embeddings Using Local Ollama."""

    def __init__(self) -> None:
        self.provider: str = "ollama"
        self.model_name: str = settings.EMBEDDING_MODEL_NAME
        self._dimension: int | None = None
        self._cache: dict[str, np.ndarray] = {}  # In-memory query embedding cache

    def get_dimension(self) -> int:
        """Returns the embedding dimension of the configured model."""
        if self._dimension is not None:
            return self._dimension

        # Query Ollama to get the dimension of the model by encoding a dummy string
        try:
            with httpx.Client(timeout=10.0) as client:
                response = client.post(
                    f"{settings.OLLAMA_BASE_URL.rstrip('/')}/api/embed",
                    json={
                        "model": self.model_name,
                        "input": "test",
                    },
                )
                if response.status_code == 200:
                    data = response.json()
                    embeddings = data.get("embeddings", [])
                    if embeddings and len(embeddings) > 0:
                        self._dimension = len(embeddings[0])
                        logger.info(f"Dynamically detected Ollama embedding dimension: {self._dimension}")
                    else:
                        self._dimension = settings.EMBEDDING_DIMENSION
                else:
                    logger.warning(
                        f"Ollama health check for dimension returned status {response.status_code}. "
                        f"Using fallback dimension: {settings.EMBEDDING_DIMENSION}"
                    )
                    self._dimension = settings.EMBEDDING_DIMENSION
        except Exception as e:
            logger.warning(
                f"Failed to dynamically query Ollama embedding dimension: {e}. "
                f"Using fallback dimension: {settings.EMBEDDING_DIMENSION}"
            )
            self._dimension = settings.EMBEDDING_DIMENSION

        return self._dimension

    async def check_health(self) -> bool:
        """Checks if local Ollama service is reachable and has the required embedding model loaded."""
        try:
            async with httpx.AsyncClient(timeout=2.0) as client:
                response = await client.get(f"{settings.OLLAMA_BASE_URL.rstrip('/')}/api/tags")
                if response.status_code != 200:
                    return False
                data = response.json()
                models = [m.get("name") for m in data.get("models", [])]
                has_model = any(self.model_name in m or m in self.model_name for m in models)
                return has_model
        except Exception as e:
            logger.debug(f"Ollama embedding model connection check failed: {e}")
            return False

    def generate_embedding(self, text: str) -> np.ndarray:
        """Generates A Dense Vector Embedding For A Text String."""

        if not text.strip():
            raise EmbeddingGenerationError("Cannot generate embedding for empty text.")

        # Cache lookup to bypass inference for identical strings
        if text in self._cache:
            logger.debug(f"Query Embedding Cache Hit for text snippet: '{text[:30]}...'")
            return self._cache[text]

        try:
            with httpx.Client(timeout=30.0) as client:
                response = client.post(
                    f"{settings.OLLAMA_BASE_URL.rstrip('/')}/api/embed",
                    json={
                        "model": self.model_name,
                        "input": text,
                    },
                )
                if response.status_code == 200:
                    data = response.json()
                    embeddings = data.get("embeddings", [])
                    if embeddings and len(embeddings) > 0:
                        vector = np.array(embeddings[0], dtype=np.float32)
                    else:
                        raise EmbeddingGenerationError("Ollama embedding endpoint returned empty embeddings list.")
                else:
                    raise EmbeddingGenerationError(
                        f"Ollama API returned status {response.status_code}: {response.text}"
                    )

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
            return np.empty((0, self.get_dimension()), dtype=np.float32)

        try:
            with httpx.Client(timeout=60.0) as client:
                response = client.post(
                    f"{settings.OLLAMA_BASE_URL.rstrip('/')}/api/embed",
                    json={
                        "model": self.model_name,
                        "input": texts,
                    },
                )
                if response.status_code == 200:
                    data = response.json()
                    embeddings = data.get("embeddings", [])
                    return np.array(embeddings, dtype=np.float32)
                else:
                    raise EmbeddingGenerationError(
                        f"Ollama API returned status {response.status_code}: {response.text}"
                    )

        except Exception as e:
            logger.error(f"Batch Embedding Generation Failed: {e}", exc_info=True)
            raise EmbeddingGenerationError(f"Failed To Encode Batch: {e}") from e


# Singleton Instance To Be Shared Across Services
embedding_service = EmbeddingService()
