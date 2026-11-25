import re
from urllib.parse import urlparse

_EXTENSION_ORIGIN = re.compile(r"chrome-extension://[a-p]{32}\Z")
_LOOPBACK_HOSTS = frozenset({"localhost", "127.0.0.1", "::1"})
_MAX_PORT = 65535


def local_host(host):
    try:
        parsed = urlparse(f"//{host}")
        port = parsed.port
    except ValueError:
        return False
    return (
        parsed.hostname in _LOOPBACK_HOSTS
        and parsed.username is None
        and parsed.password is None
        and not parsed.path
        and not parsed.query
        and not parsed.fragment
        and (port is None or 0 < port <= _MAX_PORT)
    )


def allowed_origin(origin, host):
    if origin is None:
        return True
    if _EXTENSION_ORIGIN.fullmatch(origin):
        return True
    try:
        parsed = urlparse(origin)
    except ValueError:
        return False
    return (
        parsed.scheme == "http"
        and parsed.netloc.lower() == host.lower()
        and local_host(parsed.netloc)
        and not parsed.path
        and not parsed.query
        and not parsed.fragment
    )
