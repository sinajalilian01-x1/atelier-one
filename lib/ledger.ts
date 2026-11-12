import "server-only";
import { put, list } from "@vercel/blob";
import type { ChainEvent } from "./events";

export interface LedgerEntry {
  hash: string;
  signerId: string;
  at: number;
  action: string;
  studioId: string;
  ok: boolean;
  error?: string;
  title?: string;
  tokenId?: string;
  events: ChainEvent[];
}

export async function record(e: LedgerEntry) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return;
  const inv = String(9_999_999_999_999 - e.at).padStart(13, "0");
  try {
    await put(`ledger/${inv}-${e.hash}.json`, JSON.stringify(e), { access: "public", addRandomSuffix: false, allowOverwrite: true, contentType: "application/json" });
  } catch (err) { console.error("ledger record failed", err); }
}

let cache: { t: number; v: LedgerEntry[] } | null = null;
export async function recent(limit = 60): Promise<LedgerEntry[]> {
  if (cache && Date.now() - cache.t < 8000) return cache.v.slice(0, limit);
  if (!process.env.BLOB_READ_WRITE_TOKEN) return [];
  const { blobs } = await list({ prefix: "ledger/", limit: 100 });
  const sorted = blobs.sort((a, b) => a.pathname.localeCompare(b.pathname));
  const seen = new Set<string>();
  const out = (await Promise.all(sorted.map(async (b) => {
    try { const r = await fetch(b.url, { cache: "force-cache" }); return (await r.json()) as LedgerEntry; } catch { return null; }
  }))).filter((x): x is LedgerEntry => !!x && !seen.has(x.hash) && !!seen.add(x.hash));
  cache = { t: Date.now(), v: out };
  return out.slice(0, limit);
}
