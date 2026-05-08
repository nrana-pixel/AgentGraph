import type { IngestPayload, IngestResponse } from "@agentgraph/types";

export interface AgentGraphConfig {
  apiKey: string;
  baseUrl?: string;
  debug?: boolean;
}

const DEFAULT_BASE_URL = "https://api.agentgraph.dev";

export async function sendIngest(
  config: AgentGraphConfig,
  payload: IngestPayload
): Promise<IngestResponse> {
  const url = `${config.baseUrl ?? DEFAULT_BASE_URL}/v1/ingest`;

  if (config.debug) {
    console.debug("[AgentGraph] POST", url, JSON.stringify(payload, null, 2));
  }

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
    throw new Error(`AgentGraph ingest failed (${res.status}): ${text}`);
  }

  return res.json() as Promise<IngestResponse>;
}
