# MindCache Browser Extension

Manifest V3 extension with client-side page extraction, spotlight search, background tracking, and a full settings dashboard.

---

## Quick Start

```bash
npm install        # Install dependencies
npm run build      # Compile → dist/
```

Load `dist/` as an unpacked extension in Chrome/Brave (`chrome://extensions` → Developer mode → Load unpacked).

---

## Documentation

Full project docs are in the root [`docs/`](../docs/index.md) directory:

- [Architecture](../docs/architecture.md) — Extension modules, state management, build output
- [API Reference](../docs/api.md) — Backend endpoints the extension calls
- [Development Guide](../docs/development.md) — Build, test, project structure, named constants, context menus
- [AI Pipeline](../docs/ai-pipeline.md) — Client-side extraction bypass, embedding generation

---

## Features

- **Background tab tracking** with 10-second dwell threshold and path/extension blacklists.
- **Client-side extraction** via Defuddle — works behind auth, paywalls, and JS SPAs.
- **Three capture methods**: `Ctrl+Shift+S`, popup "Save to MindCache" button, right-click context menu.
- **Auto-extraction toggle**: When off, pages are tracked but not extracted until manually captured.
- **Spotlight search**: Keyboard-first popup with relevance scores, domain badges, match classification.
- **Settings dashboard**: Stats, search, knowledge graph, privacy controls, shortcuts.
- **Context menus**: Save page, save link, or save selection to MindCache.

## Shortcuts

| Action | Shortcut / Gesture |
|---|---|
| Open search overlay | `Ctrl+Shift+K` |
| Save current page | `Ctrl+Shift+S` |
| Save page (right-click) | Right-click page → "Save this page to MindCache" |
| Save link (right-click) | Right-click link → "Save this link to MindCache" |
| Save selection (right-click) | Select text → Right-click → "Save selection to MindCache" |

Shortcuts are configurable at `chrome://extensions/shortcuts`.

---

## Project Structure

```
src/
├── background/index.ts   # Service worker, tab tracking, context menus
├── content/
│   ├── index.ts          # Message handlers, overlay init
│   ├── extract-page.ts   # Defuddle extraction pipeline
│   └── SearchOverlay.tsx # Spotlight overlay
├── popup/App.tsx         # Search popup
├── settings/App.tsx      # Dashboard & settings
├── components/           # Shared React components
├── services/             # BackendClient.ts
├── store/                # Zustand stores
├── types/index.ts        # TypeScript interfaces
└── utils/error.ts        # Error handling
```
