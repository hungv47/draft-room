import type { NextConfig } from "next";

// Fully static: no server, no env vars. BASE_PATH lets the same build sit under a sub-path
// (e.g. GitHub Pages) without touching code.
const basePath = process.env.BASE_PATH?.replace(/\/$/, "") || undefined;

const nextConfig: NextConfig = {
  output: "export",
  basePath,
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
  // Pin the workspace root so a stray lockfile higher up the tree cannot change the build.
  turbopack: { root: import.meta.dirname },
};

export default nextConfig;
