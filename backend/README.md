# MindCache Backend

FastAPI server managing web scraping, local AI models (Ollama), SQLite storage, and FAISS/BM25 vector indices. Handles the full ingestion pipeline: download, extraction, noise detection, keyword/entity extraction, chunking, embedding, and hybrid search.

---

## Quick Start

```bash
uv sync                              # Install dependencies
uv run uvicorn app.main:app --reload  # Start on :8000
```

Interactive API docs at `http://127.0.0.1:8000/docs`.

---

## Documentation

Full project docs are in the root [`docs/`](../docs/README.md) directory:

- [Architecture](../docs/Architecture.md) — System context, ingestion pipeline, retrieval
- [API Reference](../docs/API.md) — All endpoints with request/response examples
- [AI Pipeline](../docs/AI-Pipeline.md) — Embeddings, FAISS, Ollama summarization
- [Platform Extraction](../docs/Platform-Extraction.md) — YouTube, X/Twitter extractors
- [Setup Guide](../docs/Setup.md) — Config, migrations, testing, linting
- [Development Guide](../docs/Development.md) — Project structure, building, debugging

---

## Core Technologies

- **FastAPI** — Async Python web framework with auto-generated OpenAPI docs.
- **SQLAlchemy 2.0 + aiosqlite** — Fully async database layer for documents, keywords, entities, visits, and analytics.
- **FAISS** — Facebook AI Similarity Search using `IndexFlatIP` (inner product) with L2-normalized 768-dimensional vectors from `embeddinggemma:300m`.
- **BM25** — Rank-BM25 lexical engine for complementary keyword search.
- **Ollama** — Handles embedding generation, keyword extraction (with TF fallback), entity extraction (with regex fallback), page summarization, and collective search synthesis. Zero Python ML libraries in the process.
- **Trafilatura + BeautifulSoup4** — Server-side HTML content extraction fallback when client-side extraction is unavailable.
- **Platform extractors** — YouTube (yt-dlp metadata + youtube-transcript-api captions), X/Twitter (public CDN syndication API), plus a generic extractor with noise detection scoring.

---

## Key Features

- **Client-Side Extraction Bypass** — When the extension provides `extracted_content`, the backend skips HTTP download and Trafilatura entirely. The `auto_extract` field (`Optional[bool]`, default `true`) allows the extension to signal the visit was automatic; when `false` with no content, the backend returns `"recorded"` status and skips all processing.
- **Noise Detection** — Incoming pages are scored on a knowledge quality rubric (word count, unique words, path depth, platform match). Pages scoring below 2 are skipped. Platform search result URLs (Google Search, YouTube search) are excluded by path matching.
- **Dual-Layer Keyword Extraction** — Primary: Ollama LLM prompt returns exactly 5 keywords. Fallback: TF-based statistical counter when Ollama is unavailable.
- **Metadata-Enriched Chunking** — Pages over 3000 characters are split into overlapping blocks, each prepended with title, domain, source type, keywords, and entities for semantic context.
- **Hybrid Retrieval** — Weighted fusion of FAISS cosine similarity (0.45), BM25 lexical score (0.25), title match (0.10), keyword overlap (0.05), metadata match (0.05), recency decay (0.02), and source type boost (0.03). Results below 0.15 are filtered.
- **Dynamic Quality Multiplier** — Base score is multiplied by `(1 + quality_score * 0.05)` where quality is derived from dwell time, word count, source type, transcript availability, and revisit count.
- **Click-Based Ranking** — Documents clicked for the same query get a +0.10 boost per click (capped at +0.30).
- **Entity Extraction & Knowledge Graph** — Named entities (Persons, Companies, Technologies, Projects) extracted on ingestion. Exposed via `GET /graph` with document-entity edges and entity co-occurrence relationships.
- **Local RAG Synthesis** — On search with `generate_summary: true`, top results are compiled into a context block and sent to Ollama for collective synthesis with inline source citations.

---

## Example Commands

```bash
# Index a page with auto-extraction
curl -X POST http://127.0.0.1:8000/visit \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com/article", "auto_extract": true}'

# Index a page with pre-extracted content (from extension)
curl -X POST http://127.0.0.1:8000/visit \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com/article", "extracted_content": "## Article Text...", "title": "My Article"}'

# Record a visit without content processing (auto_extract off)
curl -X POST http://127.0.0.1:8000/visit \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com/article", "auto_extract": false}'

# Search history with AI summary
curl -X POST http://127.0.0.1:8000/search \
  -H "Content-Type: application/json" \
  -d '{"query": "vector databases", "limit": 5, "generate_summary": true}'

# List documents
curl http://127.0.0.1:8000/documents?skip=0&limit=20

# Get document details
curl http://127.0.0.1:8000/documents/1

# Delete a document
curl -X DELETE http://127.0.0.1:8000/documents/1

# Record a search click signal
curl -X POST http://127.0.0.1:8000/search/click \
  -H "Content-Type: application/json" \
  -d '{"query": "vector databases", "document_id": 1}'

# Check system health
curl http://127.0.0.1:8000/health

# Get knowledge graph data
curl "http://127.0.0.1:8000/graph?limit=50&min_keyword_freq=2"
```

---

## Project Structure

```
backend/
├── app/
│   ├── api/          # Routers: visit, search, documents, health, graph
│   ├── core/         # Config, logger, exception handlers
│   ├── db/           # Async SQLAlchemy sessions
│   ├── models/       # Tables: Document, Keyword, Entity, VisitHistory, SearchClick, SearchQuery
│   ├── repositories/ # CRUD interfaces (documents, keywords, entities, visits)
│   ├── schemas/      # Pydantic V2 request/response payloads
│   ├── services/     # Document processor, vector store, extractors, synthesis
│   │   └── extractors/  # Generic, YouTube, X/Twitter + factory
│   └── main.py       # FastAPI app, lifespan hooks, route registration
├── data/             # SQLite DB, FAISS index, BM25 index (gitignored)
├── migrations/       # Alembic version schemas
├── tests/            # 32 pytest tests (API, extractors, services)
├── Dockerfile        # Container build
├── docker-compose.yml# Orchestration with host-gateway Ollama routing
└── pyproject.toml    # Dependencies, tool configs
```
