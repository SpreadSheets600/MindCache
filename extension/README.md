# MindCache Browser Extension

MindCache is an AI-powered, local-first browser memory extension. It automatically records webpages you visit and indexes them into local vector databases, allowing you to search your browsing history through natural language questions.

## Features

- **Automatic Page Indexing**: Background service worker tracks active tabs, computes dwell time, and automatically indexes pages after 10 seconds of viewing. Path and extension blacklists filter out login pages, binary files, and other low-value URLs.
- **Client-Side Content Extraction**: Uses Defuddle (from Obsidian Web Clipper) for fast, accurate page content extraction with shadow DOM flattening, noise removal, and URL absolutification.
- **Flexible Capture Options**:
  - **Keyboard shortcut**: `Ctrl+Shift+S` to save the current page.
  - **Right-click context menu**: Save current page, save a link URL, or save selected text.
  - **Popup button**: "Save to MindCache" appears when auto-tracking or auto-extraction is off.
- **Interactive Knowledge Graph Dashboard**: View total indexed memory stats (documents, vectors, entities), browse raw content pages in a scrollable records explorer, delete individual documents, and navigate an interactive Canvas-based Knowledge Graph with three node types: **Pages** (documents), **Keywords** (topics), and **Entities** (Persons, Companies, Technologies, Projects). Supports entity co-occurrence edges, color-coded entity types, keyword frequency filtering, and multiple color modes (Domain, Classic, Recency).
- **Raycast-Style Spotlight Search**: Open search panels instantly with `Ctrl+Shift+K` to retrieve past pages with semantic matching and relevance percentage scores.
- **RAG Summaries**: Uses local Ollama installations (e.g. Llama3) to synthesize a unified response summarizing your search results.
- **Entity Extraction**: Automatically extracts named entities (Persons, Companies, Technologies, Projects) from page content during ingestion using local Ollama models with regex fallback.
- **Privacy Controls**: Set custom exclusion rules, toggle auto-tracking and auto-extraction independently, view live diagnostics checks (SQLite, FAISS, Ollama).
- **Refined Slate-Blue Aesthetic**: Styled with a minimal, dark slate-gray and steel-blue palette with zero neon glows.
- **Absolute Privacy**: Relies entirely on localhost servers; zero cloud API calls or tracking data leaves your computer.

## Quick Start

### 1. Compile Assets

Ensure you have [Node.js](https://nodejs.org) installed, then run:

```bash
# Install dependencies
npm install

# Compile typescript files and bundle
npm run build
```

This compiles scripts and stores assets inside `extension/dist`.

### 2. Install in Chrome

1. Navigate to the extensions page (`chrome://extensions` or `brave://extensions`).
2. Activate **Developer mode** in the upper-right corner.
3. Click the **Load unpacked** button in the upper-left corner.
4. Select the `extension/dist` directory.

### 3. Usage Shortcuts

| Action | Shortcut / Gesture |
|---|---|
| Open Search Interface | `Ctrl+Shift+K` (macOS: `Cmd+Shift+K`) |
| Save Current Page | `Ctrl+Shift+S` (configurable at `chrome://extensions/shortcuts`) |
| Save Page (Right-click) | Right-click on page → "Save this page to MindCache" |
| Save Link (Right-click) | Right-click on a link → "Save this link to MindCache" |
| Save Selection (Right-click) | Select text → Right-click → "Save selection to MindCache" |
| Keyboard Search Navigation | `↑` / `↓` to select, `Enter` to open, `Esc` to clear |

## Auto-Extraction Toggle

By default, MindCache automatically extracts and indexes page content while you browse. You can disable this in settings:

- **Settings → Privacy → Auto extraction**: When turned off, pages are tracked (URL and dwell time) but not extracted or sent to the backend. Use the popup button, keyboard shortcut, or right-click menu to manually save pages.

This is useful for:
- Reducing backend load during heavy browsing.
- Selectively indexing only high-value pages.
- Preserving bandwidth on metered connections.

## Internal Documentation

Refer to the following guides for detailed architecture and development workflows:

- [System Architecture](docs/Architecture.md)
- [Local REST API Integration](docs/API-Integration.md)
- [Development and Testing Manual](docs/Development.md)
