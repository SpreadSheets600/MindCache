#!/usr/bin/env bash
set -eu

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"

if ! command -v uv >/dev/null 2>&1; then
  printf 'uv is required to install the MindCache backend: https://docs.astral.sh/uv/\n' >&2
  exit 1
fi

(cd "$ROOT_DIR/backend" && uv sync --locked --no-dev)
printf '\nInstalled. Start the desktop app with ./mindcache; it starts the backend for you.\n'
printf 'Load the browser extension from the mindcache-extension zip as an unpacked extension.\n'
