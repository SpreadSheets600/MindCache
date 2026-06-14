# Development Guide

Covers building, testing, and extending both the backend and the browser extension.

---

## Backend Development

### Environment

- Python 3.12+, `uv` package manager.
- Running Ollama instance (for AI features).

### Setup

```bash
cd backend
uv sync                    # Install dependencies
uv run pre-commit install  # Enable git hooks (ruff, mypy)
```

### Configuration

Create `backend/.env`:

```ini
DATABASE_URL=sqlite:///data/mindcache.db
FAISS_INDEX_PATH=data/faiss_index.bin
EMBEDDING_PROVIDER=ollama
EMBEDDING_MODEL_NAME=embeddinggemma:300m
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=qwen3.5:2b
LOG_LEVEL=INFO
```

### Run

```bash
uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

API docs at `http://127.0.0.1:8000/docs`.

### Database Migrations

```bash
uv run alembic revision --autogenerate -m "describe_changes"
uv run alembic upgrade head
uv run alembic downgrade -1
```

### Test

```bash
uv run pytest              # All tests
uv run pytest -s           # With logs/prints
uv run pytest --cov=app tests/  # With coverage
```

### Lint

```bash
uv run ruff check .
uv run ruff format --check .
uv run mypy .
```

### Docker

```bash
docker compose up --build -d
```

### Project Structure

```
backend/
├── app/
│   ├── api/          # FastAPI routers (visit, search, documents, health)
│   ├── core/         # Config, logger, exceptions
│   ├── db/           # Async database sessions
│   ├── models/       # SQLAlchemy tables
│   ├── repositories/ # CRUD interfaces
│   ├── schemas/      # Pydantic V2 payloads
│   ├── services/     # NLP, vector store, scraper, synthesis
│   │   └── extractors/  # Platform-specific extractors
│   └── main.py       # App entry point
├── data/             # SQLite DB + FAISS index
├── migrations/       # Alembic versions
├── tests/            # Pytest test suite
└── pyproject.toml    # Dependencies
```

---

## Extension Development

### Environment

- Node.js 18+, npm 9+.
- Running backend server.

### Setup

```bash
cd extension
npm install
```

### Dev Server (UI Only)

```bash
npm run dev
```

Serves popup and settings pages in a browser tab. Background worker cannot be fully tested here since it needs Chrome extension APIs.

### Build

```bash
npm run build
```

Produces three builds:
1. **Popup & Settings** — standard React/Vite SPA bundles.
2. **content.js** (459KB) — IIFE with Defuddle bundled.
3. **background.js** (28KB) — IIFE with blacklist constants inlined.

### Test

```bash
npm run test          # Run once
npm run test:watch    # Watch mode
```

Tests cover settings store, backend client, and extraction output structure.

### Load in Browser

1. Go to `chrome://extensions` (or `brave://extensions`).
2. Enable **Developer mode**.
3. Click **Load unpacked** → select `extension/dist/`.

### Package for Release

```bash
npm run build
cd dist
zip -r ../mindcache-extension.zip .
```

### Project Structure

```
extension/
├── public/manifest.json      # Permissions, commands, content scripts
├── src/
│   ├── background/index.ts   # Service worker, tab tracking, context menus
│   ├── content/
│   │   ├── index.ts          # Content script entry, message handlers
│   │   ├── extract-page.ts   # Defuddle extraction pipeline
│   │   └── SearchOverlay.tsx # Spotlight overlay UI
│   ├── popup/App.tsx         # Popup search UI
│   ├── settings/App.tsx      # Settings dashboard
│   ├── components/           # Shared React components
│   ├── services/             # BackendClient.ts
│   ├── store/                # Zustand stores
│   ├── types/index.ts        # TypeScript interfaces
│   └── utils/error.ts        # Error handling
├── tests/                    # Vitest tests
└── docs/                     # (moved to root docs/)
```

### Named Constants

All hardcoded numeric values in the settings dashboard are extracted to named constants in `src/settings/App.tsx`:

| Constant | Default | Purpose |
|---|---|---|
| `DEFAULT_RESULT_LIMIT` | 10 | Default search result count |
| `MAX_DOCUMENTS_FETCH` | 100 | Max documents in list query |
| `SEARCH_DEBOUNCE_DELAY` | 250ms | Search input debounce |
| `SAVE_SUCCESS_DURATION` | 1500ms | Success toast duration |
| `RECENT_ACTIVITY_COUNT` | 5 | Dashboard recent items |
| `MAX_KEYWORDS_DISPLAY` | 4 | Max keyword tags per result |
| `GRAPH_DISPLAY_MAX` | 50 | Graph node display cap |
| `BEST_MATCH_THRESHOLD` | 65 | "Best Match" badge threshold |
| `STRONG_MATCH_THRESHOLD` | 55 | "Strong Match" badge threshold |
| `DEFAULT_MIN_SCORE` | 0 | Default min match score filter |
| `RESULT_LIMIT_OPTIONS` | [5, 10, 20, 30] | Result limit dropdown options |

Background worker inlines:
- `BLACKLISTED_EXTENSIONS` — file extensions to skip (images, media, archives, binaries, docs).
- `BLACKLISTED_PATHS` — URL path patterns to skip (login, signup, admin, etc.).
- `DWELL_TIME_THRESHOLD_SEC` — 10s before auto-indexing.
- `EXTRACTION_TIMEOUT_MS` — 2s content script timeout.

Content script defines:
- `EXCLUDED_TAGS` — elements stripped during noise removal.
- `BLACKLISTED_PATHS` — same path blacklist for URL validation.

### Adding a Context Menu Item

1. Add `chrome.contextMenus.create()` in `createContextMenus()` in `src/background/index.ts`.
2. Add a handler in the `chrome.contextMenus.onClicked` listener.
3. Implement capture logic (reuse `captureCurrentPage`, `captureUrl`, or `captureSelection`).
4. Add message handler in `src/content/index.ts` if DOM access is needed.

### Adding a Keyboard Shortcut

1. Register the command in `extension/public/manifest.json` under `"commands"`.
2. Add a handler in `chrome.commands.onCommand` in `src/background/index.ts`.
3. Update the settings page Shortcuts section.

### Ingestion Verification

1. Start the backend.
2. Load the extension in the browser.
3. Visit any webpage, wait 10 seconds.
4. Check backend logs for `POST /visit` transaction.
5. Or check `GET http://127.0.0.1:8000/documents`.

### Testing Manual Capture

1. Turn off **Auto extraction** in extension Settings → Privacy.
2. Visit a page.
3. Use `Ctrl+Shift+S`, right-click → "Save this page to MindCache", or click the popup button.
4. Verify the visit appears in `GET /documents`.
