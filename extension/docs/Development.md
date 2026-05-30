# Development and Packaging Manual

This document describes the development workflow, build steps, packaging instructions, and browser installation guide for the MindCache extension.

## Local Setup

Ensure Node.js (version 18 or newer) is installed on your system.

```bash
# Navigate to the extension folder
cd extension

# Install package dependencies
npm install
```

## Running Development Server

Start Vite's development watch server:

```bash
npm run dev
```

During development, Vite watches files and compiles changes dynamically. However, since Chrome extensions require built files to load in the browser, compiling a production watch build is often preferred. You can run the compiler watch mode to automatically rebuild the extension on every change:

```bash
npx vite build --watch
```

This compiles your changes to `extension/dist/` in real time, enabling hot-reloading in the browser.

## Compilation and Packaging

Compile the extension for production:

```bash
npm run build
```

This bundles popup React elements, processes TailwindCSS v4 classes, packages the background script as a standalone service worker, and saves the final output inside the `dist/` directory.

### Packing for Chrome Web Store

To prepare the extension for manual distribution or store uploads:

```bash
# Compress the compiled output directory
zip -r mindcache-extension.zip dist/
```

## Browser Installation Guide

Follow these steps to load the unpacked extension into Chrome, Brave, Edge, or any Chromium-based browser.

1. Open your browser and navigate to the extensions page:
   * Chrome: `chrome://extensions`
   * Brave: `brave://extensions`
   * Edge: `edge://extensions`
2. Enable **Developer mode** using the toggle switch in the top-right corner of the page.
3. Click the **Load unpacked** button in the top-left corner.
4. Select the compiled output directory: `/home/spreadsheets600/Projects/MindCache/extension/dist`.
5. The MindCache icon appears in your extensions list and browser toolbar.

---

## Technical Workarounds

### Programmatic Popup Triggering

Chrome extensions do not allow background threads to open popups programmatically on arbitrary hotkeys. To achieve a keyboard-driven search spotlight similar to Raycast:
* MindCache registers a global command `open_search` inside `manifest.json`.
* The background script listens to this command and invokes `chrome.action.openPopup()`.
* This matches security requirements while providing a smooth `Ctrl+Shift+K` keyboard shortcut.
