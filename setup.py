import argparse
import os
from pathlib import Path
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parent


def run(command: list[str], cwd: Path):
    print(f"\n> {' '.join(command)}", flush=True)
    subprocess.run(command, cwd=cwd, check=True)


def main():
    parser = argparse.ArgumentParser(description="Install MindCache dependencies, build the extension, and start the local app.")
    parser.add_argument("--skip-install", action="store_true", help="Use already installed backend and extension dependencies")
    parser.add_argument("--build-only", action="store_true", help="Build without starting the server")
    parser.add_argument("--app", action="store_true", help="Also build the Flutter desktop app for Linux (requires flutter)")
    args = parser.parse_args()
    missing = [name for name in ("uv", "node", "npm") if not shutil.which(name)]
    if missing:
        print(f"Missing required tools: {', '.join(missing)}. Install them and retry.", file=sys.stderr)
        return 1
    try:
        if not args.skip_install:
            run(["uv", "sync", "--locked"], ROOT / "backend")
            run(["npm", "install"], ROOT / "extension")
        run(["npm", "run", "build"], ROOT / "extension")
        if args.app:
            if not shutil.which("flutter"):
                print("The desktop app needs Flutter. Install it from https://flutter.dev and retry with --app.", file=sys.stderr)
                return 1
            run(["flutter", "pub", "get"], ROOT / "app")
            run(["flutter", "build", "linux", "--release"], ROOT / "app")
            print("\nDesktop app built in app/build. Run ./start.sh --app to open it.", flush=True)
        if args.build_only:
            return 0
        print("\nOpen http://127.0.0.1:8000/app/", flush=True)
        print("Load extension/dist as an unpacked extension in your browser.", flush=True)
        os.chdir(ROOT / "backend")
        os.execvp("uv", ["uv", "run", "--no-sync", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8000"])
    except subprocess.CalledProcessError as exc:
        print(f"Setup failed while running {exc.cmd[0]}. Fix the error above and retry; your data was not removed.", file=sys.stderr)
        return exc.returncode
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
