import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Phase 0 runs entirely against local fixture JSON (offline non-negotiable,
  // docs/SPEC.md section 12). No remote images, no rewrites yet.
  // Pin the workspace root to this app dir; parent folders contain unrelated
  // lockfiles (repo root, user home) that confuse Next.js root inference.
  outputFileTracingRoot: __dirname,
};

export default nextConfig;
