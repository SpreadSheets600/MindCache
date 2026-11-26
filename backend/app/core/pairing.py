import json
import re
from app.core.atomic_io import write_private_text

_EXTENSION_ID = re.compile(r"[a-p]{32}\Z")
MINDCACHE_EXTENSION_ID = "madgiofmobpiddlpojcefbnogkeiklbh"


def valid_extension_id(value):
    return bool(_EXTENSION_ID.fullmatch(value))


def trusted_ids(path):
    if not path.exists():
        return set()
    values = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(values, list) or any(
        not isinstance(value, str) or not valid_extension_id(value) for value in values
    ):
        raise ValueError("Invalid extension pairing file")
    return set(values)


def save_trusted_ids(path, values):
    if any(not valid_extension_id(value) for value in values):
        raise ValueError("Invalid extension ID")
    write_private_text(path, json.dumps(sorted(values)))
