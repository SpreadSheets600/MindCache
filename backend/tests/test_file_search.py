import zlib
from unittest.mock import patch

import numpy as np
import pytest

from app.models.files import IndexedFile, WatchedFolder
from app.services import file_search
from app.services.chunk_index import ChunkIndex
from app.services.chunk_store import WORD, keyword_hits, remove_source, replace_source
from app.services.embedder import DIMENSION


def fake_vector(text):
    vector = np.zeros(DIMENSION, dtype=np.float32)
    for word in WORD.findall(text.lower()):
        vector[zlib.crc32(word.encode()) % DIMENSION] += 1.0
    return vector / (np.linalg.norm(vector) or 1.0)


def fake_documents(texts):
    return np.stack([fake_vector(text) for text in texts])


async def add_file(db, index, name, content):
    folder = (await db.execute(WatchedFolder.__table__.select().limit(1))).first()
    if folder is None:
        db.add(WatchedFolder(path="/data"))
        await db.flush()
    file = IndexedFile(folder_id=1, path=f"/data/{name}", name=name, status="indexed")
    db.add(file)
    await db.flush()
    _, chunks = await replace_source(db, "file", file.id, name, content)
    index.add([chunk.id for chunk in chunks], fake_documents([chunk.text for chunk in chunks]))
    return file


@pytest.fixture
def index(tmp_path):
    chunk_index = ChunkIndex(tmp_path / "chunks.faiss")
    with (
        patch.object(file_search, "chunk_index", chunk_index),
        patch.object(file_search.embedder, "embed_query", side_effect=fake_vector),
        patch.object(file_search, "SEMANTIC_FLOOR", 0.2),
    ):
        yield chunk_index


@pytest.mark.asyncio
async def test_keyword_and_semantic_hits_are_fused_and_grouped(db_session, index):
    biology = await add_file(db_session, index, "biology.md", "The mitochondria produces energy for the cell.")
    await add_file(db_session, index, "shopping.txt", "Buy milk, eggs and bread from the market.")
    results = await file_search.search_files(db_session, "mitochondria energy")
    assert results[0]["file_id"] == biology.id
    assert set(results[0]["reasons"]) == {"keyword", "semantic"}
    assert "mitochondria" in results[0]["passages"][0]["text"].lower()
    assert len(results) >= 1


@pytest.mark.asyncio
async def test_search_still_works_when_embedding_is_unavailable(db_session, index):
    note = await add_file(db_session, index, "note.txt", "Quarterly budget review for the cedar project.")
    with patch.object(file_search.embedder, "embed_query", side_effect=RuntimeError("no model")):
        results = await file_search.search_files(db_session, "cedar budget")
    assert [item["file_id"] for item in results] == [note.id]
    assert results[0]["reasons"] == ["keyword"]


@pytest.mark.asyncio
async def test_replacing_content_removes_old_chunks_from_keyword_search(db_session, index):
    file = await add_file(db_session, index, "draft.txt", "Original zebra content.")
    old_ids, _ = await replace_source(db_session, "file", file.id, "draft.txt", "Rewritten giraffe content.")
    assert old_ids
    assert await keyword_hits(db_session, "zebra", 5) == []
    assert await keyword_hits(db_session, "giraffe", 5)


@pytest.mark.asyncio
async def test_removed_source_leaves_no_keyword_hits(db_session, index):
    file = await add_file(db_session, index, "gone.txt", "Unique platypus sentence.")
    assert await remove_source(db_session, "file", file.id)
    assert await keyword_hits(db_session, "platypus", 5) == []


@pytest.mark.asyncio
async def test_punctuation_and_empty_queries_are_safe(db_session, index):
    await add_file(db_session, index, "a.txt", "Plain text.")
    assert await file_search.search_files(db_session, '" ( ) "') == []
    assert await file_search.search_files(db_session, "   ") == []


@pytest.mark.asyncio
async def test_weak_semantic_matches_are_dropped(db_session, index):
    await add_file(db_session, index, "biology.md", "The mitochondria produces energy for the cell.")
    assert await file_search.search_files(db_session, "elephant savannah migration") == []
    related = await file_search.search_files(db_session, "mitochondria energy cell")
    assert related[0]["reasons"] == ["keyword", "semantic"]
    with patch.object(file_search, "SEMANTIC_FLOOR", 0.99):
        strict = await file_search.search_files(db_session, "mitochondria energy cell")
    assert strict[0]["reasons"] == ["keyword"]
