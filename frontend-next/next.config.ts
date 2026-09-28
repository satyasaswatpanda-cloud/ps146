import type { NextConfig } from "next";

// The FastAPI backend (backend/main.py) stays the single source of truth for
// analysis/detection/case storage. This dev-time rewrite lets the Next.js
// app call same-origin `/api/...` paths; in production, put a reverse proxy
// (nginx, Caddy, etc.) in front of both services the same way, or set
// BACKEND_ORIGIN and swap this rewrite for that value at build time.
const BACKEND_ORIGIN = process.env.BACKEND_ORIGIN || "http://127.0.0.1:8000";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${BACKEND_ORIGIN}/api/:path*` },
    ];
  },
};

export default nextConfig;
