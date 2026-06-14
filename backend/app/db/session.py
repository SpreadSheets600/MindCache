from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.core.config import settings

# Adapt SQLite URL For Async Compatibility With AIOsqlite
db_url = settings.DATABASE_URL
if db_url.startswith("sqlite:///"):
    db_url = db_url.replace("sqlite:///", "sqlite+aiosqlite:///")

# Create Async Engine. For SQLite, Disable Pool Pre-Ping Since It Is A Local Database File
connect_args = {}

if "sqlite" in db_url:
    # Allow Multiple Threads For Simple SQLite Reads
    connect_args["check_same_thread"] = False
    # Prevent "database is locked" errors under concurrent async access
    connect_args["timeout"] = 15

engine = create_async_engine(
    db_url,
    connect_args=connect_args,
    echo=False,  # True Only For Debug Logging
)

# Async Session Factory
AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Dependency For Obtaining An Async Database Session In Endpoints."""

    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()

        except Exception:
            await session.rollback()
            raise

        finally:
            await session.close()
