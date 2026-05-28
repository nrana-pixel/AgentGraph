import type { IngestPayload, IngestResponse } from "@agentgraph/types";
import type { RedactOptions } from "./redact.js";

export interface AgentGraphConfig extends RedactOptions {
  apiKey: string;
  baseUrl?: string;
  /** Max send attempts (1 = no retry) for network errors / HTTP 5xx. Default 3. */
  maxRetries?: number;
  /** Base backoff delay in ms; doubles each attempt. Default 200. */
  baseDelayMs?: number;
  /** Max payloads held in the in-memory retry queue. Default 1000. */
  maxQueueSize?: number;
}

const DEFAULT_BASE_URL = "https://api.agentgraph.dev";

/** Thrown for HTTP 4xx — the payload is bad, so retrying/queueing won't help. */
export class IngestClientError extends Error {
  readonly status: number;
  constructor(status: number, text: string) {
    super(`AgentGraph ingest failed (${status}): ${text}`);
    this.name = "IngestClientError";
    this.status = status;
  }
}

/** Thrown for HTTP 5xx — transient; eligible for retry/queue. */
export class IngestServerError extends Error {
  readonly status: number;
  constructor(status: number, text: string) {
    super(`AgentGraph ingest failed (${status}): ${text}`);
    this.name = "IngestServerError";
    this.status = status;
  }
}

/**
 * Single ingest attempt. Throws `IngestClientError` on 4xx (do not retry),
 * `IngestServerError` on 5xx (retryable), or rejects with the underlying
 * network error (retryable) when `fetch` itself fails.
 */
export async function sendIngest(
  config: AgentGraphConfig,
  payload: IngestPayload
): Promise<IngestResponse> {
  const base = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  const url = `${base}/v1/ingest`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    if (res.status >= 500) throw new IngestServerError(res.status, text);
    throw new IngestClientError(res.status, text);
  }

  return res.json() as Promise<IngestResponse>;
}
