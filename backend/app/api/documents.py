from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import DocumentNotFoundError, MindCacheException
from app.core.logging import get_logger
from app.db.session import get_db
from app.repositories.document_repository import document_repository
from app.schemas.document import DocumentResponse, KeywordResponse
from app.services.bm25_service import bm25_service
from app.services.vector_service import vector_service

router = APIRouter(tags=["Document Management"])
logger = get_logger(__name__)


@router.get(
    "/documents",
    response_model=list[DocumentResponse],
    status_code=200,
    summary="list Stored Documents",
)
async def list_documents(
    skip: int = Query(0, ge=0, description="Number Of Documents to Skip."),
    limit: int = Query(20, ge=1, le=100, description="Max Number Of Documents To Return."),
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> list[DocumentResponse]:
    """Retrieves All Indexed Browser Memory Documents Ordered By Last Updated Timestamp."""

    try:
        documents = await document_repository.list_documents(db, skip=skip, limit=limit)

        response_list = []
        for doc in documents:
            keywords_res = [
                KeywordResponse(keyword=kw.keyword, score=kw.score)
                for kw in sorted(doc.keywords, key=lambda k: k.score, reverse=True)
            ]
            visit_res = [visit.visited_at for visit in sorted(doc.visits, key=lambda v: v.visited_at)]

            response_list.append(
                DocumentResponse(
                    id=doc.id,
                    url=doc.url,
                    domain=doc.domain,
                    title=doc.title,
                    author=doc.author,
                    published_date=doc.published_date,
                    extracted_content=doc.extracted_content,
                    source_type=doc.source_type,
                    platform_metadata=doc.platform_metadata,
                    summary=doc.summary,
                    created_at=doc.created_at,
                    updated_at=doc.updated_at,
                    keywords=keywords_res,
                    visit_history=visit_res,
                )
            )
        return response_list
    except Exception as e:
        logger.error(f"Failed To List Documents : {e}", exc_info=True)

        raise HTTPException(
            status_code=500,
            detail="Failed To Retrieve Document Listing.",
        ) from e


@router.get(
    "/documents/{document_id}",
    response_model=DocumentResponse,
    status_code=200,
    summary="Get Document Details By ID",
)
async def get_document(
    document_id: int,
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> DocumentResponse:
    """Retrieves The Full Extracted Content, Metadata, Keyword List, And Visit History Of A Single Page."""

    try:
        doc = await document_repository.get_by_id(db, document_id)

        if not doc:
            raise DocumentNotFoundError(document_id)

        keywords_res = [
            KeywordResponse(keyword=kw.keyword, score=kw.score)
            for kw in sorted(doc.keywords, key=lambda k: k.score, reverse=True)
        ]

        visit_res = [visit.visited_at for visit in sorted(doc.visits, key=lambda v: v.visited_at)]

        return DocumentResponse(
            id=doc.id,
            url=doc.url,
            domain=doc.domain,
            title=doc.title,
            author=doc.author,
            published_date=doc.published_date,
            extracted_content=doc.extracted_content,
            source_type=doc.source_type,
            platform_metadata=doc.platform_metadata,
            summary=doc.summary,
            created_at=doc.created_at,
            updated_at=doc.updated_at,
            keywords=keywords_res,
            visit_history=visit_res,
        )
    except MindCacheException as e:
        raise HTTPException(status_code=e.status_code, detail=e.message) from e

    except Exception as e:
        logger.error(f"Error Fetching Document ID {document_id} : {e}", exc_info=True)

        raise HTTPException(
            status_code=500,
            detail="Failed To Retrieve Document Details.",
        ) from e


@router.delete(
    "/documents/{document_id}",
    status_code=200,
    summary="Delete A Document",
)
async def delete_document(
    document_id: int,
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> dict:
    """Deletes A Webpage's Database Record ( SQLite Cascading Keywords And Visits ) And Clears Its FAISS Vector."""

    try:
        # Delete From SQLite DB
        deleted = await document_repository.delete(db, document_id)

        if not deleted:
            raise DocumentNotFoundError(document_id)

        # Commit SQLite Transaction First So FAISS Deletion Only Occurs if DB Delete Succeeds
        await db.commit()

        # Delete Vector From FAISS Index And BM25 Index
        vector_service.delete_document(document_id)
        bm25_service.remove_document(document_id)

        return {"message": f"Document ID {document_id} Was Successfully Deleted From Local Memory."}

    except MindCacheException as e:
        raise HTTPException(status_code=e.status_code, detail=e.message) from e

    except Exception as e:
        logger.error(f"Error Deleting Document ID {document_id} : {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Failed To Delete Document.",
        ) from e
