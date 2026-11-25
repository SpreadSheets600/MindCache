import json
import os
from pathlib import Path

import numpy as np
import pytest

from app.services.embedder import DIMENSION, MODEL_ID, SIGNATURE, Embedder
from app.services.vector_service import VectorService


def make_service(directory, dimension, vectors):
    import faiss

    path = Path(directory) / "faiss.bin"
    index = faiss.IndexIDMap(faiss.IndexFlatIP(dimension))
    if vectors:
        index.add_with_ids(np.ones((vectors, dimension), dtype=np.float32), np.arange(vectors, dtype=np.int64))
    faiss.write_index(index, str(path))
    service = VectorService.__new__(VectorService)
    service.index_path = str(path)
    service.dimension = dimension
    service.needs_reindexing = False
    service._index = index
    return service


def test_populated_index_from_another_model_is_reset_and_flagged(tmp_path):
    service = make_service(tmp_path, 1024, 3)
    service.ensure_current()
    assert service._index.ntotal == 0
    assert service._index.d == DIMENSION
    assert service.needs_reindexing is True
    assert not service.signature_path.exists()
    service.mark_current()
    assert service.needs_reindexing is False
    assert json.loads(service.signature_path.read_text())["signature"] == SIGNATURE


def test_empty_index_is_adopted_without_reindex(tmp_path):
    service = make_service(tmp_path, 1024, 0)
    service.ensure_current()
    assert service.needs_reindexing is False
    assert service._index.d == DIMENSION
    assert json.loads(service.signature_path.read_text())["signature"] == SIGNATURE


def test_current_index_is_kept(tmp_path):
    service = make_service(tmp_path, DIMENSION, 2)
    service.signature_path.write_text(json.dumps({"signature": SIGNATURE}))
    service.ensure_current()
    assert service._index.ntotal == 2
    assert service.needs_reindexing is False


def test_missing_model_fails_with_embedding_error(tmp_path):
    from app.core.exceptions import EmbeddingGenerationError

    embedder = Embedder()
    embedder.__class__ = type("Missing", (Embedder,), {"models_dir": tmp_path})
    with pytest.raises(EmbeddingGenerationError):
        embedder.embed_query("hello")
    assert embedder.status() == "not_downloaded"


@pytest.mark.skipif(not os.environ.get("MINDCACHE_REAL_MODEL"), reason="needs the downloaded model")
def test_real_model_ranks_relevant_document_first():
    embedder = Embedder()
    embedder.__class__ = type("Real", (Embedder,), {"models_dir": Path(os.environ["MINDCACHE_REAL_MODEL"])})
    query = embedder.embed_query("which organelle makes energy")
    documents = embedder.embed_documents(
        ["The mitochondria is the powerhouse of the cell.", "Buy milk and eggs from the market."]
    )
    assert query.shape == (DIMENSION,)
    assert documents.shape == (2, DIMENSION)
    assert float(np.linalg.norm(query)) == pytest.approx(1.0, abs=2e-2)
    assert documents[0] @ query > documents[1] @ query
    assert MODEL_ID == "google/embeddinggemma-2"
