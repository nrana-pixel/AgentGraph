"""OpenAI auto-instrumentation. Mirrors `instrumentation/openai.ts`.

Monkeypatches ``client.chat.completions.create`` to emit an ``llm_call`` step
with model + token usage. Best-effort response parsing never crashes the
caller. The ``openai`` package is optional and is *not* imported here.
"""

from __future__ import annotations

from typing import Any

from ..trace import Trace
from ._util import get_field


def instrument_openai(client: Any, trace: Trace) -> None:
    completions = client.chat.completions
    original = completions.create

    def create(*args: Any, **kwargs: Any) -> Any:
        params = args[0] if args else kwargs
        model = params.get("model") if isinstance(params, dict) else kwargs.get("model")
        if not isinstance(model, str):
            model = "unknown"

        span = trace.start_span("llm_call", f"{model} completion")
        span.set_model(model)

        messages = kwargs.get("messages")
        if messages is None and isinstance(params, dict):
            messages = params.get("messages")
        if messages is not None:
            span.set_input({"messages": messages})

        try:
            result = original(*args, **kwargs)
        except BaseException as err:
            span.set_error(err).end()
            trace.add_span(span)
            raise

        # Best-effort response parsing — never crash the caller.
        try:
            choices = get_field(result, "choices") or []
            first = choices[0] if choices else None
            message = get_field(first, "message")
            if message is not None:
                span.set_output({"message": message})
            usage = get_field(result, "usage")
            if usage is not None:
                prompt = get_field(usage, "prompt_tokens", 0) or 0
                completion = get_field(usage, "completion_tokens", 0) or 0
                total = get_field(usage, "total_tokens", 0) or 0
                span.set_token_usage(prompt, completion, total)
        except Exception:
            pass

        span.end()
        trace.add_span(span)
        return result

    completions.create = create
