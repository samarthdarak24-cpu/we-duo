"""Local private storage under `settings.upload_dir` (path-traversal safe)."""
from __future__ import annotations

from pathlib import Path

from ...config import settings
from .interface import NotConfigured


class LocalStorage:
    name = "local-fs"

    def __init__(self, root: Path | None = None) -> None:
        self.root = (root or settings.upload_dir).resolve()
        self.root.mkdir(parents=True, exist_ok=True)

    def _path(self, key: str) -> Path:
        candidate = (self.root / key).resolve()
        if self.root not in candidate.parents and candidate != self.root:
            raise NotConfigured("Refusing path outside the upload root.")
        return candidate

    def put(self, key: str, data: bytes, content_type: str = "application/octet-stream") -> str:
        path = self._path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        return key

    def get(self, key: str) -> bytes | None:
        path = self._path(key)
        return path.read_bytes() if path.is_file() else None

    def exists(self, key: str) -> bool:
        return self._path(key).is_file()

    def url(self, key: str) -> str | None:
        # Private storage: no public URL by design.
        return None
