# API Reference

The MindCache backend runs on `http://localhost:8000` by default. All endpoints return JSON. The extension communicates with the backend exclusively through `src/services/BackendClient.ts`.

---

## Visit Ingestion

### `POST /visit`

Ingests and indexes a visited web page. Accepts client-side extracted content or triggers server-side download.

#### Basic Payload

```json
{
    "url": "https://example.com/ai-memory-article"
}
```

#### Enriched Payload (Client-Side Extraction)

When the extension's content script extracts content via Defuddle, the backend skips server-side HTTP download and extraction:

```json
{
    "url": "https://example.com/ai-memory-article",
    "title": "Local AI Personal Memory Systems",
    "dwell_time": 42.5,
    "auto_extract": true,
    "extracted_content": "## AI Memory Systems\n\nThis article discusses...",
    "extracted_content_html": "<h2>AI Memory Systems</h2><p>This article discusses...</p>",
    "description": "A deep dive into local AI memory systems",
    "author": "Jane Doe",
    "site_name": "Example Blog",
    "published_date": "2026-05-29",
    "language": "en",
    "schema_org": {"@type": "Article", "headline": "..."},
    "meta_tags": [{"name": "keywords", "content": "ai, memory"}],
    "keywords": ["ai", "memory", "vector"],
    "highlights": [{"text": "key passage", "content": "<em>key passage</em>", "xpath": "/html/body/p[1]"}],
    "selection": "selected text in markdown",
    "selection_html": "<p>selected text in HTML</p>"
}
```

#### Request Fields

