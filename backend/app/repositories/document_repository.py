import datetime
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.logging import get_logger
from app.models.document import Document, Entity, Keyword, SearchClick, SearchQuery, VisitHistory

logger = get_logger(__name__)


class DocumentRepository:
    """Repository To Manage All Asynchronous CRUD Operations For Documents, Keywords, And VisitHistory."""

    async def get_by_id(self, db: AsyncSession, document_id: int) -> Optional[Document]:  # noqa: UP045
        """Retrieves A Document By Its Primary Key, Preloading Keywords, Entities, And Visits."""

        result = await db.execute(
            select(Document)
            .where(Document.id == document_id)
            .options(selectinload(Document.keywords), selectinload(Document.entities), selectinload(Document.visits))
        )
        return result.scalars().first()

    async def get_by_url(self, db: AsyncSession, url: str) -> Optional[Document]:  # noqa: UP045
        """Retrieves A Document By Its Exact URL."""

        result = await db.execute(
            select(Document)
            .where(Document.url == url)
            .options(selectinload(Document.keywords), selectinload(Document.visits))
        )
        return result.scalars().first()

    async def get_by_ids(self, db: AsyncSession, document_ids: list[int]) -> list[Document]:
        """Retrieves Multiple Documents By Their Primary Keys. Preserves Preloading."""  # noqa: UP045

        if not document_ids:
            return []

        result = await db.execute(
            select(Document)
            .where(Document.id.in_(document_ids))
            .options(selectinload(Document.keywords), selectinload(Document.visits))
        )

        # Store In Dict To Allow Sorting By The Requested document_ids Order
        doc_map = {doc.id: doc for doc in result.scalars().all()}
        return [doc_map[did] for did in document_ids if did in doc_map]

    async def list_documents(self, db: AsyncSession, skip: int = 0, limit: int = 100) -> list[Document]:
        """Lists Stored Documents Ordered By Updated Timestamp Descending."""

        result = await db.execute(
            select(Document)
            .order_by(Document.updated_at.desc())
            .offset(skip)
            .limit(limit)
            .options(selectinload(Document.keywords), selectinload(Document.entities), selectinload(Document.visits))
        )
        return list(result.scalars().all())

    async def count_documents(self, db: AsyncSession) -> int:
        """Returns the total number of documents in the database."""

        result = await db.execute(select(func.count(Document.id)))
        return result.scalar() or 0

    async def create(
        self,
        db: AsyncSession,
        url: str,
        domain: str,
        title: Optional[str],  # noqa: UP045
        author: Optional[str],  # noqa: UP045
        published_date: Optional[datetime.datetime],  # noqa: UP045
        extracted_content: str,
        summary: Optional[str] = None,  # noqa: UP045
        source_type: str = "Generic",
        platform_metadata: Optional[dict] = None,  # noqa: UP045
    ) -> Document:
        """Creates And Persists A New Web Document Record In The Database."""

        document = Document(
            url=url,
            domain=domain,
            title=title,
            author=author,
            published_date=published_date,
            extracted_content=extracted_content,
            summary=summary,
            source_type=source_type,
            platform_metadata=platform_metadata,
        )
        db.add(document)
        await db.flush()  # Generates The document.id
        return document

    async def add_keywords(self, db: AsyncSession, document_id: int, keywords_list: list[tuple[str, float]]) -> None:
        """Associates Multiple Extracted Keywords And Scores With A Document."""

        for kw, score in keywords_list:
            keyword_record = Keyword(
                document_id=document_id,
                keyword=kw,
                score=score,
            )
            db.add(keyword_record)

    async def add_visit(self, db: AsyncSession, document_id: int, visited_at: datetime.datetime) -> VisitHistory:
        """Records A New Timestamped Visit For A Document."""

        visit = VisitHistory(document_id=document_id, visited_at=visited_at)
        db.add(visit)
        return visit

    async def update_summary(self, db: AsyncSession, document_id: int, summary: str) -> None:
        """Updates A Document's Summary Field."""

        result = await db.execute(select(Document).where(Document.id == document_id))
        document = result.scalars().first()

        if document:
            document.summary = summary
            document.updated_at = datetime.datetime.now(datetime.UTC).replace(tzinfo=None)

    async def search_by_keywords(self, db: AsyncSession, query_keywords: list[str], limit: int = 25) -> list[Document]:
        """Searches Documents By Matching Keywords. Returns Documents With The Most Keyword Hits First."""

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

    async def get_all_document_ids(self, db: AsyncSession) -> list[int]:
        """Returns All Document IDs Currently In The Database."""

        result = await db.execute(select(Document.id))
        return list(result.scalars().all())

    async def get_ids_by_time_window(
        self,
        db: AsyncSession,
        start_time: Optional[datetime.datetime] = None,
        end_time: Optional[datetime.datetime] = None,
    ) -> set[int]:
        """Retrieves a set of Document IDs where updated_at is within the specified time window."""

        query = select(Document.id)
        if start_time:
            query = query.where(Document.updated_at >= start_time)
        if end_time:
            query = query.where(Document.updated_at <= end_time)

        result = await db.execute(query)
        return set(result.scalars().all())

    async def delete(self, db: AsyncSession, document_id: int) -> bool:
        """Deletes A Document And Its Related Records By ID (Cascade Handles Keywords And Visits)."""

        result = await db.execute(select(Document).where(Document.id == document_id))
        document = result.scalars().first()
        if not document:
            return False

        await db.delete(document)
        logger.info(f"Deleted Document ID {document_id} From SQLite.")
        return True

    async def add_entities(self, db: AsyncSession, document_id: int, entities_list: list[tuple[str, str]]) -> None:
        """Associates Multiple Extracted Entities (name, type) With A Document."""

        for name, etype in entities_list:
            entity_record = Entity(
                document_id=document_id,
                name=name,
                type=etype,
            )
            db.add(entity_record)

    async def record_click(self, db: AsyncSession, query: str, document_id: int) -> None:
        """Logs a search result click signal to SQLite."""

        click_record = SearchClick(query=query.strip().lower(), document_id=document_id)
        db.add(click_record)

    async def get_clicks_for_query(self, db: AsyncSession, query: str) -> list[SearchClick]:
        """Retrieves all click records for a given search query (case-insensitive)."""

        result = await db.execute(select(SearchClick).where(SearchClick.query == query.strip().lower()))
        return list(result.scalars().all())

    async def record_search_query(self, db: AsyncSession, query: str) -> None:
        """Logs a search query to SQLite."""

        query_record = SearchQuery(query=query.strip())
        db.add(query_record)


# Singleton Instance
document_repository = DocumentRepository()
