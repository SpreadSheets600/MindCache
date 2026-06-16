# MindCache Browser Extension

Manifest V3 extension with client-side page extraction, background tab tracking, spotlight search, right-click context menus, and a full settings dashboard. The extension runs entirely locally and communicates with the FastAPI backend at `http://localhost:8000`.

---

## Quick Start

```bash
npm install        # Install dependencies
npm run build      # Compile TypeScript → dist/
```

Load `dist/` as an unpacked extension in Chrome/Brave (`chrome://extensions` → Developer mode → Load unpacked).

---

## Documentation

Full project docs are in the root [`docs/`](../docs/README.md) directory:

- [Architecture](../docs/Architecture.md) — Extension modules, state management, build output
- [API Reference](../docs/API.md) — Backend endpoints the extension calls
- [Development Guide](../docs/Development.md) — Build, test, project structure, named constants, context menus
- [AI Pipeline](../docs/AI-Pipeline.md) — Client-side extraction bypass, embedding generation

---

## Features

### Background Tab Tracking
Monitors tab activations, navigation completes, closures, and window focus changes. Computes exact dwell time per tab. Auto-indexes after a 10-second threshold. Deduplicates rapid revisits to the same URL within 10 seconds.

### URL Filtering (Blacklists)
Every URL passes through `shouldTrack()` which checks:
- **Protocol**: Only `http:` and `https:` — internal chrome:// pages are skipped.
- **Auto-tracking setting**: Users can disable tracking entirely.
- **Excluded domains**: Per-domain patterns configured in settings.
- **Path blacklist**: Blocks `/login`, `/signup`, `/register`, `/logout`, `/reset-password`, `/forgot-password`, `/subscribe`, `/pricing`, `/checkout`, `/cart`, `/wp-admin`, `/admin` and directory variants.
- **Extension blacklist**: Blocks image files (`.png`, `.jpg`, `.gif`, `.svg`, `.webp`, `.ico`), media (`.mp3`, `.mp4`, `.avi`), archives (`.zip`, `.tar`, `.gz`, `.rar`, `.7z`), binaries (`.exe`, `.dmg`, `.pkg`, `.msi`), and documents (`.pdf`, `.docx`, `.xlsx`, `.pptx`).

### Client-Side Extraction (`extract-page.ts`)
Uses the **Defuddle** library (from Obsidian Web Clipper) to extract rich content directly from the page DOM. The extraction pipeline:

1. **Shadow DOM flattening** — Recursively walks elements with `shadowRoot` and inlines their content so Defuddle can access them.
2. **Noise removal** — Strips `<nav>`, `<header>`, `<footer>`, `<aside>`, `<form>`, `<noscript>`, `[role="navigation"]`, `[role="banner"]`, `[role="contentinfo"]`, `.sidebar`, `.nav`, `.footer`, `.cookie` elements.
3. **URL absolutification** — Rewrites `src`, `href`, and `srcset` attributes to absolute URLs using `document.baseURI`.
4. **Defuddle parsing** — Runs `Defuddle.parseAsync()` with an 8-second timeout, falling back to synchronous `Defuddle.parse()` on timeout.
5. **Sanitization** — Removes `<script>`, `<style>`, `<noscript>` tags and inline `style` attributes from the full HTML snapshot.

Returns: clean markdown content, HTML content, title, author, description, site name, language, published date, Schema.org JSON-LD, meta tags, favicon, word count, current text selection, and stored highlights from localStorage.

### Four Capture Methods

| Method | Trigger | Behavior |
|---|---|---|
| **Automatic** | 10-second dwell threshold | Extracts and indexes the page automatically. Configurable via auto-extract toggle. |
| **Keyboard shortcut** | `Ctrl+Shift+S` | Registered via `chrome.commands`. Background captures the active tab immediately. |
| **Popup button** | Click "Save to MindCache" in popup | Sends `"capture-page"` runtime message. Visible when auto-tracking *or* auto-extract is off. |
| **Context menu** | Right-click on page / link / selection | Three menu items: "Save this page", "Save this link" (URL-only), "Save selection to MindCache" (text + HTML). |

### Auto-Extraction Toggle
When the `autoExtract` setting is off:
- `processVisit()` returns early during automatic browsing — no extraction, no backend call.
- The user must explicitly capture using one of the three manual methods above.
- The popup displays "MANUAL" status indicator and shows the Save button.
- Useful for selective indexing, reducing backend load, or preserving bandwidth.

