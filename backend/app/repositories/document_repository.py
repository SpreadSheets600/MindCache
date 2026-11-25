import datetime
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.data_sanitizer import sanitize_datetime, sanitize_platform_metadata, sanitize_text
from app.core.logging import get_logger
from app.models.document import Document, Entity, Keyword, SearchClick, SearchQuery, VisitHistory

logger = get_logger(__name__)


class DocumentRepository:

    async def get_by_id(self, db: AsyncSession, document_id: int):

        result = await db.execute(
            select(Document)
            .where(Document.id == document_id)
            .options(selectinload(Document.keywords), selectinload(Document.entities), selectinload(Document.visits))
        )
        return result.scalars().first()

    async def get_by_url(self, db: AsyncSession, url: str):

        result = await db.execute(
            select(Document)
            .where(Document.url == url)
            .options(selectinload(Document.keywords), selectinload(Document.visits))
        )
        return result.scalars().first()

    async def get_by_ids(self, db: AsyncSession, document_ids: list[int]):

        if not document_ids:
            return []

        result = await db.execute(
            select(Document)
            .where(Document.id.in_(document_ids))
            .options(selectinload(Document.keywords), selectinload(Document.visits))
        )

        doc_map = {doc.id: doc for doc in result.scalars().all()}
        return [doc_map[did] for did in document_ids if did in doc_map]

    async def list_documents(self, db: AsyncSession, skip: int = 0, limit: int = 100):

        result = await db.execute(
            select(Document)
            .order_by(Document.updated_at.desc())
            .offset(skip)
            .limit(limit)
            .options(selectinload(Document.keywords), selectinload(Document.entities), selectinload(Document.visits))
        )
        return list(result.scalars().all())

    async def count_documents(self, db: AsyncSession):

        result = await db.execute(select(func.count(Document.id)))
        return result.scalar() or 0

    async def create(
        self,
        db: AsyncSession,
        url: str,
        domain: str,
        title: Optional[str],
        author: Optional[str],
        published_date: Optional[datetime.datetime],
        extracted_content: str,
        summary: Optional[str] = None,
        source_type: str = "Generic",
        platform_metadata: Optional[dict] = None,
        quality_score: float = 0.0,
        total_dwell_time: float = 0.0,
    ):

        document = Document(
            url=sanitize_text(url, 2048) or "",
            domain=sanitize_text(domain, 253) or "",
            title=sanitize_text(title, 512),
            author=sanitize_text(author, 256),
            published_date=sanitize_datetime(published_date),
            extracted_content=sanitize_text(extracted_content) or "",
            summary=sanitize_text(summary),
            source_type=sanitize_text(source_type, 50) or "Generic",
            platform_metadata=sanitize_platform_metadata(platform_metadata),
            quality_score=quality_score,
            total_dwell_time=total_dwell_time,
        )
        db.add(document)
        await db.flush()
        return document

    async def add_keywords(self, db: AsyncSession, document_id: int, keywords_list: list[tuple[str, float]]):

        for kw, score in keywords_list:
            keyword_record = Keyword(
                document_id=document_id,
                keyword=kw,
                score=score,
            )
            db.add(keyword_record)

    async def add_visit(self, db: AsyncSession, document_id: int, visited_at: datetime.datetime):

        visit = VisitHistory(document_id=document_id, visited_at=sanitize_datetime(visited_at) or visited_at)
        db.add(visit)
        return visit

    async def update_summary(self, db: AsyncSession, document_id: int, summary: str):

        result = await db.execute(select(Document).where(Document.id == document_id))
        document = result.scalars().first()

        if document:
            document.summary = sanitize_text(summary)
            document.updated_at = datetime.datetime.now(datetime.UTC).replace(tzinfo=None)

    async def search_by_keywords(self, db: AsyncSession, query_keywords: list[str], limit: int = 25):

        if not query_keywords:
            return []

        from sqlalchemy import func

        result = await db.execute(
            select(Document)
            .join(Keyword, Document.id == Keyword.document_id)
            .where(Keyword.keyword.in_(query_keywords))
            .group_by(Document.id)
            .order_by(func.count(Keyword.id).desc())
            .limit(limit)
            .options(selectinload(Document.keywords), selectinload(Document.visits))
        )
        return list(result.scalars().all())

    async def get_all_document_ids(self, db: AsyncSession):

        result = await db.execute(select(Document.id))
        return list(result.scalars().all())

    async def get_ids_by_time_window(
        self,
        db: AsyncSession,
        start_time: Optional[datetime.datetime] = None,
        end_time: Optional[datetime.datetime] = None,
    ):

        query = select(Document.id)
        if start_time:
            query = query.where(Document.updated_at >= start_time)
        if end_time:
            query = query.where(Document.updated_at <= end_time)

        result = await db.execute(query)
        return set(result.scalars().all())

    async def delete(self, db: AsyncSession, document_id: int):

        result = await db.execute(select(Document).where(Document.id == document_id))
        document = result.scalars().first()
        if not document:
            return False

        await db.delete(document)
        logger.info(f"Deleted Document ID {document_id} From SQLite.")
        return True

    async def add_entities(self, db: AsyncSession, document_id: int, entities_list: list[tuple[str, str]]):

        for name, etype in entities_list:
            entity_record = Entity(
                document_id=document_id,
                name=name,
                type=etype,
            )
            db.add(entity_record)

    async def record_click(self, db: AsyncSession, query: str, document_id: int):

        click_record = SearchClick(query=query.strip().lower(), document_id=document_id)
        db.add(click_record)

    async def get_clicks_for_query(self, db: AsyncSession, query: str):

        result = await db.execute(select(SearchClick).where(SearchClick.query == query.strip().lower()))
        return list(result.scalars().all())

    async def record_search_query(self, db: AsyncSession, query: str):

        query_record = SearchQuery(query=query.strip())
        db.add(query_record)


document_repository = DocumentRepository()
