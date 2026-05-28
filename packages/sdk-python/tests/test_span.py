import re
import time

from agentgraph.span import Span


def test_serialises_type_and_name():
    step = Span("llm_call", "my-step").to_step_input()
    assert step["type"] == "llm_call"
    assert step["name"] == "my-step"


def test_sets_input_output_model():
    span = Span("tool_call", "web_search")
    span.set_input({"query": "cats"}).set_output({"results": []}).set_model("gpt-4o")
    step = span.to_step_input()
    assert step["input"] == {"query": "cats"}
    assert step["output"] == {"results": []}
    assert step["model"] == "gpt-4o"


def test_records_token_usage_and_cost_camelcase():
    span = Span("llm_call", "inference")
    span.set_token_usage(100, 50, 150).set_cost(0.002)
    step = span.to_step_input()
    assert step["tokenUsage"] == {"prompt": 100, "completion": 50, "total": 150}
    assert step["costUsd"] == 0.002


def test_token_usage_total_defaults_to_sum():
    span = Span("llm_call", "inference")
    span.set_token_usage(100, 50)
    assert span.to_step_input()["tokenUsage"]["total"] == 150


def test_sets_tool_name_and_version_camelcase():
    span = Span("tool_call", "stripe_charge")
    span.set_tool_name("stripe").set_tool_version("v2")
    step = span.to_step_input()
    assert step["toolName"] == "stripe"
    assert step["toolVersion"] == "v2"


def test_converts_exception_to_message_string():
    span = Span("llm_call", "failing")
    span.set_error(ValueError("something broke"))
    assert span.to_step_input()["error"] == "something broke"


def test_stores_plain_string_error_as_is():
    span = Span("llm_call", "failing")
    span.set_error("timeout")
    assert span.to_step_input()["error"] == "timeout"


def test_latency_unset_until_end():
    span = Span("llm_call", "timed")
    assert "latencyMs" not in span.to_step_input()
    span.end()
    assert span.to_step_input()["latencyMs"] >= 0


def test_latency_reflects_elapsed_time():
    span = Span("llm_call", "timed")
    time.sleep(0.03)
    span.end()
    assert span.to_step_input()["latencyMs"] >= 25


def test_omits_unset_optional_fields():
    step = Span("custom", "minimal").to_step_input()
    for key in ("input", "output", "model", "error", "latencyMs", "costUsd"):
        assert key not in step


def test_timestamp_is_rfc3339_with_z():
    ts = Span("retrieval", "vector-search").to_step_input()["timestamp"]
    # Must end in Z and parse as a date — matches Zod .datetime() strictness.
    assert ts.endswith("Z")
    assert re.match(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}", ts)


def test_setters_are_chainable():
    span = Span("llm_call", "chain")
    result = span.set_input({}).set_output({}).set_model("gpt-4o").set_cost(0).end()
    assert result is span
