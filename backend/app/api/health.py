from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.repositories.document_repository import document_repository
from app.services.ollama_service import ollama_service
from app.services.vector_service import vector_service

router = APIRouter(tags=["System health"])


@router.get("/health", summary="Health check endpoint")
async def health_check(db: AsyncSession = Depends(get_db)) -> dict:  # noqa: B008
    """Executed Live Diagnostics Checks On The Database, Vector Store, And Local AI Model Server."""

    # Check For SQLite Database Connection
    db_connected = False
    documents_count = 0

    try:
        await db.execute(text("SELECT 1"))
        db_connected = True
        documents_count = await document_repository.count_documents(db)

    except Exception:
        pass

    # Check For FAISS Index
    faiss_status = "error"
    vector_count = 0

    try:
        if vector_service._index is not None:
            faiss_status = "initialized"

            vector_count = vector_service._index.ntotal

    except Exception:
        pass

    # Check For Model Server
    ollama_online = await ollama_service.check_health()

    # Check For Embedding Model Server/Local Status
    from app.services.embedding_service import embedding_service
    embedding_online = await embedding_service.check_health()
    embedding_model = embedding_service.model_name
    embedding_provider = embedding_service.provider

    # Determine Overall Status
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
            "ollama": {
                "status": "connected" if ollama_online else "offline",
                "model": ollama_service.model if ollama_online else None,
            },
            "embedding": {
                "status": "connected" if embedding_online else "offline",
                "model": embedding_model,
                "provider": embedding_provider,
            },
        },
    }
