import argparse
import hashlib
import json
from pathlib import Path
import sqlite3
from zipfile import ZIP_DEFLATED, ZipFile

MAX_FILE = 20 * 1024 * 1024


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("data_dir", type=Path, help="Recall data directory containing recall.db and uploads/")
    parser.add_argument("output", type=Path, help="New ZIP file to create")
    args = parser.parse_args()
    data = args.data_dir.resolve()
    database = data / "recall.db"
    uploads = (data / "uploads").resolve()
    if not database.is_file():
        parser.error("recall.db not found in the data directory")
    connection = sqlite3.connect(database.as_uri() + "?mode=ro", uri=True)
    connection.row_factory = sqlite3.Row
    try:
        rows = connection.execute("SELECT * FROM memories ORDER BY id").fetchall()
        records = [{key: value for key, value in dict(row).items() if key != "embedding"} for row in rows]
    finally:
        connection.close()
    if len(records) > 5000:
        parser.error("Recall library exceeds the 5,000-memory import limit")
    included = missing = 0
    files = {}
    for record in records:
        stored = record.get("path")
        if not stored:
            continue
        path = Path(stored)
        candidates = [path.resolve()] if path.is_absolute() else [(data.parent / path).resolve(), (data / path).resolve()]
        original = next((candidate for candidate in candidates if candidate.is_relative_to(uploads) and candidate.is_file()), None)
        if original is None or original.stat().st_size > MAX_FILE:
            missing += 1
            continue
        content = original.read_bytes()
        name = "files/" + hashlib.sha256(content).hexdigest()
        files.setdefault(name, content)
        record["archive_file"] = name
        included += 1
    manifest = json.dumps({"version": "1.0", "memories": records}, ensure_ascii=False).encode()
    if len(manifest) > MAX_FILE or len(manifest) + sum(map(len, files.values())) > 200 * 1024 * 1024:
        parser.error("Export exceeds MindCache's size limits; split the Recall library before packing")
    with ZipFile(args.output, "x", compression=ZIP_DEFLATED) as archive:
        for name, content in files.items():
            archive.writestr(name, content)
        archive.writestr("manifest.json", manifest)
    print(f"Packed {len(records)} memories; {included} originals included; {missing} unavailable or outside Recall uploads.")


if __name__ == "__main__":
    main()
