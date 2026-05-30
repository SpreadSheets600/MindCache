import json
import logging
import sys
from typing import Any, cast

from app.core.config import settings


class StructuredJSONFormatter(logging.Formatter):
    """Formats Log Records As Single-Line JSON Objects."""

    def format(self, record: logging.LogRecord) -> str:

        # Exclude Sensitive Query Parameters Or Content If Present
        log_data: dict[str, Any] = {
            "timestamp": self.formatTime(record, self.datefmt),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }

        # Include Additional Context Passed In 'Extra'
        if hasattr(record, "extra_info") and isinstance(record.extra_info, dict):
            extra_info: dict[str, Any] = cast("dict[str, Any]", record.extra_info)

            # Strip Potential Sensitive Info
            safe_extra = {
                k: v
                for k, v in extra_info.items()
                if k not in ("password", "token", "secret", "extracted_content")
            }

            log_data.update(safe_extra)

        if record.exc_info:
            log_data["exception"] = self.formatException(record.exc_info)

        return json.dumps(log_data)


def setup_logging() -> None:
    """Configures Structured Logging For The Application."""

    root_logger = logging.getLogger()
    root_logger.setLevel(settings.LOG_LEVEL)

    # Clear Existing Handlers
    root_logger.handlers = []

    # Stream Handler For Stdout
    handler = logging.StreamHandler(sys.stdout)
    formatter = StructuredJSONFormatter(datefmt="%Y-%m-%dT%H:%M:%S")
    handler.setFormatter(formatter)
    root_logger.addHandler(handler)

    # Disable Excessive Log Spam From Third-Party Libraries
    logging.getLogger("urllib3").setLevel(logging.WARNING)
    logging.getLogger("sentence_transformers").setLevel(logging.WARNING)


# Expose Standard Logger Generator
def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(name)
