import os
from abc import ABC, abstractmethod
from pathlib import Path
import tempfile

from core.config import settings


class StoragePathError(ValueError):
    """Raised when a storage key is unsafe or would resolve outside the backend root."""


_CONTROL_CHARS = frozenset(chr(code) for code in range(32)) | {"\x7f"}


def _is_unsafe_key(key: str) -> bool:
    """A storage key must be a relative POSIX path inside the backend root."""
    if not isinstance(key, str) or not key.strip():
        return True
    if any(char in _CONTROL_CHARS for char in key):
        return True
    # Treat both separator flavours as separators so Windows-style traversal is
    # rejected on POSIX and vice versa.
    candidate = key.replace("\\", "/")
    if candidate.startswith("/") or os.path.isabs(key):
        return True
    if Path(key).is_absolute() or Path(candidate).is_absolute():
        return True
    drive, _ = os.path.splitdrive(key)
    if drive:
        return True
    components = candidate.split("/")
    if any(component in ("", ".", "..") for component in components):
        return True
    return False


def contained_path(base_dir: Path, key: str) -> Path:
    """Resolve ``key`` under ``base_dir``, refusing anything that escapes it.

    Containment is established on the *final resolved* path, so ``..`` segments
    and symlinks that point outside the storage root are both refused.
    """
    if _is_unsafe_key(key):
        raise StoragePathError("Unsafe storage key rejected.")

    root = Path(base_dir).resolve()
    resolved = (root / key.replace("\\", "/")).resolve()
    try:
        resolved.relative_to(root)
    except ValueError:
        raise StoragePathError("Storage key resolves outside the storage root.") from None
    if resolved == root:
        raise StoragePathError("Storage key must name a file inside the storage root.")
    return resolved

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
        full_path = self._contained(path)
        full_path.parent.mkdir(parents=True, exist_ok=True)
        full_path.write_bytes(file_bytes)
        return self.get_url(path)

    def get_url(self, path: str) -> str:
        return self._contained(path).as_uri()

    def delete(self, path: str) -> None:
        full_path = self._contained(path)
        if full_path.exists():
            try:
                full_path.unlink()
            except Exception:
                pass

    def _contained(self, path: str) -> Path:
        """Resolve a storage key, refusing anything that escapes ``base_dir``."""
        return contained_path(self.base_dir, path)


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
