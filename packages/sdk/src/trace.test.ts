import { describe, it, expect, vi, beforeEach } from "vitest";
import { Trace } from "./trace.js";
import type { IngestPayload } from "@agentgraph/types";

function makeTrace(send?: (p: IngestPayload) => Promise<void>) {
  const mockSend = send ?? vi.fn().mockResolvedValue(undefined);
  const trace = new Trace({ agentId: "test-agent", env: "dev" }, mockSend);
  return { trace, mockSend };
}

describe("Trace", () => {
  it("step() returns the value from the callback", async () => {
    const { trace } = makeTrace();
    const result = await trace.step("llm_call", "summarise", async () => "hello");
    expect(result).toBe("hello");
  });

  it("step() records the span on success", async () => {
    const mockSend = vi.fn().mockResolvedValue(undefined);
    const trace = new Trace({ agentId: "agent" }, mockSend);
    await trace.step("tool_call", "web_search", async (span) => {
      span.setOutput({ results: [] });
    });
    await trace.flush();
    const payload = (mockSend as ReturnType<typeof vi.fn>).mock.calls[0][0] as IngestPayload;
    expect(payload.steps).toHaveLength(1);
    expect(payload.steps[0]!.name).toBe("web_search");
  });

  it("step() records the span and rethrows on error", async () => {
    const mockSend = vi.fn().mockResolvedValue(undefined);
    const trace = new Trace({ agentId: "agent" }, mockSend);

    await expect(
      trace.step("llm_call", "failing", async () => {
        throw new Error("oops");
      }),
    ).rejects.toThrow("oops");

    await trace.flush("error");
    const payload = mockSend.mock.calls[0][0] as IngestPayload;
    expect(payload.steps[0]!.error).toBe("oops");
  });

  it("flush() sends the payload with the correct agentId and env", async () => {
    const mockSend = vi.fn().mockResolvedValue(undefined);
    const trace = new Trace({ agentId: "my-agent", env: "staging" }, mockSend);
    await trace.step("custom", "noop", async () => {});
    await trace.flush();
    const payload = mockSend.mock.calls[0][0] as IngestPayload;
    expect(payload.agentId).toBe("my-agent");
    expect(payload.env).toBe("staging");
  });

  it("flush() sends the correct status", async () => {
    const mockSend = vi.fn().mockResolvedValue(undefined);
    const trace = new Trace({ agentId: "a" }, mockSend);
    await trace.step("custom", "s", async () => {});
    await trace.flush("error");
    expect(mockSend.mock.calls[0][0].status).toBe("error");
  });

  it("flush() defaults to status=completed", async () => {
    const mockSend = vi.fn().mockResolvedValue(undefined);
    const trace = new Trace({ agentId: "a" }, mockSend);
    await trace.step("custom", "s", async () => {});
    await trace.flush();
    expect(mockSend.mock.calls[0][0].status).toBe("completed");
  });

  it("flush() is a no-op when there are no steps", async () => {
    const { trace, mockSend } = makeTrace();
    await trace.flush();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("flush() is idempotent — send is called only once", async () => {
    const mockSend = vi.fn().mockResolvedValue(undefined);
    const trace = new Trace({ agentId: "a" }, mockSend);
    await trace.step("custom", "s", async () => {});
    await trace.flush();
    await trace.flush();
    expect(mockSend).toHaveBeenCalledOnce();
  });

  it("flush() aggregates totalTokens from all steps", async () => {
    const mockSend = vi.fn().mockResolvedValue(undefined);
    const trace = new Trace({ agentId: "a" }, mockSend);
    await trace.step("llm_call", "s1", async (span) => {
      span.setTokenUsage({ prompt: 100, completion: 50, total: 150 });
    });
    await trace.step("llm_call", "s2", async (span) => {
      span.setTokenUsage({ prompt: 200, completion: 100, total: 300 });
    });
    await trace.flush();
    expect(mockSend.mock.calls[0][0].totalTokens).toBe(450);
  });

  it("flush() aggregates totalCostUsd from all steps", async () => {
    const mockSend = vi.fn().mockResolvedValue(undefined);
    const trace = new Trace({ agentId: "a" }, mockSend);
    await trace.step("llm_call", "s1", async (span) => { span.setCost(0.01); });
    await trace.step("llm_call", "s2", async (span) => { span.setCost(0.02); });
    await trace.flush();
    expect(mockSend.mock.calls[0][0].totalCostUsd).toBeCloseTo(0.03);
  });

  it("flush() includes sessionId and userId when provided", async () => {
    const mockSend = vi.fn().mockResolvedValue(undefined);
    const trace = new Trace(
      { agentId: "a", sessionId: "sess-1", userId: "user-42" },
      mockSend,
    );
    await trace.step("custom", "s", async () => {});
    await trace.flush();
    const payload = mockSend.mock.calls[0][0] as IngestPayload;
    expect(payload.sessionId).toBe("sess-1");
    expect(payload.userId).toBe("user-42");
  });

  it("flush() sets totalLatencyMs to a non-negative number", async () => {
    const mockSend = vi.fn().mockResolvedValue(undefined);
    const trace = new Trace({ agentId: "a" }, mockSend);
    await trace.step("custom", "s", async () => {});
    await trace.flush();
    expect(mockSend.mock.calls[0][0].totalLatencyMs).toBeGreaterThanOrEqual(0);
  });

  it("startSpan + addSpan records a manually managed span", async () => {
    const mockSend = vi.fn().mockResolvedValue(undefined);
    const trace = new Trace({ agentId: "a" }, mockSend);
    const span = trace.startSpan("retrieval", "vector-db");
    span.setOutput({ hits: 3 }).end();
    trace.addSpan(span);
    await trace.flush();
    const payload = mockSend.mock.calls[0][0] as IngestPayload;
    expect(payload.steps[0]!.name).toBe("vector-db");
    expect(payload.steps[0]!.output).toEqual({ hits: 3 });
  });
});
