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

    from urllib.parse import urlparse

    parsed = urlparse(request.url)

    # Ignore All Internal And LocalHosts URLs TO Avoid Indexing Noise And Non-Informative Content
    if (
        parsed.hostname in ("localhost", "127.0.0.1", "0.0.0.0")
        or (parsed.hostname and parsed.hostname.startswith("192.168."))
        or (parsed.hostname and parsed.hostname.startswith("10."))
        or (
            parsed.hostname
            and parsed.hostname.startswith("172.")
            and parsed.hostname.split(".")[1].isdigit()
            and 16 <= int(parsed.hostname.split(".")[1]) <= 31
        )
    ):
        logger.info(f"Skipping localhost/internal URL: {request.url}")
        return VisitResponse(
            status="skipped",
            message="Localhost and internal URLs are not indexed.",
            document_id=None,
            title=request.title or parsed.netloc,
            domain=parsed.netloc,
        )
    try:
        if request.extracted_content:
            status, doc = await document_processor.process_pre_extracted(
                db,
                url=request.url,
                title=request.title,
                dwell_time=request.dwell_time,
                extracted_content=request.extracted_content,
                extracted_content_html=request.extracted_content_html,
                description=request.description,
                author=request.author,
                site_name=request.site_name,
                published_date=request.published_date,
                language=request.language,
                schema_org=request.schema_org,
                meta_tags=request.meta_tags,
                keywords=request.keywords,
                highlights=request.highlights,
                selection=request.selection,
                selection_html=request.selection_html,
            )
        else:
            status, doc = await document_processor.process_url(
                db, request.url, request.title, dwell_time=request.dwell_time
            )

        if status == "skipped":
            parsed = urlparse(request.url)
            return VisitResponse(
                status="skipped",
                message="Web Page Skipped from indexing because it was identified as noise (e.g. insufficient information content).",
                document_id=None,
                title=request.title or parsed.netloc,
                domain=parsed.netloc,
            )

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
