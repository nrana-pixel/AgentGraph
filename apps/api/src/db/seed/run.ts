/**
 * Idempotent seed runner — upserts all tools and their initial global stats.
 * Run with: npx tsx src/db/seed/run.ts
 */
import "dotenv/config";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import { SEED_TOOLS } from "./tools.js";

const DATABASE_URL = process.env["DATABASE_URL"];
if (!DATABASE_URL) throw new Error("DATABASE_URL is not set");

const pgClient = postgres(DATABASE_URL);
const db = drizzle(pgClient);

async function seed() {
  console.log(`[seed] upserting ${SEED_TOOLS.length} tools…`);

  for (const tool of SEED_TOOLS) {
    // Build proper Postgres ARRAY[...] expressions — JSON strings are not valid text[] literals
    const residencyArr = sql`ARRAY[${sql.join(tool.dataResidency.map((r) => sql`${r}`), sql`, `)}]::text[]`;
    const tagsArr = sql`ARRAY[${sql.join(tool.tags.map((t) => sql`${t}`), sql`, `)}]::text[]`;

    // Upsert tool row — keep existing data_source if already graduated to telemetry
    await db.execute(sql`
      INSERT INTO tools (
        slug, name, description, category,
        website, docs_url, github_url,
        is_open_source, is_self_hostable, pricing_model,
        data_residency, tags,
        sentiment_score, data_source,
        created_at, updated_at
      ) VALUES (
        ${tool.slug}, ${tool.name}, ${tool.description}, ${tool.category},
        ${tool.website}, ${tool.docsUrl}, ${tool.githubUrl},
        ${tool.isOpenSource}, ${tool.isSelfHostable}, ${tool.pricingModel},
        ${residencyArr}, ${tagsArr},
        ${tool.sentimentScore}, 'seeded',
        NOW(), NOW()
      )
      ON CONFLICT (slug) DO UPDATE SET
        name             = EXCLUDED.name,
        description      = EXCLUDED.description,
        category         = EXCLUDED.category,
        website          = EXCLUDED.website,
        docs_url         = EXCLUDED.docs_url,
        github_url       = EXCLUDED.github_url,
        is_open_source   = EXCLUDED.is_open_source,
        is_self_hostable = EXCLUDED.is_self_hostable,
        pricing_model    = EXCLUDED.pricing_model,
        data_residency   = EXCLUDED.data_residency,
        tags             = EXCLUDED.tags,
        sentiment_score  = EXCLUDED.sentiment_score,
        updated_at       = NOW()
        -- data_source intentionally NOT overwritten so graduated tools stay 'telemetry'
    `);

    // Upsert global stats — don't overwrite real telemetry values (only insert if absent)
    await db.execute(sql`
      INSERT INTO tool_global_stats (
        tool_slug, total_calls, success_rate,
        avg_latency_ms, p95_latency_ms,
        popularity_score, last_updated
      ) VALUES (
        ${tool.slug}, 0, ${tool.successRate},
        ${tool.avgLatencyMs}, ${tool.p95LatencyMs},
        50, NOW()
      )
      ON CONFLICT (tool_slug) DO NOTHING
    `);
  }

  console.log("[seed] done.");
  await pgClient.end();
}

seed().catch((err) => {
  console.error("[seed] failed:", err);
  process.exit(1);
});
