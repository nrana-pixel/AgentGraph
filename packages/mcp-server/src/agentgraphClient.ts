import type { DiscoverResponse } from "@agentgraph/types";

export interface AgentGraphClientConfig {
  apiKey: string;
  baseUrl: string;
}

export interface SearchArgs {
  task: string;
  availableTools?: string[];
  limit?: number;
}

/** Thin REST client over the AgentGraph discovery + tool endpoints. */
export class AgentGraphClient {
  constructor(private readonly config: AgentGraphClientConfig) {}

  private get base(): string {
    return this.config.baseUrl.replace(/\/+$/, "");
  }

  private get headers(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.config.apiKey}`,
    };
  }

  async searchTools(args: SearchArgs): Promise<DiscoverResponse> {
    const res = await fetch(`${this.base}/v1/discover`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(args),
    });
    if (!res.ok) {
      throw new Error(`discover failed (${res.status}): ${await res.text()}`);
    }
    return (await res.json()) as DiscoverResponse;
  }

  async getToolSchema(slug: string): Promise<unknown> {
    const res = await fetch(`${this.base}/v1/tools/${encodeURIComponent(slug)}`, {
      headers: this.headers,
    });
    if (!res.ok) {
      throw new Error(`tool lookup failed (${res.status}): ${await res.text()}`);
    }
    return res.json();
  }
}
