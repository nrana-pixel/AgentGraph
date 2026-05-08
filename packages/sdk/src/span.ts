import type { TraceStepInput, StepType, TokenUsage } from "@agentgraph/types";

export class Span {
  private startedAt: number;
  private type: StepType;
  private name: string;
  private input?: Record<string, unknown>;
  private output?: Record<string, unknown>;
  private model?: string;
  private tokenUsage?: TokenUsage;
  private costUsd?: number;
  private toolName?: string;
  private toolVersion?: string;
  private error?: string;
  private latencyMs?: number;
  private timestamp: string;

  constructor(type: StepType, name: string) {
    this.type = type;
    this.name = name;
    this.startedAt = Date.now();
    this.timestamp = new Date().toISOString();
  }

  setInput(input: Record<string, unknown>): this {
    this.input = input;
    return this;
  }

  setOutput(output: Record<string, unknown>): this {
    this.output = output;
    return this;
  }

  setModel(model: string): this {
    this.model = model;
    return this;
  }

  setTokenUsage(usage: TokenUsage): this {
    this.tokenUsage = usage;
    return this;
  }

  setCost(usd: number): this {
    this.costUsd = usd;
    return this;
  }

  setToolName(name: string): this {
    this.toolName = name;
    return this;
  }

  setToolVersion(version: string): this {
    this.toolVersion = version;
    return this;
  }

  setError(error: Error | string): this {
    this.error = error instanceof Error ? error.message : error;
    return this;
  }

  end(): this {
    this.latencyMs = Date.now() - this.startedAt;
    return this;
  }

  toStepInput(): TraceStepInput {
    const step: TraceStepInput = {
      type: this.type,
      name: this.name,
      timestamp: this.timestamp,
    };
    if (this.input !== undefined) step.input = this.input;
    if (this.output !== undefined) step.output = this.output;
    if (this.model !== undefined) step.model = this.model;
    if (this.tokenUsage !== undefined) step.tokenUsage = this.tokenUsage;
    if (this.costUsd !== undefined) step.costUsd = this.costUsd;
    if (this.toolName !== undefined) step.toolName = this.toolName;
    if (this.toolVersion !== undefined) step.toolVersion = this.toolVersion;
    if (this.error !== undefined) step.error = this.error;
    if (this.latencyMs !== undefined) step.latencyMs = this.latencyMs;
    return step;
  }
}
