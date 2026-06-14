# AI Ingestion and Retrieval Pipeline

This document explains how MindCache downloads, parses, indexes, and retrieves web content using local machine learning pipelines. The system uses a dual-layer strategy for every AI operation: a primary path via Ollama LLM/embedding models, with deterministic statistical fallbacks when Ollama is unavailable.

---

## 0. Client-Side Extraction Bypass

When the browser extension's content script can access the page DOM, the backend receives **pre-extracted content** via the `POST /visit` endpoint. The backend detects the presence of `extracted_content` in the request body and **skips** server-side HTTP download and HTML parsing entirely.

**Benefits:**
- Pages behind auth/paywalls work (the user is already logged in)
- JS-rendered SPAs yield full content (browser has the rendered DOM)
- Performance improves (no server round-trip for download)

**Fallback:** If `extracted_content` is absent, the server downloads and extracts the page using platform-specific extractors (see Section 1).

**Auto-extraction toggle:** When `auto_extract` is `false` and no `extracted_content` is provided, the backend returns `"recorded"` status and skips all processing — no download, no extraction, no indexing.

---

## 1. Web Page Download and Extraction

MindCache handles webpage ingestion asynchronously to prevent blocking the FastAPI event loop.

### Download Phase

The system requests pages using the asynchronous HTTP client HTTPX with a common desktop user-agent string. If HTTPX fails (e.g., TLS fingerprinting blocks on Medium), it falls back to `urllib` for a second attempt.

### Server-Side Extraction

If no `extracted_content` is provided, the backend routes the URL through the **ExtractorFactory** to select a platform-specific extractor:

| Platform | Extractor | Primary Method | Fallback |
|---|---|---|---|
| YouTube | `YouTubeExtractor` | yt-dlp (metadata) + youtube-transcript-api (captions) | Title + description + tags only |
| X/Twitter | `XExtractor` | fixupx.com syndication API | Partial metadata (username, tweet ID) |
| GitHub | `GitHubExtractor` | HTTPX (repo page HTML) | raw.githubusercontent.com README |
| Reddit | `RedditExtractor` | old.reddit.com HTML | GenericExtractor fallback |
| PDF | `PDFExtractor` | pypdf (metadata) + pspdfkit (to Markdown) | Filename-based title extraction |
| Google Search | `GoogleSearchExtractor` | SERP HTML scraping | DuckDuckGo Search API |
| Generic | `GenericExtractor` | Trafilatura | BeautifulSoup4 structural extraction |

### Generic Extraction Pipeline

1. **Trafilatura**: Strips navigation, ads, footers, sidebars; outputs clean markdown-friendly text with title, author, date metadata.
2. **BeautifulSoup4 fallback**: If Trafilatura returns empty, a structural BS4 extractor:
   - Preserves heading hierarchy as markdown headers
   - Converts lists and tables to clean text
   - Extracts meta descriptions as contextual preamble
   - Extracts OpenGraph, Twitter Card, and JSON-LD schema metadata

---

## 2. Dynamic Keyword Extraction

To extract relevant topics from webpages, MindCache utilizes a dual-layer keyword extraction strategy:

### Ollama Prompt-based Extraction (Primary)

MindCache queries the local Ollama LLM (`qwen3.5:2b`) using a precise extraction prompt. The prompt instructs the model to analyze the clean page text and return exactly five single-word keywords as a comma-separated string, avoiding introductory filler or markdown code blocks.

### TF-based Statistical Fallback

If the Ollama server is offline or busy, MindCache automatically triggers a deterministic **term-frequency counter**:

1. Tokenizes text (lowercase, split on non-alphanumeric)
2. Filters out punctuation and common English stop words (120+ stopwords)
3. Returns top 5 most frequent words with decaying scores: `1.0, 0.9, 0.8, 0.7, 0.6`

This hybrid approach guarantees keyword availability with zero system memory impact (no local PyTorch weights in the FastAPI server).

---

## 3. Semantic Embedding Generation

MindCache uses `embeddinggemma:300m` via local Ollama, which generates a **768-dimensional** dense vector representing the deep semantics of the text.

### Why embeddinggemma:300m and Why Ollama?

- **Frictionless License**: Gemma models are gated on Hugging Face. Ollama distributes `embeddinggemma:300m` seamlessly.
- **Process Memory Isolation**: Offloading vector generation to Ollama means the Python backend never loads model binaries, saving massive RAM.
- **Dynamic Dimension Detection**: The embedding dimension is auto-detected by querying Ollama `/api/embed` on first call, falling back to configured default (384) if detection fails.

### Embedding Generation

The `EmbeddingService` (`embedding_service.py`) handles all embedding operations:

- **Single embedding**: `generate_embedding(text)` → Ollama `/api/embed`
- **Batch embedding**: `generate_embeddings(texts)` → batch Ollama `/api/embed`
- **Query cache**: In-memory FIFO cache (512 entries) for repeated query embeddings
- **Health check**: `check_health()` → verifies model availability via Ollama `/api/tags`
- **Dimension detection**: `get_dimension()` → queries Ollama to determine output dimensions

### Metadata-Enriched Chunking Strategy

To capture both high-level purpose and detailed context, documents are chunked before embedding:

1. Pages longer than **3000 characters** are split into overlapping blocks (500-character overlap)
2. Each chunk is prepended with global document metadata:

