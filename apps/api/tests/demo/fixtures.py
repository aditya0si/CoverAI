"""Explicitly synthetic PDF fixtures for demo tests.

These fixtures are generated ``fitz`` documents used only by tests. They are
never presented as uploaded user evidence and never shipped into the UI.
"""

from __future__ import annotations

from typing import Sequence

PAGE_1 = (
    "CoverAI Motor Policy\n"
    "Insurer Name: Apex General Insurance\n"
    "Policy Number: APX-2026-000123\n"
    "Vehicle Registration: KA01AB1234\n"
    "\n"
    "This policy is issued subject to the terms and conditions set out herein."
)

PAGE_2 = (
    "SECTION 4 - ACCIDENTAL DAMAGE\n"
    "The company will indemnify the insured against accidental external damage to the insured vehicle.\n"
    "Exclusions include consequential loss and damage arising from wear and tear."
)

PAGE_3 = (
    "SECTION 9 - THIRD PARTY LIABILITY\n"
    "The company will cover third party property damage up to the limits stated in the schedule."
)

DEFAULT_PAGES = [PAGE_1, PAGE_2, PAGE_3]


def build_policy_pdf(pages: Sequence[str]) -> bytes:
    """Build a real PDF with one physical page per entry (empty string = blank)."""
    import fitz

    doc = fitz.open()
    try:
        for text in pages:
            page = doc.new_page(width=595, height=842)
            y = 72.0
            for line in text.split("\n"):
                if line:
                    page.insert_text((72, y), line, fontsize=11, fontname="helv")
                y += 16.0
        return doc.tobytes()
    finally:
        doc.close()


def default_policy_pdf() -> bytes:
    return build_policy_pdf(DEFAULT_PAGES)


def encrypted_pdf() -> bytes:
    import fitz

    doc = fitz.open()
    try:
        page = doc.new_page(width=595, height=842)
        page.insert_text((72, 72), "Encrypted policy text", fontsize=11, fontname="helv")
        return doc.tobytes(
            encryption=fitz.PDF_ENCRYPT_AES_256,
            owner_pw="owner-secret",
            user_pw="user-secret",
        )
    finally:
        doc.close()


def conflicting_metadata_pdf() -> bytes:
    page = (
        "Policy Number: APX-2026-000123\n"
        "Policy Number: APX-2026-999999\n"
        "Insurer Name: Apex General Insurance\n"
        "Renewal date reference 2023-01-01 means nothing unlabelled"
    )
    return build_policy_pdf([page])


def unicode_page_pdf() -> bytes:
    page = (
        "Policy schedule — café ☕ insured vehicle\n"
        "SECTION 4 - ACCIDENTAL DAMAGE\n"
        "The company will indemnify against accidental external damage to the vehicle."
    )
    return build_policy_pdf([page])


# ── coverai-repair-r4 fixtures ─────────────────────────────────────────────
# These builders reproduce the independent-review findings against the *actual*
# parser. Each has a control assertion in test_repair_r4.py proving the fixture
# is the intended nasty case (not merely a string the parser rejects by accident).

def owner_password_only_pdf() -> bytes:
    """A real AES-256 PDF with an *empty user password* but a non-empty owner
    password. It opens without a password (``needs_pass`` is False) yet still
    carries an ``/Encrypt`` dictionary, so ``needs_pass`` alone must not be the
    encryption test."""
    import fitz

    doc = fitz.open()
    try:
        page = doc.new_page(width=595, height=842)
        page.insert_text(
            (72, 72), "Owner password only policy text", fontsize=11, fontname="helv"
        )
        return doc.tobytes(
            encryption=fitz.PDF_ENCRYPT_AES_256,
            owner_pw="owner-secret",
            user_pw="",
        )
    finally:
        doc.close()


