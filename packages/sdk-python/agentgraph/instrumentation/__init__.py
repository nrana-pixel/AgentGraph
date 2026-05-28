"""Optional provider auto-instrumentation.

Mirrors `packages/sdk/src/instrumentation/`. Provider libraries (openai,
anthropic) are imported lazily inside each ``instrument_*`` call so the core
SDK keeps zero required dependencies.
"""

from .openai import instrument_openai
from .anthropic import instrument_anthropic

__all__ = ["instrument_openai", "instrument_anthropic"]
