// Minimal MCP (Model Context Protocol) request handler.
//
// Implements the subset of the JSON-RPC 2.0 / MCP surface needed to act as a
// tool provider over stdio: `initialize`, `tools/list`, `tools/call`, `ping`,
// and the `notifications/initialized` notification. Kept as a pure function
// (no I/O) so it can be unit-tested; the stdio plumbing lives in server.ts.

import type { SearchArgs } from "./agentgraphClient.js";

export const PROTOCOL_VERSION = "2024-11-05";
export const SERVER_INFO = { name: "agentgraph", version: "0.1.0" } as const;

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: unknown;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string };
}

// What the handler needs from the outside world. Injected so tests can stub it.
export interface HandlerDeps {
  searchTools(args: SearchArgs): Promise<unknown>;
  getToolSchema(slug: string): Promise<unknown>;
}

// The MCP tools this server exposes. Two discovery tools replace loading the
// entire registry: the agent searches, then fetches one schema on demand.
export const TOOL_DEFINITIONS = [
  {
    name: "search_tools",
    description:
      "Find the best tool(s) for a task, ranked by real-world reliability, latency, popularity and your own usage history. Returns each tool's input schema so you can call it directly.",
    inputSchema: {
      type: "object",
      properties: {
        task: { type: "string", description: "What you are trying to do, in plain language." },
        availableTools: {
          type: "array",
          items: { type: "string" },
          description: "Optional: restrict ranking to these tool slugs (the tools you can call).",
        },
        limit: { type: "number", description: "Max results (default 5)." },
      },
      required: ["task"],
    },
  },
  {
    name: "get_tool_schema",
    description: "Fetch the full profile and input/output schema for a single tool by slug.",
    inputSchema: {
      type: "object",
      properties: {
        slug: { type: "string", description: "The tool slug, e.g. 'stripe' or 'sendgrid'." },
      },
      required: ["slug"],
    },
  },
] as const;

function ok(id: JsonRpcResponse["id"], result: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id, result };
}

function err(id: JsonRpcResponse["id"], code: number, message: string): JsonRpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

// JSON-RPC error codes.
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;
const INTERNAL_ERROR = -32603;

/**
 * Handle one parsed JSON-RPC message. Returns the response to write, or null
 * for notifications (no `id`) that take no reply.
 */
export async function handleMessage(
  msg: JsonRpcRequest,
  deps: HandlerDeps,
): Promise<JsonRpcResponse | null> {
  const id = msg.id ?? null;

  switch (msg.method) {
    case "initialize":
      return ok(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
      });

    case "notifications/initialized":
      return null; // notification — no response

    case "ping":
      return ok(id, {});

    case "tools/list":
      return ok(id, { tools: TOOL_DEFINITIONS });

    case "tools/call":
      return handleToolCall(id, msg.params, deps);

    default:
      // Unknown notifications (no id) are silently ignored per JSON-RPC.
      if (msg.id === undefined || msg.id === null) return null;
      return err(id, METHOD_NOT_FOUND, `Method not found: ${msg.method}`);
  }
}

async function handleToolCall(
  id: JsonRpcResponse["id"],
  params: unknown,
  deps: HandlerDeps,
): Promise<JsonRpcResponse> {
  const p = (params ?? {}) as { name?: unknown; arguments?: unknown };
  const name = typeof p.name === "string" ? p.name : null;
  const args = (p.arguments ?? {}) as Record<string, unknown>;

  if (!name) return err(id, INVALID_PARAMS, "tools/call requires a tool name");

  try {
    if (name === "search_tools") {
      if (typeof args["task"] !== "string" || args["task"].trim() === "") {
        return err(id, INVALID_PARAMS, "search_tools requires a non-empty 'task' string");
      }
      const searchArgs: SearchArgs = { task: args["task"] };
      if (Array.isArray(args["availableTools"])) {
        searchArgs.availableTools = args["availableTools"] as string[];
      }
      if (typeof args["limit"] === "number") searchArgs.limit = args["limit"];
      const result = await deps.searchTools(searchArgs);
      return ok(id, toolResult(result));
    }

    if (name === "get_tool_schema") {
      if (typeof args["slug"] !== "string" || args["slug"].trim() === "") {
        return err(id, INVALID_PARAMS, "get_tool_schema requires a 'slug' string");
      }
      const result = await deps.getToolSchema(args["slug"]);
      return ok(id, toolResult(result));
    }

    return err(id, METHOD_NOT_FOUND, `Unknown tool: ${name}`);
  } catch (e) {
    // Surface upstream failures as an MCP tool error, not a transport error, so
    // the agent sees a usable message instead of the connection dropping.
    return ok(id, {
      content: [{ type: "text", text: `Error: ${e instanceof Error ? e.message : String(e)}` }],
      isError: true,
    });
  }
}

// MCP tool results are a content array; we return the payload as pretty JSON text.
function toolResult(payload: unknown): { content: Array<{ type: "text"; text: string }> } {
  return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
}

export { INTERNAL_ERROR };
