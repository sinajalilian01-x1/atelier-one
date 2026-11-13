import { json } from "@/lib/studio";
import { makeQuote } from "@/lib/commission";
import { rateLimit } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Free: brief in, poster copy + three bids out (each a real on-chain style with its own price). */
export async function POST(req: Request) {
  const rl = rateLimit(req, "quote", 20, 10 * 60_000);
  if (!rl.ok) return json({ error: `Too many quotes: try again in ${rl.retryAfter}s.` }, 429);
  const body = await req.json().catch(() => ({}));
  try {
    const { quote, token } = await makeQuote(String(body.brief || ""));
    return json({ quote, quoteToken: token });
  } catch (e) { return json({ error: (e as Error).message }, 400); }
}
