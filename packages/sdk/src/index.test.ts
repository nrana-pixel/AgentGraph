import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AgentGraph } from "./index.js";

/** Build a Response-like object for the mocked fetch. */
function res(status: number, body: unknown = { traceId: "00000000-0000-0000-0000-000000000000", stepsQueued: 1, status: "queued" }) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
  };
}

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function traceWithOneStep(ag: AgentGraph) {
  const t = ag.trace({ agentId: "a", traceId: "11111111-1111-1111-1111-111111111111" });
  const span = t.startSpan("custom", "s");
  span.end();
  t.addSpan(span);
  return t;
}

describe("AgentGraph retry + queue", () => {
  it("retries on HTTP 500 then succeeds", async () => {
    fetchMock.mockResolvedValueOnce(res(500, "boom")).mockResolvedValueOnce(res(200));
    const ag = new AgentGraph({ apiKey: "ag_test", baseDelayMs: 1, maxRetries: 3 });
    const t = await traceWithOneStep(ag);

    const flush = t.flush();
    await vi.advanceTimersByTimeAsync(5);
    await flush;

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries on a network error (fetch rejects) then succeeds", async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError("network down"))
      .mockResolvedValueOnce(res(200));
    const ag = new AgentGraph({ apiKey: "ag_test", baseDelayMs: 1 });
    const t = await traceWithOneStep(ag);

    const flush = t.flush();
    await vi.advanceTimersByTimeAsync(5);
    await flush;

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws immediately on HTTP 4xx and does not retry or queue", async () => {
    fetchMock.mockResolvedValue(res(400, "bad payload"));
    const ag = new AgentGraph({ apiKey: "ag_test", baseDelayMs: 1 });
    const t = await traceWithOneStep(ag);

    await expect(t.flush()).rejects.toThrow(/400/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("queues on persistent 5xx failure without throwing, then drains on next flush", async () => {
    // First trace: always 500 -> exhausts retries -> queued.
    fetchMock.mockResolvedValue(res(500, "down"));
    const ag = new AgentGraph({ apiKey: "ag_test", baseDelayMs: 1, maxRetries: 2 });

    const t1 = await traceWithOneStep(ag);
    const flush1 = t1.flush();
    await vi.advanceTimersByTimeAsync(10);
    await expect(flush1).resolves.toBeUndefined(); // best-effort: no throw
    expect(fetchMock).toHaveBeenCalledTimes(2); // 2 attempts, then queued

    // Backend recovers. Second trace's flush should drain the queued payload
    // (oldest first) AND send its own.
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(res(200));

    const t2 = ag.trace({ agentId: "a", traceId: "22222222-2222-2222-2222-222222222222" });
    const span = t2.startSpan("custom", "s2");
    span.end();
    t2.addSpan(span);

    const flush2 = t2.flush();
    await vi.advanceTimersByTimeAsync(10);
    await flush2;

    // 2 fetches: drained queued payload + current payload.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const bodies = fetchMock.mock.calls.map((c) => JSON.parse((c[1] as RequestInit).body as string));
    expect(bodies[0].traceId).toBe("11111111-1111-1111-1111-111111111111"); // queued, oldest first
    expect(bodies[1].traceId).toBe("22222222-2222-2222-2222-222222222222"); // current
  });

  it("caps the queue and warns when dropping the oldest", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    fetchMock.mockResolvedValue(res(500, "down"));
    const ag = new AgentGraph({ apiKey: "ag_test", baseDelayMs: 1, maxRetries: 1, maxQueueSize: 1 });

    for (const id of ["aaaaaaaa-0000-0000-0000-000000000001", "aaaaaaaa-0000-0000-0000-000000000002"]) {
      const t = ag.trace({ agentId: "a", traceId: id });
      const span = t.startSpan("custom", "s");
      span.end();
      t.addSpan(span);
      const f = t.flush();
      await vi.advanceTimersByTimeAsync(5);
      await f;
    }

    expect(warn).toHaveBeenCalledWith(expect.stringContaining("retry queue full"));
    warn.mockRestore();
  });
});

describe("AgentGraph redaction wiring", () => {
  it("applies redactKeys and hashInputs to steps before sending", async () => {
    fetchMock.mockResolvedValue(res(200));
    const ag = new AgentGraph({
      apiKey: "ag_test",
      redactKeys: ["password"],
      baseDelayMs: 1,
    });
    const t = ag.trace({ agentId: "a", traceId: "33333333-3333-3333-3333-333333333333" });
    const span = t.startSpan("tool_call", "login");
    span.setInput({ user: "x", password: "hunter2" }).end();
    t.addSpan(span);

    const flush = t.flush();
    await vi.advanceTimersByTimeAsync(5);
    await flush;

    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.steps[0].input).toEqual({ user: "x", password: "[REDACTED]" });
  });
});
