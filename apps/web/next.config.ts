import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@agentgraph/types"],
  experimental: {
    typedRoutes: true,
  },
};

export default nextConfig;
