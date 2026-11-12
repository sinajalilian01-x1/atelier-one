import { view, accountBalance } from "@/lib/near";
import { getStudio, json, validAccount } from "@/lib/studio";
import { aiMode } from "@/lib/ai";
import { demoKillCheck } from "@/lib/killswitch";
import { AGENT_ID, COLLECTOR_ID, CONTRACT_ID, DEMO_STUDIO_ID } from "@/lib/config";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const u = new URL(req.url);
  const sid = u.searchParams.get("studio") || DEMO_STUDIO_ID;
  if (!validAccount(sid)) return json({ error: "bad studio id" }, 400);
  try {
    let [studio, config, supply, agentBalance, collectorBalance] = await Promise.all([
      getStudio(sid),
      view<any>("get_config"),
      view<string>("nft_total_supply"),
      accountBalance(AGENT_ID),
      accountBalance(COLLECTOR_ID),
    ]);
    let killReleaseAt: number | null = null;
    if (sid === DEMO_STUDIO_ID && studio?.kill_switch) {
      const k = await demoKillCheck();
      killReleaseAt = k.releaseAt;
      if (k.releasedHash) studio = await getStudio(sid);
    }
    const total = Number(supply);
    const from = Math.max(0, total - 9);
    const recent = total ? await view<any[]>("nft_tokens", { from_index: String(from), limit: 9 }) : [];
    return json({
      contractId: CONTRACT_ID, agentId: AGENT_ID, collectorId: COLLECTOR_ID, demoStudioId: DEMO_STUDIO_ID,
      studio, killReleaseAt, config, recent: recent.reverse(), agentBalance, collectorBalance, ai: aiMode(),
    });
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 502);
  }
}
