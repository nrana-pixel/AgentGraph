import { eq, isNull } from "drizzle-orm";
import type { Drizzle } from "../types.js";
import { tools } from "../db/schema.js";
import { embedTexts, embeddingsEnabled, toolEmbeddingText } from "../lib/embeddings.js";

// Bound cost/time per run; remaining tools are picked up on the next run.
const MAX_PER_RUN = 1000;

/**
 * Backfill embeddings for any tool missing one — the seeded catalog, tools
 * auto-discovered from telemetry, and anything imported before embeddings were
 * configured. Without this, semantic task-relevance ranking silently never
 * applies to those tools even when an embedding provider is set. No-op when
 * embeddings are unconfigured.
 */
export async function runEmbeddingBackfill(db: Drizzle): Promise<void> {
  if (!embeddingsEnabled()) {
    console.log("[embedding-backfill] embeddings unconfigured — skipping");
    return;
  }

  const rows = await db
    .select({
      slug: tools.slug,
      name: tools.name,
      description: tools.description,
      tags: tools.tags,
    })
    .from(tools)
    .where(isNull(tools.embedding))
    .limit(MAX_PER_RUN);

  if (rows.length === 0) {
    console.log("[embedding-backfill] nothing to backfill");
    return;
  }

  console.log(`[embedding-backfill] embedding ${rows.length} tools`);
  const vectors = await embedTexts(
    rows.map((r) => toolEmbeddingText(r.name, r.description, r.tags ?? [])),
  );

  let updated = 0;
  for (let i = 0; i < rows.length; i++) {
    const vec = vectors[i];
    if (!vec) continue;
    await db
      .update(tools)
      .set({ embedding: JSON.stringify(vec), updatedAt: new Date() })
      .where(eq(tools.slug, rows[i]!.slug));
    updated++;
  }
  console.log(`[embedding-backfill] updated ${updated} tools`);
}
