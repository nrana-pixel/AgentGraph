import { describe, it, expect } from "vitest";
import { Span } from "./span.js";

describe("Span", () => {
  it("serialises type and name into the step input", () => {
    const span = new Span("llm_call", "my-step");
    const step = span.toStepInput();
    expect(step.type).toBe("llm_call");
    expect(step.name).toBe("my-step");
  });

  it("sets input, output, model in the step", () => {
    const span = new Span("tool_call", "web_search");
    span.setInput({ query: "cats" }).setOutput({ results: [] }).setModel("gpt-4o");
    const step = span.toStepInput();
    expect(step.input).toEqual({ query: "cats" });
    expect(step.output).toEqual({ results: [] });
    expect(step.model).toBe("gpt-4o");
  });

  it("records token usage and cost", () => {
    const span = new Span("llm_call", "inference");
    span.setTokenUsage({ prompt: 100, completion: 50, total: 150 }).setCost(0.002);
    const step = span.toStepInput();
    expect(step.tokenUsage).toEqual({ prompt: 100, completion: 50, total: 150 });
    expect(step.costUsd).toBe(0.002);
  });

  it("sets toolName and toolVersion", () => {
    const span = new Span("tool_call", "stripe_charge");
    span.setToolName("stripe").setToolVersion("v2");
    const step = span.toStepInput();
    expect(step.toolName).toBe("stripe");
    expect(step.toolVersion).toBe("v2");
  });

  it("converts Error objects to message strings", () => {
    const span = new Span("llm_call", "failing-step");
    span.setError(new Error("something broke"));
    expect(span.toStepInput().error).toBe("something broke");
  });

  it("stores plain string errors as-is", () => {
    const span = new Span("llm_call", "failing-step");
    span.setError("timeout");
    expect(span.toStepInput().error).toBe("timeout");
  });

  it("sets latencyMs after end() is called", () => {
    const span = new Span("llm_call", "timed-step");
    expect(span.toStepInput().latencyMs).toBeUndefined();
    span.end();
    expect(span.toStepInput().latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("latencyMs reflects elapsed time", async () => {
    const span = new Span("llm_call", "timed-step");
    await new Promise((r) => setTimeout(r, 30));
    span.end();
    expect(span.toStepInput().latencyMs).toBeGreaterThanOrEqual(25);
  });

  it("omits undefined fields from the step input", () => {
    const span = new Span("custom", "minimal");
    const step = span.toStepInput();
    expect("input" in step).toBe(false);
    expect("output" in step).toBe(false);
    expect("model" in step).toBe(false);
    expect("error" in step).toBe(false);
    expect("latencyMs" in step).toBe(false);
  });

  it("includes a timestamp ISO string", () => {
    const span = new Span("retrieval", "vector-search");
    const { timestamp } = span.toStepInput();
    expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("setters are chainable", () => {
    const span = new Span("llm_call", "chain-test");
    const result = span.setInput({}).setOutput({}).setModel("gpt-4o").setCost(0).end();
    expect(result).toBe(span);
  });
});
