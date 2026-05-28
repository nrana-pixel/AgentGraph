"""Shared helpers for instrumentation: tolerant field access.

The Python OpenAI/Anthropic SDKs (>=1.x) return Pydantic model objects with
attribute access, while older/raw responses may be plain dicts. ``get_field``
tries both so the parsers work against either shape.
"""

from __future__ import annotations

from typing import Any, Optional


def get_field(obj: Any, key: str, default: Optional[Any] = None) -> Any:
    """Read ``key`` from an object whether it's a dict or a model/object."""
    if obj is None:
        return default
    if isinstance(obj, dict):
        return obj.get(key, default)
    return getattr(obj, key, default)
