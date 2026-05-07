import type { Drizzle } from "../types.js";
import { eq, isNotNull } from "drizzle-orm";

interface GitHubRepoResponse {
  stargazers_count: number;
  open_issues_count: number;
}

/**
 * Weekly cron — runs Sunday at 04:00 UTC.
 * Fetches GitHub stars + normalises into sentiment_score (0–100) per tool.
 * HN/Reddit signals are stubbed for v1; the 15% weight is redistributed to GitHub.
 */
export async function runSentimentFetcher(db: Drizzle): Promise<void> {
  // Import schema lazily
  const { tools } = await import("../db/schema.js");

  const toolList = await db
    .select({ slug: tools.slug, githubUrl: tools.githubUrl })
    .from(tools)
    .where(isNotNull(tools.githubUrl));

  console.log(`[sentiment-fetcher] processing ${toolList.length} tools with GitHub URLs`);

  const githubToken = process.env["GITHUB_TOKEN"];
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (githubToken) headers["Authorization"] = `Bearer ${githubToken}`;

  // Collect star counts to normalise
  const starCounts: Map<string, number> = new Map();

  for (const tool of toolList) {
    if (!tool.githubUrl) continue;

    // Extract owner/repo from github URL
    const match = tool.githubUrl.match(/github\.com\/([^/]+\/[^/]+)/);
    if (!match?.[1]) continue;

    try {
      const response = await fetch(
        `https://api.github.com/repos/${match[1]}`,
        { headers },
      );

      if (!response.ok) {
        console.warn(`[sentiment-fetcher] ${tool.slug}: GitHub API ${response.status}`);
        // Respect rate limits
        if (response.status === 403 || response.status === 429) {
          await sleep(60_000);
        }
        continue;
      }

      const data = (await response.json()) as GitHubRepoResponse;
      starCounts.set(tool.slug, data.stargazers_count);

      await sleep(750); // ~80 req/min, well within 5,000/hr limit with auth
    } catch (err) {
      console.error(`[sentiment-fetcher] ${tool.slug} error:`, err);
    }
  }

  if (starCounts.size === 0) return;

  // Normalise star counts to 0–100 using log scale
  const maxStars = Math.max(...starCounts.values(), 1);

  for (const [slug, stars] of starCounts) {
    const normalised = (Math.log10(stars + 1) / Math.log10(maxStars + 1)) * 100;
    const sentimentScore = Math.round(normalised * 100) / 100;

    await db
      .update(tools)
      .set({ sentimentScore: sentimentScore.toString(), updatedAt: new Date() })
      .where(eq(tools.slug, slug));
  }

  console.log(`[sentiment-fetcher] updated ${starCounts.size} tools`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
