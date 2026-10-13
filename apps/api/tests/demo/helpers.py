"""Shared test helpers for the demo suite (imported by tests in this directory)."""

from __future__ import annotations

from typing import Any
from uuid import UUID, uuid4

from fastapi.testclient import TestClient

ALLOWED_ORIGIN = "http://localhost:3000"


class SessionClient:
    """Thin wrapper around TestClient that manages Origin/CSRF/idempotency."""

    def __init__(self, http: TestClient, origin: str = ALLOWED_ORIGIN) -> None:
        self.http = http
        self.origin = origin
        self.csrf: str | None = None

    def headers(
        self,
        *,
        csrf: bool = False,
        origin: bool = True,
        key: UUID | None = None,
        extra: dict[str, str] | None = None,
    ) -> dict[str, str]:
        headers: dict[str, str] = {}
        if origin:
            headers["Origin"] = self.origin
        if csrf and self.csrf:
            headers["X-Demo-CSRF"] = self.csrf
        if key is not None:
            headers["Idempotency-Key"] = str(key)
        if extra:
            headers.update(extra)
        return headers

    def create(self, origin: str | None = None) -> Any:
        response = self.http.post(
            "/api/v1/demo/session",
            json={},
            headers={"Origin": origin or self.origin},
        )
        if response.status_code == 201:
            self.csrf = response.json()["csrf_token"]
        return response

    def get_session(self) -> Any:
        return self.http.get("/api/v1/demo/session")

    def delete_session(self, *, csrf: bool = True, origin: bool = True) -> Any:
        return self.http.request(
            "DELETE",
            "/api/v1/demo/session",
            headers=self.headers(csrf=csrf, origin=origin),
        )

    def upload(
        self,
        pdf_bytes: bytes,
        *,
        filename: str = "policy.pdf",
        content_type: str = "application/pdf",
        key: UUID | None = None,
        csrf: bool = True,
        origin: bool = True,
        extra: dict[str, str] | None = None,
    ) -> Any:
        key = key or uuid4()
        return self.http.post(
            "/api/v1/demo/policies",
            files={"file": (filename, pdf_bytes, content_type)},
            headers=self.headers(csrf=csrf, origin=origin, key=key, extra=extra),
        )

    def explain(
        self,
        document_id: str,
        document_revision: int,
        narrative: str,
        *,
        key: UUID | None = None,
        mode: str = "deterministic",
        csrf: bool = True,
        origin: bool = True,
        extra: dict[str, str] | None = None,
    ) -> Any:
        key = key or uuid4()
        payload = {
            "document_id": document_id,
            "document_revision": document_revision,
            "narrative": narrative,
            "mode": mode,
        }
        return self.http.post(
            "/api/v1/demo/explanations",
            json=payload,
            headers=self.headers(csrf=csrf, origin=origin, key=key, extra=extra),
        )

    def get_page(self, document_id: str, page: int) -> Any:
        return self.http.get(f"/api/v1/demo/policies/{document_id}/pages/{page}")

    def get_explanation(self, explanation_id: str) -> Any:
        return self.http.get(f"/api/v1/demo/explanations/{explanation_id}")

    def handoff(
        self,
        explanation_id: str,
        *,
        key: UUID | None = None,
        csrf: bool = True,
        origin: bool = True,
    ) -> Any:
        key = key or uuid4()
        return self.http.post(
            "/api/v1/demo/handoffs",
            json={"explanation_id": explanation_id},
            headers=self.headers(csrf=csrf, origin=origin, key=key),
        )

    def get_inbox(self, recipient: str) -> Any:
        return self.http.get(f"/api/v1/demo/inboxes/{recipient}")
