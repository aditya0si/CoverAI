"""Containment tests for the policy PDF upload path (finding F2).

Security report t_281df2d9 reproduced two defects in ``routers/policies.py``:

* a crafted multipart filename reached the handler verbatim and was
  interpolated into the storage key, so ``LocalStorageBackend.upload`` wrote
  outside its base directory; and
* the extension gate used ``and`` against ``content_type``, so
  ``Content-Type: application/pdf`` bypassed the ``.pdf`` requirement.

These tests drive the real router (real Starlette/python-multipart parsing) and
the real ``LocalStorageBackend`` against a disposable temp directory, then
assert that every stored byte lands on the canonical server-generated key
``policies/<uuid>/policy.pdf`` and nowhere else.

One dependency behaviour is documented rather than fought: python-multipart
strips IE6-style absolute Windows paths (drive-prefixed and UNC) down to their
basename while parsing part headers, so those variants are neutralised before
the handler ever sees them. The validator still rejects the raw strings, which
``test_unsafe_names_are_rejected_by_the_validator`` proves.

Windows separators are built from ``BS`` instead of written as literals, so a
reviewer never has to count escaping when reading a security test.
"""
from __future__ import annotations

import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock

import fitz
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import models
import routers.policies as policies_module
from core.database import get_db
from core.exceptions import CoverAIException, coverai_exception_handler
from core.security import get_current_user
from core.storage import LocalStorageBackend, StoragePathError
from routers.policies import is_safe_pdf_filename, policy_storage_path

BS = chr(0x5C)  # a single Windows path separator
NUL = chr(0)
CONTROL = chr(0x1F)

WIN_TRAVERSAL = f"..{BS}..{BS}..{BS}windows{BS}evil.pdf"
WIN_DRIVE_PATH = f"C:{BS}temp{BS}escape.pdf"
WIN_DRIVE_RELATIVE = f"C:{BS}evil.pdf"
UNC_PATH = f"{BS}{BS}srv{BS}share{BS}policy.pdf"

_FORM_DATA = {
    "vehicle_registration": "KA01AB1234",
    "insurer_name": "Apex General Insurance",
}


def _policy_pdf() -> bytes:
    """A minimal but genuinely valid PDF: extraction must produce text."""
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text(
        (72, 100),
        """Certificate of Insurance Apex General Insurance Private Limited
Policy Number POL-12345678 Vehicle Registration KA01AB1234
Premium Amount 15000 Sum Insured 500000 Cover Comprehensive""",
    )
    data = doc.tobytes()
    doc.close()
    return data


def _files_under(root) -> list:
    return sorted(p for p in root.rglob("*") if p.is_file())


class _FakeSession:
    """Captures the ORM objects the handler stages instead of touching a DB."""

    def __init__(self) -> None:
        self.added: list = []

    def add(self, obj: object) -> None:
        self.added.append(obj)

    async def flush(self) -> None:
        return None


@pytest.fixture()
def upload_context(tmp_path, monkeypatch):
    """The real ``/policies/upload`` route wired to a temp storage directory."""
    storage_dir = tmp_path / "storage"
    backend = LocalStorageBackend(base_dir=str(storage_dir))
    session = _FakeSession()
    user = SimpleNamespace(id=uuid.uuid4(), role=models.UserRole.customer)

    monkeypatch.setattr(policies_module, "get_storage_backend", lambda: backend)
    monkeypatch.setattr(policies_module, "log_action", AsyncMock())
    monkeypatch.setattr(
        policies_module, "generate_and_store_embeddings", lambda *args, **kwargs: None
    )

    app = FastAPI()
    app.add_exception_handler(CoverAIException, coverai_exception_handler)
    app.include_router(policies_module.policies_router)

    async def _current_user():
        return user

    async def _db():
        yield session

    app.dependency_overrides[get_current_user] = _current_user
    app.dependency_overrides[get_db] = _db

    return SimpleNamespace(
        client=TestClient(app), storage=storage_dir, session=session, user=user
    )


def _post_upload(client, filename, data=None, content_type="application/pdf"):
    payload = _policy_pdf() if data is None else data
    return client.post(
        "/policies/upload",
        files={"file": (filename, payload, content_type)},
        data=_FORM_DATA,
    )


