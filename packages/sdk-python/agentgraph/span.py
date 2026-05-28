"""Span — a single step within a trace.

Mirrors `packages/sdk/src/span.ts`. Setters are chainable (return ``self``),
and ``to_step_input()`` serializes to the camelCase JSON contract defined by
``TraceStepInputSchema`` in ``packages/types/src/trace.ts``.
"""

from __future__ import annotations

import time
from datetime import datetime, timezone
from typing import Any, Dict, Optional, Union

# Step types accepted by the API contract (StepTypeSchema).
StepType = str  # "llm_call" | "tool_call" | "retrieval" | "human" | "custom"


def _now_iso() -> str:
    """RFC 3339 timestamp with a trailing ``Z`` (what Zod's .datetime() wants)."""
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


class Span:
    def __init__(self, type: str, name: str) -> None:
        self._type = type
        self._name = name
        self._started_at = time.monotonic()
        self._timestamp = _now_iso()

        self._input: Optional[Dict[str, Any]] = None
        self._output: Optional[Dict[str, Any]] = None
        self._model: Optional[str] = None
        self._token_usage: Optional[Dict[str, int]] = None
        self._cost_usd: Optional[float] = None
        self._tool_name: Optional[str] = None
        self._tool_version: Optional[str] = None
        self._error: Optional[str] = None
        self._latency_ms: Optional[int] = None

    def set_input(self, input: Dict[str, Any]) -> "Span":
        self._input = input
        return self

    def set_output(self, output: Dict[str, Any]) -> "Span":
        self._output = output
        return self

    def set_model(self, model: str) -> "Span":
        self._model = model
        return self

    def set_token_usage(
        self, prompt: int, completion: int, total: Optional[int] = None
    ) -> "Span":
        self._token_usage = {
            "prompt": prompt,
            "completion": completion,
            "total": total if total is not None else prompt + completion,
        }
        return self

    def set_cost(self, usd: float) -> "Span":
        self._cost_usd = usd
        return self

    def set_tool_name(self, name: str) -> "Span":
        self._tool_name = name
        return self

    def set_tool_version(self, version: str) -> "Span":
        self._tool_version = version
        return self

    def set_error(self, error: Union[BaseException, str]) -> "Span":
        self._error = str(error) if isinstance(error, BaseException) else error
        return self

    def end(self) -> "Span":
        self._latency_ms = int((time.monotonic() - self._started_at) * 1000)
        return self

    def to_step_input(self) -> Dict[str, Any]:
        """Serialize to the camelCase step dict. Omits unset fields entirely
        (the contract fields are ``.optional()``, not ``.nullable()``)."""
        step: Dict[str, Any] = {
            "type": self._type,
            "name": self._name,
            "timestamp": self._timestamp,
        }
        if self._input is not None:
            step["input"] = self._input
        if self._output is not None:
            step["output"] = self._output
        if self._model is not None:
            step["model"] = self._model
        if self._token_usage is not None:
            step["tokenUsage"] = self._token_usage
        if self._cost_usd is not None:
            step["costUsd"] = self._cost_usd
        if self._tool_name is not None:
            step["toolName"] = self._tool_name
        if self._tool_version is not None:
            step["toolVersion"] = self._tool_version
        if self._error is not None:
            step["error"] = self._error
        if self._latency_ms is not None:
            step["latencyMs"] = self._latency_ms
        return step
