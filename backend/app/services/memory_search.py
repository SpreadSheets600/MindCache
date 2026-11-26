import asyncio
from datetime import UTC, datetime
from pathlib import Path

from sqlalchemy import select

from app.models.document import Document
from app.models.files import Chunk, IndexedFile
from app.models.item import SavedItem
from app.services.chunk_index import chunk_index
from app.services.chunk_store import STOPWORDS, WORD, keyword_hits
from app.services.embedder import embedder
from app.services.excerpts import matching_excerpt

CANDIDATES = 100
RRF_K = 60
PASSAGES_PER_FILE = 3
SEMANTIC_FLOOR = 0.70


def fuse(*rankings):
    scores = {}
    for ranking in rankings:
        for rank, chunk_id in enumerate(ranking):
            scores[chunk_id] = scores.get(chunk_id, 0.0) + 1.0 / (RRF_K + rank + 1)
    return scores


async def semantic_hits(query, limit):
    try:
        vector = await asyncio.to_thread(embedder.embed_query, query)
    except Exception:
        return []
    return [chunk_id for chunk_id, score in chunk_index.search(vector, limit) if score >= SEMANTIC_FLOOR]


async def load_sources(db, chunks):
    wanted = {"file": set(), "document": set(), "item": set()}
    for chunk in chunks.values():
        wanted[chunk.source_kind].add(chunk.source_id)
    files = {}
    pages = {}
    items = {}
    if wanted["file"]:
        files = {item.id: item for item in (await db.execute(select(IndexedFile).where(IndexedFile.id.in_(wanted["file"]), IndexedFile.status != "missing"))).scalars()}
    if wanted["document"]:
        pages = {item.id: item for item in (await db.execute(select(Document).where(Document.id.in_(wanted["document"])))).scalars()}
    if wanted["item"]:
        items = {item.id: item for item in (await db.execute(select(SavedItem).where(SavedItem.id.in_(wanted["item"])))).scalars()}
    return files, pages, items


def iso(value):
    return value.isoformat() if value else None


def modified(item):
    if not item.mtime_ns:
        return None
    return datetime.fromtimestamp(item.mtime_ns / 1e9, UTC).replace(tzinfo=None).isoformat()


def describe(key, files, pages, items):
    kind, source_id = key
    if kind == "file" and source_id in files:
        item = files[source_id]
        return {"kind": "file", "id": item.id, "title": item.name, "location": item.path,
                "folder": str(Path(item.path).parent), "ext": item.ext, "size": item.size,
                "when": modified(item), "open_url": f"/files/{item.id}/raw"}
    if kind == "document" and source_id in pages:
        item = pages[source_id]
        return {"kind": "page", "id": item.id, "title": item.title or item.url, "location": item.url,
                "domain": item.domain, "when": iso(item.updated_at), "open_url": item.url}
    if kind == "item" and source_id in items:
        item = items[source_id]
        note = item.kind == "note"
        location = "" if note or item.original is None else f"/items/{item.id}/file"
        return {"kind": "note" if note else "upload", "id": item.id, "title": item.title, "location": location,
                "when": iso(item.updated_at), "open_url": location}
    return None


def query_terms(query):
    words = WORD.findall(query)
    return [word for word in words if word.lower() not in STOPWORDS] or words


async def search_memory(db, query, limit=20, mode="full", kinds=None):
    if not WORD.search(query):
        return []
    keyword = await keyword_hits(db, query, CANDIDATES)
    semantic = [] if mode == "fast" else await semantic_hits(query, CANDIDATES)
    scores = fuse(keyword, semantic)
    if not scores:
        return []
    chunks = {chunk.id: chunk for chunk in (await db.execute(select(Chunk).where(Chunk.id.in_(scores)))).scalars()}
    files, pages, items = await load_sources(db, chunks)
    terms = query_terms(query)
    grouped = {}
    for chunk_id in sorted(chunks, key=lambda key: -scores[key]):
        chunk = chunks[chunk_id]
        key = (chunk.source_kind, chunk.source_id)
        source = describe(key, files, pages, items)
        if source is None or (kinds and source["kind"] not in kinds):
            continue
        entry = grouped.setdefault(key, {**source, "score": scores[chunk_id], "passages": [], "reasons": set()})
        if len(entry["passages"]) < PASSAGES_PER_FILE:
            excerpt = matching_excerpt(chunk.text, terms) or " ".join(chunk.text[:240].split())
            entry["passages"].append({"text": excerpt, "start": chunk.char_start})
        if chunk_id in keyword:
            entry["reasons"].add("keyword")
        if chunk_id in semantic:
            entry["reasons"].add("semantic")
    ranked = sorted(grouped.values(), key=lambda entry: -entry["score"])[:limit]
    return [{**entry, "score": round(entry["score"], 5), "reasons": sorted(entry["reasons"])} for entry in ranked]
