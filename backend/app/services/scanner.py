import os
from fnmatch import fnmatch
from pathlib import Path

EXCLUDED_DIRS = {
    ".git", ".hg", ".svn", "node_modules", ".venv", "venv", "__pycache__", "target", "build", "dist",
    ".cache", ".gradle", ".idea", ".next", ".tox", ".mypy_cache", ".pytest_cache", ".dart_tool",
}
EXCLUDED_NAMES = (
    ".env*", "*.pem", "*.key", "*.p12", "*.pfx", "id_rsa*", "id_ed25519*", "*.kdbx",
    "*.sqlite", "*.sqlite3", "*.db", "*.pyc", "*.lock", "*.min.js", "*.map",
)
TEXT_EXTENSIONS = {
    ".txt", ".md", ".markdown", ".rst", ".org", ".csv", ".tsv", ".json", ".yaml", ".yml", ".toml", ".ini",
    ".cfg", ".log", ".xml", ".html", ".htm", ".css", ".py", ".js", ".ts", ".tsx", ".jsx", ".dart", ".java",
    ".kt", ".c", ".h", ".cpp", ".hpp", ".cs", ".go", ".rs", ".rb", ".php", ".swift", ".sh", ".zsh", ".sql",
    ".tex", ".bib", ".conf",
}
SUPPORTED_EXTENSIONS = TEXT_EXTENSIONS | {".pdf"}
MAX_BYTES = 25 * 1024 * 1024


def excluded_name(name, extra):
    return any(fnmatch(name, pattern) for pattern in (*EXCLUDED_NAMES, *extra))


def scan(root, extra_globs=()):
    found = []
    pending = [Path(root)]
    while pending:
        directory = pending.pop()
        try:
            entries = list(os.scandir(directory))
        except OSError:
            continue
        for entry in entries:
            if entry.is_symlink() or excluded_name(entry.name, extra_globs):
                continue
            if entry.is_dir(follow_symlinks=False):
                if entry.name not in EXCLUDED_DIRS:
                    pending.append(Path(entry.path))
                continue
            extension = os.path.splitext(entry.name)[1].lower()
            if extension not in SUPPORTED_EXTENSIONS:
                continue
            try:
                info = entry.stat(follow_symlinks=False)
            except OSError:
                continue
            if 0 < info.st_size <= MAX_BYTES:
                found.append({"path": entry.path, "name": entry.name, "ext": extension, "size": info.st_size, "mtime_ns": info.st_mtime_ns})
    return found


def inside(path, root):
    try:
        return Path(path).resolve().is_relative_to(Path(root).resolve())
    except OSError:
        return False


def wanted(path, root, extra=()):
    path = Path(path)
    try:
        relative = path.relative_to(root)
    except ValueError:
        return False
    parts = relative.parts
    if not parts or any(part in EXCLUDED_DIRS for part in parts[:-1]):
        return False
    if any(excluded_name(part, extra) for part in parts):
        return False
    return path.suffix.lower() in SUPPORTED_EXTENSIONS
