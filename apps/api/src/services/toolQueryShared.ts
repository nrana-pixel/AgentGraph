import { sql } from "drizzle-orm";
import { tools, toolGlobalStats } from "../db/schema.js";

// Shared building blocks for the catalog-ranking queries (recommendation +
// discovery engines). Centralised so a schema change or an FTS tweak is made
// once, not copied across engines (and across recommendation's own two query
// blocks).

/** Catalog columns common to both engines. Each engine spreads this and adds
 *  the few extra columns it needs (id for recommendation; schemas + embedding
 *  for discovery). */
export const toolBaseColumns = {
  slug: tools.slug,
  name: tools.name,
  description: tools.description,
  category: tools.category,
  website: tools.website,
  docsUrl: tools.docsUrl,
  isOpenSource: tools.isOpenSource,
  isSelfHostable: tools.isSelfHostable,
  pricingModel: tools.pricingModel,
  dataResidency: tools.dataResidency,
  tags: tools.tags,
  dataSource: tools.dataSource,
  sentimentScore: tools.sentimentScore,
} as const;

/** The global-benchmark columns, joined from tool_global_stats. */
export const toolGlobalStatColumns = {
  totalCalls: toolGlobalStats.totalCalls,
  successRate: toolGlobalStats.successRate,
  avgLatencyMs: toolGlobalStats.avgLatencyMs,
  p95LatencyMs: toolGlobalStats.p95LatencyMs,
  popularityScore: toolGlobalStats.popularityScore,
  lastUpdated: toolGlobalStats.lastUpdated,
} as const;

/** `to_tsvector` over name + description + tags — the indexed FTS document
 *  (matches the GIN index expression in migration 0000). */
export function toolFtsVector() {
  return sql`to_tsvector('english', coalesce(${tools.name}, '') || ' ' || coalesce(${tools.description}, '') || ' ' || coalesce(immutable_array_to_string(${tools.tags}, ' '), ''))`;
}

/** Boolean FTS match condition for a free-text task query. */
export function toolFtsMatch(task: string) {
  return sql`${toolFtsVector()} @@ plainto_tsquery('english', ${task})`;
}
