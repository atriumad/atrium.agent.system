import type { NextConfig } from "next";
import { SECURITY_HEADERS } from "./lib/headers";

// No `rewrites`: Next keeps a client's X-Forwarded-For, so the API is reached only through the
// route handler in app/loyalty-api, which builds the upstream request itself.
const config: NextConfig = {
  agentRules: false,
  transpilePackages: ["@atrium/ui"],
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default config;
