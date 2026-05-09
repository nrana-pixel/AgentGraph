import type { IngestPayload, IngestResponse } from "@agentgraph/types";

export interface AgentGraphConfig {
  apiKey: string;
}

const BASE_URL = "https://api.agentgraph.dev";

export async function sendIngest(
  config: AgentGraphConfig,
  payload: IngestPayload
): Promise<IngestResponse> {
  const url = `${BASE_URL}/v1/ingest`;

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