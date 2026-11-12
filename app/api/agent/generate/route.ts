import { randomUUID } from "crypto";
import { agentCall } from "@/lib/near";
import { getStudio, json, validAccount } from "@/lib/studio";
import { paint } from "@/lib/ai";
import { pin } from "@/lib/ipfs";
import { signJob } from "@/lib/job";
import { record } from "@/lib/ledger";
import { DEMO_STUDIO_ID, nearToYocto, toNear } from "@/lib/config";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Step 1: the artist thinks, paints, pins to IPFS and pays for the inference out of the studio budget (on-chain). */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const studioId = body.studio || DEMO_STUDIO_ID;
  if (!validAccount(studioId)) return json({ error: "bad studio id" }, 400);
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
    description: `${art.thinking} — painted by the Atelier One agent (${AGENT_DESC(art.provider)}) for studio ${studioId}.`,
    media: pinned.url, mediaHash: pinned.media_hash,
    extra: JSON.stringify({ motif: art.motif, palette: art.paletteName, provider: art.provider, model: art.model, job_id: jobId, cid: pinned.cid, cost_usd: art.costUsd }),
    priceYocto, createdAt: Date.now(),
  };
  return json({
    job, jobToken: signJob(job),
    art: { title: art.title, thinking: art.thinking, motif: art.motif, palette: art.paletteName, mime: art.mime, svg: art.svg || null, dataUrl: art.mime === "image/png" ? `data:image/png;base64,${art.bytes.toString("base64")}` : null, media: pinned.url, cid: pinned.cid, provider: art.provider, model: art.model, costUsd: art.costUsd, costYocto: art.costYocto, price: art.price },
    tx: { hash: charge.hash, ok: true, at, events: charge.events },
  });
}
const AGENT_DESC = (p: string) => (p.startsWith("NEAR AI") ? "NEAR AI Cloud" : "local generative painter");
