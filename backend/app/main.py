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

    # Asynchronously Warm Up Local AI Model Pipeline in background
    # This prevents blocking the main thread, letting the FastAPI backend start instantly.
    async def warm_up_models_background():
        try:
            logger.info("Warming up BGE Embedding Model in background...")
            _ = embedding_service.model
            
            logger.info("Warming up Cross-Encoder Reranker Model in background...")
            from app.services.reranker_service import reranker_service
            _ = reranker_service.model
            
            logger.info("All local AI models successfully loaded and active.")
        except Exception as err:
            logger.error(f"Background AI model warmup had issues: {err}", exc_info=True)

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