def repaired_policy_pdf() -> bytes:
    """A real PDF that PyMuPDF can only open by *repairing* it.

    The valid bytes are truncated until the parser reports ``is_repaired`` while
    still returning readable text. ``needs_pass`` stays False, so the repaired
    state is the only signal that the file is damaged.
    """
    import fitz

    valid = build_policy_pdf(DEFAULT_PAGES)
    for fraction in (0.9, 0.85, 0.8, 0.75, 0.7):
        truncated = valid[: int(len(valid) * fraction)]
        doc = fitz.open(stream=truncated, filetype="pdf")
        try:
            repaired = bool(doc.is_repaired) and doc.page_count >= 1
            readable = bool(doc.load_page(0).get_text("text").strip())
        finally:
            doc.close()
        if repaired and readable:
            return truncated
    raise AssertionError("could not build a repaired PDF fixture")


DISTRACTOR_METADATA_PAGE = (
    "Example Insurer Name: Sample Insurance Co\n"
    "Previous Policy Number: APX-1999-000001\n"
    "Not the Vehicle Registration: XX00XX0000\n"
    "Example Vehicle Year: 1999\n"
    "Previous Premium: INR 1\n"
    "Not Insured Declared Value: INR 0\n"
    "Example Period From: 2000-01-01\n"
    "Previous Valid To: 2000-12-31\n"
)


def distractor_metadata_pdf() -> bytes:
    return build_policy_pdf([DISTRACTOR_METADATA_PAGE])


SUPPORTED_METADATA_PAGE = (
    "Insurer Name: Apex General Insurance\n"
    "Policy Number: APX-2026-000123\n"
    "Vehicle Registration: KA01AB1234\n"
    "Vehicle Year: 2020\n"
    "Total Premium: INR 12,345\n"
    "Insured Declared Value: INR 500000\n"
    "Policy Start Date: 2026-01-01\n"
    "Policy End Date: 2026-12-31\n"
)

SUPPORTED_METADATA = {
    "insurer_name": "Apex General Insurance",
    "policy_number": "APX-2026-000123",
    "vehicle_registration": "KA01AB1234",
    "vehicle_year": "2020",
    "premium": "INR 12,345",
    "insured_value": "INR 500000",
    "start_date": "2026-01-01",
    "end_date": "2026-12-31",
}


def supported_metadata_pdf() -> bytes:
    return build_policy_pdf([SUPPORTED_METADATA_PAGE])


DISTRACTOR_AND_CURRENT_PAGE = (
    "Previous Policy Number: APX-1999-000001\n"
    "Policy Number: APX-2026-000123\n"
)


def distractor_and_current_pdf() -> bytes:
    return build_policy_pdf([DISTRACTOR_AND_CURRENT_PAGE])


# One physical paragraph (single newlines only, no blank line) whose positive
# clause and exclusion clause are far more than 600 code points apart.
LONG_CLAUSE_PARAGRAPH = (
    "The company will indemnify accidental external damage to the insured vehicle.\n"
    + "\n".join(["ordinary unrelated wording " * 3] * 8)
    + "\nExclusions include consequential loss and damage arising from wear and tear."
)


def long_paragraph_pdf() -> bytes:
    return build_policy_pdf([LONG_CLAUSE_PARAGRAPH])


ASTRAL_CHAR = "\U0001F600"  # U+1F600, a single code point outside the BMP
# Deliberately longer than the 600-code-point excerpt cap so the returned window
# is cropped and starts *after* the astral code point.
ASTRAL_PAGE_TEXT = (
    "Preamble " + ASTRAL_CHAR + " "
    + ("ordinary unrelated wording " * 25)
    + "accidental external damage to the insured vehicle"
)


