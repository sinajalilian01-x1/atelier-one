import { agentCall } from "@/lib/near";
import { json } from "@/lib/studio";
import { verifyJob } from "@/lib/job";
import { record } from "@/lib/ledger";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Step 2: mint the signed job as a NEP-171 token (NEP-177 metadata); storage is paid from the studio budget. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  let job;
  try { job = verifyJob(body.jobToken); } catch (e) { return json({ error: (e as Error).message }, 400); }
  const tx = await agentCall("agent_mint", {
    studio_id: job.studioId,
    metadata: { title: job.title, description: job.description, media: job.media, media_hash: job.mediaHash, extra: job.extra },
  });
  const at = Date.now();
  const minted = tx.events.find((e) => e.event === "minted");
  const tokenId = minted?.data?.token_id as string | undefined;
  await record({ hash: tx.hash, signerId: tx.signerId, at, action: "agent_mint", studioId: job.studioId, ok: tx.ok, error: tx.error, title: job.title, tokenId, events: tx.events });
  if (!tx.ok || !tokenId) return json({ error: tx.error || "mint failed", tx: { hash: tx.hash, ok: false, error: tx.error, at } }, 409);
  return json({ tokenId, tx: { hash: tx.hash, ok: true, at, events: tx.events } });
}
