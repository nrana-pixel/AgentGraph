import types

import pytest

from agentgraph.instrumentation import instrument_openai, instrument_anthropic
from agentgraph.trace import Trace


def make_trace():
    sent = []
    return Trace(lambda p: sent.append(p), agent_id="a"), sent


# --- fakes that mimic the Pydantic-model shape (attribute access) ----------


class Obj:
    def __init__(self, **kw):
        self.__dict__.update(kw)


def fake_openai_client(response):
    completions = types.SimpleNamespace(create=lambda *a, **k: response)
    chat = types.SimpleNamespace(completions=completions)
    return types.SimpleNamespace(chat=chat)


def fake_anthropic_client(response):
    messages = types.SimpleNamespace(create=lambda *a, **k: response)
    return types.SimpleNamespace(messages=messages)


def test_instrument_openai_emits_llm_call_with_model_and_tokens():
    response = Obj(
        choices=[Obj(message={"role": "assistant", "content": "hi"})],
        usage=Obj(prompt_tokens=12, completion_tokens=8, total_tokens=20),
    )
    client = fake_openai_client(response)
    trace, sent = make_trace()

    instrument_openai(client, trace)
    out = client.chat.completions.create(model="gpt-4o", messages=[{"role": "user", "content": "hey"}])
    trace.flush()

    assert out is response
    step = sent[0]["steps"][0]
    assert step["type"] == "llm_call"
    assert step["model"] == "gpt-4o"
    assert step["name"] == "gpt-4o completion"
    assert step["tokenUsage"] == {"prompt": 12, "completion": 8, "total": 20}
    assert step["input"] == {"messages": [{"role": "user", "content": "hey"}]}
    assert sent[0]["totalTokens"] == 20


def test_instrument_openai_handles_dict_response():
    response = {
        "choices": [{"message": {"content": "hi"}}],
        "usage": {"prompt_tokens": 1, "completion_tokens": 2, "total_tokens": 3},
    }
    client = fake_openai_client(response)
    trace, sent = make_trace()
    instrument_openai(client, trace)
    client.chat.completions.create(model="gpt-4o-mini", messages=[])
    trace.flush()
    assert sent[0]["steps"][0]["tokenUsage"]["total"] == 3


def test_instrument_openai_records_error_and_reraises():
    def boom(*a, **k):
        raise RuntimeError("api down")

    client = types.SimpleNamespace(
        chat=types.SimpleNamespace(completions=types.SimpleNamespace(create=boom))
    )
    trace, sent = make_trace()
    instrument_openai(client, trace)
    with pytest.raises(RuntimeError, match="api down"):
        client.chat.completions.create(model="gpt-4o", messages=[])
    trace.flush("error")
    assert sent[0]["steps"][0]["error"] == "api down"


def test_instrument_anthropic_emits_llm_call_with_tokens():
    response = Obj(
        content=[Obj(type="text", text="hello there")],
        stop_reason="end_turn",
        usage=Obj(input_tokens=30, output_tokens=10),
    )
    client = fake_anthropic_client(response)
    trace, sent = make_trace()

    instrument_anthropic(client, trace)
    out = client.messages.create(
        model="claude-3-5-sonnet", messages=[{"role": "user", "content": "hi"}], system="be brief"
    )
    trace.flush()

    assert out is response
    step = sent[0]["steps"][0]
    assert step["type"] == "llm_call"
    assert step["model"] == "claude-3-5-sonnet"
    assert step["name"] == "claude-3-5-sonnet message"
    assert step["tokenUsage"] == {"prompt": 30, "completion": 10, "total": 40}
    assert step["output"]["text"] == "hello there"
    assert step["output"]["stop_reason"] == "end_turn"
    assert step["input"]["system"] == "be brief"


def test_instrument_anthropic_records_error_and_reraises():
    def boom(*a, **k):
        raise RuntimeError("anthropic down")

    client = types.SimpleNamespace(messages=types.SimpleNamespace(create=boom))
    trace, sent = make_trace()
    instrument_anthropic(client, trace)
    with pytest.raises(RuntimeError, match="anthropic down"):
        client.messages.create(model="claude-3-5-sonnet", messages=[])
    trace.flush("error")
    assert sent[0]["steps"][0]["error"] == "anthropic down"
