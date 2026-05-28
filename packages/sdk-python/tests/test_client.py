import io
import json
import urllib.error

import pytest

from agentgraph.client import AgentGraph, IngestClientError, IngestServerError


class FakeResponse(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *a):
        self.close()
        return False


def test_post_serialises_camelcase_and_sets_auth_header(monkeypatch):
    captured = {}

    def fake_urlopen(req):
        captured["url"] = req.full_url
        captured["method"] = req.get_method()
        captured["auth"] = req.get_header("Authorization")
        captured["content_type"] = req.get_header("Content-type")
        captured["body"] = json.loads(req.data.decode("utf-8"))
        return FakeResponse(
            json.dumps({"traceId": "x", "stepsQueued": 1, "status": "queued"}).encode()
        )

    monkeypatch.setattr("urllib.request.urlopen", fake_urlopen)

    ag = AgentGraph(api_key="ag_live_abc", base_url="http://localhost:3001")
    with ag.trace(agent_id="my-agent", session_id="s1") as trace:
        trace.step(
            "tool_call",
            "web_search",
            lambda span: span.set_input({"q": "cats"}).set_token_usage(10, 5),
        )

    assert captured["url"] == "http://localhost:3001/v1/ingest"
    assert captured["method"] == "POST"
    assert captured["auth"] == "Bearer ag_live_abc"
    assert captured["content_type"] == "application/json"

    body = captured["body"]
    # camelCase contract assertions.
    assert body["agentId"] == "my-agent"
    assert body["sessionId"] == "s1"
    assert body["status"] == "completed"
    assert body["env"] == "prod"
    assert "traceId" in body and "totalLatencyMs" in body
    step = body["steps"][0]
    assert step["name"] == "web_search"
    assert "toolName" not in step  # not set on this span
    assert step["input"] == {"q": "cats"}
    assert step["tokenUsage"] == {"prompt": 10, "completion": 5, "total": 15}
    assert body["totalTokens"] == 15


def test_base_url_trailing_slash_stripped(monkeypatch):
    captured = {}

    def fake_urlopen(req):
        captured["url"] = req.full_url
        return FakeResponse(b"{}")

    monkeypatch.setattr("urllib.request.urlopen", fake_urlopen)
    ag = AgentGraph(api_key="k", base_url="http://localhost:3001/")
    ag._post({"agentId": "a", "steps": [], "env": "prod", "status": "completed", "metadata": {}})
    assert captured["url"] == "http://localhost:3001/v1/ingest"


def _http_error(code):
    def fake_urlopen(req):
        raise urllib.error.HTTPError(
            req.full_url, code, "err", {}, io.BytesIO(b"bad payload")
        )

    return fake_urlopen


def test_4xx_raises_client_error(monkeypatch):
    monkeypatch.setattr("urllib.request.urlopen", _http_error(400))
    ag = AgentGraph(api_key="k")
    with pytest.raises(IngestClientError) as exc:
        ag._post({"agentId": "a"})
    assert exc.value.status == 400


def test_5xx_raises_server_error(monkeypatch):
    monkeypatch.setattr("urllib.request.urlopen", _http_error(503))
    ag = AgentGraph(api_key="k")
    with pytest.raises(IngestServerError) as exc:
        ag._post({"agentId": "a"})
    assert exc.value.status == 503
