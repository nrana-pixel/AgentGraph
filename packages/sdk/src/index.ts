import {
  sendIngest,
  IngestClientError,
  type AgentGraphConfig,
} from "./client.js";
import { Trace, type TraceOptions } from "./trace.js";
import { applyRedaction } from "./redact.js";
import type { IngestPayload, TraceStepInput } from "@agentgraph/types";

export { Span } from "./span.js";
export { Trace, type TraceOptions } from "./trace.js";
export type { AgentGraphConfig } from "./client.js";
export { IngestClientError, IngestServerError } from "./client.js";
export type { RedactOptions } from "./redact.js";

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_BASE_DELAY_MS = 200;
const DEFAULT_MAX_QUEUE_SIZE = 1000;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class AgentGraph {
  private config: AgentGraphConfig;
  /**
   * In-memory, best-effort retry queue shared across all Traces created by
   * this client. Payloads that exhaust their retries land here and are drained
   * (oldest first) on the next flush of any Trace. Ingest is keyed by traceId
   * and the server upserts, so at-least-once delivery is safe — we never dedupe
   * client-side.
   */
  private queue: IngestPayload[] = [];

  constructor(config: AgentGraphConfig) {
    this.config = config;
  }

  trace(options: TraceOptions): Trace {
    return new Trace(
      options,
      (payload) => this.deliver(payload),
      (step: TraceStepInput) => applyRedaction(step, this.config)
    );
  }

  /**
   * Drain any queued payloads first (oldest first), then send the current one.
   * Never throws on transient failure — failed payloads are (re)queued and
   * flush resolves. 4xx failures are hard errors and are NOT queued.
   */
  private async deliver(payload: IngestPayload): Promise<void> {
    await this.drainQueue();
    await this.attempt(payload);
  }

  /** Send queued payloads oldest-first. Stop at the first transient failure. */
  private async drainQueue(): Promise<void> {
    while (this.queue.length > 0) {
      const next = this.queue[0]!;
      const sent = await this.attemptOrRequeueFront(next);
      if (!sent) return; // backend still down — stop burning retries this flush
      this.queue.shift();
    }
  }

  /**
   * Attempt to send a queued payload (already at the front of the queue).
   * Returns true if delivered. On transient failure leaves it in place and
   * returns false. On 4xx, drops it (bad payload) and returns true so the
   * drain continues past it.
   */
  private async attemptOrRequeueFront(payload: IngestPayload): Promise<boolean> {
    try {
      await this.sendWithRetry(payload);
      return true;
    } catch (err) {
      if (err instanceof IngestClientError) return true; // drop bad payload
      return false; // transient — keep at front, retry on a later flush
    }
  }

  /** Send the current payload; queue it on transient failure (no throw). */
  private async attempt(payload: IngestPayload): Promise<void> {
    try {
      await this.sendWithRetry(payload);
    } catch (err) {
      if (err instanceof IngestClientError) throw err; // bad payload — surface it
      this.enqueue(payload); // transient — best-effort retry later
    }
  }

  /** Push onto the bounded queue, dropping the oldest when full. */
  private enqueue(payload: IngestPayload): void {
    const max = this.config.maxQueueSize ?? DEFAULT_MAX_QUEUE_SIZE;
    while (this.queue.length >= max) {
      this.queue.shift();
      console.warn(
        `[agentgraph] retry queue full (max ${max}); dropping oldest payload`
      );
    }
    this.queue.push(payload);
  }

  /**
   * Send with exponential backoff. Retries on network errors and HTTP 5xx;
   * 4xx (IngestClientError) is rethrown immediately without retry.
   */
  private async sendWithRetry(payload: IngestPayload): Promise<void> {
    const maxRetries = this.config.maxRetries ?? DEFAULT_MAX_RETRIES;
    const baseDelay = this.config.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;

    for (let attempt = 1; ; attempt++) {
      try {
        await sendIngest(this.config, payload);
        return;
      } catch (err) {
        if (err instanceof IngestClientError) throw err; // 4xx — do not retry
        if (attempt >= maxRetries) throw err; // exhausted — caller may queue
        await sleep(baseDelay * 2 ** (attempt - 1));
      }
    }
  }
}
