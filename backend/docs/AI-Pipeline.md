# AI Ingestion and Retrieval Pipeline

This document explains how MindCache downloads, parses, indexes, and retrieves web content using local machine learning pipelines.

## 1. Web Page Download and Extraction

MindCache handles webpage ingestion asynchronously to prevent blocking the FastAPI event loop.

### Download Phase

The system requests pages using the asynchronous HTTP client HTTPX. It passes a common desktop user-agent string to prevent websites from blocking automated headers.

### Extraction Phase

MindCache processes the downloaded HTML through Trafilatura. Trafilatura strips boilerplate clutter such as navigation menus, advertisements, footers, and sidebars. It outputs clean, markdown-friendly text along with page title, author, and date metadata.

If Trafilatura fails or returns empty text, MindCache falls back to BeautifulSoup4. BeautifulSoup4 strips script and style tags, then parses the raw textual representation from the HTML body.

## 2. Dynamic Keyword Extraction (RAM & Setup Optimization)

To extract relevant topics from webpages, MindCache utilizes a dual-layer keyword extraction strategy:

### Ollama Prompt-based Extraction
MindCache queries the local Ollama LLM (`qwen3.5:2b`) using a precise extraction prompt. The prompt instructs the model to analyze the clean page text and return exactly five single-word keywords as a comma-separated string, avoiding introductory filler or markdown code blocks.

### Classical Statistical Fallback
If the Ollama server is offline or busy processing other tasks, MindCache automatically triggers a deterministic, **statistical term-frequency counter**. The system splits the text into tokens, filters out punctuation and common English stop words, and returns the top five most frequent words.

This hybrid approach guarantees keyword availability and reliability with zero system memory impact (no local PyTorch weights loaded inside the FastAPI server).

## 3. Semantic Embedding Generation

MindCache uses `embeddinggemma:300m` via local Ollama, which generates a **768-dimensional** dense vector representing the deep semantics of the text.

### Why embeddinggemma:300m and Why Ollama?
- **Frictionless License Agreement**: Standard Gemma models are gated on Hugging Face. Running them via local SentenceTransformers would fail unless you log in and set up your `HF_TOKEN`. Ollama distributes `embeddinggemma:300m` seamlessly.
- **Process Memory Isolation**: Offloading vector generation to the local Ollama service means the python backend doesn't load heavy model binaries into the application process memory, saving massive RAM and keeping the API server startup instant.

### Ingestion Strategy

To capture both the high-level purpose and detailed context of a page, MindCache generates embeddings for webpage chunks. Each chunk is enriched with global document metadata (Title, Domain, Platform/Source Type, and Extracted Keywords) prepended to the chunk text:

`Title: [page title] \n\n Domain: [domain] \n\n Source Type: [type] \n\n Keywords: [keywords] \n\n Content (Chunk X): [content]`

This guarantees that queries matching either global metadata or granular inner-content blocks score highly in FAISS distance calculations.

## 4. FAISS Vector Search and Cosine Similarity

MindCache uses FAISS (Facebook AI Similarity Search) to index generated vectors.

### Cosine Similarity via Inner Product

FAISS implements standard L2 distance or raw inner product search. To calculate true Cosine Similarity, MindCache normalizes every document embedding to unit length (L2 norm of 1.0) before adding it to a FAISS `IndexFlatIP` (Inner Product) index.

$$\text{Cosine Similarity} = \frac{\mathbf{A} \cdot \mathbf{B}}{\|\mathbf{A}\| \|\mathbf{B}\|}$$

Since both the stored document vector $\mathbf{A}$ and query vector $\mathbf{B}$ are L2-normalized ($\|\mathbf{A}\| = 1.0$, $\|\mathbf{B}\| = 1.0$), the inner product formula resolves to:

$$\text{Inner Product} = \mathbf{A} \cdot \mathbf{B} = \text{Cosine Similarity}$$

This mathematical alignment yields accurate, high-performance cosine similarity scoring.

### Document Vector Deletion

MindCache wraps its flat index in a FAISS `IndexIDMap`. When you delete a document, the database ID is sent to `remove_ids`, which purges the vector from RAM and updates the serialized index on disk.

## 5. Local Ollama Summarization and Synthesis

Ollama runs outside the FastAPI process as a local desktop service (typically port 11434).

### Document Summarization (Ingestion)

During URL ingestion, if Ollama is running and has the target model installed, MindCache sends the extracted webpage text to `/api/generate` with a prompt requesting a three-sentence summary. The system updates the SQLite document record with the result.

### Collective Synthesis (Search)

If you request a search summary, MindCache extracts the top matching documents from FAISS and SQLite, compiles their contents into a context block, and queries Ollama. Ollama synthesizes the documents to draft a single comprehensive answer addressing your search query. It includes inline source citations (e.g., `[1]`, `[2]`).
