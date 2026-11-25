import asyncio

from sqlalchemy import select

from app.core.logging import get_logger
from app.db import session as database
from app.models.document import Document
from app.models.files import Chunk
from app.models.item import SavedItem
from app.services import chunk_store
from app.services.chunk_index import chunk_index
from app.services.embedder import embedder

logger = get_logger(__name__)
TASKS = set()


async def index_source(db, kind, source_id, title, content):
    old_ids, chunks = await chunk_store.replace_source(db, kind, source_id, title, content)
    chunk_index.remove(old_ids)
    if chunks:
        try:
            vectors = await asyncio.to_thread(embedder.embed_documents, [f"{title}\n{chunk.text}" for chunk in chunks])
            chunk_index.add([chunk.id for chunk in chunks], vectors)
        except Exception as exc:
            logger.warning("Semantic indexing unavailable for %s %s: %s", kind, source_id, exc)
    chunk_index.save()


async def forget_source(db, kind, source_id):
    chunk_index.remove(await chunk_store.remove_source(db, kind, source_id))
    chunk_index.save()


async def backfill(model, kind, title_of, force):
    async with database.AsyncSessionLocal() as db:
        statement = select(model.id)
        if not force:
            statement = statement.where(~model.id.in_(select(Chunk.source_id).where(Chunk.source_kind == kind)))
        ids = (await db.execute(statement)).scalars().all()
    for source_id in ids:
        async with database.AsyncSessionLocal() as db:
            source = await db.get(model, source_id)
            content = source.extracted_content if model is Document else source.content
            if source is not None and content and content.strip():
                await index_source(db, kind, source.id, title_of(source), content)
                await db.commit()


async def backfill_pages(force=False):
    await backfill(Document, "document", lambda page: page.title or page.url, force)


async def backfill_items(force=False):
    await backfill(SavedItem, "item", lambda item: item.title, force)


async def backfill_all(force=False):
    await backfill_pages(force)
    await backfill_items(force)


def backfill_in_background():
    task = asyncio.create_task(backfill_all())
    TASKS.add(task)
    task.add_done_callback(TASKS.discard)
