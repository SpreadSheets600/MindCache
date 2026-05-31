import asyncio
import os

# Mock heavy modules before importing app components
import sys
import tempfile
from collections.abc import AsyncGenerator, Generator
from unittest.mock import AsyncMock, MagicMock, patch

import numpy as np
import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

# Now import app modules
from app.core.config import settings
from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.services.bm25_service import bm25_service
from app.services.embedding_service import embedding_service
from app.services.keyword_extractor import keyword_extractor
from app.services.ollama_service import ollama_service
from app.services.entity_extractor import entity_extractor
from app.services.vector_service import vector_service

# Use standard fast in-memory SQLite for test database
TEST_DB_URL = "sqlite+aiosqlite:///:memory:"


@pytest.fixture(scope="session")
def event_loop() -> Generator[asyncio.AbstractEventLoop, None, None]:
    """Create an instance of the default event loop for each test session."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture(scope="session", autouse=True)
async def init_test_db() -> AsyncGenerator[None, None]:
    """Initializes in-memory database tables for the test suite."""
    test_engine = create_async_engine(TEST_DB_URL, connect_args={"check_same_thread": False})
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Overwrite the session engine

    test_session_local = async_sessionmaker(
        bind=test_engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )

    # Patch session factory
    with patch("app.db.session.engine", test_engine), patch("app.db.session.AsyncSessionLocal", test_session_local):
        yield

    await test_engine.dispose()


@pytest_asyncio.fixture
async def db_session() -> AsyncGenerator[AsyncSession, None]:
    """Provides a transactional database session for a single test, rolling back changes afterward."""
    from app.db.session import AsyncSessionLocal

    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.rollback()  # Rollback to keep tests isolated
        finally:
            await session.close()


@pytest.fixture(autouse=True)
def mock_ai_services() -> Generator[None, None, None]:
    """Mocks heavy AI services to return deterministic outputs instantly without internet/hardware requirements."""
    # 1. Mock Embedding Generation
    # Return a dummy unit-length 384 float vector
    mock_vector = np.zeros(384, dtype=np.float32)
    mock_vector[0] = 1.0  # Normalized unit vector

    # 2. Mock Keyword Extraction
    mock_keywords = [("test", 0.95), ("browser", 0.8), ("memory", 0.75)]
    mock_entities = [("Google", "Company"), ("Rust", "Technology")]

    # 3. Temporary FAISS & BM25 index file paths for tests to avoid overwriting production data
    with tempfile.NamedTemporaryFile(suffix=".bin", delete=False) as tmp_faiss:
        test_faiss_path = tmp_faiss.name
    with tempfile.NamedTemporaryFile(suffix=".pkl", delete=False) as tmp_bm25:
        test_bm25_path = tmp_bm25.name

    old_faiss_path = settings.FAISS_INDEX_PATH
    settings.FAISS_INDEX_PATH = test_faiss_path

    old_bm25_path = settings.BM25_INDEX_PATH
    settings.BM25_INDEX_PATH = test_bm25_path

    # Apply patches
    with (
        patch.object(embedding_service, "get_dimension", return_value=384),
        patch.object(embedding_service, "generate_embedding", return_value=mock_vector),
        patch.object(embedding_service, "generate_embeddings", return_value=np.array([mock_vector])),
        patch.object(keyword_extractor, "extract_keywords", AsyncMock(return_value=mock_keywords)),
        patch.object(entity_extractor, "extract_entities", AsyncMock(return_value=mock_entities)),
        patch.object(ollama_service, "check_health", AsyncMock(return_value=True)),
        patch.object(ollama_service, "generate_summary", AsyncMock(return_value="Mocked AI summary.")),
        patch.object(
            ollama_service, "generate_collective_summary", AsyncMock(return_value="Mocked collective AI synthesis.")
        ),
    ):
        # Reset FAISS vector service to load from temporary test path
        vector_service.index_path = test_faiss_path
        vector_service.dimension = 384
        vector_service._load_index()

        # Reset BM25 service to load from temporary test path
        bm25_service.index_path = test_bm25_path
        bm25_service._load_index()

        yield

    # Clean up test files
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
async def client_override(db_session: AsyncSession) -> AsyncGenerator[AsyncSession, None]:
    """Overrides the FastAPI get_db dependency with our isolated test db session."""

    async def _get_db_override():
        yield db_session

    app.dependency_overrides[get_db] = _get_db_override
    yield db_session
    app.dependency_overrides.clear()
