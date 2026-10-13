"""Standalone CoverAI anonymous demonstration backend.

This package is deliberately independent from the production application. It must
never import ``main``, ``core.config``, ``core.database``, ``routers``, ``models``,
``services`` or any production auth/scheduler/queue module. It provides a bounded,
in-memory, deterministic document-grounded demonstration slice.
"""

__all__ = ["__version__"]

__version__ = "1.0.0"
