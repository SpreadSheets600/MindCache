import asyncio

from sqlalchemy import select

from app.core.logging import get_logger
from app.db import session as database
from app.models.document import Document
from app.models.files import Chunk
from app.services import chunk_store
from app.services.chunk_index import chunk_index
from app.services.embedder import embedder

logger = get_logger(__name__)


async def index_page(db, document_id, title, content):
    old_ids, chunks = await chunk_store.replace_source(db, "document", document_id, title, content)
    chunk_index.remove(old_ids)
    if chunks:
        try:
            vectors = await asyncio.to_thread(embedder.embed_documents, [f"{title}\n{chunk.text}" for chunk in chunks])
            chunk_index.add([chunk.id for chunk in chunks], vectors)
        except Exception as exc:
            logger.warning("Semantic indexing unavailable for page %s: %s", document_id, exc)
    chunk_index.save()


async def forget_page(db, document_id):
    chunk_index.remove(await chunk_store.remove_source(db, "document", document_id))
    chunk_index.save()


async def backfill_pages(force=False):
    async with database.AsyncSessionLocal() as db:
        statement = select(Document.id)
        if not force:
            statement = statement.where(~Document.id.in_(select(Chunk.source_id).where(Chunk.source_kind == "document")))
        ids = (await db.execute(statement)).scalars().all()
    for document_id in ids:
        async with database.AsyncSessionLocal() as db:
            document = await db.get(Document, document_id)
            if document is not None and document.extracted_content:
                await index_page(db, document.id, document.title or document.url, document.extracted_content)
                await db.commit()
