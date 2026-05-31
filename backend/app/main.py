import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import documents, health, search, visit
from app.core.config import settings
from app.core.logging import get_logger, setup_logging
from app.db.base import Base
from app.db.session import engine
from app.services.bm25_service import bm25_service
from app.services.embedding_service import embedding_service
from app.services.vector_service import vector_service

# Initialization Of Logging Setup
setup_logging()
logger = get_logger("app.main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Handles The Startup And Shutdown Lifecycle Of The Application"""

    logger.info("Starting MindCache Local Backend...")

    # Automatic Database Schema Synchronization
    try:
        logger.info("Synchronizing SQLite Database Schemas ...")

        from sqlalchemy import text
        from app.models.document import Document, Keyword, VisitHistory, Entity, SearchClick, SearchQuery

        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

            # Retrieve existing columns to execute dynamic schema migration
            cursor = await conn.execute(text("PRAGMA table_info(documents)"))
            columns = [row[1] for row in cursor.fetchall()]

            if "source_type" not in columns:
                logger.info("Upgrading Database: Adding source_type column to documents...")
                await conn.execute(text("ALTER TABLE documents ADD COLUMN source_type VARCHAR(50) DEFAULT 'Generic'"))
            if "platform_metadata" not in columns:
                logger.info("Upgrading Database: Adding platform_metadata column to documents...")
                await conn.execute(text("ALTER TABLE documents ADD COLUMN platform_metadata TEXT"))

        logger.info("Database Schemas Synchronized Successfully.")

    except Exception as e:
        logger.critical(f"Critical Error During Database Schema Sync : {e}", exc_info=True)

    # Asynchronously Warm Up Local AI Model Pipeline and check for reindexing in background
    # This prevents blocking the main thread, letting the FastAPI backend start instantly.
    async def warm_up_models_background():
        try:
            logger.info(f"Checking/Warming up Ollama Embedding Model '{embedding_service.model_name}' in background...")
            await embedding_service.check_health()
            
            logger.info("All local AI models successfully loaded and active.")

            # Check if FAISS index is empty or dimension mismatch occurred, and re-index from DB if necessary
            from app.db.session import AsyncSessionLocal
            from sqlalchemy import select, func
            from app.models.document import Document
            from app.services.document_processor import document_processor

            async with AsyncSessionLocal() as db:
                cursor = await db.execute(select(func.count(Document.id)))
                db_doc_count = cursor.scalar() or 0

                if vector_service.needs_reindexing or (vector_service._index is not None and vector_service._index.ntotal == 0 and db_doc_count > 0):
                    logger.info(
                        f"FAISS index needs rebuild/re-index (needs_reindexing={vector_service.needs_reindexing}, "
                        f"vectors={vector_service._index.ntotal if vector_service._index else 0}, db_docs={db_doc_count}). Re-indexing now..."
                    )
                    await document_processor.reindex_all_documents(db)
                    await db.commit()

        except Exception as err:
            logger.error(f"Background AI model warmup or re-indexing failed: {err}", exc_info=True)

    # Spawn the background task immediately on startup
    asyncio.create_task(warm_up_models_background())

    yield  # Application Runs Here

    # Shutdown Cleanup
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

# CORS Middleware For Local Browser Extension Connections
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register Routers For API Endpoints
app.include_router(visit.router)
app.include_router(health.router)
app.include_router(search.router)
app.include_router(documents.router)


@app.get("/")
async def root() -> dict:
    """Standard Root Endpoint Returning Backend Metadata."""

    return {
        "app": settings.APP_NAME,
        "status": "Online",
        "documentation": "/docs",
    }
