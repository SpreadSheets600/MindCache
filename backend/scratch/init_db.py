import asyncio
from app.db.base import Base
from app.db.session import engine
from app.models.document import Document, Keyword, VisitHistory, Entity, SearchClick, SearchQuery

async def main():
    print("Initializing production database schemas...")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("Database tables created successfully.")

if __name__ == "__main__":
    asyncio.run(main())
