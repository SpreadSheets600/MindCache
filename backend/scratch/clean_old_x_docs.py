import asyncio
import sys
import os

# Add backend directory to path to enable imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db.session import AsyncSessionLocal
from app.repositories.document_repository import document_repository
from app.services.vector_service import vector_service
from app.services.bm25_service import bm25_service
from app.services.document_processor import document_processor

async def clean_and_reindex():
    print("Initializing cleanup and re-indexing...")
    db = AsyncSessionLocal()
    try:
        # Document IDs to fix
        target_ids = [36, 42, 44]
        urls_to_reindex = []
        
        for doc_id in target_ids:
            doc = await document_repository.get_by_id(db, doc_id)
            if doc:
                urls_to_reindex.append(doc.url)
                print(f"Found broken doc ID {doc_id} with URL: {doc.url}")
                # 1. Delete from SQLite
                await document_repository.delete(db, doc_id)
                # 2. Delete from FAISS
                vector_service.delete_document(doc_id)
                # 3. Delete from BM25
                bm25_service.remove_document(doc_id)
            else:
                print(f"Doc ID {doc_id} not found.")
        
        await db.commit()
        print("Successfully deleted broken X documents.")
        
        # Now re-index them using the new XExtractor
        for url in urls_to_reindex:
            print(f"Re-indexing {url}...")
            status, new_doc = await document_processor.process_url(db, url)
            print(f"Re-indexed {url} as ID {new_doc.id} with status: {status}")
            print(f"Extracted content length: {len(new_doc.extracted_content)}")
            print(f"Extracted content: {new_doc.extracted_content}\n")
            
    except Exception as e:
        print(f"Error occurred: {e}", exc_info=True)
    finally:
        await db.close()

if __name__ == "__main__":
    asyncio.run(clean_and_reindex())
