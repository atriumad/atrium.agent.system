import type { NextConfig } from "next";

const API_URL = process.env.API_URL ?? "http://localhost:3001";

const config: NextConfig = {
  agentRules: false,
  transpilePackages: ["@atrium/ui"],
  // The survey is public and the invitation token is its credential; the browser talks to this app only.
  async rewrites() {
    return [
      { source: "/survey-api/:token", destination: `${API_URL}/s/:token` },
      { source: "/survey-api/:token/info", destination: `${API_URL}/s/:token/info` },
      { source: "/qr-api/:token", destination: `${API_URL}/q/:token` },
      { source: "/onboarding-api", destination: `${API_URL}/onboarding/request` },
      { source: "/unsubscribe-api/:token", destination: `${API_URL}/u/:token` },
      { source: "/unsubscribe-api/:token/info", destination: `${API_URL}/u/:token/info` },
      { source: "/qr-api/:token/info", destination: `${API_URL}/q/:token/info` },
    ];
  },
};

export default config;
