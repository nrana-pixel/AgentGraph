import { auth } from "@clerk/nextjs/server";
import RecommendationsClient from "./RecommendationsClient.js";

export default async function RecommendationsPage() {
  const { getToken } = await auth();
  const token = (await getToken()) ?? "";

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold">Recommendations</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Describe your task and get ranked tool suggestions based on reliability, latency,
          popularity, and community sentiment.
        </p>
      </div>

      <RecommendationsClient token={token} />
    </div>
  );
}
