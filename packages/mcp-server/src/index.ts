#!/usr/bin/env node
import { AgentGraphClient } from "./agentgraphClient.js";
import { runStdioServer } from "./server.js";

const apiKey = process.env["AGENTGRAPH_API_KEY"];
if (!apiKey) {
  process.stderr.write("[agentgraph-mcp] AGENTGRAPH_API_KEY is required\n");
  process.exit(1);
}

const baseUrl = process.env["AGENTGRAPH_BASE_URL"] ?? "https://api.agentgraph.dev";

const client = new AgentGraphClient({ apiKey, baseUrl });

runStdioServer({
  searchTools: (args) => client.searchTools(args),
  getToolSchema: (slug) => client.getToolSchema(slug),
});

export { AgentGraphClient } from "./agentgraphClient.js";
export * from "./handler.js";
