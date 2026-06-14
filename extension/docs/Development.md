# Development Guide

This guide details the commands and workflows required to develop, test, and package the browser extension.

## Environment Requirements
- **Node.js**: v18 or later
- **npm**: v9 or later
- **Local Server**: Running FastAPI on `http://localhost:8000`

## Installation
Navigate to the extension directory and install dependencies:
```bash
cd extension
npm install
```

## Running Dev Server
Vite runs a local development server for popup and settings pages (allowing direct UI prototyping in tab views):
```bash
npm run dev
```

> [!NOTE]
> Since the background service worker relies on Chrome extension APIs, you cannot fully test tracking logic directly inside the Vite dev server tab. You must compile the project and load it into your browser to test active tab tracking.

## Compiling for Web Browsers
To compile TypeScript and bundle assets using Vite:
```bash
npm run build
```
This generates compiled outputs in the `extension/dist` folder. The build script runs three separate Vite builds:
1. **Popup & Settings UI** — standard React SPA builds with Vite.
2. **Content Script** — IIFE bundle (content.js, 459KB) with Defuddle included.
3. **Background Script** — IIFE bundle (background.js, 28KB) with blacklist constants inlined.

## Project Structure

```
extension/
├── public/
│   └── manifest.json          # Extension manifest (permissions, commands, content scripts)
├── src/
│   ├── background/
│   │   └── index.ts           # Service worker: tab tracking, blacklist filtering, context menus
│   ├── content/
│   │   ├── index.ts           # Content script entry: message handlers, overlay init
│   │   ├── extract-page.ts    # Defuddle extraction pipeline, shadow DOM flattening
│   │   └── SearchOverlay.tsx  # Spotlight search overlay React component
│   ├── popup/
│   │   └── App.tsx            # Popup UI: search, save button, connection status
│   ├── settings/
│   │   └── App.tsx            # Settings dashboard: config, stats, graph, search
│   ├── components/            # Shared React components (DocumentDetail, KnowledgeGraph, etc.)
│   ├── services/
│   │   └── BackendClient.ts   # API client with retry logic
│   ├── store/
│   │   ├── settingsStore.ts   # Zustand store for user preferences
│   │   ├── searchStore.ts     # Zustand store for search state
│   │   └── connectionStore.ts # Zustand store for backend health
│   ├── types/
│   │   └── index.ts           # Shared TypeScript interfaces
│   └── utils/
│       └── error.ts           # Error handling utilities
├── tests/                     # Vitest test files
└── docs/                      # Documentation
```

## Named Constants

All hardcoded numeric values in the settings dashboard are extracted to named constants at the top of `src/settings/App.tsx`:

| Constant | Value | Purpose |
|---|---|---|
| `DEFAULT_RESULT_LIMIT` | 10 | Default number of search results |
| `MAX_DOCUMENTS_FETCH` | 100 | Max documents fetched in list query |
| `SEARCH_DEBOUNCE_DELAY` | 250 | Search input debounce delay (ms) |
| `SAVE_SUCCESS_DURATION` | 1500 | Success toast display duration (ms) |
| `RECENT_ACTIVITY_COUNT` | 5 | Recent items shown on dashboard |
| `MAX_KEYWORDS_DISPLAY` | 4 | Max keyword tags shown per result |
| `GRAPH_DISPLAY_MAX` | 50 | Max documents shown in graph label |
| `SCORE_PERCENTAGE_MULTIPLIER` | 100 | Converts 0-1 score to percentage |
| `BEST_MATCH_THRESHOLD` | 65 | Score threshold for "Best Match" badge |
| `STRONG_MATCH_THRESHOLD` | 55 | Score threshold for "Strong Match" badge |
| `DEFAULT_MIN_SCORE` | 0 | Default minimum match score filter |
| `RESULT_LIMIT_OPTIONS` | [5, 10, 20, 30] | Options in result limit dropdown |

Similarly, the background worker (`src/background/index.ts`) inlines:
- `BLACKLISTED_EXTENSIONS` — file extensions to skip (images, media, archives, binaries, documents).
- `BLACKLISTED_PATHS` — URL path patterns to skip (login, signup, admin, etc.).
- `DWELL_TIME_THRESHOLD_SEC` — 10 seconds before auto-indexing.
- `EXTRACTION_TIMEOUT_MS` — 2 seconds for content script response.

The content script (`src/content/extract-page.ts`) defines:
- `EXCLUDED_TAGS` — elements removed during noise removal (nav, header, footer, aside, form, script, etc.).
- `BLACKLISTED_PATHS` — same path blacklist used for URL validation.

## Adding a New Context Menu Item

To add a new right-click context menu action:

1. Add a `chrome.contextMenus.create()` call in `createContextMenus()` in `src/background/index.ts`.
2. Add a handler in the `chrome.contextMenus.onClicked` listener.
3. Implement the capture logic (reuse `captureCurrentPage`, `captureUrl`, or `captureSelection` as appropriate).
4. Add any new message handler in `src/content/index.ts` if the action requires DOM access.
5. Update `extension/docs/Architecture.md` with the new menu item.
6. Update `extension/README.md` with the new shortcut/gesture.

## Adding a New Keyboard Shortcut

1. Register the command in `extension/public/manifest.json` under the `"commands"` key.
2. Add a handler in `chrome.commands.onCommand` in `src/background/index.ts`.
3. Update the settings page Shortcuts section in `src/settings/App.tsx`.
4. Update `extension/README.md` with the new shortcut.

## Browser Installation Guide
To load the unpacked extension into Chrome, Brave, or Edge:

1. Navigate to the extensions manager page (e.g. `chrome://extensions` or `brave://extensions`).
2. Toggle the **Developer mode** switch (located in the top-right corner).
3. Click the **Load unpacked** button (located in the top-left corner).
4. Select the compiled `extension/dist` directory.

### Ingestion Verification
Once loaded, visit any public webpage (such as `https://wikipedia.org`). Wait 10 seconds, then open the extension popup or the backend logs. You should see a successful indexing transaction recorded.

To test manual capture:
1. Turn off Auto extraction in Settings → Privacy.
2. Visit a page.
3. Use `Ctrl+Shift+S`, right-click → "Save this page to MindCache", or click the popup "Save to MindCache" button.
4. Check the backend logs for the recorded visit.

## Testing Suite
The extension uses **Vitest** for store, service, and component unit testing:

- **Run all tests once**:
  ```bash
  npm run test
  ```
- **Run tests in watch mode**:
  ```bash
  npm run test:watch
  ```

Tests cover:
- Settings store operations (get, set, persist).
- Backend client request formatting and error handling.
- Content extraction output structure.

## Packaging for Release
To package the extension into a ZIP file for Chrome Web Store distribution:
```bash
npm run build
cd dist
zip -r ../mindcache-extension.zip .
```
This compiles the code and generates a clean ZIP container ready for upload.
