import "server-only";
import { put, list } from "@vercel/blob";
import { demoOwnerCall } from "./near";
import { record } from "./ledger";
import { DEMO_STUDIO_ID } from "./config";

/** The demo studio is shared by every visitor, so its kill switch releases itself after this long. */
export const KILL_AUTO_RELEASE_MS = 60_000;
const PATH = "kill/demo-engaged.json";

export async function markDemoKillEngaged(hash: string) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return;
  try { await put(PATH, JSON.stringify({ hash, at: Date.now() }), { access: "public", addRandomSuffix: false, allowOverwrite: true, contentType: "application/json" }); } catch {}
}

async function engagedAt(): Promise<number | null> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return null;
  try { const { blobs } = await list({ prefix: PATH }); return blobs[0] ? new Date(blobs[0].uploadedAt).getTime() : null; } catch { return null; }
}

let releasing: Promise<string | null> | null = null;
/**
 * Called on every page load / state poll while the demo kill switch is engaged.
 * Returns when it will auto-release, or releases it on-chain now if the minute is up.
 */
export async function demoKillCheck(): Promise<{ releaseAt: number | null; releasedHash: string | null }> {
  const at = await engagedAt();
  const releaseAt = (at ?? 0) + KILL_AUTO_RELEASE_MS;
  if (Date.now() < releaseAt) return { releaseAt, releasedHash: null };
  if (!releasing) {
    releasing = (async () => {
      try {
        const tx = await demoOwnerCall("set_kill_switch", { engaged: false });
        await record({ hash: tx.hash, signerId: tx.signerId, at: Date.now(), action: "set_kill_switch", studioId: DEMO_STUDIO_ID, ok: tx.ok, error: tx.error, events: tx.events });
        return tx.ok ? tx.hash : null;
      } catch { return null; }
    })().finally(() => setTimeout(() => { releasing = null; }, 3000));
  }
  return { releaseAt: null, releasedHash: await releasing };
}
