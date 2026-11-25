# Setup and Workflow Guide

This document describes how to install, configure, run, and test the MindCache backend locally.

## Prerequisites

You need these tools installed on your system.

- Python 3.12 or newer
- `uv` for package management (highly recommended)
- A running instance of local Ollama (required for AI features)

### Ollama Models

Embeddings use `google/embeddinggemma-2`, downloaded once (about 1.4 GB) from Hugging Face on your confirmation in the web app's Models page. It is not gated and needs no token. It runs on your computer, on the GPU when CUDA is available and on the CPU otherwise. Text generation is optional and is chosen on the same page: a local Transformers model, Ollama, or an OpenAI-compatible API with your own key.

---

## Installation

Install dependencies and set up the local virtual environment.

```bash
# Navigate to the backend directory
cd backend

# Synchronize dependencies using uv
uv sync
```

This creates a virtual environment in `.venv/` and downloads all runtime, dev, and AI dependencies listed in `pyproject.toml`.

### Production Dependencies

| Package | Version | Purpose |
|---|---|---|
| `fastapi` | >=0.110.0 | Web framework |
| `uvicorn` | >=0.28.0 | ASGI server |
| `pydantic` + `pydantic-settings` | >=2.6 | Validation + env config |
| `sqlalchemy` + `aiosqlite` | >=2.0 | Async ORM |
| `alembic` | >=1.13 | Database migrations |
| `trafilatura` + `beautifulsoup4` | >=1.8/4.12 | HTML extraction |
| `faiss-cpu` | >=1.8 | Vector similarity search |
| `numpy` | >=1.24 | Numerical arrays |
| `httpx` | >=0.27 | Async HTTP client |
| `rank-bm25` | >=0.2 | Lexical search |
| `yt-dlp` + `youtube-transcript-api` | latest | YouTube extraction |
| `pypdf` | >=6.12 | PDF parsing |
| `duckduckgo-search` + `ddgs` | >=8.1/9.14 | Search fallback |

---

## Local Configuration

MindCache checks settings via environmental variables. Create a `.env` file in the `backend/` directory to override default values.

```ini
DATABASE_URL=sqlite:///data/mindcache.db
FAISS_INDEX_PATH=data/faiss_index.bin
BM25_INDEX_PATH=data/bm25_index.pkl
LOG_LEVEL=INFO
```

### Configuration Field Reference

| Field | Default | Description |
|---|---|---|
| `DATABASE_URL` | `sqlite:///data/mindcache.db` | SQLite database path |
| `FAISS_INDEX_PATH` | `data/faiss_index.bin` | FAISS vector index file |
| `BM25_INDEX_PATH` | `data/bm25_index.pkl` | BM25 lexical index file |
| `LOG_LEVEL` | `INFO` | Logging level (DEBUG, INFO, WARNING, ERROR) |

### Embedding Model

MindCache uses one embedding model, `google/embeddinggemma-2` (768 dimensions), and it cannot be changed. The vector index records the model it was built with. If it was built with anything else, the index is reset on startup and every saved page is re-embedded in the background once the model is available. Keyword search keeps working in the meantime.

---

## Troubleshooting

### Search Shows Only Keyword Matches

The embedding model has not been downloaded yet. Open Models in the web app and download EmbeddingGemma 2. Saved pages are re-indexed automatically afterwards.

### Ollama Connection Issues

- Verify Ollama is running: `curl http://localhost:11434/api/tags`
- Check the `OLLAMA_BASE_URL` in `.env` matches your Ollama server
- In Docker, Ollama must be accessible at `host.docker.internal:11434`

### Database Reset

To start fresh, delete the SQLite database:

```bash
rm backend/data/mindcache.db
```

The database will be recreated with empty tables on next startup.
