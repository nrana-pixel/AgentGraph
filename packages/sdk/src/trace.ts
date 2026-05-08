import type { IngestPayload, TraceStepInput, StepType, Env, TraceStatus } from "@agentgraph/types";
import { Span } from "./span.js";

export interface TraceOptions {
  agentId: string;
  traceId?: string;
  sessionId?: string;
  userId?: string;
  env?: Env;
  metadata?: Record<string, unknown>;
}

export class Trace {
  private steps: TraceStepInput[] = [];
  private startedAt: number;
  private flushed = false;
  private flushPromise?: Promise<void>;

  constructor(
    readonly options: TraceOptions,
    private readonly send: (payload: IngestPayload) => Promise<void>
  ) {
    this.startedAt = Date.now();
  }

  startSpan(type: StepType, name: string): Span {
    return new Span(type, name);
  }

  addSpan(span: Span): void {
    this.steps.push(span.toStepInput());
  }

  async step<T>(
    type: StepType,
    name: string,
    fn: (span: Span) => Promise<T>
  ): Promise<T> {
    const span = this.startSpan(type, name);
    try {
      const result = await fn(span);
      span.end();
      this.addSpan(span);
      return result;
    } catch (err) {
      span.setError(err instanceof Error ? err : String(err)).end();
      this.addSpan(span);
      throw err;
    }
  }

  async flush(status: TraceStatus = "completed"): Promise<void> {
    if (this.flushed || this.steps.length === 0) return;
    if (this.flushPromise) return this.flushPromise;

    this.flushPromise = (async () => {
      const totalLatencyMs = Date.now() - this.startedAt;
      const totalTokens = this.steps.reduce((s, step) => s + (step.tokenUsage?.total ?? 0), 0);
      const totalCostUsd = this.steps.reduce((s, step) => s + (step.costUsd ?? 0), 0);

      const payload: IngestPayload = {
        agentId: this.options.agentId,
        env: this.options.env ?? "prod",
        status,
        steps: this.steps,
        totalLatencyMs,
        metadata: this.options.metadata ?? {},
      };

      if (this.options.traceId !== undefined) payload.traceId = this.options.traceId;
      if (this.options.sessionId !== undefined) payload.sessionId = this.options.sessionId;
      if (this.options.userId !== undefined) payload.userId = this.options.userId;
      if (totalTokens > 0) payload.totalTokens = totalTokens;
      if (totalCostUsd > 0) payload.totalCostUsd = totalCostUsd;

      await this.send(payload);
      this.flushed = true;
    })().finally(() => {
      delete this.flushPromise;
    });

    return this.flushPromise;
  }
}
