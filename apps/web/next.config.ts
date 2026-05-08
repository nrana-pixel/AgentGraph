import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  transpilePackages: ["@clerk/nextjs", "@clerk/clerk-react", "@clerk/shared"],
};
export default nextConfig;
