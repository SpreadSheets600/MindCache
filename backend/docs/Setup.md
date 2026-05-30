# Setup and Workflow Guide

This document describes how to install, configure, run, and test the MindCache backend locally.

## Prerequisites

You need these tools installed on your system.

- Python 3.12 or newer.
- `uv` for package management (highly recommended).
- A running instance of local Ollama (optional, for summaries).

## Installation

Install dependencies and set up the local virtual environment.

```bash
# Navigate to the backend directory
cd backend

# Synchronize dependencies using uv
uv sync
```

This creates a virtual environment in `.venv/` and downloads all runtime, dev, and AI dependencies.

## Local Configuration

MindCache checks settings via environmental variables. Create a `.env` file in the `backend/` directory to override default values.

```ini
DATABASE_URL=sqlite:///data/mindcache.db
FAISS_INDEX_PATH=data/faiss_index.bin
EMBEDDING_MODEL_NAME=all-MiniLM-L6-v2
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3
LOG_LEVEL=INFO
```

## Running the Application

Activate your virtual environment and start the development server using uvicorn.

```bash
# Start the server using uv runner
uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

The server launches, initializes SQLite database schemas programmatically in `data/mindcache.db`, and warms up the embedding model pipelines. Access interactive API documentation at `http://127.0.0.1:8000/docs`.

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

## Running the Test Suite

Execute the test suite using pytest. The tests use mocks for AI pipelines, so they run in milliseconds and require no internet access or model downloads.

```bash
# Run all tests
uv run pytest

# Run tests and show logs/print outputs
uv run pytest -s

# Run tests with coverage report
uv run pytest --cov=app tests/
```

## Linting and Code Quality

MindCache enforces strict formatting and linting rules using Ruff and Mypy.

```bash
# Run Ruff lint checks
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
