import os
from abc import ABC, abstractmethod
from pathlib import Path
import tempfile
from core.config import settings

class StorageBackend(ABC):
    """Abstract base class representing a storage backend for policies and other documents."""

    @abstractmethod
    def upload(self, file_bytes: bytes, path: str) -> str:
        """
        Upload file bytes to the specified relative path.
        Returns the publicly accessible URL or path URI of the uploaded file.
        """
        pass

    @abstractmethod
    def get_url(self, path: str) -> str:
        """
        Retrieve the URL/URI of a file at the specified relative path.
        """
        pass

    @abstractmethod
    def delete(self, path: str) -> None:
        """
        Delete the file at the specified relative path.
        """
        pass


class LocalStorageBackend(StorageBackend):
    """Local file system storage backend for local development and testing."""

    def __init__(self, base_dir: str = "/tmp/coverai"):
        # Handle both Windows and Linux by mapping standard /tmp or local system temp
        if os.name == 'nt' and (base_dir == "/tmp/coverai" or base_dir.startswith("/tmp")):
            self.base_dir = Path(tempfile.gettempdir()) / "coverai"
        else:
            self.base_dir = Path(base_dir)
            
        self.base_dir.mkdir(parents=True, exist_ok=True)

    def upload(self, file_bytes: bytes, path: str) -> str:
        full_path = self.base_dir / path
        full_path.parent.mkdir(parents=True, exist_ok=True)
        full_path.write_bytes(file_bytes)
        return self.get_url(path)

    def get_url(self, path: str) -> str:
        full_path = self.base_dir / path
        return full_path.as_uri()

    def delete(self, path: str) -> None:
        full_path = self.base_dir / path
        if full_path.exists():
            try:
                full_path.unlink()
            except Exception:
                pass


class S3StorageBackend(StorageBackend):
    """AWS S3 storage backend for production environments."""

    def __init__(self):
        self.bucket_name = settings.STORAGE_BUCKET or "coverai-documents-bucket"
        try:
            import boto3
            self.s3 = boto3.client("s3")
        except ImportError:
            self.s3 = None

    def upload(self, file_bytes: bytes, path: str) -> str:
        if not self.s3:
            # Stub logging if boto3 is not installed or configured
            return f"s3://{self.bucket_name}/{path}"
        
        self.s3.put_object(
            Bucket=self.bucket_name,
            Key=path,
            Body=file_bytes
        )
        return self.get_url(path)

    def get_url(self, path: str) -> str:
        return f"https://{self.bucket_name}.s3.amazonaws.com/{path}"

    def delete(self, path: str) -> None:
        if not self.s3:
            return
        try:
            self.s3.delete_object(
                Bucket=self.bucket_name,
                Key=path
            )
        except Exception:
            pass


def get_storage_backend() -> StorageBackend:
    """Factory function returning the configured storage backend."""
    backend_type = settings.STORAGE_BACKEND.lower().strip()
    if backend_type == "s3":
        return S3StorageBackend()
    return LocalStorageBackend()
