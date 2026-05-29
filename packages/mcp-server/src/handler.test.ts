import { describe, it, expect, vi } from "vitest";
import {
  handleMessage,
  TOOL_DEFINITIONS,
  PROTOCOL_VERSION,
  type HandlerDeps,
} from "./handler.js";

function deps(overrides: Partial<HandlerDeps> = {}): HandlerDeps {
  return {
    searchTools: vi.fn().mockResolvedValue({ task: "x", tools: [], dataFreshness: "" }),
    getToolSchema: vi.fn().mockResolvedValue({ tool: { slug: "stripe" } }),
    ...overrides,
  };
}

describe("handleMessage", () => {
  it("responds to initialize with protocol version + tools capability", async () => {
    const res = await handleMessage({ jsonrpc: "2.0", id: 1, method: "initialize" }, deps());
    expect(res?.result).toMatchObject({
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { tools: {} },
    });
  });

  it("returns null (no reply) for the initialized notification", async () => {
    const res = await handleMessage(
      { jsonrpc: "2.0", method: "notifications/initialized" },
      deps(),
    );
    expect(res).toBeNull();
  });

  it("lists both discovery tools", async () => {
    const res = await handleMessage({ jsonrpc: "2.0", id: 2, method: "tools/list" }, deps());
    const tools = (res?.result as { tools: typeof TOOL_DEFINITIONS }).tools;
    expect(tools.map((t) => t.name)).toEqual(["search_tools", "get_tool_schema"]);
  });

  it("calls searchTools and wraps the payload as text content", async () => {
    const d = deps();
    const res = await handleMessage(
      {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: "search_tools", arguments: { task: "send email", limit: 3 } },
      },
      d,
    );
    expect(d.searchTools).toHaveBeenCalledWith({
      task: "send email",
      availableTools: undefined,
      limit: 3,
    });
    const content = (res?.result as { content: Array<{ type: string; text: string }> }).content;
    expect(content[0]?.type).toBe("text");
  });

  it("rejects search_tools without a task", async () => {
    const res = await handleMessage(
      { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "search_tools", arguments: {} } },
      deps(),
    );
    expect(res?.error?.code).toBe(-32602);
  });

  it("returns an MCP tool error (not a transport error) when the upstream call fails", async () => {
    const d = deps({ searchTools: vi.fn().mockRejectedValue(new Error("boom")) });
    const res = await handleMessage(
      {
        jsonrpc: "2.0",
        id: 5,
        method: "tools/call",
        params: { name: "search_tools", arguments: { task: "x" } },
      },
      d,
    );
    expect(res?.error).toBeUndefined();
    expect((res?.result as { isError?: boolean }).isError).toBe(true);
  });

  it("returns method-not-found for unknown methods with an id", async () => {
    const res = await handleMessage({ jsonrpc: "2.0", id: 6, method: "bogus" }, deps());
    expect(res?.error?.code).toBe(-32601);
  });
});
