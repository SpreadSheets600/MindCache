import numpy as np

from app.core.ai_config import load_models
from app.core.config import settings
from app.core.exceptions import EmbeddingGenerationError
from app.core.logging import get_logger
from app.services.ai_providers import embeddings

logger = get_logger(__name__)


class EmbeddingService:
    def __init__(self):
        self._model = None
        self._selected = None
        self._dimension: int | None = None
        self._cache: dict[str, np.ndarray] = {}

    def _choice(self):
        choice = load_models(settings.DATA_DIR / "models.json", settings.EMBEDDING_MODEL_NAME)["embedding"]
        if choice != self._selected:
            self._model = None
            self._dimension = None
            self._cache.clear()
            self._selected = choice
        return choice

    @property
    def provider(self):
        provider = self._choice().provider
        return "local" if provider == "transformers" else provider

    @property
    def model_name(self):
        return self._choice().model

    def _load_model(self):
        choice = self._choice()
        if choice.provider != "transformers":
            raise ValueError("This embedding provider is not a local Transformers model")
        if self._model is None:
            from sentence_transformers import SentenceTransformer
            local_path = settings.BASE_DIR / settings.EMBEDDING_MODEL_PATH
            source = str(local_path) if choice.model == settings.EMBEDDING_MODEL_NAME and local_path.exists() else choice.model
            self._model = SentenceTransformer(source, local_files_only=True)
            self._dimension = self._model.get_embedding_dimension()
        return self._model

    def get_dimension(self):
        if self._dimension is None:
            self._load_model()
        return self._dimension

    async def check_health(self):
        try:
            if self._choice().provider != "transformers":
                return False
            self._load_model()
            return True
        except Exception:
            return False

    def generate_embedding(self, text: str):
        if not text.strip():
            raise EmbeddingGenerationError("Cannot generate embedding for empty text.")
        choice = self._choice()
        if text in self._cache:
            return self._cache[text]
        try:
            if choice.provider == "transformers":
                vector = self._load_model().encode(text, prompt_name="query").astype(np.float32)
            else:
                vector = np.asarray(embeddings(choice, [text])[0], dtype=np.float32)
            if len(self._cache) >= 512:
                self._cache.pop(next(iter(self._cache)))
            self._cache[text] = vector
            return vector
        except Exception as exc:
            raise EmbeddingGenerationError(f"Embedding unavailable: {exc}") from exc

    def generate_embeddings(self, texts: list[str]):
        if not texts:
            return np.empty((0, self.get_dimension()), dtype=np.float32)
        choice = self._choice()
        try:
            if choice.provider == "transformers":
                return self._load_model().encode(texts).astype(np.float32)
            return np.asarray(embeddings(choice, texts), dtype=np.float32)
        except Exception as exc:
            raise EmbeddingGenerationError(f"Embedding unavailable: {exc}") from exc


embedding_service = EmbeddingService()
