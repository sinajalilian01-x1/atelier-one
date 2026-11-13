import { view } from "./near";
import { nearUsd } from "./ai";
import { DEMO_STUDIO_ID, CONTRACT_ID, AGENT_ID } from "./config";

/** The agent's public P&L, read straight from contract state (not from our own logs). All amounts are yoctoNEAR strings. */
export async function readPnl(studioId = DEMO_STUDIO_ID) {
  const [s, styles, commissions, usd] = await Promise.all([
    view<Record<string, any> | null>("get_studio", { studio_id: studioId }), // eslint-disable-line @typescript-eslint/no-explicit-any
    view<Record<string, any>[]>("get_styles"), // eslint-disable-line @typescript-eslint/no-explicit-any
    view<Record<string, any>[]>("get_commissions", { from_index: 0, limit: 200 }), // eslint-disable-line @typescript-eslint/no-explicit-any
    nearUsd(),
  ]);
  if (!s) throw new Error("studio not found");
  const B = (x: unknown) => BigInt(String(x ?? "0"));
  const mine = commissions.filter((c) => c.studio_id === studioId);
  const delivered = mine.filter((c) => c.status === "Delivered"), refunded = mine.filter((c) => c.status === "Refunded"), open = mine.filter((c) => c.status === "Open");
  const artists = styles.filter((st) => st.artist_id).map((st) => ({ style: st.id, name: st.name, artist: st.artist_id, bps: st.artist_bps, works: st.works, earned: String(st.artist_earned_total) }));
  const artistTotal = artists.reduce((a, x) => a + B(x.earned), 0n);
  const compute = B(s.ai_spent_total), storage = B(s.storage_spent_total), studioIn = B(s.studio_earned_total);
  return {
    contract: CONTRACT_ID, agent: AGENT_ID, studio: studioId, nearUsd: usd, at: Date.now(),
    revenue: String(s.revenue_total), royaltiesResale: String(s.royalties_total), ownerPaid: String(s.owner_earned_total), artistPaid: String(artistTotal),
    studioIn: String(studioIn), compute: String(compute), storage: String(storage), studioNet: String(studioIn - compute - storage), budget: String(s.budget),
    works: { minted: s.works_minted, sold: s.works_sold }, commissions: { delivered: delivered.length, refunded: refunded.length, open: open.length, revenue: String(delivered.reduce((a, c) => a + B(c.price), 0n)) },
    artists,
  };
}