def _build_identity_h_pdf(text: str, astral_cid: int = 0xF001) -> bytes:
    """Build a real single-page PDF with a Type0/Identity-H font and ToUnicode.

    PyMuPDF's own writer truncates astral code points to the BMP on round-trip
    (MuPDF bug), so this fixture is assembled by hand: every non-astral character
    maps to its own CID, and every astral code point maps to ``astral_cid``, which
    the ToUnicode CMap maps to a UTF-16 surrogate pair. The page is deliberately
    very wide so text is never clipped at the media box.
    """
    cids: list[int] = []
    toupairs: dict[int, str] = {}
    for ch in text:
        cp = ord(ch)
        cid = astral_cid if cp > 0xFFFF else cp
        cids.append(cid)
        if cid not in toupairs:
            if cp > 0xFFFF:
                value = cp - 0x10000
                hi = 0xD800 + (value >> 10)
                lo = 0xDC00 + (value & 0x3FF)
                toupairs[cid] = f"{hi:04X}{lo:04X}"
            else:
                toupairs[cid] = f"{cp:04X}"

    content_hex = "".join(f"{cid:04X}" for cid in cids)
    content = f"BT /F1 14 Tf 72 780 Td <{content_hex}> Tj ET".encode("latin-1")
    bfchars = "\n".join(
        f"<{cid:04X}> <{uni}>" for cid, uni in sorted(toupairs.items())
    )
    cmap = f"""
/CIDInit /ProcSet findresource begin
12 dict begin
begincmap
/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def
/CMapName /Adobe-Identity-UCS def
/CMapType 2 def
1 begincodespacerange
<0000> <FFFF>
endcodespacerange
{len(toupairs)} beginbfchar
{bfchars}
endbfchar
endcmap
CMapName currentdict /CMap defineresource pop
end
end
""".strip().encode("latin-1")

    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 30000 842] "
        b"/Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
        b"<< /Type /Font /Subtype /Type0 /BaseFont /LiberationSans /Encoding /Identity-H "
        b"/DescendantFonts [6 0 R] /ToUnicode 7 0 R >>",
        b"<< /Length "
        + str(len(content)).encode()
        + b" >>\nstream\n"
        + content
        + b"\nendstream",
        b"<< /Type /Font /Subtype /CIDFontType2 /BaseFont /LiberationSans "
        b"/CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> "
        b"/FontDescriptor 8 0 R /DW 1000 /W [1 [1000] "
        + str(astral_cid).encode()
        + b" [1000]] >>",
        b"<< /Length "
        + str(len(cmap)).encode()
        + b" >>\nstream\n"
        + cmap
        + b"\nendstream",
        b"<< /Type /FontDescriptor /FontName /LiberationSans /Flags 4 "
        b"/FontBBox [0 0 1000 1000] /ItalicAngle 0 /Ascent 800 /Descent -200 "
        b"/CapHeight 700 /StemV 80 >>",
    ]

    out = bytearray(b"%PDF-1.7\n")
    offsets: list[int] = []
    for index, obj in enumerate(objects, start=1):
        offsets.append(len(out))
        out += f"{index} 0 obj\n".encode() + obj + b"\nendobj\n"
    xref_pos = len(out)
    out += f"xref\n0 {len(objects) + 1}\n".encode()
    out += b"0000000000 65535 f \n"
    for offset in offsets:
        out += f"{offset:010d} 00000 n \n".encode()
    out += (
        f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\n"
        f"startxref\n{xref_pos}\n%%EOF\n"
    ).encode()
    return bytes(out)


def astral_policy_pdf() -> bytes:
    return _build_identity_h_pdf(ASTRAL_PAGE_TEXT)


# ── independent-repair-final fixtures ──────────────────────────────────────
def _wrap_lines(text: str, width: int = 80) -> str:
    """Wrap a long single paragraph onto physical lines without blank lines, so
    PyMuPDF inserts it without clipping while retrieval still sees one paragraph."""
    lines: list[str] = []
    current = ""
    for word in text.split(" "):
        candidate = word if not current else f"{current} {word}"
        if len(candidate) > width:
            if current:
                lines.append(current)
            current = word
        else:
            current = candidate
    if current:
        lines.append(current)
    return "\n".join(lines)


def _many_clause_raw() -> str:
    parts: list[str] = []
    for index in range(5):
        parts.append(
            f"collision accidental damage clause number {index} is described in this section."
        )
        parts.append("ordinary unrelated wording " * 22)
    parts.append(
        "Exclusions: this collision-only exclusion removes cover for loss and wear and tear."
    )
    return " ".join(parts)


