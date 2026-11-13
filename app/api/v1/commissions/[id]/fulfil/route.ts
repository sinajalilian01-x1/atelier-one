import { fulfil } from "@/lib/agentapi";
import { rateLimit } from "@/lib/auth";
import { json } from "@/lib/studio";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^\d{1,12}$/.test(id)) return json({ error: "bad id" }, 400);
  const rl = rateLimit(req, "v1fulfil", 6, 10 * 60_000);
  if (!rl.ok) return json({ error: `rate limited, retry in ${rl.retryAfter}s` }, 429);
  const body = await req.json().catch(() => ({}));
  try { return json(await fulfil(id, String(body.quoteToken || ""), body.auth)); }
  catch (e) { const err = e as Error & { status?: number; refundTx?: string }; return json({ error: err.message, refundTx: err.refundTx }, err.status || 409); }
}
