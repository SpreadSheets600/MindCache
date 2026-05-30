import asyncio
import sys
from pathlib import Path

# Add backend directory to system path
sys.path.append(str(Path(__file__).resolve().parent.parent))

from app.db.base import Base
from app.db.session import AsyncSessionLocal, engine
from app.services.document_processor import document_processor
from app.services.search_service import search_service


async def run_e2e_test():
    print("====================================================")
    print("STARTING MINDCACHE LOCAL E2E VERIFICATION TEST")
    print("====================================================")

    # 1. Initialize DB tables
    print("\n[Step 1] Synchronizing local SQLite database schemas...")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("SQLite schemas initialized successfully.")

    # 2. Ingest some dummy web pages
    print("\n[Step 2] Processing and indexing dummy web pages...")
    urls = [
        "https://raw.githubusercontent.com/multica-ai/andrej-karpathy-skills/refs/heads/main/.cursor/rules/karpathy-guidelines.mdc",
        "https://raw.githubusercontent.com/HVND/stop-slop/main/README.md",
    ]

    async with AsyncSessionLocal() as db:
        for url in urls:
            print(f"\n-> Ingesting: {url}")
            try:
                # The document_processor will download, scrape, run KeyBERT, run SentenceTransformers,
                # save to SQLite, write to FAISS, and generate an Ollama summary!
                status, doc = await document_processor.process_url(db, url)
                print(f"   Ingestion Status: {status}")
                print(f"   Title: {doc.title}")
                print(f"   Keywords: {[k.keyword for k in doc.keywords]}")
                print(f"   AI Summary (Ollama): {doc.summary}")
            except Exception as e:
                print(f"   Ingestion Failed for {url}: {e}")

    # 3. Perform semantic search with AI Synthesis
    print("\n[Step 3] Executing Semantic Vector Search with local Ollama synthesis...")
    query = "How to write simple clean software code and cut AI slop"
    async with AsyncSessionLocal() as db:
        try:
            response = await search_service.search(db=db, query=query, limit=3, generate_summary=True)
            print(f"-> Search Query: '{query}'")
            print(f"-> Results Found: {len(response.results)}")
            for idx, item in enumerate(response.results, 1):
                print(f"   [{idx}] Title: {item.title}")
                print(f"       URL: {item.url}")
                print(f"       Score (Cosine Similarity): {item.score:.4f}")
            print("\n-> Local Collective AI Synthesis (Ollama):")
            print(response.ai_summary)
        except Exception as e:
            print(f"Search Failed: {e}")

    print("\n====================================================")
    print("MINDCACHE E2E VERIFICATION TEST COMPLETED")
    print("====================================================")


if __name__ == "__main__":
    asyncio.run(run_e2e_test())
