import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from app.core.local_access import allowed_origin, local_host
from app.core.pairing import trusted_ids
from fastapi.middleware.cors import CORSMiddleware

from app.api import ai, documents, files, health, items, pairing, privacy, recall, search, visit
from app.core.config import settings
from app.core.logging import get_logger, setup_logging
from app.db.base import Base
from app.db.session import engine
from app.services.document_processor import document_processor
from app.services.chunk_index import chunk_index
from app.services.indexer import indexer
from app.services.page_chunks import backfill_pages
from app.services.watcher import watcher
from app.services.vector_service import vector_service

setup_logging()
logger = get_logger("app.main")


async def catch_up():
    rebuilding = chunk_index.needs_rebuild
    await backfill_pages(force=rebuilding)
    await indexer.rebuild_if_needed()
    await indexer.enqueue_unfinished()


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting MindCache Local Backend...")

    try:
        logger.info("Synchronizing SQLite Database Schemas ...")

        from sqlalchemy import text
        import app.models.document

        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

            cursor = await conn.execute(text("PRAGMA table_info(documents)"))
            columns = [row[1] for row in cursor.fetchall()]

            if "source_type" not in columns:
                logger.info("Upgrading Database: Adding source_type column to documents...")
                await conn.execute(text("ALTER TABLE documents ADD COLUMN source_type VARCHAR(50) DEFAULT 'Generic'"))
            if "platform_metadata" not in columns:
                logger.info("Upgrading Database: Adding platform_metadata column to documents...")
                await conn.execute(text("ALTER TABLE documents ADD COLUMN platform_metadata TEXT"))
            if "quality_score" not in columns:
                logger.info("Upgrading Database: Adding quality_score column to documents...")
                await conn.execute(text("ALTER TABLE documents ADD COLUMN quality_score FLOAT DEFAULT 0.0"))
            if "total_dwell_time" not in columns:
                logger.info("Upgrading Database: Adding total_dwell_time column to documents...")
                await conn.execute(text("ALTER TABLE documents ADD COLUMN total_dwell_time FLOAT DEFAULT 0.0"))

        logger.info("Database Schemas Synchronized Successfully.")

    except Exception as e:
        logger.critical(f"Critical Error During Database Schema Sync : {e}", exc_info=True)

    reindex = asyncio.create_task(document_processor.reindex_if_needed())
    indexer.start()
    startup = asyncio.create_task(catch_up())
    await watcher.start()

    yield

    reindex.cancel()
    startup.cancel()
    await watcher.stop()
    await indexer.stop()
    logger.info("MindCache Backend Shutting Down ...")

    try:
        vector_service.save()
        logger.info("FAISS Vector store saved successfully during shutdown.")

    except Exception as e:
        logger.error(f"Failed To Serialize FAISS Vector Index During Shutdown: {e}", exc_info=True)


app = FastAPI(
    title=settings.APP_NAME,
    description="Local Backend Engine For Analyzing And Indexing Web Pages.",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=False,
    allow_origins=[],
    allow_origin_regex=r"^(http://(localhost|127\.0\.0\.1|\[::1\])(:[0-9]+)?|chrome-extension://[a-p]{32})$",
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def restrict_local_browser_requests(request, call_next):
    host = request.headers.get("host", "")
    origin = request.headers.get("origin")
    if not local_host(host) or not allowed_origin(origin, host):
        return JSONResponse({"detail": "Only local MindCache clients may access this service."}, status_code=403)
    if origin and origin.startswith("chrome-extension://"):
        if request.url.path.startswith(("/ai", "/privacy", "/imports", "/pairing", "/folders", "/files", "/index", "/memory")):
            return JSONResponse({"detail": "Use the local web app to change these settings."}, status_code=403)
        try:
            paired = origin.removeprefix("chrome-extension://") in trusted_ids(pairing.PAIRING_PATH)
        except (ValueError, OSError):
            paired = False
        if not paired:
            return JSONResponse({"detail": "Pair this extension in MindCache Setup."}, status_code=403)
    return await call_next(request)


app.include_router(visit.router)
app.include_router(health.router)
app.include_router(search.router)
app.include_router(documents.router)
app.include_router(privacy.router)
app.include_router(ai.router)
app.include_router(items.router)
app.include_router(files.router)
app.include_router(recall.router)
app.include_router(pairing.router)


@app.get("/")
async def root():

    return {
        "app": settings.APP_NAME,
        "status": "Online",
        "documentation": "/docs",
    }

app.mount("/app", StaticFiles(directory=str(settings.BASE_DIR.parent / "frontend"), html=True), name="web")
