from datetime import datetime
from typing import Any


def sanitize_text(value: Any, max_length: int | None = None):
    if value is None:
        return None
    if isinstance(value, bytes):
        value = value.decode("utf-8", errors="replace")
    if not isinstance(value, str):
        value = str(value)
    cleaned = value.encode("utf-8", errors="replace").decode("utf-8")
    return cleaned[:max_length] if max_length is not None else cleaned


def sanitize_platform_metadata(value: Any):
    if value is None:
        return None
    if not isinstance(value, dict):
        try:
            value = dict(value)
        except (TypeError, ValueError):
            return None
    cleaned: dict[str, Any] = {}
    for key, item in value.items():
        clean_key = sanitize_text(key, 255)
        if clean_key is None:
            continue
        cleaned[clean_key] = _sanitize_metadata_value(item)
    return cleaned or None


def _sanitize_metadata_value(value: Any):
    if isinstance(value, str):
        return sanitize_text(value)
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="replace")
    if isinstance(value, dict):
        return sanitize_platform_metadata(value)
    if isinstance(value, list):
        return [_sanitize_metadata_value(item) for item in value]
    return value


def sanitize_datetime(value: Any):
    if value is None:
        return None
    if isinstance(value, datetime):
        return value
    if isinstance(value, bytes):
        value = value.decode("utf-8", errors="replace")
    try:
        return datetime.fromisoformat(str(value))
    except (ValueError, TypeError):
        return None
