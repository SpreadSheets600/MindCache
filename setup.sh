#!/usr/bin/env bash
set -eu

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

if ! command -v python3 >/dev/null 2>&1; then
  printf 'Python 3 is required. Install Python, uv, Node.js, and npm, then retry.\n' >&2
  exit 1
fi

if [ "${1:-}" = "--help" ] || [ "${1:-}" = "-h" ]; then
  exec python3 "$ROOT_DIR/setup.py" --help
fi

python3 "$ROOT_DIR/setup.py" --build-only "$@"
printf '\nSetup complete. Run ./start.sh to start MindCache.\n'
printf 'Load extension/dist as an unpacked extension, then pair it in the web app.\n'
