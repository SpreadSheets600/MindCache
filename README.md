<p align="center">
  <img src=".github/image/Banner.png" alt="MindCache Logo" />
</p>

# MindCache

> An AI-powered, completely local personal browser memory assistant. MindCache runs entirely on your local machine to scrape, index, summarize, and semantically search web pages you visit, ensuring absolute privacy for your browsing history.

---

## Architecture Overview

MindCache operates offline, coordinating a background tab monitor with a local vector and relational database pipeline.

```mermaid
graph TD
    A[Browser Tabs] -->|On Navigation / Tab Switch| B[Background Service Worker]
    B -->|Ingests URL & Title| C[FastAPI Local Server]
    C -->|Asynchronous Scraping| D[Trafilatura / BeautifulSoup4]
    D -->|Trimmed Content| E[Local Ollama: qwen3.5:2b]
    E -->|Ollama / Stat counter| F[Keyword Extraction]
    D -->|Doc Text| G[Ollama: embeddinggemma:300m]
    G -->|Normalized vectors| H[FAISS Vector Store (768d)]
    D -->|Full payload| I[SQLite Database]
    D -->|Optional summary| E
```

---

## Core Features

- **Absolute Local Privacy**: Zero external cloud or API calls. All indexing, vector computations, relational database storage, and AI syntheses occur on your localhost.
- **Background Ingestion & Tab Tracking**: The Chromium extension automatically registers visited URLs and pre-rendered tab titles, using debounces and domain exclusion rules.
- **Hybrid Content Scraping**: Utilizes specialized extraction pipelines for YouTube, X (Twitter), and Reddit (to capture subreddits, posts, and top discussion comments), falling back gracefully to Trafilatura and BeautifulSoup4 for generic web content.
- **Hugging Face-Free RAM Optimization**: Operates without heavy Hugging Face/SentenceTransformer dependencies in the python backend process, delegating both keyword extraction and embedding generation tasks to Ollama, reducing local process memory bloat and preventing unauthenticated download gates.
- **Spotlight Semantic Search**: Executes high-performance Cosine Similarity matches on FAISS inner product indices (768 dimensions) with real-time, debounced query auto-updates.
- **Local RAG Chat Synthesis**: Connects directly to local Ollama installations (`qwen3.5:2b`) to construct dynamic syntheses and answers from your browsing history with inline citations.

---

## Project Structure

MindCache is divided into two distinct components:

- **[`/backend`](backend/README.md)**: High-performance FastAPI server managing scrapers, local models (Ollama embeddings and prompt-based keyword generation), aiosqlite/SQLAlchemy ORM, and FAISS indices.
- **[`/extension`](extension/README.md)**: Manifest V3 browser extension and a full-featured spotlight dashboard built with React, TypeScript, Radix UI, Zustand, and TailwindCSS.

---

## Quick Start

### 1. Launch the Backend Server

Ensure you have Python 3.12+ installed. We recommend using `uv` for fast package management.

```bash
cd backend
# Install dependencies and sync virtual environment
uv sync

# Run the database migrations and start the server
uv run uvicorn app.main:app --reload
```

The server initializes the SQLite database at `backend/data/mindcache.db` and is reachable at `http://localhost:8000`.

### 2. Set Up the Browser Extension

Ensure you have Node.js 18+ installed.

```bash
cd extension
# Install dependencies
npm install

# Build the extension
npm run build
```

This generates compiled assets in `extension/dist`.

### 3. Load the Extension into your Browser

1. Navigate to the extensions page in your Chromium-based browser (e.g., `chrome://extensions` or `brave://extensions`).
2. Toggle **Developer mode** in the top right.
3. Click **Load unpacked** in the top left.
4. Select the `extension/dist` folder.

---

> [!IMPORTANT]
> **Ollama Integration**  
> To leverage RAG chat synthesis, automated page summarization, and embeddings generation, ensure [Ollama](https://ollama.ai/) is running locally and has both models pulled:
>
> ```bash
> # Pull LLM for summary, keywords, and synthesis
> ollama pull qwen3.5:2b
>
> # Pull Embedding Model for FAISS semantic indexing
> ollama pull embeddinggemma:300m
> ```
>
> ### Why Ollama and Why Not Hugging Face/SentenceTransformers?
> - **Zero Credentials & Gated Model Friction**: Models like Google Gemma require a Hugging Face account and license acceptance. Loading `google/embeddinggemma-300m` via Python's SentenceTransformers would crash without setting up `HF_TOKEN`. Ollama handles model distribution seamlessly without token credentials.
> - **Dramatically Lower Memory Footprint**: Rather than loading multi-gigabyte PyTorch/Hugging Face weight models directly in Python's memory (which bloats backend RAM by 1GB+), we offload embedding and generation to local Ollama, which uses optimized C++ (llama.cpp) with dynamic GPU/CPU offloading.
> - **Unified AI Backend**: Running both embeddings and text generation through a single local server (Ollama) reduces setup complexity and dependency updates.
