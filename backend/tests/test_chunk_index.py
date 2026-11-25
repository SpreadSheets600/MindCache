import json

import numpy as np

from app.services.chunk_index import ChunkIndex
from app.services.embedder import DIMENSION, SIGNATURE


def unit(position):
    vector = np.zeros(DIMENSION, dtype=np.float32)
    vector[position] = 1.0
    return vector


def test_search_returns_nearest_chunk_first(tmp_path):
    index = ChunkIndex(tmp_path / "x.faiss")
    index.add([10, 11, 12], np.stack([unit(0), unit(1), unit(2)]))
    assert index.search(unit(1), 2)[0][0] == 11
    assert index.count == 3


def test_removed_chunks_are_not_returned(tmp_path):
    index = ChunkIndex(tmp_path / "x.faiss")
    index.add([1, 2], np.stack([unit(0), unit(1)]))
    index.remove([1])
    assert [chunk_id for chunk_id, _ in index.search(unit(0), 5)] == [2]


def test_index_survives_reload(tmp_path):
    index = ChunkIndex(tmp_path / "x.faiss")
    index.add([5], np.stack([unit(3)]))
    index.save()
    assert ChunkIndex(tmp_path / "x.faiss").search(unit(3), 1)[0][0] == 5


def test_other_model_signature_resets_and_flags_rebuild(tmp_path):
    index = ChunkIndex(tmp_path / "x.faiss")
    index.add([5], np.stack([unit(3)]))
    index.save()
    index.signature_path.write_text(json.dumps({"signature": "other|1|1"}))
    reloaded = ChunkIndex(tmp_path / "x.faiss")
    assert reloaded.count == 0
    assert reloaded.needs_rebuild is True
    reloaded.mark_current()
    assert json.loads(reloaded.signature_path.read_text())["signature"] == SIGNATURE
    assert reloaded.needs_rebuild is False


def test_empty_index_is_adopted_without_rebuild(tmp_path):
    assert ChunkIndex(tmp_path / "x.faiss").needs_rebuild is False
