import "server-only";
import { view } from "./near";

export interface Studio {
  owner_id: string; name: string; style: string; floor: string; split_owner_bps: number; royalty_bps: number;
  daily_ai_cap: string; budget: string; spent_today: string; kill_switch: boolean; works_minted: number; works_sold: number;
  ai_spent_total: string; storage_spent_total: string; revenue_total: string; owner_earned_total: string; studio_earned_total: string; royalties_total: string;
}
export async function getStudio(id: string): Promise<Studio | null> {
  return (await view<Studio | null>("get_studio", { studio_id: id })) || null;
}
export function validAccount(id: unknown): id is string {
  return typeof id === "string" && /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/.test(id) && id.length >= 2 && id.length <= 64;
}
export const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "cache-control": "no-store" } });
