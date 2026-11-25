import re

from sqlalchemy import delete, select, text

from app.models.files import Chunk
from app.services.chunker import chunk_text

WORD = re.compile(r"\w+", re.UNICODE)
STOPWORDS = frozenset(
    "a an and are as at be but by do does for from had has have how i if in into is it its of on or "
    "our so than that the their then there these they this to was we were what when where which who "
    "why will with you your".split()
)


async def remove_source(db, kind, source_id):
    ids = list((await db.execute(select(Chunk.id).where(Chunk.source_kind == kind, Chunk.source_id == source_id))).scalars())
    if ids:
        marks = ",".join(str(chunk_id) for chunk_id in ids)
        await db.execute(text(f"DELETE FROM chunks_fts WHERE rowid IN ({marks})"))
        await db.execute(delete(Chunk).where(Chunk.id.in_(ids)))
    return ids


async def replace_source(db, kind, source_id, title, content):
    old_ids = await remove_source(db, kind, source_id)
    chunks = [
        Chunk(source_kind=kind, source_id=source_id, ordinal=ordinal, title=title, text=body, char_start=start, char_end=end)
        for ordinal, (start, end, body) in enumerate(chunk_text(content))
    ]
    db.add_all(chunks)
    await db.flush()
    for chunk in chunks:
        await db.execute(
            text("INSERT INTO chunks_fts(rowid, title, text) VALUES (:id, :title, :text)"),
            {"id": chunk.id, "title": chunk.title, "text": chunk.text},
        )
    return old_ids, chunks


def match_expression(query):
    words = WORD.findall(query)
    meaningful = [word for word in words if word.lower() not in STOPWORDS]
    words = meaningful or words
    if not words:
        return None
    terms = [f'"{word}"' for word in words[:-1]] + [f'"{words[-1]}"*']
    return " OR ".join(terms)


async def keyword_hits(db, query, limit):
    expression = match_expression(query)
    if expression is None:
        return []
    rows = await db.execute(
        text("SELECT rowid FROM chunks_fts WHERE chunks_fts MATCH :q ORDER BY bm25(chunks_fts, 4.0, 1.0) LIMIT :n"),
        {"q": expression, "n": limit},
    )
    return [row[0] for row in rows]
