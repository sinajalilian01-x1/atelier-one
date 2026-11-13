import { json } from "@/lib/studio";
import { checkCommission, paintCommission, readQuote, refund, signPainted } from "@/lib/commission";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Paint a paid commission. Only runs against an Open on-chain escrow that matches the quote. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  let q;
  try { q = readQuote(body.quoteToken); } catch (e) { return json({ error: (e as Error).message }, 400); }
  let c;
  try { c = await checkCommission(q, String(body.commissionId)); } catch (e) { return json({ error: (e as Error).message }, 409); }
  try {
    const { painted, charge, previewPng } = await paintCommission(q, c);
    if (!charge.ok) throw new Error(`compute charge failed: ${charge.error}`);
    return json({ painted, paintedToken: signPainted(painted), preview: `data:image/png;base64,${previewPng}`, tx: { hash: charge.hash, ok: true, at: Date.now(), events: charge.events } });
  } catch (e) {
    // Nothing gets kept for an undelivered commission: the agent refunds the escrow right away.
    const r = await refund(c.id).catch(() => null);
    return json({ error: (e as Error).message, refunded: !!r?.ok, refundTx: r?.hash }, 502);
  }
}
