import { toNear } from "./config";
import type { ChainEvent } from "./events";

export type LineKind = "cost" | "sale" | "royalty" | "payout" | "info" | "fund" | "fail";
export interface Line { key: string; label: string; sub: string; amount: string | null; kind: LineKind; hash: string; at: number; studioId: string }
export interface EntryLike { hash: string; at: number; ok: boolean; error?: string; title?: string; action: string; studioId: string; events: ChainEvent[] }

const short = (a: string) => (a && a.length > 22 ? a.slice(0, 20) + "…" : a);

export function linesFor(e: EntryLike): Line[] {
  const L: Line[] = [];
  const base = { hash: e.hash, at: e.at, studioId: e.studioId };
  if (!e.ok) {
    L.push({ ...base, key: e.hash + ":fail", label: e.action === "agent_charge_inference" ? "Agent blocked" : `Rejected: ${e.action}`, sub: e.error || "transaction failed", amount: null, kind: "fail" });
    return L;
  }
  e.events.filter((ev) => ev.standard === "atelier_one").forEach((ev, i) => {
    const d = ev.data, k = `${e.hash}:${i}`;
    switch (ev.event) {
      case "inference_paid": L.push({ ...base, key: k, label: "AI inference", sub: String(d.provider).startsWith("NEAR AI") ? `NEAR AI Cloud · ${String(d.model).split(" + ")[0]}` : "local painter · no NEAR AI key", amount: "-" + d.amount, kind: "cost" }); break;
      case "minted": L.push({ ...base, key: k, label: `Mint “${d.title}”`, sub: `NEP-171 #${d.token_id} · storage`, amount: "-" + d.storage_cost, kind: "cost" }); break;
      case "listed": L.push({ ...base, key: k, label: `List #${d.token_id} @ ${toNear(d.price, 3)}`, sub: d.floor ? `floor ${toNear(d.floor, 3)} · rule kept` : "resale listing", amount: null, kind: "info" }); break;
      case "sold": L.push({ ...base, key: k, label: `SALE “${e.title || "#" + d.token_id}”`, sub: `buyer: ${short(d.buyer_id)}`, amount: d.price, kind: "sale" }); break;
      case "resold": L.push({ ...base, key: k, label: `Resale royalty #${d.token_id}`, sub: `resold for ${toNear(d.price, 3)}`, amount: d.royalty, kind: "royalty" }); break;
      case "split_paid": {
        const ob = Number(d.split_owner_bps) / 100;
        L.push({ ...base, key: k + "o", label: `→ Owner ${ob}%`, sub: short(d.owner_id), amount: d.owner_amount, kind: "payout" });
        L.push({ ...base, key: k + "s", label: `→ Studio ${100 - ob}%`, sub: "AI budget refill", amount: d.studio_amount, kind: "payout" });
        break;
      }
      case "kill_switch": L.push({ ...base, key: k, label: d.engaged ? "Kill switch ENGAGED" : "Kill switch released", sub: `by ${short(d.studio_id)}`, amount: null, kind: "info" }); break;
      case "studio_opened": L.push({ ...base, key: k, label: "Studio opened", sub: short(d.studio_id), amount: d.deposit, kind: "fund" }); break;
      case "studio_funded": L.push({ ...base, key: k, label: "Budget top-up", sub: `from ${short(d.from)}`, amount: d.amount, kind: "fund" }); break;
      case "rules_updated": L.push({ ...base, key: k, label: "Rules updated", sub: `floor ${toNear(d.floor, 3)} · split ${d.split_owner_bps / 100}%`, amount: null, kind: "info" }); break;
    }
  });
  return L;
}

/** Studio P&L for a set of lines: sales + royalties - AI - storage. Payout lines are distributions. */
export function net(lines: Line[]): bigint {
  let n = 0n;
  for (const l of lines) if (l.amount && (l.kind === "cost" || l.kind === "sale" || l.kind === "royalty")) n += BigInt(l.amount);
  return n;
}
