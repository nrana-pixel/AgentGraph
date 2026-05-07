import { auth } from "@clerk/nextjs/server";
import Link from "next/link";

interface DailyStatRow {
  date: string;
  traceCount: number;
  errorCount: number;
  totalCostUsd: number;
  totalTokens: number;
}

interface TopAgent {
  agentId: string;
  traceCount: number;
  errorRate: number;
  avgLatencyMs: number;
}

interface StatsResponse {
  totals: {
    traceCount: number;
    totalCostUsd: number;
    totalTokens: number;
    errorRate: number;
  };
  dailyStats: DailyStatRow[];
  topAgents: TopAgent[];
}

async function fetchStats(projectId: string, apiKey: string): Promise<StatsResponse | null> {
  try {
    const res = await fetch(
      `${process.env["NEXT_PUBLIC_API_URL"]}/v1/projects/${projectId}/stats`,
      {
        headers: { Authorization: `Bearer ${apiKey}` },
        next: { revalidate: 60 },
      },
    );
    if (!res.ok) return null;
    return res.json() as Promise<StatsResponse>;
  } catch {
    return null;
  }
}

export default async function DashboardPage() {
  await auth();

  // In Phase 1 we render with placeholder data; real data wires in
  // once the user creates a project and API key via /settings.
  const stats: StatsResponse | null = null;

  const totalTraces = stats?.totals.traceCount ?? 0;
  const totalCost = stats?.totals.totalCostUsd ?? 0;
  const errorRate = stats?.totals.errorRate ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Overview</h1>
        <span className="text-muted-foreground text-xs">Last 30 days</span>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Total traces"
          value={totalTraces === 0 ? "—" : totalTraces.toLocaleString()}
          sub="last 30 days"
        />
        <StatCard
          label="Total cost"
          value={totalCost === 0 ? "—" : `$${totalCost.toFixed(4)}`}
          sub="LLM spend"
        />
        <StatCard
          label="Error rate"
          value={totalTraces === 0 ? "—" : `${(errorRate * 100).toFixed(1)}%`}
          sub="across all agents"
          highlight={errorRate > 0.05}
        />
      </div>

      {/* Tool Intelligence banner */}
      <div className="rounded-lg border border-primary/30 bg-primary/10 p-4">
        <p className="text-sm">
          <span className="font-semibold text-primary">Tool Intelligence</span>{" "}
          <span className="text-muted-foreground">
            — Integrate the SDK to start receiving live tool recommendations.
          </span>{" "}
          <Link href="/recommendations" className="text-primary underline-offset-4 hover:underline">
            Explore tool recommendations →
          </Link>
        </p>
      </div>

      {/* Top agents table */}
      {stats?.topAgents && stats.topAgents.length > 0 ? (
        <div>
          <h2 className="mb-3 text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Top Agents
          </h2>
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Agent</th>
                  <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Traces</th>
                  <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Error rate</th>
                  <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Avg latency</th>
                </tr>
              </thead>
              <tbody>
                {stats.topAgents.map((agent) => (
                  <tr key={agent.agentId} className="border-b border-border last:border-0 hover:bg-muted/20">
                    <td className="px-4 py-2.5 font-mono text-xs">{agent.agentId}</td>
                    <td className="px-4 py-2.5 text-right">{agent.traceCount.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-right">
                      <span className={agent.errorRate > 0.05 ? "text-destructive" : ""}>
                        {(agent.errorRate * 100).toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right text-muted-foreground">
                      {agent.avgLatencyMs ? `${agent.avgLatencyMs.toLocaleString()}ms` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <EmptyState
          title="No agent data yet"
          description="Install the AgentGraph SDK and call AgentGraph.init() to start seeing traces."
          cta={{ label: "View SDK docs", href: "/settings" }}
        />
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  highlight,
}: {
  label: string;
  value: string;
  sub: string;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${highlight ? "text-destructive" : ""}`}>
        {value}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}

function EmptyState({
  title,
  description,
  cta,
}: {
  title: string;
  description: string;
  cta: { label: string; href: string };
}) {
  return (
    <div className="rounded-lg border border-dashed border-border p-10 text-center">
      <p className="font-medium">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      <Link
        href={cta.href}
        className="mt-4 inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
      >
        {cta.label}
      </Link>
    </div>
  );
}
