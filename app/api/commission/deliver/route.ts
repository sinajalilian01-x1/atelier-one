import { json, validAccount } from "@/lib/studio";
import { deliver, getCommission, handOver, readPainted } from "@/lib/commission";
import { COLLECTOR_ID } from "@/lib/config";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Mint the poster straight to the buyer; one transaction also pays the artist royalty, the owner and the studio budget. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  let p;
  try { p = readPainted(body.paintedToken); } catch (e) { return json({ error: (e as Error).message }, 400); }
  const { tx, tokenId, result } = await deliver(p);
  if (!tx.ok || !tokenId) return json({ error: tx.error || "delivery failed", tx: { hash: tx.hash, ok: false } }, 409);
  let handover: { hash: string; ok: boolean; to: string; error?: string } | null = null;
  const to = String(body.deliverTo || "").trim().toLowerCase();
  if (to && validAccount(to) && to !== COLLECTOR_ID) {
    const c = await getCommission(p.commissionId);
    if (c?.buyer_id === COLLECTOR_ID) { const h = await handOver(tokenId, to); handover = { hash: h.hash, ok: h.ok, to, error: h.error }; }
  }
  return json({ tokenId, result, handover, tx: { hash: tx.hash, ok: true, at: Date.now(), events: tx.events } });
}
