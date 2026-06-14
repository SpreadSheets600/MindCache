<p align="center">
  <img src=".github/image/Banner.png" alt="MindCache Logo" />
</p>

# MindCache

> An AI-powered, completely local personal browser memory assistant. MindCache runs entirely on your local machine to scrape, index, summarize, and semantically search web pages you visit, ensuring absolute privacy for your browsing history.

---

## Quick Start

```bash
# 1. Start the backend
cd backend
uv sync
uv run uvicorn app.main:app --reload

# 2. Build the extension (in another terminal)
cd extension
npm install
npm run build
```

3. Load `extension/dist/` as an unpacked extension in Chrome/Brave (`chrome://extensions` → Developer mode → Load unpacked).

> **Ollama required** for AI features:
> ```bash
> ollama pull qwen3.5:2b
> ollama pull embeddinggemma:300m
> ```

---

## Documentation

Everything is in the [`docs/`](docs/index.md) directory:

| Doc | What It Covers |
|---|---|
| [Index / Quick Start](docs/index.md) | Landing page, prerequisites, backend + extension setup |
| [Architecture](docs/architecture.md) | System context, ingestion pipeline, extension modules, retrieval |
| [API Reference](docs/api.md) | All REST endpoints with request/response examples |
| [AI Pipeline](docs/ai-pipeline.md) | Embeddings, FAISS search, Ollama summarization |
| [Platform Extraction](docs/platform-extraction.md) | YouTube, X/Twitter extractors, factory pattern |
| [Setup Guide](docs/setup.md) | Backend config, migrations, testing, linting |
| [Development Guide](docs/development.md) | Extension build, project structure, constants, context menus |
| [Study Guide](docs/study.md) | Deep-dive into search, embeddings, vector databases, RAG |

---

## Core Features

- **Absolute Local Privacy**: Zero cloud API calls. All indexing, vector computation, and AI synthesis runs on localhost.
- **Background Ingestion**: Extension tracks active tabs, computes dwell time, auto-indexes after 10 seconds. Path/extension blacklists filter noise.
- **Client-Side Extraction**: Defuddle extracts content directly from the DOM — works behind auth, paywalls, and JS SPAs.
- **Three Capture Methods**: Keyboard shortcut (`Ctrl+Shift+S`), popup button, or right-click context menu (page/link/selection).
- **Auto-Extraction Toggle**: When off, pages are tracked but not extracted until manually captured.
- **Hybrid Search**: FAISS vector similarity + BM25 lexical matching + title/keyword overlap + recency decay.
- **Local RAG**: Ollama-powered summaries and collective search synthesis with inline citations.
- **Spotlight Search UI**: Keyboard-first popup with relevance scores, domain badges, and match classification.
- **Interactive Knowledge Graph**: Visualize documents, entities, and keywords with co-occurrence edges.

---

## Project Structure

```
MindCache/
├── backend/          # FastAPI server (Python)
│   ├── app/          # API routes, services, models
│   ├── tests/        # Pytest suite
│   └── data/         # SQLite + FAISS storage
├── extension/        # Browser extension (TypeScript/React)
│   ├── src/          # Background, content, popup, settings
│   ├── tests/        # Vitest suite
│   ├── dist/         # Build output
│   └── public/       # Manifest
└── docs/             # Unified documentation
```
