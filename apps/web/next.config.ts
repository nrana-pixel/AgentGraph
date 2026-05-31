import type { NextConfig } from "next";
import { join } from "node:path";

const nextConfig: NextConfig = {
  // Emit a self-contained server bundle for the production Docker image
  // (apps/web/Dockerfile copies .next/standalone and runs server.js).
  output: "standalone",
  // In a monorepo, trace workspace deps from the repo root so the standalone
  // copy includes them.
  outputFileTracingRoot: join(import.meta.dirname, "../../"),
  transpilePackages: ["@clerk/nextjs", "@clerk/clerk-react", "@clerk/shared"],
};
export default nextConfig;
