import { describe, it, expect } from "vitest";
import { SpanStatusCode } from "@opentelemetry/api";
import { stepToSpanData } from "./otlpExport.js";
import type { TraceStep } from "../db/schema.js";

const TRACE_ID = "11111111-2222-3333-4444-555555555555";
const STEP_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

function baseStep(overrides: Partial<TraceStep> = {}): TraceStep {
  return {
    id: STEP_ID,
    traceId: TRACE_ID,
    stepIndex: 0,
    parentStepId: null,
    type: "llm_call",
    name: "chat.completion",
    input: null,
    output: null,
    latencyMs: 1500,
    promptTokens: 100,
    completionTokens: 40,
    totalTokens: 140,
    costUsd: "0.00210000",
    error: null,
    model: "gpt-4o",
    toolName: null,
    toolVersion: null,
    timestamp: new Date("2026-05-28T12:00:00.000Z"),
    ...overrides,
  };
}

describe("stepToSpanData", () => {
  it("maps ids to OTel-sized trace/span ids (32 / 16 hex chars)", () => {
    const data = stepToSpanData(TRACE_ID, baseStep());
    expect(data.traceId).toBe("11111111222233334444555555555555");
    expect(data.traceId).toHaveLength(32);
    expect(data.spanId).toHaveLength(16);
    // span id is a deterministic truncation of the dashless uuid
    expect(data.spanId).toBe("aaaaaaaabbbbcccc");
  });

  it("derives start/end times from timestamp + latencyMs", () => {
    const data = stepToSpanData(TRACE_ID, baseStep({ latencyMs: 2000 }));
    const start = new Date("2026-05-28T12:00:00.000Z").getTime();
    expect(data.startTimeUnixMs).toBe(start);
    expect(data.endTimeUnixMs).toBe(start + 2000);
  });

  it("treats null latency as a zero-duration span", () => {
    const data = stepToSpanData(TRACE_ID, baseStep({ latencyMs: null }));
    expect(data.endTimeUnixMs).toBe(data.startTimeUnixMs);
  });

  it("maps model + token usage to GenAI conventions and cost to agentgraph.*", () => {
    const data = stepToSpanData(TRACE_ID, baseStep());
    expect(data.attributes).toMatchObject({
      "agentgraph.step.type": "llm_call",
      "gen_ai.request.model": "gpt-4o",
      "gen_ai.usage.input_tokens": 100,
      "gen_ai.usage.output_tokens": 40,
      "gen_ai.usage.total_tokens": 140,
      "agentgraph.cost_usd": 0.0021,
    });
  });

  it("maps tool name/version for tool_call steps", () => {
    const data = stepToSpanData(
      TRACE_ID,
      baseStep({
        type: "tool_call",
        toolName: "web-search",
        toolVersion: "1.2.0",
        model: null,
        promptTokens: null,
        completionTokens: null,
        totalTokens: null,
        costUsd: null,
      }),
    );
    expect(data.attributes["agentgraph.tool.name"]).toBe("web-search");
    expect(data.attributes["agentgraph.tool.version"]).toBe("1.2.0");
    // no model/token attributes when absent
    expect(data.attributes["gen_ai.request.model"]).toBeUndefined();
    expect(data.attributes["gen_ai.usage.total_tokens"]).toBeUndefined();
    expect(data.attributes["agentgraph.cost_usd"]).toBeUndefined();
  });

  it("sets OK status with no error", () => {
    const data = stepToSpanData(TRACE_ID, baseStep());
    expect(data.status.code).toBe(SpanStatusCode.OK);
    expect(data.status.message).toBeUndefined();
  });

  it("sets ERROR status and records the message when step.error is set", () => {
    const data = stepToSpanData(TRACE_ID, baseStep({ error: "rate limited" }));
    expect(data.status.code).toBe(SpanStatusCode.ERROR);
    expect(data.status.message).toBe("rate limited");
  });

  it("omits parentSpanId when the step is flat", () => {
    const data = stepToSpanData(TRACE_ID, baseStep());
    expect(data.parentSpanId).toBeUndefined();
  });

  it("maps parentStepId to a 16-char parentSpanId when present", () => {
    const parent = "ffffffff-0000-1111-2222-333333333333";
    const data = stepToSpanData(TRACE_ID, baseStep({ parentStepId: parent }));
    expect(data.parentSpanId).toBe("ffffffff00001111");
    expect(data.parentSpanId).toHaveLength(16);
  });
});