# One physical paragraph with six matching clusters; the last (the exclusion) has
# the lowest score so the five-excerpt cap silently drops it.
MANY_CLAUSE_PARAGRAPH = _wrap_lines(_many_clause_raw())


def many_clause_paragraph_pdf() -> bytes:
    return build_policy_pdf([MANY_CLAUSE_PARAGRAPH])


def _boundary_clause_raw() -> str:
    return (
        ("ordinary unrelated wording " * 20)
        + "collision exclusion applies "
        + "Exclusions: "
        + ("consequential loss and damage arising from " * 15)
        + "wear and tear."
    )


# One physical paragraph whose matching clause sits just past the 600-code-point
# window start; the exclusion wording extends well beyond the window end.
BOUNDARY_CLAUSE_PARAGRAPH = _wrap_lines(_boundary_clause_raw())


def boundary_clause_paragraph_pdf() -> bytes:
    return build_policy_pdf([BOUNDARY_CLAUSE_PARAGRAPH])


# ── coverai-r5 fixtures: multiline heading context ─────────────────────────
# The r4 anchoring fix only rejected a distractor on the *same* line as a label
# (e.g. "Previous Policy Number: X"). A heading on its own line followed by a
# normal label ("Policy Number: OLD-44") still promoted the old value, because
# the parser had no memory of the preceding line's context. These real PDFs
# exercise that gap, plus the section-boundary and current-schedule controls.

def multiline_previous_heading_pdf() -> bytes:
    return build_policy_pdf(
        ["Previous policy (expired):\nPolicy Number: OLD-44"]
    )


def multiline_example_heading_pdf() -> bytes:
    return build_policy_pdf(
        ["Example only - not this policy:\nPolicy Number: OLD-44"]
    )


def multiline_do_not_use_heading_pdf() -> bytes:
    return build_policy_pdf(
        ["Do not use these values:\nPolicy Number: OLD-44"]
    )


# A distractor heading is followed by a *current* schedule control that must
# reset the context so the real value is still reported.
HEADING_THEN_CURRENT_PAGE = (
    "Previous policy (expired):\n"
    "Policy Number: OLD-44\n"
    "Policy Schedule\n"
    "Policy Number: APX-2026-000123"
)


def heading_then_current_schedule_pdf() -> bytes:
    return build_policy_pdf([HEADING_THEN_CURRENT_PAGE])


# A blank line is a section boundary: the label after it is current again.
# PyMuPDF drops a truly empty line (no glyphs), so the boundary is rendered as a
# whitespace glyph, which extracts as a genuine blank line.
HEADING_BLANK_LINE_CURRENT_PAGE = (
    "Previous policy (expired):\n"
    "Policy Number: OLD-44\n"
    " \n"
    "Policy Number: APX-2026-000123"
)


def heading_blank_line_current_pdf() -> bytes:
    return build_policy_pdf([HEADING_BLANK_LINE_CURRENT_PAGE])


# The whole block under the distractor heading is historical; an unrelated
# current label after the boundary must still be found.
HEADING_SUPPRESSES_BLOCK_PAGE = (
    "Example only - not this policy:\n"
    "Policy Number: OLD-44\n"
    "Vehicle Registration: XX00XX0000\n"
    " \n"
    "Insurer Name: Apex General Insurance"
)


def heading_suppresses_block_pdf() -> bytes:
    return build_policy_pdf([HEADING_SUPPRESSES_BLOCK_PAGE])


# The current label precedes the distractor heading, so suppression must be
# directional and must not retroactively discard it.
CURRENT_BEFORE_HEADING_PAGE = (
    "Policy Number: APX-2026-000123\n"
    "Previous policy (expired):\n"
    "Policy Number: OLD-44"
)


def current_before_heading_pdf() -> bytes:
    return build_policy_pdf([CURRENT_BEFORE_HEADING_PAGE])
