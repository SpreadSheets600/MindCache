from datetime import UTC, datetime


def naive_utc_now():
    return datetime.now(UTC).replace(tzinfo=None)


def parse_datetime(value: str | None):
    if not value:
        return None
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        pass
    for pattern in ("%Y-%m-%d", "%Y%m%d"):
        try:
            return datetime.strptime(value[:10] if "-" in value else value[:8], pattern)
        except ValueError:
            continue
    return None


def parse_unix_timestamp(value: int | float):
    try:
        return datetime.fromtimestamp(value, UTC).replace(tzinfo=None)
    except (ValueError, OverflowError, OSError):
        return None
