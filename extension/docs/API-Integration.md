# Local Backend API Integration

This document describes how the browser extension integrates with the local FastAPI backend.

## Dynamic Server Discovery

The extension does not hardcode server connection strings. Instead, the network client (`src/services/backendClient.ts`) loads the current `backendUrl` dynamically from Chrome local storage before executing every fetch command.

```typescript
const settings = await storageService.getSettings();
const url = `${settings.backendUrl}/visit`;
```

This guarantees immediate connection switches when you update the backend URL in the settings panel, eliminating stale endpoints.

## Request Execution and Retries

The client wraps standard fetch operations in a robust execution policy:
* **JSON Headers**: Automatically injects `Content-Type: application/json` headers.
* **Auto-Retries**: If a request encounters temporary network disconnects, it executes up to two automated retries using a linear backoff delay (500ms, then 1000ms).
* **Exception Mapping**: Concludes failures by throwing a `BackendClientError` containing the exact HTTP status code and text.

## API Schemas

### 1. Register Tab Visit

* **Endpoint**: `POST /visit`
* **Trigger**: Fired when tab navigation completes or you switch active tabs.

#### Request Schema

```json
{
  "url": "https://example.com/learn-fastapi",
  "title": "Tutorial: FastAPI App Development"
}
```

#### Expected Response

```json
{
  "status": "success",
  "message": "Web page processed and semantically indexed successfully.",
  "document_id": 12,
  "title": "Tutorial: FastAPI App Development",
  "domain": "example.com"
}
```

---

### 2. Semantic Search

* **Endpoint**: `POST /search`
* **Trigger**: Fired automatically in real time using a 300ms debounce as you type.

#### Request Schema

```json
{
  "query": "local async sqlite database connection",
  "limit": 5,
  "generate_summary": true
}
```

#### Expected Response

```json
{
  "query": "local async sqlite database connection",
  "results": [
    {
      "id": 12,
      "url": "https://example.com/learn-fastapi",
      "domain": "example.com",
      "title": "Tutorial: FastAPI App Development",
      "summary": "This tutorial covers creating local SQLite databases using async drivers.",
      "score": 0.884,
      "published_date": null,
      "last_visited_at": "2026-05-30T13:42:00",
      "keywords": [
        {
          "keyword": "sqlite",
          "score": 0.94
        }
      ]
    }
  ],
  "ai_summary": "You visited a tutorial covering async SQLite databases in FastAPI [1]."
}
```

---

### 3. Engine Health Diagnostic

* **Endpoint**: `GET /health`
* **Trigger**: Polled every 10 seconds to update the popup status bar.

#### Expected Response

```json
{
  "status": "healthy",
  "components": {
    "database": "connected",
    "faiss_index": {
      "status": "initialized",
      "vectors_count": 42
    },
    "ollama": {
      "status": "connected",
      "model": "qwen2:0.5b"
    }
  }
}
```
