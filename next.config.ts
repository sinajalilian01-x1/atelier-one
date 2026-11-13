import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: { unoptimized: true },
  // native SVG renderer + the poster fonts it reads from disk
  serverExternalPackages: ["@resvg/resvg-js"],
  outputFileTracingIncludes: { "/api/**": ["./assets/fonts/**"] },
  devIndicators: false,
  async redirects() {
    return [
      { source: "/", has: [{ type: "query", key: "theme", value: "clay" }], destination: "/clay", permanent: false },
      { source: "/", has: [{ type: "query", key: "theme", value: "receipt" }], destination: "/receipt", permanent: false },
    ];
  },
};

export default nextConfig;
