"""Private object-storage interface."""
from __future__ import annotations

from typing import Protocol


class NotConfigured(RuntimeError):
    """Raised when a backend is selected but its credentials are absent."""


class StorageBackend(Protocol):
    name: str

    def put(self, key: str, data: bytes, content_type: str = "application/octet-stream") -> str: ...

    def get(self, key: str) -> bytes | None: ...

    def exists(self, key: str) -> bool: ...

    def url(self, key: str) -> str | None:
        """Return a public URL only if the object is intentionally public."""
