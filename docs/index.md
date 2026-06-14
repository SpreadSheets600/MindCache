# MindCache Documentation

MindCache is an AI-powered personal browser memory assistant that runs **100% locally**. It intercepts webpage visits, parses clean reading text, extracts key entities, builds hybrid search indices, and uses local AI models to search, synthesize, and organize web history without leaking data.

The project has two components:

- **[Backend](./backend)**: FastAPI server managing scrapers, Ollama models, SQLite storage, and FAISS/BM25 indices.
- **[Extension](./extension)**: Manifest V3 browser extension with client-side extraction, spotlight search overlay, popup, and settings dashboard.

## Quick Start

### Prerequisites

| Tool | Version | Purpose |
|---|---|---|
| Python | 3.12+ | Backend server |
| `uv` | latest | Python package manager |
| Node.js | 18+ | Extension build |
| Ollama | latest | AI models (embeddings + LLM) |

Pull the required Ollama models:

```bash
ollama pull qwen3.5:2b          # LLM for summaries, keywords, synthesis
ollama pull embeddinggemma:300m  # Embedding model for FAISS indexing
```

### 1. Start the Backend

```bash
cd backend
uv sync                                    # Install dependencies
uv run uvicorn app.main:app --reload       # Start server on :8000
```

The database auto-initializes at `backend/data/mindcache.db`. API docs at `http://127.0.0.1:8000/docs`.

### 2. Build and Load the Extension

```bash
cd extension
npm install        # Install dependencies
npm run build      # Compile TypeScript → extension/dist/
```

Then in Chrome/Brave/Edge:

1. Go to `chrome://extensions`
2. Enable **Developer mode** (top-right)
3. Click **Load unpacked** → select `extension/dist/`

### 3. Verify It Works

Visit any webpage, wait 10 seconds, then check:

- Backend logs show a `POST /visit` transaction.
- Extension popup shows "System Active & Recording".
- `GET http://127.0.0.1:8000/documents` returns indexed pages.

---

## Documentation Map

| Doc | What It Covers |
|---|---|
| [Architecture](architecture.md) | System context, ingestion pipeline, extension modules, retrieval pipeline, state management, build outputs |
| [API Reference](api.md) | All REST endpoints: visit ingestion, search, document management, knowledge graph, health |
| [AI Pipeline](AI-Pipeline.md) | Embedding generation, FAISS search, Ollama summarization, hybrid retrieval |
| [Platform Extraction](PlatformExtraction.md) | YouTube, X/Twitter, GitHub, Reddit, PDF, Google Search extractors, factory pattern, adding new extractors |
| [Setup Guide](Setup.md) | Backend installation, environment config, migrations, testing, linting |
| [Development Guide](development.md) | Extension dev server, project structure, named constants, context menus, packaging |
| [Study Guide](Study.md) | Educational deep-dive into search, embeddings, vector databases, RAG |

---

## Key Concepts

- **Client-side extraction**: The extension's content script uses Defuddle to extract page content directly from the DOM, bypassing server-side HTTP download. This enables indexing behind auth/paywalls and JS-rendered SPAs.
- **Auto-extraction toggle**: When disabled in settings, pages are tracked (URL + dwell time) but not extracted until the user explicitly captures them via popup, keyboard shortcut (`Ctrl+Shift+S`), or right-click context menu.
- **Three capture methods**: Keyboard shortcut, popup button, or right-click context menu (save page / save link / save selection).
- **Spotlight search overlay**: Press `Ctrl+Shift+K` to open a spotlight-style search overlay that searches both open tabs and indexed memory.
- **Hybrid search**: Combines FAISS vector similarity (cosine), BM25 lexical matching, title/keyword overlap, and recency decay into a weighted score.
- **Knowledge graph**: Interactive graph visualization of documents, entities, and keywords with force-directed physics simulation.
- **Platform-specific extractors**: YouTube (yt-dlp + captions), X/Twitter (syndication API), GitHub (stars + README), Reddit (comments), PDF (pypdf), Google Search (SERP + DuckDuckGo fallback).
- **Zero cloud dependencies**: Everything runs on localhost — Ollama, SQLite, FAISS. No API keys needed.

---

## Project Structure

```
MindCache/
├── backend/
│   ├── app/
│   │   ├── api/              # FastAPI routers (visit, search, documents, health)
│   │   ├── core/             # Config (pydantic-settings), logger, exceptions
│   │   ├── db/               # Async SQLAlchemy session management
│   │   ├── models/           # ORM models (Document, Keyword, Entity, VisitHistory, etc.)
│   │   ├── repositories/     # CRUD data access layer
│   │   ├── schemas/          # Pydantic V2 request/response schemas
│   │   ├── services/         # Business logic (NLP, vector store, scraper, synthesis)
│   │   │   └── extractors/   # Platform-specific content extractors
│   │   └── main.py           # FastAPI app entry point with lifespan events
│   ├── data/                 # SQLite DB + FAISS + BM25 index files
│   ├── migrations/           # Alembic migration configuration
│   ├── tests/                # Pytest test suite with AI service mocks
│   ├── Dockerfile            # Production container image
│   ├── docker-compose.yml    # Backend + volume mount
│   └── pyproject.toml        # Dependencies and tool config
├── extension/
│   ├── public/manifest.json  # Manifest V3 permissions and commands
│   ├── src/
│   │   ├── background/       # Service worker: tab tracking, context menus, message routing
│   │   ├── content/          # Content script: Defuddle extraction, search overlay UI
│   │   ├── popup/            # Popup UI: connection status, manual capture
│   │   ├── settings/         # Dashboard: search, graph, memories, settings tabs
│   │   ├── components/       # Shared React components (DocumentDetail, KnowledgeGraph)
│   │   ├── services/         # BackendClient API wrapper with retry logic
│   │   ├── store/            # Zustand stores (settings, search, connection)
│   │   └── types/            # TypeScript interfaces
│   ├── tests/                # Vitest tests with Chrome API mocks
│   ├── build.js              # 3-stage production build script
│   └── vite.config.ts        # Vite dev configuration
├── docs/                     # Documentation
└── README.md
```
