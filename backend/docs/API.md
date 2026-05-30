# REST API Documentation

The MindCache backend runs on `http://localhost:8000` by default. It provides five operational endpoints and a system health diagnostic.

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

Searches history using natural language query matching.

#### Request Payload

```json
{
    "query": "local vector database search",
    "limit": 5,
    "generate_summary": true
}
```

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
            ]
        }
    ],
    "ai_summary": "Your visited history contains an article about local browser memory databases. It details running vector indices locally to preserve privacy [1]."
}
```

---

## Document Management

### `GET /documents`

Lists indexed documents ordered by updated timestamp descending.

#### Query Parameters

- `skip` (default: 0): Skip N records.
- `limit` (default: 20): Max records to return.

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
        "summary": "This article discusses running browser memory databases locally.",
        "created_at": "2026-05-30T11:40:00",
        "updated_at": "2026-05-30T11:42:00",
        "keywords": [
            {
                "keyword": "vector",
                "score": 0.91
            }
        ],
        "visit_history": ["2026-05-30T11:40:00", "2026-05-30T11:42:00"]
    }
]
```

### `GET /documents/{id}`

Retrieves full extracted content, metadata, and history for a document.

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

## System Health

### `GET /health`

Checks diagnostic status.

#### Response (Status 200)

```json
{
    "status": "healthy",
    "components": {
        "database": "connected",
        "faiss_index": {
            "status": "initialized",
            "vectors_count": 128
        },
        "ollama": {
            "status": "connected",
            "model": "llama3"
        }
    }
}
```
