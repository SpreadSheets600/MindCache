# API Reference

The MindCache backend runs on `http://localhost:8000` by default. The extension communicates with it exclusively through `src/services/BackendClient.ts`.

---

## Visit Ingestion

### `POST /visit`

Ingests and indexes a visited web page.

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

The `auto_extract` field (`Optional[bool]`, default `true`) tells the backend whether this visit was automatically extracted. When `false` and no `extracted_content` is provided, the backend returns `"recorded"` and skips all processing.

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

**Duplicate URL (201)**:
```json
{
    "status": "duplicate",
    "message": "URL visit recorded. Page content was already indexed.",
    "document_id": 4,
    "title": "Local AI Personal Memory Systems",
    "domain": "example.com"
}
```

**Recorded without content (201)** — returned when `auto_extract` is `false`:
```json
{
    "status": "recorded",
    "message": "Visit recorded without content extraction (auto_extract is off).",
    "document_id": null,
    "title": null,
    "domain": "example.com"
}
```

**Skipped as noise (201)**:
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

Searches history using natural language query matching with optional time filtering.

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
| `query` | string | required | Natural language search query |
| `limit` | int | 5 | Max results (1-50) |
| `generate_summary` | bool | false | Generate AI summary of results |
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

### `POST /search/click`

Records a click signal for search result ranking optimization.

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

**Response**: Array of document objects with keywords, entities, and visit history.

### `GET /documents/{id}`

Retrieves full extracted content, metadata, entities, keywords, and visit history for a specific document.

**Response**: Single document object matching the list format above.

**404 error**:
```json
{ "detail": "Document with ID 99 was not found" }
```

### `DELETE /documents/{id}`

Removes a webpage from SQLite and FAISS index.

**Response**:
```json
{ "message": "Document ID 4 was successfully deleted from local memory." }
```

---

## Knowledge Graph

### `GET /graph`

Returns entities, keywords, and relationships for graph visualization.

| Parameter | Default | Max | Description |
|---|---|---|---|
| `limit` | 100 | 500 | Max documents to include |
| `min_keyword_freq` | 2 | — | Min keyword frequency for node inclusion |

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

Checks diagnostic status of all system components.

#### Response

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

---

## Client Error Management

`BackendClient` in the extension encapsulates request handling:

- **Configurability**: Reads base URL from `useSettingsStore` dynamically.
- **Fail-safe**: Background ingestion catches and discards server errors silently. Popup and settings display friendly offline alerts.
- **Retry**: Up to 2 retries with exponential backoff (300ms, 600ms) on server errors. Bypassed on 4xx responses and health checks.
- **Validation**: Rejects malformed JSON responses, preventing backend format issues from breaking the UI.
