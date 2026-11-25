#!/usr/bin/env bash
set -eu

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_PYTHON="$ROOT_DIR/backend/.venv/bin/python"

if [ ! -x "$BACKEND_PYTHON" ] || [ ! -x "$ROOT_DIR/backend/.venv/bin/uvicorn" ]; then
  printf 'Backend dependencies are missing. Run ./setup.sh first.\n' >&2
  exit 1
fi
if [ ! -f "$ROOT_DIR/extension/dist/manifest.json" ] || [ ! -f "$ROOT_DIR/frontend/dist/dashboard.js" ]; then
  printf 'The dashboard or browser extension has not been built. Run ./setup.sh first.\n' >&2
  exit 1
fi

printf 'MindCache: http://127.0.0.1:8000/app/\n'
printf 'Pair your browser extension under Setup in the web app.\n'
cd "$ROOT_DIR/backend"
exec "$BACKEND_PYTHON" -m uvicorn app.main:app --host 127.0.0.1 --port 8000
