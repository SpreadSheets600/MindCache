import asyncio
import os
import sys

# Add backend directory to path to enable imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import or_, select

from app.db.session import AsyncSessionLocal
from app.models.document import Document
from app.repositories.document_repository import document_repository
from app.services.bm25_service import bm25_service
from app.services.document_processor import document_processor
from app.services.vector_service import vector_service


async def clean_and_reindex_reddit():
    print("Scanning database for existing Reddit documents to migrate...")
    db = AsyncSessionLocal()
    try:
        # Query all documents whose URL contains reddit.com or redd.it
        result = await db.execute(
            select(Document).where(
                or_(
                    Document.url.like("%reddit.com%"),
                    Document.url.like("%redd.it%"),
                )
            )
        )
        reddit_docs = result.scalars().all()

        if not reddit_docs:
            print("No existing Reddit documents found in the database.")
            return

        print(f"Found {len(reddit_docs)} Reddit documents to update:")
        urls_to_reindex = []

        for doc in reddit_docs:
            print(f"  - [ID {doc.id}] URL: {doc.url}")
            urls_to_reindex.append(doc.url)

            # 1. Delete from SQLite
            await document_repository.delete(db, doc.id)
            # 2. Delete from FAISS
            vector_service.delete_document(doc.id)
            # 3. Delete from BM25
            bm25_service.remove_document(doc.id)

        await db.commit()
        print("Successfully cleared outdated Reddit indexes from SQLite, FAISS, and BM25.\n")

        # Now re-index them using the new RedditExtractor
        for url in urls_to_reindex:
            print(f"Re-indexing {url} with high-context RedditExtractor...")
            try:
                status, new_doc = await document_processor.process_url(db, url)
                print(f"  -> SUCCESS: Re-indexed as ID {new_doc.id} | Status: {status}")
                print(f"  -> Extracted title: '{new_doc.title}'")
                print(f"  -> Content size: {len(new_doc.extracted_content)} characters\n")
            except Exception as extract_err:
                print(f"  -> FAILED to re-index {url}: {extract_err}\n")

        print("Reddit document migration complete!")

    except Exception as e:
        print(f"Error occurred during migration: {e}")
    finally:
        await db.close()


if __name__ == "__main__":
    asyncio.run(clean_and_reindex_reddit())
