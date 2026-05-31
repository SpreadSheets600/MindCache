# MindCache Backend

The MindCache local engine is a high-performance Python backend built on FastAPI, SQLite (via SQLAlchemy + aiosqlite), and FAISS. It manages web scraping, text extraction, local semantic embedding generation, vector indexing, and local LLM orchestration.

---

## Core Technologies

- **FastAPI**: Asynchronous high-performance web routing framework.
- **SQLAlchemy 2.0 & aiosqlite**: Fully asynchronous database layer for non-blocking storage of document details, keywords, and visit history.
- **FAISS (Facebook AI Similarity Search)**: Custom flat inner product index wrapper for ultra-fast, L2-normalized cosine similarity search (dimension adjusted dynamically to 768 to support Gemma).
- **Ollama AI Integration**: Handles semantic vector generation (`embeddinggemma:300m`), page summary generation, and interactive RAG synthesis (`qwen3.5:2b`) without any heavy local ML Python libraries.
- **Trafilatura & BeautifulSoup4**: Combined HTML scraping pipeline to strip menus and ads, falling back structurally to clean text parsing when needed.
- **Dedicated Platforms Scrapers**: Custom, high-context extraction pipelines for YouTube, X (Twitter), and Reddit (to capture subreddit names, posts, and top discussion threads).

---

## Key Features

- **Non-Blocking Architecture**: Heavy CPU-bound structural parsing and metadata extractions run inside specialized thread pools (`asyncio.to_thread`) to ensure the ASGI event loop remains highly responsive.
- **Zero Python ML Overhead**: Both embedding and keyword extraction models run inside the Ollama daemon process, keeping Python process RAM extremely low (saving over 1GB+ system RAM compared to PyTorch/Transformers) and eliminating Hugging Face gate/token access friction.
- **Intelligent Deduplication**: Visited URLs are checked in real time. If a page is already indexed, the backend appends a visit record to history and updates timestamps without re-triggering heavy AI scrapers.
- **Tab Title Fallback**: Integrates incoming pre-rendered tab titles from the browser extension as a fallback in case paywalls, CAPTCHAs, or javascript restrictions block scrapers.
- **Max-Similarity Vector Merging**: Uses a robust max-selection strategy for document chunks to ensure multiple matches from a single long webpage do not cause score overwrite penalties.

---

## Project Structure

```
backend/
├── app/
│   ├── api/          # FastAPI routers (visit, search, documents, health)
│   ├── core/         # Configuration, logger, and exception handlers
│   ├── db/           # Async database sessions and base declarations
│   ├── models/       # Declarative tables (Document, Keyword, VisitHistory)
│   ├── repositories/ # Abstract SQLite CRUD interfaces
│   ├── schemas/      # Pydantic V2 validation payloads
│   ├── services/     # NLP, vector store, scraper, and synthesis engines
│   └── main.py       # Lifespan startup hooks and App entry point
│
├── data/             # Local database and vector storage folder
├── docs/             # Technical specifications & guides
├── migrations/       # Alembic version schemas
├── tests/            # High-coverage isolated mock test suite
└── pyproject.toml    # Modern python dependency description
```

---

## Quick Start

Ensure you have Python 3.12+ installed.

### Host Machine Run

```bash
# 1. Navigate to the backend folder
cd backend

# 2. Install dependencies and prepare local virtualenv
uv sync

# 3. Spin up the FastAPI hot-reload server
uv run uvicorn app.main:app --reload
```

The database initializes automatically inside `data/mindcache.db` and the API becomes reachable at `http://127.0.0.1:8000`.

### Docker Orchestration

Docker Compose configures automatic host-gateway routing to resolve local Ollama servers.

```bash
# Build and run containers in background
docker compose up --build -d
```

The API will be exposed on port `8000`. Data files are persisted to `./data` on your host.

---

## Example API Actions

### Register a Visited Page

```bash
curl -X POST http://127.0.0.1:8000/visit \
     -H "Content-Type: application/json" \
     -d '{"url": "https://example.com/privacy-article", "title": "Optional Tab Title"}'
```

### Search Browser History Semantically

```bash
curl -X POST http://127.0.0.1:8000/search \
     -H "Content-Type: application/json" \
     -d '{
       "query": "local search privacy",
       "limit": 3,
       "generate_summary": true
     }'
```

### Fetch Page Details

```bash
curl -X GET http://127.0.0.1:8000/documents/1
```

### Purge Page from Memory

```bash
curl -X DELETE http://127.0.0.1:8000/documents/1
```

---

> [!NOTE]
> **API & Architecture Specifications**  
> For granular technical details, refer to files in `docs/`:
>
> - [`Architecture.md`](docs/Architecture.md): Data flows, lifecycles, and backend service layouts.
> - [`API.md`](docs/API.md): Complete query payloads, schema validators, and responses.
> - [`Setup.md`](docs/Setup.md): Advanced configurations, migrations, and docker parameters.
