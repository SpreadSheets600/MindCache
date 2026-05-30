from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import MindCacheException
from app.core.logging import get_logger
from app.db.session import get_db
from app.schemas.document import VisitRequest, VisitResponse
from app.services.document_processor import document_processor

router = APIRouter(tags=["Visit Ingestion"])
logger = get_logger(__name__)


@router.post(
    "/visit",
    response_model=VisitResponse,
    status_code=201,
    summary="Record And Process A Visited URL",
)
async def record_visit(
    request: VisitRequest,
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> VisitResponse:
    """Accepts A URL, Extracts Page Content/Metadata, Generates Keywords & Embeddings, And Indexes It."""

    logger.info(f"Accepting Visit URL : {request.url}")
    try:
        status, doc = await document_processor.process_url(db, request.url, request.title)

        if status == "duplicate":
            return VisitResponse(
                status="duplicate",
                message="URL Visit Recorded. Page Content Was Already Indexed.",
                document_id=doc.id,
                title=doc.title,
                domain=doc.domain,
            )

        return VisitResponse(
            status="success",
            message="Web Page Processed And Semantically Indexed Successfully.",
            document_id=doc.id,
            title=doc.title,
            domain=doc.domain,
        )

    except MindCacheException as e:
        logger.error(f"Application Error Processing Visit : {e.message}", exc_info=True)
        raise HTTPException(status_code=e.status_code, detail=e.message) from e

    except Exception as e:
        logger.error(f"Unexpected Error Processing Visit: {e}", exc_info=True)

        raise HTTPException(
            status_code=500,
            detail=f"An Unexpected Internal Error Occurred During Processing: {str(e)}",
        ) from e
