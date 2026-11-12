import { randomUUID } from "crypto";
import { agentCall } from "@/lib/near";
import { getStudio, json, validAccount } from "@/lib/studio";
import { paint } from "@/lib/ai";
import { pin } from "@/lib/ipfs";
import { signJob } from "@/lib/job";
import { record } from "@/lib/ledger";
import { DEMO_STUDIO_ID, nearToYocto, toNear } from "@/lib/config";
import { rateLimit, verifyOwnerAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Step 1: the artist thinks, paints, pins to IPFS and pays for the inference out of the studio budget (on-chain). */
export async function POST(req: Request) {
  const rl = rateLimit(req, "generate", 6, 10 * 60_000);
  if (!rl.ok) return json({ error: `Easy, the artist needs a breather: try again in ${rl.retryAfter}s (6 runs per 10 min per visitor).` }, 429);
  const body = await req.json().catch(() => ({}));
  const studioId = body.studio || DEMO_STUDIO_ID;
  if (!validAccount(studioId)) return json({ error: "bad studio id" }, 400);
  // The demo studio is open to everyone. Any other studio only runs with its owner's NEP-413 signature.
  if (studioId !== DEMO_STUDIO_ID) {
    const err = await verifyOwnerAuth(studioId, body.auth);
    if (err) return json({ error: err, needAuth: true }, 401);
  }
  const studio = await getStudio(studioId);
  if (!studio) return json({ error: `No studio for ${studioId}. Open one first.` }, 404);
  const jobId = randomUUID();
  const floorNear = Number(toNear(studio.floor, 6));

  if (studio.kill_switch) {
    // Still ask the chain: the contract itself refuses, which is the proof the kill switch works.
    const tx = await agentCall("agent_charge_inference", { studio_id: studioId, amount: "1000000000000000000000", model: "-", provider: "-", job_id: jobId });
    const at = Date.now();
    await record({ hash: tx.hash, signerId: tx.signerId, at, action: "agent_charge_inference", studioId, ok: tx.ok, error: tx.error, events: tx.events });
    return json({ killed: true, tx: { hash: tx.hash, ok: tx.ok, error: tx.error, at } }, 409);
  }

  const art = await paint(jobId, studio.style, floorNear);
  const ext = art.mime === "image/png" ? "png" : "svg";
  const pinned = await pin(art.bytes, `atelier-one-${jobId}.${ext}`, art.mime);

  const charge = await agentCall("agent_charge_inference", {
    studio_id: studioId, amount: art.costYocto, model: art.model.slice(0, 80), provider: art.provider.slice(0, 60), job_id: jobId,
  });
  const at = Date.now();
  await record({ hash: charge.hash, signerId: charge.signerId, at, action: "agent_charge_inference", studioId, ok: charge.ok, error: charge.error, title: art.title, events: charge.events });
  if (!charge.ok) return json({ error: charge.error, tx: { hash: charge.hash, ok: false, error: charge.error, at } }, 409);

  const priceYocto = nearToYocto(art.price);
  const job = {
    jobId, studioId, title: art.title,
    // Kept short on purpose: every byte of metadata is paid from the studio budget as storage.
    description: art.thinking.slice(0, 140),
    media: pinned.cid, mediaHash: pinned.media_hash,
    extra: JSON.stringify({ by: AGENT_DESC(art.provider), job: jobId.slice(0, 8) }),
    priceYocto, createdAt: Date.now(),
  };
  return json({
    job, jobToken: signJob(job),
    art: { title: art.title, thinking: art.thinking, motif: art.motif, palette: art.paletteName, mime: art.mime, svg: art.svg || null, dataUrl: art.mime === "image/png" ? `data:image/png;base64,${art.bytes.toString("base64")}` : null, media: pinned.url, cid: pinned.cid, provider: art.provider, model: art.model, costUsd: art.costUsd, costYocto: art.costYocto, price: art.price },
    tx: { hash: charge.hash, ok: true, at, events: charge.events },
  });
}
const AGENT_DESC = (p: string) => (p.startsWith("NEAR AI") ? "near-ai" : "local");
