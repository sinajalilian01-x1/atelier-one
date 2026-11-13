import { readPnl } from "@/lib/pnl";
import { json, validAccount } from "@/lib/studio";

export const dynamic = "force-dynamic";
let cache: { k: string; t: number; v: unknown } | null = null;

export async function GET(req: Request) {
  const sid = new URL(req.url).searchParams.get("studio") || undefined;
  if (sid && !validAccount(sid)) return json({ error: "bad studio id" }, 400);
  const k = sid || "";
  try {
    if (!cache || cache.k !== k || Date.now() - cache.t > 15_000) cache = { k, t: Date.now(), v: await readPnl(sid) };
    return json(cache.v);
  } catch (e) { return json({ error: String((e as Error).message || e) }, 502); }
}
