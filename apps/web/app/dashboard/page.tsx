import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  return (
    <main className="min-h-screen p-8">
      <div className="mx-auto max-w-7xl">
        <h1 className="mb-8 text-3xl font-bold">Dashboard</h1>

        {/* Stat cards row — populated in Phase 1 */}
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard label="Traces today" value="—" />
          <StatCard label="Total cost (7d)" value="—" />
          <StatCard label="Active agents" value="—" />
        </div>

        {/* Tool Intelligence banner */}
        <div className="mb-8 rounded-lg border border-primary/30 bg-primary/10 p-4">
          <p className="text-sm text-primary">
            <span className="font-semibold">Tool Intelligence</span> — Instrument
            your agents with the SDK to start seeing tool recommendations here.
          </p>
        </div>

        <p className="text-muted-foreground text-sm">
          Traces and charts will appear here once you integrate the AgentGraph SDK.
        </p>
      </div>
    </main>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <p className="text-muted-foreground text-sm">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}
