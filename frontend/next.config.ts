import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Pin tracing root to this app — a stray lockfile above the repo would
  // otherwise nest server.js at .next/standalone/<repo>/frontend/server.js
  // and break the systemd unit's ExecStart path.
  outputFileTracingRoot: path.join(__dirname),
  async headers() {
    return [
      {
        // The admin console is a hidden per-deployment path — keep it out of
        // every search index and tell clients not to cache it.
        source: "/nx/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
          { key: "Cache-Control", value: "no-store" },
        ],
      },
    ];
  },
};

export default nextConfig;
