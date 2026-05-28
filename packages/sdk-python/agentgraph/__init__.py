"""AgentGraph — OpenTelemetry-style tracing for AI agents.

Mirrors the TypeScript SDK (`@agentgraph/sdk`). Posts traces to the API's
``POST /v1/ingest`` endpoint using only the Python standard library.
"""

from .client import AgentGraph
from .span import Span
from .trace import Trace
from .client import IngestClientError, IngestServerError

__all__ = [
    "AgentGraph",
    "Trace",
    "Span",
    "IngestClientError",
    "IngestServerError",
]

__version__ = "0.1.0"
