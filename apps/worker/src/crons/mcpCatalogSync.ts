import { sql } from "drizzle-orm";
import type { Drizzle } from "../types.js";
import { tools } from "../db/schema.js";
import { embedTexts, embeddingsEnabled, toolEmbeddingText } from "../lib/embeddings.js";
import { computeDefinitionHash } from "../lib/definitionHash.js";
import { scoreToolDescription } from "../lib/toolDescriptionQuality.js";

/**
 * Catalog sync — seeds/refreshes the tool catalog from the public MCP registry
 * so a brand-new user gets useful, schema-bearing discovery results on day one,
 * before any of their own telemetry exists (the cold-start fix, Workstream C).
 *
 * Crawling uses Firecrawl (https://firecrawl.dev) with structured extraction.
 * Gated on FIRECRAWL_API_KEY — when unset the sync is a no-op so deployments
 * without a key boot fine.
 */

const FIRECRAWL_BASE = "https://api.firecrawl.dev/v1";
const DEFAULT_REGISTRY_URL = "https://registry.modelcontextprotocol.io/v0/servers";

// Mirror of packages/types ToolCategorySchema. Registry categories are mapped
// onto this fixed set; anything unrecognised falls back to "other".
const VALID_CATEGORIES = new Set([
  "auth", "email", "analytics", "queue", "database", "vector_db", "crm",
  "payments", "storage", "search", "monitoring", "communication",
  "ai_gateway", "llm_provider", "other",
]);

export interface NormalizedTool {
  slug: string;
  name: string;
  description: string | null;
  category: string;
  website: string | null;
  githubUrl: string | null;
  inputSchema: string | null;
  outputSchema: string | null;
  tags: string[];
}

// ---------------------------------------------------------------------------
// Pure helpers (unit-tested)
// ---------------------------------------------------------------------------

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function mapCategory(raw: unknown): string {
  if (typeof raw !== "string") return "other";
  const c = raw.toLowerCase().trim().replace(/[\s-]+/g, "_");
  return VALID_CATEGORIES.has(c) ? c : "other";
}

function asStringOrNull(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

// Schemas may arrive as objects (JSON Schema) or already-stringified JSON.
function asSchemaString(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "string") return v.trim() === "" ? null : v;
  try {
    return JSON.stringify(v);
  } catch {
    return null;
  }
}

/**
 * Normalize raw registry entries (whatever shape the crawl returns) into tool
 * rows. Drops entries without a usable name; dedupes by slug. Defensive about
 * field names — registries vary, so we accept a few common aliases.
 */
export function normalizeRegistryEntries(raw: unknown[]): NormalizedTool[] {
  const bySlug = new Map<string, NormalizedTool>();

  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const e = item as Record<string, unknown>;

    const name = asStringOrNull(e["name"]) ?? asStringOrNull(e["title"]);
    if (!name) continue;
    const slug = slugify(name);
    if (!slug) continue;

    const tags = Array.isArray(e["tags"])
      ? (e["tags"] as unknown[]).filter((t): t is string => typeof t === "string")
      : [];

    bySlug.set(slug, {
      slug,
      name,
      description: asStringOrNull(e["description"]) ?? asStringOrNull(e["summary"]),
      category: mapCategory(e["category"]),
      website: asStringOrNull(e["website"]) ?? asStringOrNull(e["homepage"]),
      githubUrl: asStringOrNull(e["githubUrl"]) ?? asStringOrNull(e["repository"]),
      inputSchema: asSchemaString(e["inputSchema"]),
      outputSchema: asSchemaString(e["outputSchema"]),
      tags,
    });
  }

  return [...bySlug.values()];
}

// ---------------------------------------------------------------------------
// Firecrawl fetch
// ---------------------------------------------------------------------------

