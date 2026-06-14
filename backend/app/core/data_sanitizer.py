from datetime import datetime
from typing import Any, Optional


def sanitize_text(value: Any, max_length: Optional[int] = None) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, bytes):
        value = value.decode("utf-8", errors="replace")
    if not isinstance(value, str):
        value = str(value)
    cleaned = value.encode("utf-8", errors="replace").decode("utf-8")
    if max_length is not None:
        cleaned = cleaned[:max_length]
    return cleaned


def sanitize_platform_metadata(value: Any) -> Optional[dict]:
    if value is None:
        return None
    if not isinstance(value, dict):
        try:
            value = dict(value)
        except (TypeError, ValueError):
            return None
    cleaned = {}
    for k, v in value.items():
        key = sanitize_text(k, 255)
        if key is None:
            continue
        if isinstance(v, str):
            cleaned[key] = sanitize_text(v)
        elif isinstance(v, bytes):
            cleaned[key] = v.decode("utf-8", errors="replace")
        elif isinstance(v, dict):
            cleaned[key] = sanitize_platform_metadata(v)
        elif isinstance(v, list):
            cleaned_list = []
            for item in v:
                if isinstance(item, str):
                    cleaned_list.append(sanitize_text(item))
                elif isinstance(item, bytes):
                    cleaned_list.append(item.decode("utf-8", errors="replace"))
                elif isinstance(item, dict):
                    cleaned_list.append(sanitize_platform_metadata(item))
                else:
                    cleaned_list.append(item)
            cleaned[key] = cleaned_list
        else:
            cleaned[key] = v
    return cleaned if cleaned else None


def sanitize_datetime(value: Any) -> Optional[datetime]:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value)
        except (ValueError, TypeError):
            return None
    if isinstance(value, bytes):
        try:
            return datetime.fromisoformat(value.decode("utf-8", errors="replace"))
        except (ValueError, TypeError):
            return None
    try:
        return datetime.fromisoformat(str(value))
    except (ValueError, TypeError):
        return None
