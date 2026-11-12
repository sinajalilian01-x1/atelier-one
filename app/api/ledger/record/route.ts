import { txStatus, view } from "@/lib/near";
import { json, validAccount } from "@/lib/studio";
import { record } from "@/lib/ledger";
import { CONTRACT_ID } from "@/lib/config";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Wallet-signed transactions (real-wallet buys, studio opens, kill switch) are verified against the chain, then recorded. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const hash = String(body.hash || ""), signerId = String(body.signerId || "");
  if (!/^[1-9A-HJ-NP-Za-km-z]{43,44}$/.test(hash) || !validAccount(signerId)) return json({ error: "bad input" }, 400);
  const res = await txStatus(hash, signerId).catch((e) => { throw e; });
  const ae = res.events.find((e) => e.standard === "atelier_one");
  if (!ae) return json({ error: `No ${CONTRACT_ID} events in that transaction` }, 400);
  const sold = res.events.find((e) => e.event === "sold" || e.event === "resold");
  let title: string | undefined;
  if (sold) title = (await view<any>("nft_token", { token_id: sold.data.token_id }))?.metadata?.title;
  const at = Date.now();
  await record({ hash, signerId, at, action: sold ? "buy" : ae.event, studioId: ae.data.studio_id || "", ok: res.ok, error: res.error, title, tokenId: sold?.data?.token_id, events: res.events });
  return json({ tx: { hash, ok: res.ok, at, events: res.events, error: res.error } });
}
