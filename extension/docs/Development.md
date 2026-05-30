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
This generates compiled outputs in the `extension/dist` folder.

## Browser Installation Guide
To load the unpacked extension into Chrome, Brave, or Edge:

1. Navigate to the extensions manager page (e.g. `chrome://extensions` or `brave://extensions`).
2. Toggle the **Developer mode** switch (located in the top-right corner).
3. Click the **Load unpacked** button (located in the top-left corner).
4. Select the compiled `extension/dist` directory.

### Ingestion Verification
Once loaded, visit any public webpage (such as `https://wikipedia.org`). Wait 5 seconds, then open the extension popup or the backend logs. You should see a successful indexing transaction recorded.

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

## Packaging for Release
To package the extension into a ZIP file for Chrome Web Store distribution:
```bash
cd dist
zip -r ../mindcache-extension.zip .
```
This compiles the code and generates a clean ZIP container ready for upload.