### Spotlight Search Popup
Keyboard-first search interface (`Ctrl+Shift+K`):
- Real-time debounced semantic search queries.
- Relevance percentage scores with color-coded match badges: **Best Match** (≥65%, amber), **Strong Match** (≥55%, emerald), **Related Result** (<55%, zinc).
- Domain badges, keyword tags, and result summaries.
- Connection status indicator (green "System Active" / red "Offline").
- Quick links to Dashboard, Search, Graph, and Memories pages.
- One-click "Save to MindCache" button for manual capture.

### Settings Dashboard
Four-tab interface built with React, TanStack Query, Zustand, and Tailwind:

1. **Dashboard** — System stats (documents, vectors, AI model, embedding model, connection status), recent activity (last 5 indexed pages), backend diagnostics, and domain exclusion count.
2. **Search** — Full-text search with filters: result limit (5/10/20/30), AI summary toggle, date range, source type, sort order (relevance, date ascending/descending, domain), minimum match score slider (0-100).
3. **Graph** — Interactive knowledge graph visualization (Canvas-based) with documents, entities, and keywords as nodes; supports entity co-occurrence edges, color-coded entity types, keyword frequency filtering, and multiple color modes (Domain, Classic, Recency).
4. **Settings** — Server URL, auto-tracking toggle, auto-extraction toggle, privacy mode (hide search queries), excluded domains list, shortcuts display (keyboard + context menu) with link to `chrome://extensions/shortcuts`.

All numeric values use **named constants** for easy tuning (see [Development Guide](../docs/development.md#named-constants)).

### State Management
Three **Zustand** stores with cross-context sync via `chrome.storage.local`:

- **Settings Store** — Persists autoTracking, autoExtract, backendUrl, excludedDomains, privacyMode. Background worker rehydrates on `chrome.storage.onChanged`.
- **Search Store** — Current query, recent queries.
- **Connection Store** — Live backend health status (non-persistent).

### Build Output

| Bundle | Size | Format | What's Inside |
|---|---|---|---|
| `content.js` | 459KB | IIFE | Defuddle extraction library + overlay React component |
| `background.js` | 28KB | IIFE | Service worker, blacklist constants inlined |
| Popup assets | 9KB | ESM | Spotlight search React app |
| Settings assets | 87KB | ESM | Full dashboard + knowledge graph |

---

## Shortcuts

| Action | Shortcut / Gesture |
|---|---|
| Open search overlay | `Ctrl+Shift+K` |
| Save current page | `Ctrl+Shift+S` |
| Save page (right-click) | Right-click page → "Save this page to MindCache" |
| Save link (right-click) | Right-click link → "Save this link to MindCache" |
| Save selection (right-click) | Select text → Right-click → "Save selection to MindCache" |

All shortcuts are configurable at `chrome://extensions/shortcuts` (or `brave://extensions/shortcuts`).

---

## Project Structure

```
extension/
├── public/manifest.json      # Permissions, commands, content script registration
├── src/
│   ├── background/
│   │   └── index.ts          # Service worker: tab tracking, blacklists, context menus, capture methods
│   ├── content/
│   │   ├── index.ts          # Content script entry: message handlers (ping, extract-page, extract-selection, toggle-overlay)
│   │   ├── extract-page.ts   # Defuddle extraction pipeline, shadow DOM flattening, noise removal, URL absolutification
│   │   └── SearchOverlay.tsx # Spotlight search overlay React component
│   ├── popup/
│   │   └── App.tsx           # Search popup: query input, results, save button, connection status
│   ├── settings/
│   │   └── App.tsx           # Dashboard, search, graph, settings tabs with full CRUD
│   ├── components/           # Shared: DocumentDetail, InteractiveKnowledgeGraph, etc.
│   ├── services/
│   │   └── BackendClient.ts  # API client with retry, validation, error handling
│   ├── store/
│   │   ├── settingsStore.ts  # Zustand: user preferences (persisted to chrome.storage.local)
│   │   ├── searchStore.ts    # Zustand: search state
│   │   └── connectionStore.ts# Zustand: backend health
│   ├── types/
│   │   └── index.ts          # Shared TypeScript interfaces (ExtensionSettings, TabInfo, etc.)
│   └── utils/
│       └── error.ts          # Error formatting utilities
├── tests/                    # Vitest suite: store tests, service tests (10 total)
└── dist/                     # Build output (gitignored)
```
