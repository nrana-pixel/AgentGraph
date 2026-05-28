"""AgentGraph client — mirrors `packages/sdk/src/index.ts` + `client.ts`.

Creates traces and owns the single HTTP sender (``_post``) that POSTs an
IngestPayload to ``{base_url}/v1/ingest`` with a Bearer API key. Uses only
the standard library ``urllib.request`` — zero required third-party deps.
"""

from __future__ import annotations

import json
import urllib.error
import urllib.request
from typing import Any, Dict, Optional

from .trace import Trace


class IngestClientError(Exception):
    """HTTP 4xx — the payload is bad; retrying won't help."""

    def __init__(self, status: int, text: str) -> None:
        super().__init__(f"AgentGraph ingest failed ({status}): {text}")
        self.status = status


class IngestServerError(Exception):
    """HTTP 5xx — transient; eligible for retry."""

    def __init__(self, status: int, text: str) -> None:
        super().__init__(f"AgentGraph ingest failed ({status}): {text}")
        self.status = status


class AgentGraph:
    def __init__(
        self, api_key: str, base_url: str = "http://localhost:3001"
    ) -> None:
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")

    def trace(
        self,
        agent_id: str,
        session_id: Optional[str] = None,
        user_id: Optional[str] = None,
        env: str = "prod",
        metadata: Optional[Dict[str, Any]] = None,
        trace_id: Optional[str] = None,
    ) -> Trace:
        return Trace(
            self._post,
            agent_id=agent_id,
            session_id=session_id,
            user_id=user_id,
            env=env,
            metadata=metadata,
            trace_id=trace_id,
        )

    def _post(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Single ingest attempt. Raises ``IngestClientError`` on 4xx,
        ``IngestServerError`` on 5xx, or re-raises the underlying URLError on
        network failure."""
        url = f"{self.base_url}/v1/ingest"
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=data,
            method="POST",
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {self.api_key}",
            },
        )
        try:
            with urllib.request.urlopen(req) as resp:
                body = resp.read().decode("utf-8")
                return json.loads(body) if body else {}
        except urllib.error.HTTPError as err:
            text = ""
            try:
                text = err.read().decode("utf-8")
            except Exception:
                pass
            if err.code >= 500:
                raise IngestServerError(err.code, text) from err
            raise IngestClientError(err.code, text) from err
