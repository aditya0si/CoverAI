"""Unit tests for ClaimService.upload_images file validation.

Covers the real security-relevant checks that live in the service:
extension allowlist, magic-bytes spoofing detection, size limits,
state restrictions, and the happy path.
"""
from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock, AsyncMock

import pytest

from core.exceptions import CoverAIException
from services.claim_service import ClaimService

VALID_PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
VALID_JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 64
VALID_WEBP = b"RIFF\x00\x00\x00\x00WEBPVP8 " + b"\x00" * 64


class FakeFile:
    def __init__(self, filename: str, content_type: str, data: bytes):
        self.filename = filename
        self.content_type = content_type
        self._data = data

    async def read(self) -> bytes:
        return self._data


def _make_service(claim_status: str = "draft"):
    db = MagicMock()
    db.flush = AsyncMock()
    db.commit = AsyncMock()
    user = MagicMock()
    user.id = "claimant-uuid"
    claim = SimpleNamespace(id="claim-uuid", claimant_id="claimant-uuid", status=claim_status)

    service = ClaimService(db=db, user=user)

    async def fake_get(_claim_id):
        return claim

    service._get_claim_or_404 = fake_get
    service._get_storage = lambda: MagicMock()
    return service, db


@pytest.mark.asyncio
async def test_accepts_valid_png_and_returns_image_metadata():
    service, db = _make_service()
    results = await service.upload_images("claim-uuid", [FakeFile("damage.png", "image/png", VALID_PNG)])

    assert len(results) == 1
    assert results[0]["message"] == "Image uploaded successfully."
    assert results[0]["_background_task"][0] == "run_image_ai_analysis"
    db.add.assert_called_once()
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_accepts_jpeg_and_webp():
    service, _ = _make_service()
    for filename, content_type, data in [
        ("a.jpg", "image/jpeg", VALID_JPEG),
        ("a.webp", "image/webp", VALID_WEBP),
    ]:
        results = await service.upload_images("claim-uuid", [FakeFile(filename, content_type, data)])
        assert len(results) == 1


@pytest.mark.asyncio
async def test_rejects_spoofed_png_magic_bytes():
    service, _ = _make_service()
    file = FakeFile("damage.png", "image/png", b"this is text pretending to be a png")
    with pytest.raises(CoverAIException) as exc:
        await service.upload_images("claim-uuid", [file])
    assert exc.value.error_code == "INVALID_FILE_TYPE"
    assert "Spoofed file detected" in exc.value.detail


@pytest.mark.asyncio
async def test_rejects_spoofed_webp_magic_bytes():
    service, _ = _make_service()
    # RIFF header without the WEBP signature at bytes 8..12
    file = FakeFile("a.webp", "image/webp", b"RIFF\x00\x00\x00\x00AVI " + b"\x00" * 64)
    with pytest.raises(CoverAIException) as exc:
        await service.upload_images("claim-uuid", [file])
    assert exc.value.error_code == "INVALID_FILE_TYPE"


@pytest.mark.asyncio
async def test_rejects_unsupported_extension():
    service, _ = _make_service()
    file = FakeFile("damage.gif", "image/gif", b"GIF89a")
    with pytest.raises(CoverAIException) as exc:
        await service.upload_images("claim-uuid", [file])
    assert exc.value.error_code == "INVALID_FILE_TYPE"
    assert "Only JPEG, PNG, and WebP are allowed" in exc.value.detail


@pytest.mark.asyncio
async def test_rejects_oversized_file():
    service, _ = _make_service()
    big = VALID_PNG + b"\x00" * (10 * 1024 * 1024 + 1)
    file = FakeFile("damage.png", "image/png", big)
    with pytest.raises(CoverAIException) as exc:
        await service.upload_images("claim-uuid", [file])
    assert exc.value.error_code == "FILE_TOO_LARGE"


@pytest.mark.asyncio
async def test_rejects_more_than_five_files():
    service, _ = _make_service()
    files = [FakeFile(f"d{i}.png", "image/png", VALID_PNG) for i in range(6)]
    with pytest.raises(CoverAIException) as exc:
        await service.upload_images("claim-uuid", files)
    assert exc.value.error_code == "TOO_MANY_FILES"


@pytest.mark.asyncio
async def test_rejects_uploads_to_approved_claim():
    service, _ = _make_service(claim_status="approved")
    file = FakeFile("damage.png", "image/png", VALID_PNG)
    with pytest.raises(CoverAIException) as exc:
        await service.upload_images("claim-uuid", [file])
    assert exc.value.error_code == "INVALID_STATE"


@pytest.mark.asyncio
async def test_rejects_upload_by_non_owner():
    service, _ = _make_service()
    service.user.id = "some-other-user"
    file = FakeFile("damage.png", "image/png", VALID_PNG)
    with pytest.raises(CoverAIException) as exc:
        await service.upload_images("claim-uuid", [file])
    assert exc.value.status_code == 403