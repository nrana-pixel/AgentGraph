import { sql } from "drizzle-orm";
import type { Drizzle } from "../types.js";
import { tools } from "../db/schema.js";
import { scoreToolDescription } from "../lib/toolDescriptionQuality.js";

// Bound cost/time per run; remaining tools are picked up on the next run.
const MAX_PER_RUN = 2000;

interface ScanRow {
  slug: string;
  name: string;
  description: string | null;
  category: string;
  input_schema: string | null;
  [key: string]: unknown;
}

/**
 * Daily cron (spec 03) — scores tool description + input-schema quality.
 *
 * Picks tools that have never been scored, or whose definition changed since
 * the last score (updated_at moves forward when the catalog/auto-discovery
 * refreshes a row and recomputes its definition_hash). name_collision needs the
 * category cohort, so we load same-category names once per category.
 */
export async function runToolQualityScan(db: Drizzle): Promise<void> {
  const rows = await db.execute<ScanRow>(sql`
    SELECT slug, name, description, category, input_schema
    FROM tools
    WHERE quality_checked_at IS NULL
       OR updated_at > quality_checked_at
    ORDER BY quality_checked_at NULLS FIRST
    LIMIT ${MAX_PER_RUN}
  `);

  if (rows.length === 0) {
    console.log("[tool-quality-scan] nothing to score");
    return;
  }

  // Category cohorts — every tool's name (not just the to-be-scored ones), so a
  // newly-added tool collides against the full catalog cohort. One query.
  const cohortRows = await db.execute<{ category: string; name: string }>(sql`
    SELECT category, name FROM tools
  `);
  const namesByCategory = new Map<string, string[]>();
  for (const r of cohortRows) {
    const list = namesByCategory.get(r.category) ?? [];
    list.push(r.name);
    namesByCategory.set(r.category, list);
  }

  let scored = 0;
  for (const row of rows) {
    const cohort = namesByCategory.get(row.category) ?? [];
    const { score, issues } = scoreToolDescription(
      { name: row.name, description: row.description, inputSchema: row.input_schema },
      cohort,
    );

    await db.execute(sql`
      UPDATE tools
      SET description_quality_score = ${score},
          quality_issues = ${JSON.stringify(issues)},
          quality_checked_at = NOW()
      WHERE slug = ${row.slug}
    `);
    scored++;
  }

  console.log(`[tool-quality-scan] scored ${scored} tools`);
}
