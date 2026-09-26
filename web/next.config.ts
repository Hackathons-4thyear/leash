import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // @leash/shared ships TypeScript source; let Next compile it.
  transpilePackages: ["@leash/shared"],
  // Monorepo: trace dependencies from the repo root (needed on Vercel).
  outputFileTracingRoot: path.join(__dirname, ".."),
  turbopack: { root: path.join(__dirname, "..") },
  agentRules: false,
};

export default nextConfig;
