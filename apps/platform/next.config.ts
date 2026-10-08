import type { NextConfig } from "next";

const API_URL = process.env.API_URL ?? "http://localhost:3001";

const config: NextConfig = {
  // Next writes AGENTS.md and CLAUDE.md into the app on first run; the repo has its own.
  agentRules: false,
  transpilePackages: ["@atrium/ui"],
  // The browser talks to this app only; sign-in cookies stay same-origin and need no CORS.
  async redirects() {
    return [{ source: "/surveys", destination: "/reputation/responses", permanent: false }];
  },
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_URL}/api/:path*` }];
  },
};

export default config;
