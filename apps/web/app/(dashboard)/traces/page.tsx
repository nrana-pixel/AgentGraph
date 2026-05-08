import Link from "next/link";
import { formatDistanceToNow } from "../../../lib/dateUtils";

interface Trace {
  id: string;
  agentId: string;
  sessionId: string | null;
  status: "running" | "completed" | "error";
  totalLatencyMs: number | null;
  totalTokens: number | null;
  totalCostUsd: string | null;
  startedAt: string;
  env: string;
}

const STATUS_STYLES: Record<string, string> = {
  completed: "bg-emerald-500/15 text-emerald-400",
  error: "bg-red-500/15 text-red-400",
  running: "bg-yellow-500/15 text-yellow-400",
};

export default async function TracesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const params = await searchParams;
  const status = params["status"] ?? "";
  const agentId = params["agentId"] ?? "";
  const page = params["page"] ?? "1";

  // Placeholder — real fetch wires in once user has a project+key
  const traces: Trace[] = [];
  const hasMore = false;

  const currentPage = parseInt(page, 10);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Traces</h1>
      </div>

      {/* Filters */}
      <form className="flex flex-wrap gap-3">
        <input
          name="agentId"
          defaultValue={agentId}
          placeholder="Filter by agent ID"
          className="rounded-md border border-border bg-input px-3 py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <select
          name="status"
          defaultValue={status}
          className="rounded-md border border-border bg-input px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="">All statuses</option>
          <option value="completed">Completed</option>
          <option value="error">Error</option>
          <option value="running">Running</option>
        </select>
        <button
          type="submit"
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          Filter
        </button>
      </form>

      {/* Trace table */}
      {traces.length > 0 ? (
        <>
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Trace ID</th>
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Agent</th>
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Status</th>
                  <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Latency</th>
                  <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Tokens</th>
                  <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Cost</th>
                  <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Started</th>
                </tr>
              </thead>
              <tbody>
                {traces.map((trace) => (
                  <tr
                    key={trace.id}
                    className="border-b border-border last:border-0 hover:bg-muted/20"
                  >
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/traces/${trace.id}`}
                        className="font-mono text-xs text-primary hover:underline"
                      >
                        {trace.id.slice(0, 8)}…
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs">{trace.agentId}</td>
                    <td className="px-4 py-2.5">
                      <StatusBadge status={trace.status} />
                    </td>
                    <td className="px-4 py-2.5 text-right text-muted-foreground">
                      {trace.totalLatencyMs != null
                        ? `${trace.totalLatencyMs.toLocaleString()}ms`
                        : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right text-muted-foreground">
                      {trace.totalTokens != null
                        ? trace.totalTokens.toLocaleString()
                        : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right text-muted-foreground">
                      {trace.totalCostUsd != null
                        ? `$${parseFloat(trace.totalCostUsd).toFixed(5)}`
                        : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right text-muted-foreground text-xs">
                      {formatDistanceToNow(new Date(trace.startedAt))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>Page {currentPage}</span>
            <div className="flex gap-2">
              {currentPage > 1 && (
                <Link
                  href={`/traces?page=${currentPage - 1}&status=${status}&agentId=${agentId}`}
                  className="rounded border border-border px-3 py-1 hover:bg-muted/30"
                >
                  Previous
                </Link>
              )}
              {hasMore && (
                <Link
                  href={`/traces?page=${currentPage + 1}&status=${status}&agentId=${agentId}`}
                  className="rounded border border-border px-3 py-1 hover:bg-muted/30"
                >
                  Next
                </Link>
              )}
            </div>
          </div>
        </>
      ) : (
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <p className="font-medium">No traces yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Install the SDK and send your first trace to see it here.
          </p>
          <pre className="mt-4 inline-block rounded-md bg-muted px-4 py-2 text-left text-xs text-muted-foreground">
            {`npm install @agentgraph/sdk\n\nAgentGraph.init({ apiKey: process.env.AGENTGRAPH_API_KEY })`}
          </pre>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[status] ?? "bg-muted text-muted-foreground"}`}
    >
      {status}
    </span>
  );
}
