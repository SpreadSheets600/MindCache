from sqlalchemy import select

from app.models.files import Chunk, IndexedFile
from app.services.chunk_index import chunk_index
from app.services.chunk_store import WORD, keyword_hits
from app.services.embedder import embedder
from app.services.excerpts import matching_excerpt

CANDIDATES = 100
RRF_K = 60
PASSAGES_PER_FILE = 3


def fuse(*rankings):
    scores = {}
    for ranking in rankings:
        for rank, chunk_id in enumerate(ranking):
            scores[chunk_id] = scores.get(chunk_id, 0.0) + 1.0 / (RRF_K + rank + 1)
    return scores


def semantic_hits(query, limit):
    try:
        vector = embedder.embed_query(query)
    except Exception:
        return []
    return [chunk_id for chunk_id, _ in chunk_index.search(vector, limit)]


async def search_files(db, query, limit=20):
    if not WORD.search(query):
        return []
    keyword = await keyword_hits(db, query, CANDIDATES)
    semantic = semantic_hits(query, CANDIDATES)
    scores = fuse(keyword, semantic)
    if not scores:
        return []
    chunks = {
        chunk.id: chunk
        for chunk in (await db.execute(select(Chunk).where(Chunk.id.in_(scores), Chunk.source_kind == "file"))).scalars()
    }
    files = {
        item.id: item
        for item in (
            await db.execute(select(IndexedFile).where(IndexedFile.id.in_({chunk.source_id for chunk in chunks.values()})))
        ).scalars()
    }
    terms = WORD.findall(query)
    grouped = {}
    for chunk_id in sorted(chunks, key=lambda key: -scores[key]):
        chunk = chunks[chunk_id]
        if chunk.source_id not in files:
            continue
        entry = grouped.setdefault(chunk.source_id, {"score": scores[chunk_id], "passages": [], "reasons": set()})
        if len(entry["passages"]) < PASSAGES_PER_FILE:
            excerpt = matching_excerpt(chunk.text, terms) or " ".join(chunk.text[:240].split())
            entry["passages"].append({"text": excerpt, "start": chunk.char_start})
        if chunk_id in keyword:
            entry["reasons"].add("keyword")
        if chunk_id in semantic:
            entry["reasons"].add("semantic")
    ranked = sorted(grouped.items(), key=lambda pair: -pair[1]["score"])[:limit]
    return [
        {
            "file_id": file_id,
            "name": files[file_id].name,
            "path": files[file_id].path,
            "score": round(entry["score"], 5),
            "reasons": sorted(entry["reasons"]),
            "passages": entry["passages"],
        }
        for file_id, entry in ranked
    ]
