import json
import logging
import sys
from typing import Any

from app.core.config import settings

_SENSITIVE_EXTRA_KEYS = frozenset({"password", "token", "secret", "extracted_content"})


class StructuredJSONFormatter(logging.Formatter):

    def format(self, record: logging.LogRecord):
        payload: dict[str, Any] = {
            "timestamp": self.formatTime(record, self.datefmt),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        extra = getattr(record, "extra_info", None)
        if isinstance(extra, dict):
            payload.update(
                {key: value for key, value in extra.items() if key not in _SENSITIVE_EXTRA_KEYS}
            )
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        return json.dumps(payload)


def setup_logging():
    root = logging.getLogger()
    root.setLevel(settings.LOG_LEVEL)
    root.handlers = [logging.StreamHandler(sys.stdout)]
    root.handlers[0].setFormatter(StructuredJSONFormatter(datefmt="%Y-%m-%dT%H:%M:%S"))

    for noisy_logger in ("urllib3", "sentence_transformers", "httpx"):
        logging.getLogger(noisy_logger).setLevel(logging.WARNING)


def get_logger(name: str):
    return logging.getLogger(name)
