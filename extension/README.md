<p align="center">
  <img src="./public/icon-128.png" alt="MindCache Logo" width="96" height="96" />
</p>

# MindCache Browser Extension

The MindCache Browser Extension is a Manifest V3 extension that serves as the visual control center for your local personal memory engine. It monitors active tab transitions, handles automated page ingestion, and mounts a comprehensive spotlight dashboard for searching, exploring, and chatting with your indexed history.

---

## Core Capabilities

- **Automated Tab Ingestion**: Listens to webpage completions and active tab changes, securely transferring URLs and pre-rendered titles to the FastAPI backend.
- **Robust Exclusions & Normalization**: Automatically strips browser internal protocols (`chrome://`, `edge://`, `about:`, `file://`), bypasses local networks (`localhost`, `127.0.0.1`), and normalizes user domain exclusions (stripping `https://`, `www.`, sub-directories, ports, and parameters) to prevent duplicate rules.
- **Debounced Spotlight Search**: Implements instant, responsive search against your local index with a 300ms input debounce to prevent redundant network payloads.
- **Local RAG Chat Box**: Provides an interactive interface to query and synthesize answers from browser history, utilizing local Ollama models with source citations.
- **Radix UI Primitive Layouts**: High-accessibility sidebar layouts, switch states, and loader skeletons built on Radix UI primitives and styled with TailwindCSS.
- **Live Diagnostics Bar**: Popover action menu displaying real-time database connection statuses, vector index counts, and preloaded Ollama models.

---

## Keyboard Commands

- **`Ctrl+Shift+K`** (or **`⌘+Shift+K`** on macOS): Launches the MindCache dashboard spotlight search or action popup instantly.
- **`Enter`**: Submits a semantic history search query or sends a chat message.

---

## Extension Structure

```
extension/
├── public/           # Static assets and MV3 metadata
│   ├── manifest.json # Extension descriptor
│   └── icon-128.png  # Logo asset
├── src/
│   ├── background/   # Service worker monitoring tabs & exclusion rules
│   ├── components/   # Modular UI (BackendStatus, SearchBar, SettingsPanel)
│   ├── dashboard/    # Radar Spotlight search dashboard mounting node
│   ├── services/     # Storage interfaces and HTTP client retry loops
│   ├── store/        # Zustand state engines (search, connection, settings)
│   ├── types/        # TypeScript models
│   ├── App.tsx       # Popup portal controller
│   └── main.tsx      # Main application mounting script
│
├── dashboard.html    # Full-page Dashboard HTML entry point
├── docs/             # Technical manuals
└── tests/            # Vitest unit test suites
```

---

## Development Setup

Ensure you have Node.js 18+ installed.

### 1. Install Dependencies
```bash
cd extension
npm install
```

### 2. Compile for Production
```bash
npm run build
```
This compiles TypeScript, transpiles assets via Vite, and outputs the packed extension files to `extension/dist`.

### 3. Run the Unit Tests
```bash
npm run test
```
Runs Vitest coverage checking client retries, storage adapters, and Zustand state modifiers.

---

## Loading into your Browser

1. Open your Chromium-based browser extensions manager:
   - Chrome: `chrome://extensions`
   - Brave: `brave://extensions`
2. Turn on **Developer mode** (top right switch).
3. Click **Load unpacked** (top left button).
4. Select the build output directory: `extension/dist`.

---

> [!TIP]
> **Developer Hot-Reloading**  
> During active frontend development, you can run `npm run dev` to launch the Vite hot-reloading dev server. Note that for extension background script updates to take effect in the browser, you must click the reload icon on the unpacked extension in `chrome://extensions`.
