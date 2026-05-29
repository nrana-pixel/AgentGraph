import { createInterface } from "node:readline";
import { handleMessage, type HandlerDeps, type JsonRpcRequest } from "./handler.js";

/**
 * Run the MCP server over stdio. Messages are newline-delimited JSON-RPC 2.0
 * (one object per line), per the MCP stdio transport. Responses are written to
 * stdout; everything else (logs) MUST go to stderr so it doesn't corrupt the
 * protocol stream.
 */
export function runStdioServer(deps: HandlerDeps): void {
  const rl = createInterface({ input: process.stdin, terminal: false });

  rl.on("line", (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    let msg: JsonRpcRequest;
    try {
      msg = JSON.parse(trimmed) as JsonRpcRequest;
    } catch {
      process.stderr.write(`[agentgraph-mcp] dropped malformed line\n`);
      return;
    }

    void handleMessage(msg, deps)
      .then((response) => {
        if (response !== null) process.stdout.write(JSON.stringify(response) + "\n");
      })
      .catch((e) => {
        process.stderr.write(`[agentgraph-mcp] handler error: ${String(e)}\n`);
      });
  });

  rl.on("close", () => process.exit(0));
  process.stderr.write("[agentgraph-mcp] ready on stdio\n");
}
