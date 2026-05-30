# AI Ingestion and Retrieval Pipeline

This document explains how MindCache downloads, parses, indexes, and retrieves web content using local machine learning pipelines.

## 1. Web Page Download and Extraction

MindCache handles webpage ingestion asynchronously to prevent blocking the FastAPI event loop.

### Download Phase

The system requests pages using the asynchronous HTTP client HTTPX. It passes a common desktop user-agent string to prevent websites from blocking automated headers.

### Extraction Phase

MindCache processes the downloaded HTML through Trafilatura. Trafilatura strips boilerplate clutter such as navigation menus, advertisements, footers, and sidebars. It outputs clean, markdown-friendly text along with page title, author, and date metadata.

If Trafilatura fails or returns empty text, MindCache falls back to BeautifulSoup4. BeautifulSoup4 strips script and style tags, then parses the raw textual representation from the HTML body.

## 2. Shared Model Keyword Extraction (Memory Optimization)

To extract relevant topics from webpages, MindCache uses KeyBERT.

### Memory Optimization Architecture

KeyBERT typically loads its own instance of a SentenceTransformer model, which uses about 450MB of RAM. Since MindCache already loads a SentenceTransformer instance for semantic vector search, it passes the _exact same preloaded model instance_ directly to KeyBERT.

```
┌───────────────────────────────────────────────────────────┐
│                    RAM / System Memory                    │
│                                                           │
│  ┌─────────────────────────────────────────────────────┐  │
│  │Shared SentenceTransformer ("BAAI/bge-small-en-v1.5")│  │
│  └──────────────┬──────────────────────────┬───────────┘  │
│                 │ (shared instance)        │              │
│                 ▼                          ▼              │
│     ┌──────────────────────┐    ┌─────────────────────┐   │
│     │   EmbeddingService   │    │  KeywordExtractor   │   │
│     │ (Generates Vectors)  │    │  (KeyBERT scoring)  │   │
│     └──────────────────────┘    └─────────────────────┘   │
└───────────────────────────────────────────────────────────┘
```

This optimization saves nearly 500MB of local RAM and prevents CPU/GPU compilation redundancy, enabling MindCache to run smoothly on lower-end local machines.

### Keyword Extraction Logic

KeyBERT calculates document embeddings, generates candidate terms (n-grams), embeds them using the shared transformer, and uses cosine similarity to select keywords that represent the page content. The system preserves the top five keywords and their scores.

## 3. Semantic Embedding Generation

MindCache uses `BAAI/bge-small-en-v1.5`, a fast sentence-transformer model that yields a 384-dimensional dense vector representing the semantics of the text.

### Ingestion Strategy

To capture both the high-level purpose and detailed content of a page, MindCache generates embeddings using a combined text block:
`Title: [page title] \n\n Content: [first 2000 characters of extracted text]`

This ensures search queries matching terms in the webpage title or introductory paragraphs score highly in vector distance.

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
