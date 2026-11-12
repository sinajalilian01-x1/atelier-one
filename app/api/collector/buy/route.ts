import { collectorCall, view } from "@/lib/near";
import { json } from "@/lib/studio";
import { record } from "@/lib/ledger";
import { DEMO_COLLECTOR_MAX, DEMO_STUDIO_ID } from "@/lib/config";
import { rateLimit } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Step 4 (demo path): the demo collector account buys the listed work with real testnet NEAR. */
export async function POST(req: Request) {
  const rl = rateLimit(req, "buy", 6, 10 * 60_000);
  if (!rl.ok) return json({ error: `Demo collector is out of breath: try again in ${rl.retryAfter}s.` }, 429);
  const body = await req.json().catch(() => ({}));
  const tokenId = String(body.tokenId || "");
  if (!/^\d+$/.test(tokenId)) return json({ error: "bad token id" }, 400);
  const listing = await view<any>("get_listing", { token_id: tokenId });
  if (!listing) return json({ error: "Not listed (already sold?)" }, 404);
  if (listing.studio_id !== DEMO_STUDIO_ID) return json({ error: "The demo collector only buys from the demo studio. Buy your own studio's work from another wallet." }, 400);
  if (!listing.primary) return json({ error: "Demo collector only buys fresh primary listings" }, 400);
  if (BigInt(listing.price) > DEMO_COLLECTOR_MAX) return json({ error: "Price above the demo collector's 0.25 NEAR limit — buy it with your own wallet" }, 400);
  const token = await view<any>("nft_token", { token_id: tokenId });
  const tx = await collectorCall("buy", { token_id: tokenId }, listing.price);
  const at = Date.now();
  await record({ hash: tx.hash, signerId: tx.signerId, at, action: "buy", studioId: listing.studio_id, ok: tx.ok, error: tx.error, title: token?.metadata?.title, tokenId, events: tx.events });
  if (!tx.ok) return json({ error: tx.error, tx: { hash: tx.hash, ok: false, error: tx.error, at } }, 409);
  return json({ tx: { hash: tx.hash, ok: true, at, events: tx.events }, buyer: tx.signerId });
}
