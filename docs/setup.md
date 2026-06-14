# Setup and Workflow Guide

This document describes how to install, configure, run, and test the MindCache backend locally.

## Prerequisites

You need these tools installed on your system.

- Python 3.12 or newer
- `uv` for package management (highly recommended)
- A running instance of local Ollama (required for AI features)

### Ollama Models

Pull the required models:

```bash
ollama pull qwen3.5:2b          # LLM for summaries, keywords, synthesis
ollama pull embeddinggemma:300m # Embedding model for FAISS indexing
```

You can also configure alternative models in `.env`:
- `OLLAMA_MODEL` — any Ollama chat model (e.g., `llama3`, `gemma4:31b-cloud`)
- `EMBEDDING_MODEL_NAME` — any Ollama embedding model (e.g., `nomic-embed-text`, `mxbai-embed-large`)

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
EMBEDDING_PROVIDER=ollama
EMBEDDING_MODEL_NAME=embeddinggemma:300m
EMBEDDING_DIMENSION=768
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=qwen3.5:2b
LOG_LEVEL=INFO
```

### Configuration Field Reference

| Field | Default | Description |
|---|---|---|
| `DATABASE_URL` | `sqlite:///data/mindcache.db` | SQLite database path |
| `FAISS_INDEX_PATH` | `data/faiss_index.bin` | FAISS vector index file |
| `BM25_INDEX_PATH` | `data/bm25_index.pkl` | BM25 lexical index file |
| `EMBEDDING_PROVIDER` | `huggingface` | "huggingface" or "ollama" |
| `EMBEDDING_MODEL_NAME` | `BAAI/bge-small-en-v1.5` | Embedding model name |
| `EMBEDDING_DIMENSION` | `384` | Default embedding dimension (auto-detected for Ollama) |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama server URL |
| `OLLAMA_MODEL` | `llama3` | Ollama generative model |
| `LOG_LEVEL` | `INFO` | Logging level (DEBUG, INFO, WARNING, ERROR) |

### Rationale: Ollama-Exclusive Integration vs. Hugging Face

MindCache executes all model inference via a local **Ollama** server rather than embedding Python-native Hugging Face / PyTorch loaders:

1. **Zero Access Friction**: Models like Gemma require accepting license agreements on Hugging Face. Loading them via Python would require a valid `HF_TOKEN`. Ollama bypasses this entirely.
2. **RAM Preservation**: Running model execution in Ollama's optimized C++ (llama.cpp) runtime avoids loading heavy models into Python's process space (saving 1GB+ RAM).
3. **Process Memory Isolation**: Offloading vector generation to Ollama means the Python backend never loads model binaries, keeping API server startup instant.
4. **Dynamic Dimension Detection**: The embedding dimension is auto-detected by querying Ollama `/api/embed` on first use, falling back to `EMBEDDING_DIMENSION` (384) if detection fails.

---

## Running the Application

```bash
# Start the server using uv runner (development mode with auto-reload)
uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

### What Happens on Startup

1. **Logging** is initialized
2. **Database schema** is synced — all tables created if missing, dynamic ALTER TABLE for column additions
3. **Background warmup** — AI models are pre-loaded in Ollama via `/api/embed` and `/api/generate` with `keep_alive=-1`
4. **FAISS index health check** — if dimension mismatch or empty index with documents in DB, automatic reindexing is triggered
5. Server is ready to accept requests on port 8000

Access interactive API documentation at `http://127.0.0.1:8000/docs`.

---

## Docker Deployment

### Build and Run

```bash
docker compose up --build -d
```

### Docker Configuration

- **Image**: `python:3.12-slim` with `uv` for dependency installation
- **Ports**: `8000:8000`
- **Volumes**: `./data:/app/data` (persistent SQLite/FAISS/BM25)
- **Ollama connection**: `http://host.docker.internal:11434` (via `extra_hosts`)
- **Embedding model**: defaults to `all-MiniLM-L6-v2` (pre-downloaded in build for cold start)
- **Restart policy**: `unless-stopped`

### Environment Overrides for Docker

```yaml
environment:
  - DATABASE_URL=sqlite:///data/mindcache.db
  - FAISS_INDEX_PATH=data/faiss_index.bin
  - EMBEDDING_MODEL_NAME=all-MiniLM-L6-v2
  - OLLAMA_BASE_URL=http://host.docker.internal:11434
  - OLLAMA_MODEL=llama3
  - LOG_LEVEL=INFO
```

---

## Database Migrations

MindCache handles migration versions using Alembic.

```bash
# Generate a new migration revision based on model changes
uv run alembic revision --autogenerate -m "describe_changes"

# Apply pending migrations to the local database
uv run alembic upgrade head

# Downgrade the schema by one revision
uv run alembic downgrade -1
```

**Note**: The project currently uses dynamic schema creation in `main.py` — tables are auto-created on startup via `Base.metadata.create_all()`, and missing columns are added via PRAGMA-based ALTER TABLE. The `migrations/versions/` directory is intentionally empty.

---

## Running the Test Suite

Execute the test suite using pytest. The tests use mocks for AI pipelines, so they run in milliseconds and require no internet access or model downloads.

```bash
# Run all tests
uv run pytest

# Run tests and show logs/print outputs
uv run pytest -s

# Run tests with coverage report
uv run pytest --cov=app tests/

# Run a specific test file
uv run pytest tests/test_api.py

# Run a specific test by name
uv run pytest tests/test_api.py -k "test_health_endpoint"
```

### Test Coverage

| Test File | Tests | Coverage Area |
|---|---|---|
| `tests/test_api.py` | 9 | Full API integration, search evaluation regression |
| `tests/test_extractors.py` | 14 | All platform extractors, factory, fallbacks |
| `tests/test_services.py` | 9 | Core services, quality scoring, BM25, FAISS |

---

## Linting and Code Quality

MindCache enforces strict formatting and linting rules using Ruff and Mypy.

```bash
# Run Ruff lint checks (with auto-fix)
uv run ruff check .

# Run Ruff formatting check
uv run ruff format --check .

# Run Mypy static type verification
uv run mypy .
```

You can activate pre-commit hooks to run these style checks automatically on every git commit.

```bash
uv run pre-commit install
```

### Pre-commit Hooks

Configured in `.pre-commit-config.yaml`:
- `ruff` — lints with `--fix --exit-non-zero-on-fix`
- `ruff-format` — checks formatting

### Code Style Rules

- Line length: 120 characters
- Target Python: 3.12
- Enabled rules: E, W, F, I, B, C4, UP
- Strict mypy with `warn_return_any` and `disallow_untyped_defs`
- Mypy overrides for trafilatura, faiss, bs4, yt_dlp (ignore_missing_imports)

---

## Troubleshooting

### FAISS Index Dimension Mismatch

If you change the embedding model, the stored FAISS index may have a different dimension than the new model's output. MindCache auto-detects this and triggers a full reindex on startup. To force reindex manually, delete the FAISS index file:

```bash
rm backend/data/faiss_index.bin
```

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
