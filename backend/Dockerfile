# Use slim python image for clean runtime footprint
FROM python:3.12-slim

# Prevent python from writing pyc files and buffer stdout/stderr
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV HF_HOME=/app/model_cache

WORKDIR /app

# Install basic system build dependencies for potential FAISS compiles
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Fetch astral-sh/uv binary directly to build dependencies extremely fast
COPY --from=ghcr.io/astral-sh/uv:0.11.8 /uv /usr/local/bin/uv

# Copy project description files
COPY pyproject.toml uv.lock ./

# Synchonize dependencies in virtual environment (frozen lockfile)
RUN uv sync --frozen --no-dev

# Copy backend application code and config
COPY app/ ./app/
COPY migrations/ ./migrations/
COPY alembic.ini ./

# Create data persistence folder
RUN mkdir -p /app/data

# PRE-DOWNLOAD AI MODEL: Pre-caches the sentence transformer inside the image
# This ensures zero-network cold starts when booting the docker container.
RUN uv run python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('all-MiniLM-L6-v2')"

EXPOSE 8000

# Execute FastAPI via uvicorn binding on all network interfaces
CMD ["uv", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
