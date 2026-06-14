# MindCache Documentation

MindCache is an AI-powered personal browser memory assistant that runs **100% locally**. It intercepts webpage visits, parses clean reading text, extracts key entities, builds hybrid search indices, and uses local AI models to search, synthesize, and organize web history without leaking data.

The project has two components:
- **[Backend](./backend)**: FastAPI server managing scrapers, Ollama models, SQLite storage, and FAISS/BM25 indices.
- **[Extension](./extension)**: Manifest V3 browser extension with client-side extraction, spotlight search, and settings dashboard.

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
| [AI Pipeline](ai-pipeline.md) | Embedding generation, FAISS search, Ollama summarization, hybrid retrieval |
| [Platform Extraction](platform-extraction.md) | YouTube, X/Twitter extractors, factory pattern, adding new extractors |
| [Setup Guide](setup.md) | Backend installation, environment config, migrations, testing, linting |
| [Development Guide](development.md) | Extension dev server, project structure, named constants, context menus, packaging |
| [Study Guide](study.md) | Educational deep-dive into search, embeddings, vector databases, RAG |

---

## Key Concepts

- **Client-side extraction**: The extension's content script uses Defuddle to extract page content directly from the DOM, bypassing server-side HTTP download. This enables indexing behind auth/paywalls and JS-rendered SPAs.
- **Auto-extraction toggle**: When disabled in settings, pages are tracked (URL + dwell time) but not extracted until the user explicitly captures them via popup, keyboard shortcut (`Ctrl+Shift+S`), or right-click context menu.
- **Three capture methods**: Keyboard shortcut, popup button, or right-click context menu (save page / save link / save selection).
- **Hybrid search**: Combines FAISS vector similarity (cosine), BM25 lexical matching, title/keyword overlap, and recency decay into a weighted score.
- **Zero cloud dependencies**: Everything runs on localhost — Ollama, SQLite, FAISS. No API keys needed.
