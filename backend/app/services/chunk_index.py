import json
import os
from pathlib import Path

import faiss
import numpy as np

from app.core.config import settings
from app.core.exceptions import VectorStoreError
from app.services.embedder import DIMENSION, SIGNATURE


class ChunkIndex:
    def __init__(self, path=None):
        self.path = Path(path or settings.FAISS_INDEX_PATH).with_name("chunks.faiss")
        self.needs_rebuild = False
        self._index = None
        self._load()

    @property
    def signature_path(self):
        return self.path.with_name("chunks-embedding.json")

    @property
    def count(self):
        return self._index.ntotal

    def _empty(self):
        return faiss.IndexIDMap2(faiss.IndexFlatIP(DIMENSION))

    def _load(self):
        if self.path.exists() and self.path.stat().st_size > 0:
            self._index = faiss.read_index(str(self.path))
        else:
            self._index = self._empty()
        current = self.signature_path.exists() and json.loads(self.signature_path.read_text())["signature"] == SIGNATURE
        if current and self._index.d == DIMENSION:
            return
        self.needs_rebuild = self._index.ntotal > 0
        self._index = self._empty()
        self.save()
        if not self.needs_rebuild:
            self.mark_current()

    def mark_current(self):
        self.signature_path.write_text(json.dumps({"signature": SIGNATURE}), encoding="utf-8")
        self.needs_rebuild = False

    def save(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.path.with_name(self.path.name + ".tmp")
        faiss.write_index(self._index, str(temporary))
        os.replace(temporary, self.path)

    def add(self, ids, vectors):
        vectors = np.ascontiguousarray(vectors, dtype=np.float32).reshape(-1, DIMENSION)
        if len(ids) != len(vectors):
            raise VectorStoreError("Each chunk needs exactly one vector.")
        faiss.normalize_L2(vectors)
        self._index.add_with_ids(vectors, np.asarray(ids, dtype=np.int64))

    def remove(self, ids):
        if len(ids):
            self._index.remove_ids(np.asarray(ids, dtype=np.int64))

    def search(self, vector, limit):
        if self._index.ntotal == 0:
            return []
        query = np.ascontiguousarray(vector, dtype=np.float32).reshape(1, -1)
        faiss.normalize_L2(query)
        scores, ids = self._index.search(query, limit)
        return [(int(chunk_id), float(score)) for chunk_id, score in zip(ids[0], scores[0], strict=True) if chunk_id != -1]


chunk_index = ChunkIndex()
