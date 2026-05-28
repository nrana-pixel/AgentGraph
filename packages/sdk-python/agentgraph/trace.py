"""Trace — collects spans and flushes them as one IngestPayload.

Mirrors `packages/sdk/src/trace.ts`. The HTTP sender is injected by
``AgentGraph`` (a callable taking the camelCase payload dict), which keeps
the class trivial to test. Supports use as a context manager that
auto-flushes on exit.
"""

from __future__ import annotations

import time
import uuid
from typing import Any, Callable, Dict, List, Optional

from .span import Span

# Injected sender: takes the fully serialized camelCase payload dict.
SendFn = Callable[[Dict[str, Any]], None]
StepFn = Callable[[Span], Any]


class Trace:
    def __init__(
        self,
        send: SendFn,
        *,
        agent_id: str,
        trace_id: Optional[str] = None,
        session_id: Optional[str] = None,
        user_id: Optional[str] = None,
        env: str = "prod",
        metadata: Optional[Dict[str, Any]] = None,
    ) -> None:
        self._send = send
        self._agent_id = agent_id
        # Generate client-side so retries/at-least-once delivery are idempotent.
        self._trace_id = trace_id or str(uuid.uuid4())
        self._session_id = session_id
        self._user_id = user_id
        self._env = env
        self._metadata = metadata if metadata is not None else {}

        self._steps: List[Dict[str, Any]] = []
        self._started_at = time.monotonic()
        self._flushed = False

    @property
    def trace_id(self) -> str:
        return self._trace_id

    def start_span(self, type: str, name: str) -> Span:
        return Span(type, name)

    def add_span(self, span: Span) -> None:
        self._steps.append(span.to_step_input())

    def step(self, type: str, name: str, fn: StepFn) -> Any:
        """Create a span, run ``fn(span)``, time it, capture errors, collect it."""
        span = self.start_span(type, name)
        try:
            result = fn(span)
            span.end()
            self.add_span(span)
            return result
        except BaseException as err:
            span.set_error(err).end()
            self.add_span(span)
            raise

    def flush(self, status: str = "completed") -> None:
        """POST the collected steps as one IngestPayload. Idempotent; no-op when
        there are no steps (the contract requires ``steps.min(1)``)."""
        if self._flushed or not self._steps:
            return

        total_latency_ms = int((time.monotonic() - self._started_at) * 1000)
        total_tokens = sum(
            (s.get("tokenUsage") or {}).get("total", 0) for s in self._steps
        )
        total_cost_usd = sum(s.get("costUsd", 0) or 0 for s in self._steps)

        payload: Dict[str, Any] = {
            "agentId": self._agent_id,
            "env": self._env,
            "status": status,
            "steps": self._steps,
            "totalLatencyMs": total_latency_ms,
            "metadata": self._metadata,
        }
        # Only emit optional keys when set — the contract uses .optional(), not
        # .nullable(), so absent != null.
        payload["traceId"] = self._trace_id
        if self._session_id is not None:
            payload["sessionId"] = self._session_id
        if self._user_id is not None:
            payload["userId"] = self._user_id
        if total_tokens > 0:
            payload["totalTokens"] = total_tokens
        if total_cost_usd > 0:
            payload["totalCostUsd"] = total_cost_usd

        self._send(payload)
        self._flushed = True

    # --- context manager: auto-flush on exit -------------------------------
    def __enter__(self) -> "Trace":
        return self

    def __exit__(self, exc_type, exc_val, exc_tb) -> bool:
        # Flush with the right status; never swallow the exception.
        self.flush("error" if exc_type is not None else "completed")
        return False
