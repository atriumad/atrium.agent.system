import { forwardLoyalty } from "../../../lib/proxy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const env = () => ({
  apiUrl: process.env.API_URL ?? "http://localhost:3001",
  hops: Number(process.env.QR_CARD_PROXY_HOPS ?? 0) || 0,
  proxySecret: process.env.LOYALTY_PROXY_SECRET || undefined,
});

type Ctx = { params: Promise<{ path: string[] }> };

export async function GET(req: Request, ctx: Ctx) {
  return forwardLoyalty(req, (await ctx.params).path, env());
}

export async function POST(req: Request, ctx: Ctx) {
  return forwardLoyalty(req, (await ctx.params).path, env());
}