# --------------------------------------------------------------------------- #
# Canonical storage key
# --------------------------------------------------------------------------- #


def test_policy_storage_path_is_a_single_canonical_uuid_key():
    policy_id = uuid.uuid4()
    assert policy_storage_path(policy_id) == f"policies/{policy_id}/policy.pdf"


# --------------------------------------------------------------------------- #
# Positive: a legitimate upload is stored on the canonical key and nowhere else
# --------------------------------------------------------------------------- #


def test_benign_pdf_upload_lands_on_the_canonical_key(upload_context):
    pdf = _policy_pdf()
    response = _post_upload(upload_context.client, "Apex Policy 2026.PDF", data=pdf)

    assert response.status_code == 201, response.text
    policy_id = response.json()["policy_id"]
    expected = upload_context.storage / "policies" / policy_id / "policy.pdf"
    assert expected.read_bytes() == pdf
    assert _files_under(upload_context.storage) == [expected]

    row = upload_context.session.added[0]
    assert row.pdf_storage_path == upload_context.storage.joinpath(
        "policies", policy_id, "policy.pdf"
    ).resolve().as_uri()


def test_client_filename_is_not_exposed_to_the_client_or_the_db(upload_context):
    response = _post_upload(upload_context.client, "Rajesh-Kumar-Policy-2026.pdf")

    assert response.status_code == 201, response.text
    assert "Rajesh-Kumar" not in response.text
    row = upload_context.session.added[0]
    assert "Rajesh-Kumar" not in row.pdf_storage_path


# --------------------------------------------------------------------------- #
# Negative: separator / traversal / absolute / drive-prefixed names are refused
# --------------------------------------------------------------------------- #

REJECTED_NAMES = [
    "../../../../app/entrypoint.sh.pdf",
    WIN_TRAVERSAL,
    "policies/../../escape.pdf",
    f"..{BS}escape.pdf",
    "/etc/cron.d/evil.pdf",
    "/tmp/escape.pdf",
    "nested/dir/policy.pdf",
]


# Absolute Windows and UNC paths are stripped to their basename by the multipart
# parser before the handler runs (see the neutralisation test below), so they are
# covered there rather than here.
PARSER_NEUTRALISED_NAMES = [WIN_DRIVE_PATH, WIN_DRIVE_RELATIVE, UNC_PATH]


@pytest.mark.parametrize("filename", REJECTED_NAMES)
def test_path_names_outside_a_plain_basename_are_rejected(upload_context, filename, tmp_path):
    response = _post_upload(upload_context.client, filename)

    assert response.status_code == 422, response.text
    assert response.json()["error"] == "VALIDATION_ERROR"
    assert upload_context.session.added == []
    assert _files_under(upload_context.storage) == []
    # nothing was written anywhere in the sandbox, including above the storage root
    assert [
        p for p in tmp_path.rglob("*") if p.is_file() and upload_context.storage not in p.parents
    ] == []


@pytest.mark.parametrize("filename", PARSER_NEUTRALISED_NAMES)
def test_windows_absolute_and_unc_paths_are_neutralised_by_the_multipart_parser(
    upload_context, filename
):
    """python-multipart reduces drive-prefixed and UNC paths to their basename.

    That is the IE6 workaround in ``python_multipart.multipart``: the handler
    never sees the path part. Whatever a parser version does with the prefix,
    the bytes still land on the canonical key and never outside the root.
    """
    response = _post_upload(upload_context.client, filename)

    assert response.status_code == 201, response.text
    policy_id = response.json()["policy_id"]
    assert _files_under(upload_context.storage) == [
        upload_context.storage / "policies" / policy_id / "policy.pdf"
    ]


@pytest.mark.parametrize(
    "filename", ["..pdf", "....pdf", "..%2f..%2fevil.pdf", "policy..final.pdf"]
)
def test_separatorless_odd_names_are_neutralised_onto_the_canonical_key(
    upload_context, filename
):
    response = _post_upload(upload_context.client, filename)

    assert response.status_code == 201, response.text
    policy_id = response.json()["policy_id"]
    assert _files_under(upload_context.storage) == [
        upload_context.storage / "policies" / policy_id / "policy.pdf"
    ]


