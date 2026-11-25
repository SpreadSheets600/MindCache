import hashlib
from io import BytesIO
import json
from pathlib import PurePosixPath
from zipfile import BadZipFile, ZipFile

MAX_ARCHIVE = 200 * 1024 * 1024
MAX_FILE = 20 * 1024 * 1024
MAX_RECORDS = 5000


def parse_recall(data: bytes):
    if len(data) > MAX_ARCHIVE:
        raise ValueError("The export exceeds the 200 MB limit")
    archive = None
    try:
        if data.startswith(b"PK\x03\x04"):
            archive = ZipFile(BytesIO(data))
            entries = archive.infolist()
            if len({entry.filename for entry in entries}) != len(entries):
                raise ValueError("Archive contains duplicate paths")
            if sum(entry.file_size for entry in entries) > MAX_ARCHIVE:
                raise ValueError("Uncompressed archive exceeds 200 MB")
            if any(entry.flag_bits & 1 or entry.file_size > MAX_FILE for entry in entries):
                raise ValueError("Encrypted or oversized archive member")
            if any(PurePosixPath(entry.filename).is_absolute() or ".." in PurePosixPath(entry.filename).parts for entry in entries):
                raise ValueError("Archive contains an unsafe path")
            raw = archive.read("manifest.json")
        else:
            raw = data
        if len(raw) > MAX_FILE:
            raise ValueError("Export metadata exceeds 20 MB")
        payload = json.loads(raw)
        records = payload.get("memories") if isinstance(payload, dict) else None
        if not isinstance(records, list) or len(records) > MAX_RECORDS:
            raise ValueError("Expected a Recall export with at most 5,000 memories")
        result = []
        for record in records:
            if not isinstance(record, dict):
                raise ValueError("Every memory must be an object")
            metadata = {key: value for key, value in record.items() if key not in {"embedding", "archive_file"}}
            if not isinstance(metadata.get("content", ""), str) or not isinstance(metadata.get("title", ""), (str, type(None))):
                raise ValueError("Invalid title or content in export")
            if len(metadata.get("content", "")) > 1_000_000:
                raise ValueError("A memory exceeds the text limit")
            fingerprint = metadata.get("content_hash")
            if not isinstance(fingerprint, str) or not fingerprint:
                fingerprint = json.dumps(metadata, sort_keys=True, ensure_ascii=False)
            key = hashlib.sha256(fingerprint.encode()).hexdigest()
            original = None
            archive_name = record.get("archive_file")
            if archive_name:
                if not archive or not isinstance(archive_name, str) or not archive_name.startswith("files/"):
                    raise ValueError("Invalid original-file reference")
                info = archive.getinfo(archive_name)
                if info.file_size > MAX_FILE:
                    raise ValueError("An original file exceeds 20 MB")
                original = archive.read(info)
            missing = bool(metadata.get("path")) and original is None
            result.append({"key": key, "metadata": metadata, "original": original, "missing": missing})
        return result
    except (BadZipFile, KeyError, UnicodeError, json.JSONDecodeError) as exc:
        raise ValueError("Invalid or incomplete Recall export") from exc
    finally:
        if archive:
            archive.close()
