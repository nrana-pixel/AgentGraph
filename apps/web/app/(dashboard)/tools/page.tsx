import { auth } from "@clerk/nextjs/server";
import Link from "next/link";

const API_BASE = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3001";

const CATEGORY_LABELS: Record<string, string> = {
  auth: "Auth",
  email: "Email",
  analytics: "Analytics",
  queue: "Queue",
  database: "Database",
  vector_db: "Vector DB",
  crm: "CRM",
  payments: "Payments",
  storage: "Storage",
  search: "Search",
  monitoring: "Monitoring",
  communication: "Communication",
  ai_gateway: "AI Gateway",
  llm_provider: "LLM Provider",
  other: "Other",
};

const PRICING_STYLES: Record<string, string> = {
  free: "bg-emerald-500/15 text-emerald-400",
  freemium: "bg-blue-500/15 text-blue-400",
  paid: "bg-amber-500/15 text-amber-400",
  open_source: "bg-violet-500/15 text-violet-400",
};

interface ToolRow {
  slug: string;
  name: string;
  description: string | null;
  category: string;
  isOpenSource: boolean;
  isSelfHostable: boolean;
  pricingModel: string | null;
  tags: string[] | null;
  dataSource: string;
  sentimentScore: string | null;
  successRate: string | null;
  avgLatencyMs: string | null;
  totalCalls: number | null;
}

async function fetchTools(category: string | undefined, page: number, token: string) {
  const params = new URLSearchParams({ page: String(page), limit: "24" });
  if (category) params.set("category", category);

  const res = await fetch(`${API_BASE}/v1/tools?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  if (!res.ok) return { tools: [] as ToolRow[], page, limit: 24 };
  return res.json() as Promise<{ tools: ToolRow[]; page: number; limit: number }>;
}

export default async function ToolsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const params = await searchParams;
  const category = params["category"] ?? "";
  const pageNum = parseInt(params["page"] ?? "1", 10);

  const { getToken } = await auth();
  const token = (await getToken()) ?? "";

  const { tools, limit } = await fetchTools(category || undefined, pageNum, token);
  const hasMore = tools.length === limit;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Tool Catalog</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {tools.length} tools{category ? ` in ${CATEGORY_LABELS[category] ?? category}` : ""}
          </p>
        </div>
      </div>

      {/* Category filter */}
      <div className="flex flex-wrap gap-2">
        <CategoryChip label="All" value="" current={category} />
        {Object.entries(CATEGORY_LABELS).map(([val, label]) => (
          <CategoryChip key={val} label={label} value={val} current={category} />
        ))}
      </div>

      {/* Grid */}
      {tools.length > 0 ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {tools.map((tool) => (
              <ToolCard key={tool.slug} tool={tool} />
            ))}
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>Page {pageNum}</span>
            <div className="flex gap-2">
              {pageNum > 1 && (
                <Link
                  href={`/tools?page=${pageNum - 1}&category=${category}`}
                  className="rounded border border-border px-3 py-1 hover:bg-muted/30"
                >
                  Previous
                </Link>
              )}
              {hasMore && (
                <Link
                  href={`/tools?page=${pageNum + 1}&category=${category}`}
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
          <p className="font-medium">No tools found</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Try a different category or check back after running the seed script.
          </p>
        </div>
      )}
    </div>
  );
}

function CategoryChip({
  label,
  value,
  current,
}: {
  label: string;
  value: string;
  current: string;
}) {
  const active = value === current;
  return (
    <Link
      href={value ? `/tools?category=${value}` : "/tools"}
      className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
        active
          ? "bg-primary text-primary-foreground"
          : "border border-border text-muted-foreground hover:bg-accent hover:text-foreground"
      }`}
    >
      {label}
    </Link>
  );
}

function ToolCard({ tool }: { tool: ToolRow }) {
  const successRate =
    tool.successRate != null ? (parseFloat(tool.successRate) * 100).toFixed(1) : null;
  const avgLatency =
    tool.avgLatencyMs != null ? Math.round(parseFloat(tool.avgLatencyMs)) : null;
  const isColdStart = (tool.totalCalls ?? 0) < 50;

  return (
    <Link
      href={`/tools/${tool.slug}`}
      className="group flex flex-col rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/50 hover:bg-accent/30"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium">{tool.name}</p>
          <p className="text-xs text-muted-foreground">{CATEGORY_LABELS[tool.category] ?? tool.category}</p>
        </div>
        {tool.pricingModel && (
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${PRICING_STYLES[tool.pricingModel] ?? "bg-muted text-muted-foreground"}`}
          >
            {tool.pricingModel}
          </span>
        )}
      </div>

      {tool.description && (
        <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{tool.description}</p>
      )}

      <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
        {successRate != null && (
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            {successRate}% success
            {isColdStart && <span className="text-muted-foreground/50">(est.)</span>}
          </span>
        )}
        {avgLatency != null && (
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
            {avgLatency}ms avg
          </span>
        )}
        {tool.isOpenSource && (
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-violet-400" />
            OSS
          </span>
        )}
      </div>

      {tool.tags && tool.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {tool.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground"
            >
              {tag}
            </span>
          ))}
          {tool.tags.length > 3 && (
            <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
              +{tool.tags.length - 3}
            </span>
          )}
        </div>
      )}
    </Link>
  );
}