async function fetchFromFirecrawl(apiKey: string, registryUrl: string): Promise<unknown[]> {
  const res = await fetch(`${FIRECRAWL_BASE}/scrape`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      url: registryUrl,
      formats: ["json"],
      jsonOptions: {
        prompt:
          "Extract every tool / MCP server listed. For each return: name, description, category, website, githubUrl, and inputSchema/outputSchema (JSON schema) if present.",
        schema: {
          type: "object",
          properties: {
            tools: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  description: { type: "string" },
                  category: { type: "string" },
                  website: { type: "string" },
                  githubUrl: { type: "string" },
                  inputSchema: { type: "object" },
                  outputSchema: { type: "object" },
                },
                required: ["name"],
              },
            },
          },
        },
      },
    }),
    signal: AbortSignal.timeout(120_000),
  });

  if (!res.ok) {
    throw new Error(`firecrawl scrape failed (${res.status}): ${await res.text()}`);
  }
  const body = (await res.json()) as { data?: { json?: { tools?: unknown[] } } };
  return body.data?.json?.tools ?? [];
}

// ---------------------------------------------------------------------------
// Entrypoint
// ---------------------------------------------------------------------------

export async function runMcpCatalogSync(db: Drizzle): Promise<void> {
  const apiKey = process.env["FIRECRAWL_API_KEY"];
  if (!apiKey) {
    console.log("[mcp-catalog-sync] FIRECRAWL_API_KEY unset — skipping");
    return;
  }
  const registryUrl = process.env["MCP_REGISTRY_URL"] ?? DEFAULT_REGISTRY_URL;

  console.log("[mcp-catalog-sync] crawling", registryUrl);
  const raw = await fetchFromFirecrawl(apiKey, registryUrl);
  const normalized = normalizeRegistryEntries(raw);
  console.log(`[mcp-catalog-sync] normalized ${normalized.length} tools`);

  // Embed all tools in batched provider calls up front (not one-at-a-time in
  // the loop), then upsert with the precomputed vectors.
  const embeddings = embeddingsEnabled()
    ? await embedTexts(normalized.map((t) => toolEmbeddingText(t.name, t.description, t.tags)))
    : [];

  // Same-category name cohorts for the inline quality scorer (name_collision).
  const namesByCategory = new Map<string, string[]>();
  for (const t of normalized) {
    const list = namesByCategory.get(t.category) ?? [];
    list.push(t.name);
    namesByCategory.set(t.category, list);
  }

  let upserted = 0;

  for (let i = 0; i < normalized.length; i++) {
    const t = normalized[i]!;
    const embedding = embeddings[i] ?? null;
    const definitionHash = computeDefinitionHash(t.name, t.description, t.inputSchema);
    // Score freshly-crawled tools immediately so they surface a quality signal
    // on day one, before the daily quality-scan cron runs.
    const { score, issues } = scoreToolDescription(
      { name: t.name, description: t.description, inputSchema: t.inputSchema },
      namesByCategory.get(t.category) ?? [],
    );
    const qualityIssues = JSON.stringify(issues);
    const qualityCheckedAt = new Date();

    await db
      .insert(tools)
      .values({
        slug: t.slug,
        name: t.name,
        description: t.description,
        category: t.category,
        website: t.website,
        githubUrl: t.githubUrl,
        inputSchema: t.inputSchema,
        outputSchema: t.outputSchema,
        tags: t.tags.length > 0 ? t.tags : null,
        embedding: embedding ? JSON.stringify(embedding) : null,
        dataSource: "seeded",
        definitionHash,
        descriptionQualityScore: score,
        qualityIssues,
        qualityCheckedAt,
      })
      // Refresh catalog metadata, but ONLY for still-seeded tools — never
      // clobber a tool that has graduated to telemetry-derived data.
      .onConflictDoUpdate({
        target: tools.slug,
        set: {
          description: t.description,
          website: t.website,
          githubUrl: t.githubUrl,
          inputSchema: t.inputSchema,
          outputSchema: t.outputSchema,
          ...(embedding ? { embedding: JSON.stringify(embedding) } : {}),
          definitionHash,
          descriptionQualityScore: score,
          qualityIssues,
          qualityCheckedAt,
          updatedAt: new Date(),
        },
        setWhere: sql`${tools.dataSource} = 'seeded'`,
      });
    upserted++;
  }

  console.log(`[mcp-catalog-sync] upserted ${upserted} tools`);
}
