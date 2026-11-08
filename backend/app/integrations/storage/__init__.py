from .interface import NotConfigured, StorageBackend
from .local_storage import LocalStorage
from .s3_storage import S3Storage, get_storage

__all__ = ["StorageBackend", "NotConfigured", "LocalStorage", "S3Storage",
           "get_storage", "get_storage_status"]


def get_storage_status() -> dict:
    """Report which backend is active and whether it is properly configured.

    The backend is ``local`` unless S3 is configured; ``configured`` reflects
    whether the selected backend's credentials are present. We never claim S3 is
    active when ``TD_S3_*`` is unset.
    """
    s3 = S3Storage()
    if s3.available():
        return {"backend": "s3", "configured": True, "provider": s3.name,
                "bucket": s3.bucket}
    return {"backend": "local", "configured": True, "provider": LocalStorage().name}

