import os
import threading

import numpy as np
import psutil

from app.core.config import settings
from app.core.exceptions import EmbeddingGenerationError

MODEL_ID = "google/embeddinggemma-2"
DIMENSION = 768
MAX_TOKENS = 1024
PROMPT_VERSION = 1
SIGNATURE = f"{MODEL_ID}|{DIMENSION}|{PROMPT_VERSION}"
QUERY_CACHE_SIZE = 512


def cpu_threads():
    return psutil.cpu_count(logical=False) or max(1, (os.cpu_count() or 2) // 2)


class Embedder:
    def __init__(self):
        self._model = None
        self._lock = threading.Lock()
        self._queries = {}

    @property
    def models_dir(self):
        return settings.DATA_DIR / "models"

    @property
    def device(self):
        import torch

        return "cuda" if torch.cuda.is_available() else "cpu"

    def is_downloaded(self):
        from huggingface_hub import snapshot_download

        try:
            snapshot_download(MODEL_ID, cache_dir=self.models_dir, local_files_only=True)
            return True
        except Exception:
            return False

    def download(self):
        from huggingface_hub import snapshot_download

        snapshot_download(MODEL_ID, cache_dir=self.models_dir)

    def status(self):
        if self._model is not None or self.is_downloaded():
            return "ready"
        return "not_downloaded"

    def _load(self):
        with self._lock:
            if self._model is None:
                import torch
                from sentence_transformers import SentenceTransformer

                device = self.device
                if device == "cpu":
                    torch.set_num_threads(cpu_threads())
                model = SentenceTransformer(
                    MODEL_ID,
                    cache_folder=str(self.models_dir),
                    device=device,
                    local_files_only=True,
                    model_kwargs={"dtype": torch.bfloat16 if device == "cuda" else torch.float32},
                    config_kwargs={"vision_config": None, "audio_config": None},
                )
                model.max_seq_length = MAX_TOKENS
                self._model = model
            return self._model

    def embed_query(self, text):
        if not text.strip():
            raise EmbeddingGenerationError("Cannot generate embedding for empty text.")
        if text in self._queries:
            return self._queries[text]
        try:
            vector = self._load().encode(text, prompt_name="SearchQuery", normalize_embeddings=True)
        except Exception as exc:
            raise EmbeddingGenerationError(f"Embedding unavailable: {exc}") from exc
        vector = np.asarray(vector, dtype=np.float32)
        if len(self._queries) >= QUERY_CACHE_SIZE:
            self._queries.pop(next(iter(self._queries)))
        self._queries[text] = vector
        return vector

    def embed_documents(self, texts):
        if not texts:
            return np.empty((0, DIMENSION), dtype=np.float32)
        try:
            vectors = self._load().encode(texts, prompt_name="Document", normalize_embeddings=True, batch_size=16)
        except Exception as exc:
            raise EmbeddingGenerationError(f"Embedding unavailable: {exc}") from exc
        return np.asarray(vectors, dtype=np.float32)


embedder = Embedder()
