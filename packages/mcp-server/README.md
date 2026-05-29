# @agentgraph/mcp-server

An MCP (Model Context Protocol) server that exposes AgentGraph's runtime tool
discovery as **two** tools — so an agent searches for the right tool and fetches
one schema on demand, instead of loading an entire tool registry into its
context window.

## Tools

- **`search_tools(task, availableTools?, limit?)`** — ranks tools for a task by
  real-world reliability, latency, popularity, and your own usage history.
  Returns each tool's input schema so the agent can call it directly.
- **`get_tool_schema(slug)`** — full profile + input/output schema for one tool.

## Usage

```bash
AGENTGRAPH_API_KEY=ag_live_... \
AGENTGRAPH_BASE_URL=https://api.agentgraph.dev \
npx -y @agentgraph/mcp-server
```

### Claude Desktop / MCP client config

```json
{
  "mcpServers": {
    "agentgraph": {
      "command": "npx",
      "args": ["-y", "@agentgraph/mcp-server"],
      "env": {
        "AGENTGRAPH_API_KEY": "ag_live_...",
        "AGENTGRAPH_BASE_URL": "https://api.agentgraph.dev"
      }
    }
  }
}
```

## Why

Standard MCP setups can consume the majority of an agent's context window with
tool definitions before any work begins, and tool-selection accuracy degrades as
the toolset grows. This server replaces "load everything" with "search, then
fetch one schema."

Transport: newline-delimited JSON-RPC 2.0 over stdio. Zero runtime dependencies.
