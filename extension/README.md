# MindCache Browser Extension

MindCache is an AI-powered, local-first browser memory extension. It automatically records webpages you visit and indexes them into local vector databases, allowing you to search your browsing history through natural language questions.

## Features

- **Interactive Knowledge Graph Dashboard**: View total indexed memory stats, browse raw content pages in a scrollable records explorer, delete individual documents, and navigate an interactive Canvas-based Knowledge Graph detailing connections between pages and keywords.
- **Raycast-Style Spotlight Search**: Open search panels instantly to retrieve past pages with semantic matching and relevance percentage scores.
- **RAG Summaries**: Uses local Ollama installations (e.g. Llama3) to synthesize a unified response summarizing your search results.
- **Privacy Controls**: Set custom exclusion rules, view live diagnostics checks (SQLite, FAISS, Ollama), and toggle background tracking easily.
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

- **Open Search Interface**: `Ctrl+Shift+K` (on macOS: `Cmd+Shift+K`)
- **Keyboard Search Navigation**:
  - `↑` and `↓`: Select matching records
  - `Enter`: Navigate to selected website
  - `Esc`: Clear current search input

## Internal Documentation

Refer to the following guides for detailed architecture and development workflows:

- [System Architecture](docs/Architecture.md)
- [Local REST API Integration](docs/API-Integration.md)
- [Development and Testing Manual](docs/Development.md)