| Field | Type | Default | Description |
|---|---|---|---|
| `url` | string | required | Full URL (must start with http:// or https://) |
| `title` | string | null | Page title from browser tab |
| `dwell_time` | float | null | Time spent on page in seconds |
| `extracted_content` | string | null | Client-extracted markdown body (skips server download) |
| `extracted_content_html` | string | null | Client-extracted HTML body |
| `description` | string | null | Meta description |
| `author` | string | null | Author name |
| `site_name` | string | null | Site name from OpenGraph |
| `published_date` | string | null | ISO date string |
| `language` | string | null | Page language code |
| `schema_org` | object | null | JSON-LD schema.org data |
| `meta_tags` | array | null | Array of `{name, property, content}` objects |
| `keywords` | array | null | Client-extracted keyword list |
| `auto_extract` | bool | true | When false and no content, skip processing entirely |
| `highlights` | array | null | Highlighted text fragments `{text, content, xpath}` |
| `selection` | string | null | User-selected text (context menu) |
| `selection_html` | string | null | HTML of selection |

#### Responses

**New document (201)**:

```json
{
    "status": "success",
    "message": "Web page processed and semantically indexed successfully.",
    "document_id": 4,
    "title": "Local AI Personal Memory Systems",
    "domain": "example.com"
}
```

**Duplicate URL (201)** — Visit recorded, content already indexed; quality_score and dwell_time updated:

```json
{
    "status": "duplicate",
    "message": "URL visit recorded. Page content was already indexed.",
    "document_id": 4,
    "title": "Local AI Personal Memory Systems",
    "domain": "example.com"
}
```

**Recorded without content (201)** — When `auto_extract` is `false`:

```json
{
    "status": "recorded",
    "message": "Visit recorded without content extraction (auto_extract is off).",
    "document_id": null,
    "title": null,
    "domain": "example.com"
}
```

**Skipped as noise (201)** — Knowledge quality score < 2 or platform search page:

```json
{
    "status": "skipped",
    "message": "Web Page Skipped from indexing because it was identified as noise (e.g. insufficient information content).",
    "document_id": null,
    "title": "Google Search: best vector database for rag",
    "domain": "google.com"
}
```

#### Error Responses

- **400** — Invalid URL (malformed or non-HTTP scheme):

  ```json
  { "detail": "URL 'ftp://invalid' is invalid: Only HTTP and HTTPS protocols are supported." }
  ```

- **422** — Extraction failure (page unreachable or no readable text):

  ```json
  { "detail": "Failed to extract content from https://example.com/empty: Webpage has no parseable text content." }
  ```

---

## Semantic Search

### `POST /search`

Searches history using natural language query matching with optional time filtering. Executes hybrid retrieval: FAISS vector search + BM25 lexical search + keyword matching + click boosting.

#### Request

```json
{
    "query": "local vector database search",
    "limit": 5,
    "generate_summary": true,
    "start_time": "2026-05-01T00:00:00Z",
    "end_time": "2026-05-31T23:59:59Z"
}
```

| Field | Type | Default | Description |
|---|---|---|---|
| `query` | string | required | Natural language search query (min 1 char) |
| `limit` | int | 5 | Max results (1-50) |
| `generate_summary` | bool | false | Generate AI collective summary of results |
| `start_time` | ISO timestamp | optional | Filter results visited after this time |
| `end_time` | ISO timestamp | optional | Filter results visited before this time |

#### Response

```json
{
    "query": "local vector database search",
    "results": [
        {
            "id": 4,
            "url": "https://example.com/ai-memory-article",
            "domain": "example.com",
            "title": "Local AI Personal Memory Systems",
            "summary": "This article discusses running browser memory databases locally.",
            "score": 0.892,
            "published_date": "2026-05-29T00:00:00",
            "last_visited_at": "2026-05-30T11:42:00",
            "total_dwell_time": 120.5,
            "keywords": [
                { "keyword": "vector", "score": 0.91 },
                { "keyword": "database", "score": 0.85 }
            ],
            "source_type": "Generic"
        }
    ],
    "ai_summary": "Your visited history contains an article about local browser memory databases. It details running vector indices locally to preserve privacy [1]."
}
```

#### Result Fields

| Field | Type | Description |
|---|---|---|
| `id` | int | Document ID |
| `url` | string | Page URL |
| `domain` | string | Extracted domain |
| `title` | string | Page title |
| `summary` | string | AI-generated summary |
| `score` | float | Combined relevance score (0-1) |
| `published_date` | ISO datetime | Article publish date |
| `last_visited_at` | ISO datetime | Most recent visit |
| `total_dwell_time` | float | Accumulated dwell time |
| `keywords` | array | Extracted keywords with scores |
| `source_type` | string | Generic, GitHub, YouTube, Reddit, X, PDF |

### `POST /search/click`

Records a click signal for search result ranking optimization. Boosts clicked documents by +0.10 per click (capped at +0.30) for future identical queries.

#### Request

```json
{
    "query": "local vector database",
    "document_id": 4
}
```

#### Response

```json
{
    "status": "success",
    "message": "Click signal recorded for query 'local vector database' on document 4."
}
```

---

## Document Management

### `GET /documents`

Lists indexed documents ordered by updated timestamp descending.

| Parameter | Default | Max | Description |
|---|---|---|---|
| `skip` | 0 | — | Skip N records |
| `limit` | 20 | 100 | Max records to return |

**Response** (200): Array of document objects with keywords, entities, and visit history:

```json
[
    {
        "id": 4,
        "url": "https://example.com/ai-memory-article",
        "domain": "example.com",
        "title": "Local AI Personal Memory Systems",
        "author": "John Doe",
        "published_date": "2026-05-29T00:00:00",
        "extracted_content": "Full parsed page content...",
        "source_type": "Generic",
        "platform_metadata": null,
        "summary": "This article discusses running browser memory databases locally.",
        "total_dwell_time": 120.5,
        "created_at": "2026-05-30T11:40:00",
        "updated_at": "2026-05-30T11:42:00",
        "keywords": [
            { "keyword": "vector", "score": 0.91 }
        ],
        "entities": [
            { "name": "FAISS", "type": "Technology" },
            { "name": "Meta", "type": "Company" }
        ],
        "visit_history": ["2026-05-30T11:40:00", "2026-05-30T11:42:00"]
    }
]
```

### `GET /documents/{id}`

Retrieves full extracted content, metadata, entities, keywords, and visit history for a specific document.

- **200**: Single document object matching the list format above
- **404**: `{ "detail": "Document with ID 99 was not found" }`

### `DELETE /documents/{id}`

Removes a webpage from SQLite (cascade deletes keywords, entities, visits, clicks) and removes its vectors from FAISS index and BM25 index.

**Response** (200):

```json
{ "message": "Document ID 4 was successfully deleted from local memory." }
```

### `POST /documents/{id}/summarize`

Generates an AI summary for a document using Ollama. Checks Ollama health first. Updates the document's `summary` field.

**Response** (200):

```json
{
    "message": "Summary generated successfully.",
    "summary": "This article discusses running browser memory databases locally..."
}
```

---

## Knowledge Graph

### `GET /graph`

Returns entities, keywords, and relationships for knowledge graph visualization. Used by the InteractiveKnowledgeGraph component in the settings dashboard.

| Parameter | Default | Max | Description |
|---|---|---|---|
| `limit` | 100 | 500 | Max documents to include |
| `min_keyword_freq` | 2 | 10 | Min keyword frequency for node inclusion |

#### Response

```json
{
    "nodes": {
        "documents": [
            {
                "id": "doc_4",
                "label": "Local AI Personal Memory Systems",
                "type": "document",
                "url": "https://example.com/ai-memory-article",
                "domain": "example.com",
                "source_type": "Generic",
                "updated_at": "2026-05-30T11:42:00",
                "visit_count": 2
            }
        ],
        "entities": [
            { "id": "ent_0", "label": "FAISS", "type": "entity", "entity_type": "Technology", "document_count": 3 },
            { "id": "ent_1", "label": "Meta", "type": "entity", "entity_type": "Company", "document_count": 2 }
        ],
        "keywords": [
            { "id": "kw_vector", "label": "vector", "type": "keyword", "document_count": 5 }
        ]
    },
    "edges": [
        { "source": "doc_4", "target": "kw_vector", "type": "has_keyword" },
        { "source": "doc_4", "target": "ent_0", "type": "has_entity" },
        { "source": "ent_0", "target": "ent_1", "type": "co_occurs", "weight": 2 }
    ],
    "stats": {
        "document_count": 10,
        "entity_count": 15,
        "keyword_count": 8,
        "edge_count": 45
    }
}
```

#### Edge Types

| Type | Meaning |
|---|---|
| `has_keyword` | Document references a keyword |
| `has_entity` | Document mentions an entity |
| `co_occurs` | Two entities/keywords appear in the same document |

---

## System Health

### `GET /health`

Checks diagnostic status of all system components — database, FAISS index, Ollama generative model, and embedding service.

#### Response (200)

```json
{
    "status": "healthy",
    "components": {
        "database": { "status": "connected", "documents_count": 128 },
        "faiss_index": { "status": "initialized", "vectors_count": 256 },
        "ollama": { "status": "connected", "model": "qwen3.5:2b" },
        "embedding": { "status": "connected", "model": "embeddinggemma:300m", "provider": "ollama" }
    }
}
```

Possible `status` values: `"healthy"` (all components online) or `"degraded"` (some components offline).

---

## Root Endpoint

### `GET /`

**Response** (200):

```json
{
    "app": "MindCache Backend",
    "status": "Online",
    "documentation": "/docs"
}
```

---

## Client Error Management

`BackendClient` in the extension encapsulates request handling:

- **Configurability**: Reads base URL from `useSettingsStore` dynamically
- **Fail-safe**: Background ingestion catches and discards server errors silently. Popup and settings display friendly offline alerts
- **Retry**: Up to 2 retries with exponential backoff (300ms, 600ms) on server errors. Bypassed on 4xx responses and health checks
- **Validation**: Rejects malformed JSON responses, preventing backend format issues from breaking the UI
- **Error formatting**: `BackendClientError` with `status` and `details` properties for structured error handling
