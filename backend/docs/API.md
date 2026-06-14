# REST API Documentation

The MindCache backend runs on `http://localhost:8000` by default. It provides operational endpoints for ingestion, search, document management, knowledge graph, and system health diagnostics.

## Visit Ingestion

### `POST /visit`

Ingests and indexes a visited web page.

#### Request Headers

- `Content-Type: application/json`

#### Request Payload

```json
{
    "url": "https://example.com/ai-memory-article"
}
```

When the extension performs client-side extraction (via Defuddle), it sends enriched payloads. The backend skips server-side HTTP download and extraction when `extracted_content` is present:

```json
{
    "url": "https://example.com/ai-memory-article",
    "title": "Local AI Personal Memory Systems",
    "dwell_time": 42.5,
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

#### Response (New Document Success - Status 201)

```json
{
    "status": "success",
    "message": "Web page processed and semantically indexed successfully.",
    "document_id": 4,
    "title": "Local AI Personal Memory Systems",
    "domain": "example.com"
}
```

#### Response (Duplicate Document Success - Status 201)

```json
{
    "status": "duplicate",
    "message": "URL visit recorded. Page content was already indexed.",
    "document_id": 4,
    "title": "Local AI Personal Memory Systems",
    "domain": "example.com"
}
```

#### Response (Skipped - Noise Detection / Platform Search - Status 201)

Returned when a page is skipped because it is identified as noise (e.g. low information content page) or when it is a platform search query page (such as a Google Search or YouTube search results page).

```json
{
    "status": "skipped",
    "message": "Web Page Skipped from indexing because it was identified as noise (e.g. insufficient information content).",
    "document_id": null,
    "title": "Google Search: best vector database for rag",
    "domain": "google.com"
}
```

#### Common Error Responses

- **Invalid URL (Status 400)**: URL is malformed or lacks HTTP/HTTPS scheme.
    ```json
    {
        "detail": "URL 'ftp://invalid' is invalid: Only HTTP and HTTPS protocols are supported."
    }
    ```
- **Extraction Failure (Status 422)**: Page is unreachable or lacks readable text.
    ```json
    {
        "detail": "Failed to extract content from https://example.com/empty: Webpage has no parseable text content."
    }
    ```

---

## Semantic Search

### `POST /search`

Searches history using natural language query matching with optional time filtering.

#### Request Payload

```json
{
    "query": "local vector database search",
    "limit": 5,
    "generate_summary": true,
    "start_time": "2026-05-01T00:00:00Z",
    "end_time": "2026-05-31T23:59:59Z"
}
```

#### Query Parameters

- `query` (required): Natural language search query.
- `limit` (default: 5): Maximum number of results (1-50).
- `generate_summary` (default: false): Generate AI summary of results.
- `start_time` (optional): ISO timestamp to filter results visited after this time.
- `end_time` (optional): ISO timestamp to filter results visited before this time.

#### Response (Status 200)

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
                {
                    "keyword": "vector",
                    "score": 0.91
                },
                {
                    "keyword": "database",
                    "score": 0.85
                }
            ],
            "source_type": "Generic"
        }
    ],
    "ai_summary": "Your visited history contains an article about local browser memory databases. It details running vector indices locally to preserve privacy [1]."
}
```

### `POST /search/click`

Records a click signal for search result ranking optimization.

#### Request Payload

```json
{
    "query": "local vector database",
    "document_id": 4
}
```

#### Response (Status 200)

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

#### Query Parameters

- `skip` (default: 0): Skip N records.
- `limit` (default: 20, max: 100): Max records to return.

#### Response (Status 200)

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
        "created_at": "2026-05-30T11:40:00",
        "updated_at": "2026-05-30T11:42:00",
        "keywords": [
            {
                "keyword": "vector",
                "score": 0.91
            }
        ],
        "entities": [
            {
                "name": "FAISS",
                "type": "Technology"
            },
            {
                "name": "Meta",
                "type": "Company"
            }
        ],
        "visit_history": ["2026-05-30T11:40:00", "2026-05-30T11:42:00"]
    }
]
```

### `GET /documents/{id}`

Retrieves full extracted content, metadata, entities, keywords, and visit history for a document.

#### Response (Status 200)

Matches single item from `GET /documents` list.

#### Common Error Responses

- **Not Found (Status 404)**:
    ```json
    {
        "detail": "Document with ID 99 was not found"
    }
    ```

### `DELETE /documents/{id}`

Removes a webpage from database records and FAISS vector index.

#### Response (Status 200)

```json
{
    "message": "Document ID 4 was successfully deleted from local memory."
}
```

---

## Knowledge Graph

### `GET /graph`

Returns entities, keywords, and relationships for knowledge graph visualization.

#### Query Parameters

- `limit` (default: 100, max: 500): Maximum number of documents to include.
- `min_keyword_freq` (default: 2, min: 1): Minimum keyword frequency to include as a node.

#### Response (Status 200)

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
            {
                "id": "ent_0",
                "label": "FAISS",
                "type": "entity",
                "entity_type": "Technology",
                "document_count": 3
            },
            {
                "id": "ent_1",
                "label": "Meta",
                "type": "entity",
                "entity_type": "Company",
                "document_count": 2
            }
        ],
        "keywords": [
            {
                "id": "kw_vector",
                "label": "vector",
                "type": "keyword",
                "document_count": 5
            }
        ]
    },
    "edges": [
        {
            "source": "doc_4",
            "target": "kw_vector",
            "type": "has_keyword"
        },
        {
            "source": "doc_4",
            "target": "ent_0",
            "type": "has_entity"
        },
        {
            "source": "ent_0",
            "target": "ent_1",
            "type": "co_occurs",
            "weight": 2
        }
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

- `has_keyword`: Document references a keyword.
- `has_entity`: Document mentions an entity.
- `co_occurs`: Two entities/keywords appear in the same document.

---

## System Health

### `GET /health`

Checks diagnostic status of all system components.

#### Response (Status 200)

```json
{
    "status": "healthy",
    "components": {
        "database": {
            "status": "connected",
            "documents_count": 128
        },
        "faiss_index": {
            "status": "initialized",
            "vectors_count": 256
        },
        "ollama": {
            "status": "connected",
            "model": "qwen3.5:2b"
        },
        "embedding": {
            "status": "connected",
            "model": "embeddinggemma:300m",
            "provider": "ollama"
        }
    }
}
```
