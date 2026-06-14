# MindCache Backend

FastAPI server managing web scraping, local AI models (Ollama), SQLite storage, and FAISS/BM25 vector indices.

---

## Quick Start

```bash
uv sync                              # Install dependencies
uv run uvicorn app.main:app --reload  # Start on :8000
```

API docs at `http://127.0.0.1:8000/docs`.

---

## Documentation

Full project docs are in the root [`docs/`](../docs/index.md) directory:

- [Architecture](../docs/architecture.md) — System context, ingestion pipeline, retrieval
- [API Reference](../docs/api.md) — All endpoints with request/response examples
- [AI Pipeline](../docs/ai-pipeline.md) — Embeddings, FAISS, Ollama summarization
- [Platform Extraction](../docs/platform-extraction.md) — YouTube, X/Twitter extractors
- [Setup Guide](../docs/setup.md) — Config, migrations, testing, linting
- [Development Guide](../docs/development.md) — Project structure, building, debugging

---

## Core Technologies

- **FastAPI** — Async Python web framework
- **SQLAlchemy 2.0 + aiosqlite** — Async database layer
- **FAISS** — Facebook AI Similarity Search (768d inner product)
- **Ollama** — Embedding generation + LLM inference (no Python ML libs)
- **Trafilatura + BeautifulSoup4** — HTML content extraction
- **Platform extractors** — YouTube (yt-dlp + transcripts), X/Twitter (syndication API)

---

## Example Commands

```bash
# Index a page
curl -X POST http://127.0.0.1:8000/visit \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com/article"}'

# Search history
curl -X POST http://127.0.0.1:8000/search \
  -H "Content-Type: application/json" \
  -d '{"query": "vector databases", "limit": 5}'

# List documents
curl http://127.0.0.1:8000/documents

# Delete a document
curl -X DELETE http://127.0.0.1:8000/documents/1
```

---

## Project Structure

```
app/
├── api/          # Routers: visit, search, documents, health
├── core/         # Config, logger, exceptions
├── db/           # Async sessions
├── models/       # SQLAlchemy tables
├── repositories/ # CRUD interfaces
├── schemas/      # Pydantic V2 payloads
├── services/     # NLP, vector store, scraper, synthesis
│   └── extractors/  # Platform-specific extractors
└── main.py       # Entry point
```
