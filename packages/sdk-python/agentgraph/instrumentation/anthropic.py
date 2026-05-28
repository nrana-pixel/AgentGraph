"""Anthropic auto-instrumentation. Mirrors `instrumentation/anthropic.ts`.

Monkeypatches ``client.messages.create`` to emit an ``llm_call`` step with
model + token usage. Best-effort response parsing never crashes the caller.
The ``anthropic`` package is optional and is *not* imported here.
"""

from __future__ import annotations

from typing import Any

from ..trace import Trace
from ._util import get_field


def instrument_anthropic(client: Any, trace: Trace) -> None:
    messages_api = client.messages
    original = messages_api.create

    def create(*args: Any, **kwargs: Any) -> Any:
        params = args[0] if args else kwargs
        model = params.get("model") if isinstance(params, dict) else kwargs.get("model")
        if not isinstance(model, str):
            model = "unknown"

        span = trace.start_span("llm_call", f"{model} message")
        span.set_model(model)

        msgs = kwargs.get("messages")
        system = kwargs.get("system")
        if isinstance(params, dict):
            msgs = msgs if msgs is not None else params.get("messages")
            system = system if system is not None else params.get("system")
        inp = {}
        if msgs is not None:
            inp["messages"] = msgs
        if isinstance(system, str):
            inp["system"] = system
        if inp:
            span.set_input(inp)

        try:
            result = original(*args, **kwargs)
        except BaseException as err:
            span.set_error(err).end()
            trace.add_span(span)
            raise

        # Best-effort response parsing — never crash the caller.
        try:
            content = get_field(result, "content") or []
            text = ""
            for block in content:
                if get_field(block, "type") == "text":
                    t = get_field(block, "text")
                    if isinstance(t, str):
                        text = t
                    break
            span.set_output(
                {"text": text, "stop_reason": get_field(result, "stop_reason")}
            )
            usage = get_field(result, "usage")
            if usage is not None:
                inp_tokens = get_field(usage, "input_tokens", 0) or 0
                out_tokens = get_field(usage, "output_tokens", 0) or 0
                span.set_token_usage(inp_tokens, out_tokens, inp_tokens + out_tokens)
        except Exception:
            pass

        span.end()
        trace.add_span(span)
        return result

    messages_api.create = create
