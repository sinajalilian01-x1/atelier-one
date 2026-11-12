import { demoOwnerCall } from "@/lib/near";
import { json } from "@/lib/studio";
import { record } from "@/lib/ledger";
import { DEMO_STUDIO_ID } from "@/lib/config";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Demo owner's kill switch. Signed by the demo owner's function-call key, which can only call set_kill_switch / update_rules. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const engaged = !!body.engaged;
  const tx = await demoOwnerCall("set_kill_switch", { engaged });
  const at = Date.now();
  await record({ hash: tx.hash, signerId: tx.signerId, at, action: "set_kill_switch", studioId: DEMO_STUDIO_ID, ok: tx.ok, error: tx.error, events: tx.events });
  return json({ engaged, tx: { hash: tx.hash, ok: tx.ok, at, events: tx.events, error: tx.error } }, tx.ok ? 200 : 409);
}
