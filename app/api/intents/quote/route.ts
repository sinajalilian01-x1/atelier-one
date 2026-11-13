import { json } from "@/lib/studio";
import { dryQuotes } from "@/lib/intents";
import { rateLimit } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 20;
const cache = new Map<string, { t: number; v: unknown }>();

/** Live NEAR Intents 1Click prices (mainnet, dry/read-only) for paying `near` NEAR in other tokens. */
export async function GET(req: Request) {
  const near = Number(new URL(req.url).searchParams.get("near"));
  if (!(near > 0 && near <= 10)) return json({ error: "near must be in (0, 10]" }, 400);
  const key = near.toFixed(3);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < 20_000) return json(hit.v);
  const rl = rateLimit(req, "intents", 20, 60_000);
  if (!rl.ok) return json({ error: "slow down" }, 429);
  const yocto = BigInt(Math.round(near * 1000)) * 10n ** 21n;
  const v = { near, dry: true, settlement: "testnet NEAR (NEAR Intents has no testnet; mainnet settlement is not enabled in this build)", ...(await dryQuotes(yocto.toString())) };
  cache.set(key, { t: Date.now(), v });
  return json(v);
}
