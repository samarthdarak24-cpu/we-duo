"""S3/MinIO adapter. Inactive unless TD_S3_* is configured and boto3 exists."""
from __future__ import annotations

import os

from .interface import NotConfigured
from .local_storage import LocalStorage


class S3Storage:
    name = "s3"

    def __init__(self) -> None:
        self.bucket = os.getenv("TD_S3_BUCKET")
        self.endpoint = os.getenv("TD_S3_ENDPOINT")
        self.region = os.getenv("TD_S3_REGION", "us-east-1")
        self._client = None

    def available(self) -> bool:
        if not self.bucket:
            return False
        try:
            import boto3  # noqa: F401
            return True
        except Exception:
            return False

    def _s3(self):
        if not self.available():
            raise NotConfigured("TD_S3_BUCKET is unset or boto3 is not installed.")
        if self._client is None:
            import boto3  # type: ignore
            self._client = boto3.client(
                "s3", endpoint_url=self.endpoint, region_name=self.region,
                aws_access_key_id=os.getenv("TD_S3_ACCESS_KEY_ID"),
                aws_secret_access_key=os.getenv("TD_S3_SECRET_ACCESS_KEY"),
            )
        return self._client

    def put(self, key: str, data: bytes, content_type: str = "application/octet-stream") -> str:
        self._s3().put_object(Bucket=self.bucket, Key=key, Body=data, ContentType=content_type)
        return key

    def get(self, key: str) -> bytes | None:
        try:
            obj = self._s3().get_object(Bucket=self.bucket, Key=key)
            return obj["Body"].read()
        except Exception:
            return None

    def exists(self, key: str) -> bool:
        try:
            self._s3().head_object(Bucket=self.bucket, Key=key)
            return True
        except Exception:
            return False

    def url(self, key: str) -> str | None:
        # Private objects: callers must use a signed URL, not a public one.
        return None


def get_storage():
    """Select S3 when configured, otherwise local private storage."""
    s3 = S3Storage()
    if s3.available():
        return s3
    return LocalStorage()
