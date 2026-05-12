import { afterEach, describe, expect, it, vi } from "vitest";
import { apiPatch, apiPost } from "./api";

const fetchMock = vi.fn();

globalThis.fetch = fetchMock as unknown as typeof fetch;

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function lastRequestInit(): RequestInit {
  return fetchMock.mock.calls.at(-1)?.[1] as RequestInit;
}

function requestHeaders(init: RequestInit): Headers {
  return new Headers(init.headers);
}

afterEach(() => {
  fetchMock.mockReset();
});

describe("apiPost", () => {
  it("uses the JSON body from data and lets caller headers override JSON defaults", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }));

    await apiPost(
      "/v1/projects",
      "session-token",
      { name: "Demo" },
      {
        body: "caller body should not win",
        headers: {
          "Content-Type": "application/vnd.agentgraph+json",
          "X-Request-Id": "req-1",
        },
      },
    );

    const init = lastRequestInit();
    const headers = requestHeaders(init);

    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ name: "Demo" }));
    expect(headers.get("authorization")).toBe("Bearer session-token");
    expect(headers.get("content-type")).toBe("application/vnd.agentgraph+json");
    expect(headers.get("x-request-id")).toBe("req-1");
  });

  it("preserves caller body when data is omitted", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }));

    await apiPost("/v1/projects/import", "session-token", undefined, {
      body: "raw-body",
      headers: new Headers([["Content-Type", "text/plain"]]),
    });

    const init = lastRequestInit();
    const headers = requestHeaders(init);

    expect(init.method).toBe("POST");
    expect(init.body).toBe("raw-body");
    expect(headers.get("content-type")).toBe("text/plain");
    expect(headers.get("authorization")).toBe("Bearer session-token");
  });
});

describe("apiPatch", () => {
  it("supports HeadersInit tuples and keeps caller header precedence", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }));

    await apiPatch("/v1/projects/project-id/webhooks/webhook-id", "session-token", { enabled: false }, {
      headers: [
        ["Content-Type", "application/merge-patch+json"],
        ["X-Request-Id", "req-2"],
      ],
    });

    const init = lastRequestInit();
    const headers = requestHeaders(init);

    expect(init.method).toBe("PATCH");
    expect(init.body).toBe(JSON.stringify({ enabled: false }));
    expect(headers.get("authorization")).toBe("Bearer session-token");
    expect(headers.get("content-type")).toBe("application/merge-patch+json");
    expect(headers.get("x-request-id")).toBe("req-2");
  });
});
