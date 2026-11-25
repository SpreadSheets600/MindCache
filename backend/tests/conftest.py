import asyncio
import os
import tempfile
from collections.abc import AsyncGenerator, Generator
from unittest.mock import AsyncMock, MagicMock, patch

import numpy as np
import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

SESSION_DATA = tempfile.mkdtemp(prefix="mindcache-tests-")
os.environ["DATA_DIR"] = SESSION_DATA
os.environ["DATABASE_URL"] = f"sqlite:///{SESSION_DATA}/mindcache.db"
os.environ["FAISS_INDEX_PATH"] = f"{SESSION_DATA}/faiss_index.bin"
os.environ["BM25_INDEX_PATH"] = f"{SESSION_DATA}/bm25_index.pkl"

from app.core.config import settings
from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.services.bm25_service import bm25_service
from app.services.embedder import embedder
from app.services.keyword_extractor import keyword_extractor
from app.services.entity_extractor import entity_extractor
from app.services.vector_service import vector_service

TEST_DB_URL = "sqlite+aiosqlite:///:memory:"


@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture(scope="session", autouse=True)
async def init_test_db():
    test_engine = create_async_engine(TEST_DB_URL, connect_args={"check_same_thread": False})
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


    test_session_local = async_sessionmaker(
        bind=test_engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )

    with patch("app.db.session.engine", test_engine), patch("app.db.session.AsyncSessionLocal", test_session_local):
        yield

    await test_engine.dispose()


@pytest_asyncio.fixture
async def db_session():
    from app.db.session import AsyncSessionLocal

    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.rollback()
        finally:
            await session.close()


@pytest.fixture(autouse=True)
def mock_ai_services():
    mock_vector = np.zeros(384, dtype=np.float32)
    mock_vector[0] = 1.0

    mock_keywords = [("test", 0.95), ("browser", 0.8), ("memory", 0.75)]
    mock_entities = [("Google", "Company"), ("Rust", "Technology")]

    with tempfile.NamedTemporaryFile(suffix=".bin", delete=False) as tmp_faiss:
        test_faiss_path = tmp_faiss.name
    with tempfile.NamedTemporaryFile(suffix=".pkl", delete=False) as tmp_bm25:
        test_bm25_path = tmp_bm25.name

    old_faiss_path = settings.FAISS_INDEX_PATH
    settings.FAISS_INDEX_PATH = test_faiss_path

    old_bm25_path = settings.BM25_INDEX_PATH
    settings.BM25_INDEX_PATH = test_bm25_path

    with (
        patch.object(embedder, "embed_query", return_value=mock_vector),
        patch.object(embedder, "embed_documents", return_value=np.array([mock_vector])),
        patch.object(embedder, "status", return_value="ready"),
        patch.object(keyword_extractor, "extract_keywords", AsyncMock(return_value=mock_keywords)),
        patch.object(entity_extractor, "extract_entities", AsyncMock(return_value=mock_entities)),
    ):
        vector_service.index_path = test_faiss_path
        vector_service.dimension = 384
        vector_service._load_index()

        bm25_service.index_path = test_bm25_path
        bm25_service._load_index()

        yield

    if os.path.exists(test_faiss_path):
        try:
            os.remove(test_faiss_path)
        except OSError:
            pass
    settings.FAISS_INDEX_PATH = old_faiss_path
    vector_service.index_path = old_faiss_path
    vector_service._load_index()

    if os.path.exists(test_bm25_path):
        try:
            os.remove(test_bm25_path)
        except OSError:
            pass
    settings.BM25_INDEX_PATH = old_bm25_path
    bm25_service.index_path = old_bm25_path
    bm25_service._load_index()


@pytest_asyncio.fixture
async def client_override(db_session: AsyncSession):

    async def _get_db_override():
        yield db_session

    app.dependency_overrides[get_db] = _get_db_override
    yield db_session
    app.dependency_overrides.clear()
