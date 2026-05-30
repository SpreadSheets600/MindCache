import asyncio
import os
import sys

# Add backend directory to path to enable imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db.session import AsyncSessionLocal
from app.repositories.document_repository import document_repository
from app.services.bm25_service import bm25_service
from app.services.document_processor import document_processor
from app.services.vector_service import vector_service


async def clean_and_reindex_google_searches():
    print("Initializing Google Search cleanup and re-indexing...")
    db = AsyncSessionLocal()
    try:
        # Document IDs to fix
        target_ids = [6, 31, 32, 33, 51, 53, 54, 55, 56, 57, 58]
        urls_to_reindex = []

        for doc_id in target_ids:
            doc = await document_repository.get_by_id(db, doc_id)
            if doc:
                urls_to_reindex.append(doc.url)
                print(f"Found broken Google Search doc ID {doc_id} with URL: {doc.url}")
                # 1. Delete from SQLite
                await document_repository.delete(db, doc_id)
                # 2. Delete from FAISS
                vector_service.delete_document(doc_id)
                # 3. Delete from BM25
                bm25_service.remove_document(doc_id)
            else:
                print(f"Doc ID {doc_id} not found.")

        await db.commit()
        print("Successfully deleted stale Google Search documents from database and index.")

        # Now re-index them using the GoogleSearchExtractor
        for url in urls_to_reindex:
            print(f"Re-indexing Google Search URL: {url}...")
            status, new_doc = await document_processor.process_url(db, url)
            print(f"Re-indexed as ID {new_doc.id} with status: {status}")
            print(f"Extracted content length: {len(new_doc.extracted_content)}")
            print(f"Title: {new_doc.title}")
            print(f"Source Type: {new_doc.source_type}")
            print(f"Extracted content sample: {new_doc.extracted_content[:200]}\n")

    except Exception as e:
        print(f"Error occurred during re-indexing: {e}", exc_info=True)
    finally:
        await db.close()


if __name__ == "__main__":
    asyncio.run(clean_and_reindex_google_searches())
