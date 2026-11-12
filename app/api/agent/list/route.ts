import { agentCall } from "@/lib/near";
import { json } from "@/lib/studio";
import { verifyJob } from "@/lib/job";
import { record } from "@/lib/ledger";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Step 3: list the new token at the price the artist chose (the contract rejects anything below the owner's floor). */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  let job;
  try { job = verifyJob(body.jobToken); } catch (e) { return json({ error: (e as Error).message }, 400); }
  const tokenId = String(body.tokenId || "");
  if (!/^\d+$/.test(tokenId)) return json({ error: "bad token id" }, 400);
  const tx = await agentCall("agent_list", { token_id: tokenId, price: job.priceYocto });
  const at = Date.now();
  await record({ hash: tx.hash, signerId: tx.signerId, at, action: "agent_list", studioId: job.studioId, ok: tx.ok, error: tx.error, title: job.title, tokenId, events: tx.events });
  if (!tx.ok) return json({ error: tx.error, tx: { hash: tx.hash, ok: false, error: tx.error, at } }, 409);
  return json({ price: job.priceYocto, tx: { hash: tx.hash, ok: true, at, events: tx.events } });
}
