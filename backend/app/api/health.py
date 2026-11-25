from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.repositories.document_repository import document_repository
from app.services.embedder import DIMENSION, MODEL_ID, embedder
from app.services.vector_service import vector_service

router = APIRouter(tags=["System health"])


@router.get("/health", summary="Health check endpoint")
async def health_check(db: AsyncSession = Depends(get_db)):

    db_connected = False
    documents_count = 0

    try:
        await db.execute(text("SELECT 1"))
        db_connected = True
        documents_count = await document_repository.count_documents(db)

    except Exception:
        pass

    faiss_status = "error"
    vector_count = 0

    try:
        if vector_service._index is not None:
            faiss_status = "initialized"

            vector_count = vector_service._index.ntotal

    except Exception:
        pass

    embedding_status = embedder.status()

    is_healthy = db_connected and faiss_status == "initialized"
    status_str = "healthy" if is_healthy else "degraded"

    return {
        "status": status_str,
        "components": {
            "database": {
                "status": "connected" if db_connected else "disconnected",
                "documents_count": documents_count,
            },
            "faiss_index": {
                "status": faiss_status,
                "vectors_count": vector_count,
            },
            "embedding": {
                "status": embedding_status,
                "model": MODEL_ID,
                "dimension": DIMENSION,
                "reindexing": vector_service.needs_reindexing,
            },
        },
    }
