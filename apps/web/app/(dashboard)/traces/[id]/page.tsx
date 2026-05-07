import { notFound } from "next/navigation";
import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { WaterfallTimeline } from "../../../../components/traces/WaterfallTimeline.js";
import { formatDistanceToNow, formatDuration } from "../../../../lib/dateUtils.js";

interface TraceStep {
  id: string;
  stepIndex: number;
  type: string;
  name: string;
  input: string | null;
  output: string | null;
  latencyMs: number | null;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  costUsd: string | null;
  error: string | null;
  model: string | null;
  toolName: string | null;
  timestamp: string;
}

interface TraceDetail {
  id: string;
  agentId: string;
  sessionId: string | null;
  status: string;
  totalLatencyMs: number | null;
  totalTokens: number | null;
  totalCostUsd: string | null;
  startedAt: string;
  endedAt: string | null;
  env: string;
  metadata: string;
}

const STATUS_STYLES: Record<string, string> = {
  completed: "bg-emerald-500/15 text-emerald-400",
  error: "bg-red-500/15 text-red-400",
  running: "bg-yellow-500/15 text-yellow-400",
};

async function fetchTrace(
  id: string,
  projectId: string,
  sessionToken: string,
): Promise<{ trace: TraceDetail; steps: TraceStep[] } | null> {
  try {
    const res = await fetch(
      `${process.env["NEXT_PUBLIC_API_URL"]}/v1/traces/${id}?projectId=${projectId}`,
      {
        headers: { Authorization: `Bearer ${sessionToken}` },
        next: { revalidate: 30 },
      },
    );
    if (res.status === 404) return null;
    if (!res.ok) return null;
    return res.json() as Promise<{ trace: TraceDetail; steps: TraceStep[] }>;
  } catch {
    return null;
  }
}

export default async function TraceDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string>>;
}) {
  const [{ id }, sp, { getToken }] = await Promise.all([
    params,
    searchParams,
    auth(),
  ]);

  const projectId = sp["projectId"] ?? "";
  const sessionToken = (await getToken()) ?? "";

  if (!projectId) notFound();

  const data = await fetchTrace(id, projectId, sessionToken);

  if (!data) notFound();

  const { trace, steps } = data;
  const metadata = JSON.parse(trace.metadata || "{}") as Record<string, unknown>;

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/traces" className="hover:text-foreground">
          Traces
        </Link>
        <span>/</span>
        <span className="font-mono text-foreground">{id.slice(0, 8)}…</span>
      </div>

      {/* Trace header */}
      <div className="rounded-lg border border-border bg-card p-5">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-mono text-lg font-semibold">{trace.agentId}</h1>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[trace.status] ?? ""}`}
              >
                {trace.status}
              </span>
              <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                {trace.env}
              </span>
            </div>
            {trace.sessionId && (
              <p className="mt-1 text-xs text-muted-foreground">
                Session: <span className="font-mono">{trace.sessionId}</span>
              </p>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(trace.startedAt))}
          </p>
        </div>

        {/* Metrics row */}
        <div className="mt-4 flex flex-wrap gap-6 text-sm">
          <Metric
            label="Total latency"
            value={
              trace.totalLatencyMs != null
                ? formatDuration(trace.totalLatencyMs)
                : "—"
            }
          />
          <Metric
            label="Tokens"
            value={
              trace.totalTokens != null
                ? trace.totalTokens.toLocaleString()
                : "—"
            }
          />
          <Metric
            label="Cost"
            value={
              trace.totalCostUsd != null
                ? `$${parseFloat(trace.totalCostUsd).toFixed(5)}`
                : "—"
            }
          />
          <Metric label="Steps" value={String(steps.length)} />
        </div>

        {/* Metadata */}
        {Object.keys(metadata).length > 0 && (
          <div className="mt-4 rounded-md bg-muted/30 p-3">
            <p className="mb-1 text-xs font-medium text-muted-foreground">Metadata</p>
            <pre className="text-xs text-muted-foreground">
              {JSON.stringify(metadata, null, 2)}
            </pre>
          </div>
        )}
      </div>

      {/* Waterfall */}
      <div>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground uppercase tracking-wide">
          Execution Timeline ({steps.length} steps)
        </h2>
        <WaterfallTimeline steps={steps} totalLatencyMs={trace.totalLatencyMs} />
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-medium">{value}</p>
    </div>
  );
}
