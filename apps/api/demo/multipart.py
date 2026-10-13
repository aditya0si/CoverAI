"""Bounded, in-memory multipart parsing for the demo policy upload.

Starlette's default form parser streams each file part into a
``SpooledTemporaryFile`` that rolls over to disk above 1 MiB. The demo must not
persist policy bytes, so the policy route no longer declares an ``UploadFile``
dependency. Instead the pure-ASGI body cap has already buffered the entire
(capped) request body in memory, and this module extracts the single ``file``
part from those bytes directly. No temporary file is ever created.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from .errors import PayloadTooLarge, ValidationError

_BOUNDARY_RE = re.compile(r'boundary="?([^";,]+)"?', re.IGNORECASE)
_NAME_RE = re.compile(r'name="([^"]*)"', re.IGNORECASE)
_FILENAME_RE = re.compile(r'filename="([^"]*)"', re.IGNORECASE)
_HEADER_SPLIT_RE = re.compile(rb"\r\n|\n")


@dataclass(frozen=True)
class UploadedPart:
    field_name: str
    filename: str | None
    content_type: str | None
    data: bytes


def _boundary(content_type: str) -> bytes:
    match = _BOUNDARY_RE.search(content_type or "")
    if not match:
        raise ValidationError("The multipart request is missing a boundary.")
    return match.group(1).encode("latin-1")


def _part_meta(header_blob: bytes) -> tuple[str, str | None, str | None]:
    name = ""
    filename: str | None = None
    content_type: str | None = None
    for line in _HEADER_SPLIT_RE.split(header_blob):
        if not line:
            continue
        raw_key, _, raw_value = line.partition(b":")
        key = raw_key.strip().lower()
        value = raw_value.decode("latin-1", "replace").strip()
        if key == b"content-disposition":
            name_match = _NAME_RE.search(value)
            if name_match:
                name = name_match.group(1)
            file_match = _FILENAME_RE.search(value)
            if file_match:
                filename = file_match.group(1)
        elif key == b"content-type":
            content_type = value
    return name, filename, content_type


def parse_policy_upload(body: bytes, content_type: str, max_file_bytes: int) -> UploadedPart:
    """Extract the ``file`` part from a bounded multipart body, entirely in memory.

    Raises ``ValidationError`` (422) for a missing/malformed part and
    ``PayloadTooLarge`` (413) when the file part alone exceeds ``max_file_bytes``.
    The caller has already enforced the smaller request-level cap.
    """
    delimiter = b"--" + _boundary(content_type)
    segments = body.split(delimiter)
    if len(segments) < 2:
        raise ValidationError("The multipart request is malformed.")

    for raw in segments[1:]:
        if raw[:2] == b"--":
            break  # closing delimiter
        segment = raw
        if segment.startswith(b"\r\n"):
            segment = segment[2:]
        elif segment.startswith(b"\n"):
            segment = segment[1:]

        header_blob, sep, data = segment.partition(b"\r\n\r\n")
        if not sep:
            header_blob, sep, data = segment.partition(b"\n\n")
            if not sep:
                continue
        # Drop the CRLF that precedes the next boundary delimiter.
        if data.endswith(b"\r\n"):
            data = data[:-2]
        elif data.endswith(b"\n"):
            data = data[:-1]

        name, filename, part_type = _part_meta(header_blob)
        if name != "file":
            continue
        if len(data) > max_file_bytes:
            raise PayloadTooLarge("The PDF exceeds the 10 MiB upload limit.")
        return UploadedPart(field_name=name, filename=filename, content_type=part_type, data=data)

    raise ValidationError("The file field is required.")
