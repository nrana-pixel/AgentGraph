import uuid

import pytest

from agentgraph.trace import Trace


def make_trace(**opts):
    sent = []
    opts.setdefault("agent_id", "test-agent")
    trace = Trace(lambda p: sent.append(p), **opts)
    return trace, sent


def test_step_returns_callback_value():
    trace, _ = make_trace()
    assert trace.step("llm_call", "summarise", lambda span: "hello") == "hello"


def test_step_records_span_on_success():
    trace, sent = make_trace(agent_id="agent")
    trace.step("tool_call", "web_search", lambda span: span.set_output({"results": []}))
    trace.flush()
    assert len(sent[0]["steps"]) == 1
    assert sent[0]["steps"][0]["name"] == "web_search"


def test_step_records_error_and_reraises():
    trace, sent = make_trace(agent_id="agent")

    def boom(span):
        raise RuntimeError("oops")

    with pytest.raises(RuntimeError, match="oops"):
        trace.step("llm_call", "failing", boom)

    trace.flush("error")
    assert sent[0]["steps"][0]["error"] == "oops"


def test_step_records_latency():
    trace, sent = make_trace()
    trace.step("custom", "s", lambda span: None)
    trace.flush()
    assert sent[0]["steps"][0]["latencyMs"] >= 0


def test_flush_sends_agent_id_and_env():
    trace, sent = make_trace(agent_id="my-agent", env="staging")
    trace.step("custom", "noop", lambda span: None)
    trace.flush()
    assert sent[0]["agentId"] == "my-agent"
    assert sent[0]["env"] == "staging"


def test_flush_sends_status():
    trace, sent = make_trace()
    trace.step("custom", "s", lambda span: None)
    trace.flush("error")
    assert sent[0]["status"] == "error"


def test_flush_defaults_to_completed():
    trace, sent = make_trace()
    trace.step("custom", "s", lambda span: None)
    trace.flush()
    assert sent[0]["status"] == "completed"


def test_flush_noop_without_steps():
    trace, sent = make_trace()
    trace.flush()
    assert sent == []


def test_flush_is_idempotent():
    trace, sent = make_trace()
    trace.step("custom", "s", lambda span: None)
    trace.flush()
    trace.flush()
    assert len(sent) == 1


def test_flush_aggregates_total_tokens():
    trace, sent = make_trace()
    trace.step("llm_call", "s1", lambda span: span.set_token_usage(100, 50, 150))
    trace.step("llm_call", "s2", lambda span: span.set_token_usage(200, 100, 300))
    trace.flush()
    assert sent[0]["totalTokens"] == 450


def test_flush_aggregates_total_cost():
    trace, sent = make_trace()
    trace.step("llm_call", "s1", lambda span: span.set_cost(0.01))
    trace.step("llm_call", "s2", lambda span: span.set_cost(0.02))
    trace.flush()
    assert sent[0]["totalCostUsd"] == pytest.approx(0.03)


def test_flush_includes_session_and_user_id():
    trace, sent = make_trace(session_id="sess-1", user_id="user-42")
    trace.step("custom", "s", lambda span: None)
    trace.flush()
    assert sent[0]["sessionId"] == "sess-1"
    assert sent[0]["userId"] == "user-42"


def test_flush_omits_unset_optional_fields():
    trace, sent = make_trace()
    trace.step("custom", "s", lambda span: None)
    trace.flush()
    payload = sent[0]
    # No tokens/cost => keys absent; no session/user => keys absent.
    assert "sessionId" not in payload
    assert "userId" not in payload
    assert "totalTokens" not in payload
    assert "totalCostUsd" not in payload


def test_flush_generates_uuid_trace_id():
    trace, sent = make_trace()
    trace.step("custom", "s", lambda span: None)
    trace.flush()
    # Must be a valid uuid4 string (client-side generated for idempotency).
    uuid.UUID(sent[0]["traceId"], version=4)


def test_explicit_trace_id_is_used():
    tid = str(uuid.uuid4())
    trace, sent = make_trace(trace_id=tid)
    trace.step("custom", "s", lambda span: None)
    trace.flush()
    assert sent[0]["traceId"] == tid


def test_metadata_defaults_to_empty_dict():
    trace, sent = make_trace()
    trace.step("custom", "s", lambda span: None)
    trace.flush()
    assert sent[0]["metadata"] == {}


def test_total_latency_non_negative():
    trace, sent = make_trace()
    trace.step("custom", "s", lambda span: None)
    trace.flush()
    assert sent[0]["totalLatencyMs"] >= 0


def test_start_span_add_span_manual():
    trace, sent = make_trace()
    span = trace.start_span("retrieval", "vector-db")
    span.set_output({"hits": 3}).end()
    trace.add_span(span)
    trace.flush()
    assert sent[0]["steps"][0]["name"] == "vector-db"
    assert sent[0]["steps"][0]["output"] == {"hits": 3}


def test_context_manager_auto_flushes_on_exit():
    sent = []
    with Trace(lambda p: sent.append(p), agent_id="cm") as trace:
        trace.step("custom", "s", lambda span: None)
    assert len(sent) == 1
    assert sent[0]["status"] == "completed"


def test_context_manager_flushes_error_status_on_exception():
    sent = []
    with pytest.raises(RuntimeError):
        with Trace(lambda p: sent.append(p), agent_id="cm") as trace:
            trace.step("custom", "s", lambda span: None)
            raise RuntimeError("boom")
    assert len(sent) == 1
    assert sent[0]["status"] == "error"
