import { demoOwnerCall } from "@/lib/near";
import { json } from "@/lib/studio";
import { record } from "@/lib/ledger";
import { DEMO_STUDIO_ID } from "@/lib/config";
import { rateLimit } from "@/lib/auth";
import { KILL_AUTO_RELEASE_MS, markDemoKillEngaged } from "@/lib/killswitch";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Demo owner's kill switch. Signed by the demo owner's function-call key, which can only call
 * set_kill_switch / update_rules. The demo studio is shared, so an engaged switch auto-releases
 * after 60 s (see lib/killswitch.ts) and a judge never lands on a paused demo.
 */
export async function POST(req: Request) {
  const rl = rateLimit(req, "kill", 10, 10 * 60_000);
  if (!rl.ok) return json({ error: `Too many kill-switch flips. Try again in ${rl.retryAfter}s.` }, 429);
  const body = await req.json().catch(() => ({}));
  const engaged = !!body.engaged;
  const tx = await demoOwnerCall("set_kill_switch", { engaged });
  const at = Date.now();
  if (engaged && tx.ok) await markDemoKillEngaged(tx.hash);
  await record({ hash: tx.hash, signerId: tx.signerId, at, action: "set_kill_switch", studioId: DEMO_STUDIO_ID, ok: tx.ok, error: tx.error, events: tx.events });
  return json({ engaged, releaseAt: engaged && tx.ok ? at + KILL_AUTO_RELEASE_MS : null, tx: { hash: tx.hash, ok: tx.ok, at, events: tx.events, error: tx.error } }, tx.ok ? 200 : 409);
}
