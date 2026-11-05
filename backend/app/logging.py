"""Structured JSON logs. One line per event, no free-form strings."""
from __future__ import annotations

import json
import logging
import sys
from datetime import datetime, timezone

from .config import settings


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "ts": datetime.now(timezone.utc).isoformat(timespec="milliseconds"),
            "level": record.levelname,
            "service": "trustdrive-intelligence",
            "env": settings.environment,
            "logger": record.name,
            "event": record.getMessage(),
        }
        extra = getattr(record, "context", None)
        if isinstance(extra, dict):
            payload["context"] = extra
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False, default=str)


def configure_logging() -> logging.Logger:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())
    root = logging.getLogger()
    root.handlers[:] = [handler]
    root.setLevel(getattr(logging, settings.log_level.upper(), logging.INFO))
    return root


log = configure_logging()


def emit(event: str, **context: object) -> None:
    """Emit a structured event with typed context."""
    log.info(event, extra={"context": context})
