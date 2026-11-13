import { quote } from "@/lib/agentapi";
import { rateLimit } from "@/lib/auth";
import { json } from "@/lib/studio";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
export async function POST(req: Request) {
  const rl = rateLimit(req, "v1quote", 20, 10 * 60_000);
  if (!rl.ok) return json({ error: `rate limited, retry in ${rl.retryAfter}s` }, 429);
  const body = await req.json().catch(() => ({}));
  try { return json(await quote(String(body.brief || ""))); } catch (e) { return json({ error: (e as Error).message }, 400); }
}
