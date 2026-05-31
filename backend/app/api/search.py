from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import MindCacheException
from app.core.logging import get_logger
from app.db.session import get_db
from app.schemas.document import SearchRequest, SearchResponse, ClickRequest
from app.services.search_service import search_service
from app.repositories.document_repository import document_repository

router = APIRouter(tags=["Search"])
logger = get_logger(__name__)


@router.post(
    "/search",
    status_code=200,
    response_model=SearchResponse,
    summary="Semantic Natural Language Search Across History",
)
async def semantic_search(
    request: SearchRequest,
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> SearchResponse:
    """Performs Semantic Search Using Vector Similarity And Generates An Optional Collective AI Summary."""

    try:
        response = await search_service.search(
            db=db,
            query=request.query,
            limit=request.limit,
            generate_summary=request.generate_summary,
            start_time=request.start_time,
            end_time=request.end_time,
        )

        return response

    except MindCacheException as e:
        logger.error(f"Application Error During Search : {e.message}", exc_info=True)
        raise HTTPException(status_code=e.status_code, detail=e.message) from e

    except Exception as e:
        logger.error(f"Unexpected Error During Search: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"An unexpected Error Occurred During Search: {str(e)}",
        ) from e


@router.post(
    "/search/click",
    status_code=200,
    summary="Record A User Click On A Search Result",
)
async def record_search_click(
    request: ClickRequest,
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> dict:
    """Logs the click event to enable dynamic rank-boosting for clicked documents on subsequent queries."""
    try:
        await document_repository.record_click(db, request.query, request.document_id)
        await db.commit()
        return {"status": "success", "message": "Search click recorded successfully."}
    except Exception as e:
        logger.error(f"Failed to record search click: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to record search click: {str(e)}",
        ) from e