def test_content_type_does_not_substitute_for_the_pdf_extension(upload_context):
    response = _post_upload(
        upload_context.client, "policy.txt", content_type="application/pdf"
    )

    assert response.status_code == 422, response.text
    assert upload_context.session.added == []
    assert _files_under(upload_context.storage) == []


def test_magic_bytes_are_still_required(upload_context):
    response = _post_upload(upload_context.client, "policy.pdf", data=b"not a pdf at all")

    assert response.status_code == 422, response.text
    assert _files_under(upload_context.storage) == []


def test_oversized_upload_is_still_rejected(upload_context):
    oversized = b"%PDF-1.7 " + b"0" * (20 * 1024 * 1024 + 1)
    response = _post_upload(upload_context.client, "policy.pdf", data=oversized)

    assert response.status_code == 422, response.text
    assert upload_context.session.added == []
    assert _files_under(upload_context.storage) == []


def test_missing_filename_is_rejected(upload_context):
    response = upload_context.client.post(
        "/policies/upload",
        files={"file": (None, _policy_pdf(), "application/pdf")},
        data=_FORM_DATA,
    )

    assert response.status_code == 422, response.text
    assert _files_under(upload_context.storage) == []


# --------------------------------------------------------------------------- #
# Filename validator
# --------------------------------------------------------------------------- #


@pytest.mark.parametrize(
    "name",
    [
        None,
        "",
        "   ",
        "policy.txt",
        "policy",
        f"policy.pdf{NUL}.exe",
        f"{NUL}policy.pdf",
        f"policy.pdf{CONTROL}",
        "policy\n.pdf",
        "a" * 300 + ".pdf",
        # path-semantic variants reject even if a parser hands them over raw
        "../../../../app/entrypoint.sh.pdf",
        WIN_TRAVERSAL,
        "/etc/cron.d/evil.pdf",
        WIN_DRIVE_PATH,
        WIN_DRIVE_RELATIVE,
        UNC_PATH,
        "nested/dir/policy.pdf",
    ],
)
def test_unsafe_names_are_rejected_by_the_validator(name):
    assert is_safe_pdf_filename(name) is False


@pytest.mark.parametrize(
    "name", ["policy.pdf", "POLICY.PDF", "My Policy.pdf", "..pdf", "policy..final.pdf"]
)
def test_plain_pdf_basenames_are_accepted_by_the_validator(name):
    assert is_safe_pdf_filename(name) is True


# --------------------------------------------------------------------------- #
# LocalStorageBackend containment (real temp directory, no HTTP layer)
# --------------------------------------------------------------------------- #

ESCAPING_KEYS = [
    "../escape.pdf",
    "../../escape.pdf",
    f"..{BS}..{BS}escape.pdf",
    "policies/x/../../../escape.pdf",
    "/tmp/escape.pdf",
    WIN_DRIVE_PATH,
    f"policies/{NUL}x/policy.pdf",
    "",
]


@pytest.mark.parametrize("path", ESCAPING_KEYS)
def test_local_backend_refuses_keys_that_escape_its_base_dir(tmp_path, path):
    base = tmp_path / "base"
    backend = LocalStorageBackend(base_dir=str(base))

    with pytest.raises(StoragePathError):
        backend.upload(b"%PDF-1.7 body", path)

    assert _files_under(tmp_path) == []


def test_local_backend_writes_inside_its_base_dir(tmp_path):
    base = tmp_path / "base"
    backend = LocalStorageBackend(base_dir=str(base))
    policy_id = uuid.uuid4()
    key = f"policies/{policy_id}/policy.pdf"

    url = backend.upload(b"%PDF-1.7 body", key)

    assert (base / "policies" / str(policy_id) / "policy.pdf").read_bytes() == b"%PDF-1.7 body"
    assert url == backend.get_url(key)
    assert url.endswith(f"policies/{policy_id}/policy.pdf")
    assert _files_under(tmp_path) == [base / "policies" / str(policy_id) / "policy.pdf"]
