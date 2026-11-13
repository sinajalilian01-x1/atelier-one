import { json } from "@/lib/studio";
import { payAsDemoPatron, readQuote } from "@/lib/commission";
import { rateLimit } from "@/lib/auth";
import { accountBalance } from "@/lib/near";
import { COLLECTOR_ID } from "@/lib/config";
import { persona } from "@/lib/styles";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** No wallet? The demo patron (a funded testnet account) pays the escrow on the visitor's behalf. */
export async function POST(req: Request) {
  const rl = rateLimit(req, "pay", 5, 10 * 60_000);
  if (!rl.ok) return json({ error: `The demo patron needs a breather: try again in ${rl.retryAfter}s (5 per 10 min).` }, 429);
  const body = await req.json().catch(() => ({}));
  let q;
  try { q = readQuote(body.quoteToken); } catch (e) { return json({ error: (e as Error).message }, 400); }
  if (!persona(body.styleId)) return json({ error: "Pick one of the three bids" }, 400);
  const bal = BigInt(await accountBalance(COLLECTOR_ID).catch(() => "0"));
  if (bal < 10n ** 24n) return json({ error: "The demo patron is out of testnet NEAR; connect a testnet wallet to pay yourself." }, 503);
  const tx = await payAsDemoPatron(q, body.styleId);
  if (!tx.ok || !tx.commissionId) return json({ error: tx.error || "payment failed", tx: { hash: tx.hash, ok: false } }, 409);
  return json({ commissionId: tx.commissionId, tx: { hash: tx.hash, ok: true, at: Date.now(), events: tx.events } });
}