```
Title: [page title]
Domain: [domain]
Source Type: [type]
Keywords: [k1, k2, ...]
Entities: [name:type, ...]
Metadata: [platform-specific: stars, topics, channel, etc.]

Content (Chunk X/Y): [text]
```

This guarantees that queries matching either global metadata or granular inner-content blocks score highly in FAISS distance calculations. For example, a search for "popular Rust PDF library" will match because "Stars: 5200" and "Rust" are part of the metadata prefix in every chunk.

---

## 4. FAISS Vector Search and Cosine Similarity

MindCache uses FAISS (Facebook AI Similarity Search) to index and search generated vectors.

### Index Configuration

- **Index type**: `IndexFlatIP` (Inner Product) wrapped in `IndexIDMap` for ID-based operations
- **Vector normalization**: All document and query vectors are L2-normalized to unit length
- **Similarity metric**: Since both stored and query vectors are unit-length, inner product equals cosine similarity:

$$\text{Cosine Similarity} = \frac{\mathbf{A} \cdot \mathbf{B}}{\|\mathbf{A}\| \|\mathbf{B}\|} = \mathbf{A} \cdot \mathbf{B} \text{ (when } \|\mathbf{A}\| = \|\mathbf{B}\| = 1)$$

### Persistence

- Index is persisted to `data/faiss_index.bin` and loaded on server startup
- Saved on shutdown and after every add/delete operation
- Automatic dimension-mismatch detection: if the embedding model changes, the index is rebuilt

### Search Operation

```python
search_similar(query_embedding, limit=5) -> [(doc_id, cosine_similarity), ...]
```

Returns top-K document IDs along with their cosine similarity scores (0-1).

### Document Vector Deletion

When a document is deleted, `remove_ids()` purges the vectors from RAM and updates the serialized index on disk.

---

## 5. Local Ollama Summarization and Synthesis

Ollama runs outside the FastAPI process as a local desktop service (typically port 11434). The `OllamaService` (`ollama_service.py`) manages all communication.

### Document Summarization (Ingestion)

During URL ingestion, after the document is indexed in FAISS and BM25, a background job:

1. Sends the extracted webpage text to `/api/generate` with a summarization prompt
2. Requests a 2-3 sentence summary capturing the core topic and key points
3. Updates the SQLite document record with the generated summary

### Collective Synthesis (Search)

When the user enables AI summaries during search:

1. The top matching documents from FAISS + BM25 are gathered
2. Their titles, summaries, and content snippets are compiled into a context block
3. Ollama is queried with a synthesis prompt that:
   - Instructs the model to cite sources by number `[1]`, `[2]`
   - Avoids introductory boilerplate ("Based on the provided context...")
   - Synthesizes findings into cohesive paragraphs
4. The synthesis is returned alongside search results

### Query Expansion

Before searching, the query is optionally expanded using Ollama:

- `expand_query_concepts()` generates alternative phrasings (1-4 words each)
- Used to augment the BM25 lexical search for better recall
- Example: "RAG pipeline" → ["retrieval augmented generation", "RAG architecture", "document retrieval"]

### Health Checks

- `check_health()` verifies both embedding and generative models are available
- If Ollama is offline, the system degrades gracefully:
  - Keyword extraction falls back to TF-based statistical extraction
  - Entity extraction falls back to regex pattern matching
  - Summarization and synthesis are skipped (return null)

---

## Pipeline Summary

```
User visits URL
    │
    ▼
Extension sends POST /visit
    │
    ▼
extracted_content provided?
    ├── YES → process_pre_extracted() [skip download]
    └── NO  → process_url()
                │
                ▼
            ExtractorFactory.get_extractor(url)
                │
                ├── YouTube → yt-dlp + captions
                ├── X/Twitter → syndication API
                ├── GitHub → page HTML + raw README
                ├── Reddit → old.reddit.com HTML
                ├── PDF → pypdf + pspdfkit
                ├── Google Search → SERP + DuckDuckGo
                └── Generic → Trafilatura + BS4
                    │
                    ▼
            Keyword Extraction
                ├── Primary: Ollama LLM (5 keywords)
                └── Fallback: TF frequency counter
                    │
                    ▼
            Entity Extraction
                ├── Primary: Ollama LLM (persons, companies, tech)
                └── Fallback: Regex patterns
                    │
                    ▼
            Quality Score Calculation
                │
                ▼
            Chunk Content (3000 char, 500 overlap)
                │
                ▼
            Metadata Enrichment (title, domain, keywords, entities)
                │
                ▼
            Embedding Generation (Ollama → 768D vectors)
                │
                ▼
            Store in SQLite + FAISS + BM25
                │
                ▼
            Background Summary Generation (Ollama)
```

```
User searches
    │
    ▼
POST /search {query}
    │
    ▼
Query Expansion (Ollama concept expansion)
    │
    ▼
FAISS Vector Search (top 30) + BM25 Lexical Search (top 40) + Keyword Match
    │
    ▼
Merge Candidates → Fetch Metadata → Click Boost
    │
    ▼
Weighted Score Fusion
    │
    ▼
YouTube Timestamp Mapping
    │
    ▼
Filter Scores < 0.15 → Rank
    │
    ▼
Optional: Ollama Collective Summary
    │
    ▼
Return Search Results
```
