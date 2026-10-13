"""CLI: write the synthetic demo policy PDF used by the Playwright e2e suite.

Usage::

    poetry run python tests/demo/make_fixture_pdf.py <output-path>

Writes only under the caller-provided path (test-results) and never into the UI.
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from fixtures import default_policy_pdf  # noqa: E402


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: make_fixture_pdf.py <output-path>", file=sys.stderr)
        return 2
    out = sys.argv[1]
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    with open(out, "wb") as handle:
        handle.write(default_policy_pdf())
    print(out)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
