"use client";
import { useCallback, useRef, useState } from "react";
import type { StudioApi } from "./useStudio";

export type CPhase = "idle" | "quoting" | "bids" | "paying" | "painting" | "delivering" | "done" | "error";
export interface CBid { styleId: string; persona: string; style: string; human: boolean; artist?: string; artistBps: number; priceNear: number; priceYocto: string; pitch: string }
export interface CQuote { brief: string; briefHash: string; title: string; subtitle: string; details: string; subject: string; bids: CBid[]; model: string; ms: number }
export interface CTx { label: string; hash: string }
export interface CIntent { token: string; label: string; chain: string; ok: boolean; amountIn?: string; amountInUsd?: string; seconds?: number; error?: string }

async function post(url: string, body: object) {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
  if (!r.ok) throw Object.assign(new Error(j.error || `HTTP ${r.status}`), { data: j });
  return j;
}

/** Chat commission: brief → quote with three bids → pay into on-chain escrow → paint → mint to the buyer + split. */
export function useCommission(s: StudioApi) {
  const [phase, setPhase] = useState<CPhase>("idle");
  const [quote, setQuote] = useState<CQuote | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  const [txs, setTxs] = useState<CTx[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [painted, setPainted] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [intents, setIntents] = useState<{ near: number; quotes: CIntent[]; at: number } | null>(null);
  const [t0, setT0] = useState<number | null>(null);
  const [t1, setT1] = useState<number | null>(null);
  const qt = useRef<string | null>(null);

  const reset = useCallback(() => { setPhase("idle"); setQuote(null); setPick(null); setTxs([]); setError(null); setPreview(null); setResult(null); setPainted(null); setIntents(null); setT0(null); setT1(null); }, []);

  const ask = useCallback(async (brief: string) => {
    setError(null); setPhase("quoting"); setTxs([]); setPreview(null); setResult(null); setPainted(null);
    try {
      const j = await post("/api/commission/quote", { brief });
      qt.current = j.quoteToken; setQuote(j.quote); setPick(j.quote.bids[0].styleId); setPhase("bids");
    } catch (e) { setError((e as Error).message); setPhase("error"); }
  }, []);

  const loadIntents = useCallback(async (near: number) => {
    try { const r = await fetch(`/api/intents/quote?near=${near}`); const j = await r.json(); if (!j.error) setIntents({ near, quotes: j.quotes, at: j.at }); } catch {}
  }, []);

  /** pay: "demo" (the demo patron's testnet account pays) or "wallet" (your own testnet wallet signs). */
  const commission = useCallback(async (how: "demo" | "wallet", deliverTo?: string) => {
    if (!quote || !pick || !qt.current) return;
    const bid = quote.bids.find((b) => b.styleId === pick)!;
    const start = Date.now(); setT0(start); setT1(null); setError(null); setPhase("paying");
    const add = (label: string, hash?: string) => hash && setTxs((x) => [...x, { label, hash }]);
    let commissionId: string | undefined;
    try {
      if (how === "demo") {
        const j = await post("/api/commission/pay", { quoteToken: qt.current, styleId: pick });
        commissionId = j.commissionId; add(`Escrow ${bid.priceNear} NEAR (demo patron)`, j.tx.hash);
      } else {
        const j = await s.walletTx("commission", { studio_id: s.state?.demoStudioId || "sina.atelier-one.testnet", style_id: pick, brief_hash: quote.briefHash }, bid.priceYocto, 50);
        const ev = j?.tx?.events?.find((e: { event: string }) => e.event === "commissioned");
        if (!ev) throw new Error("Wallet payment not confirmed (redirect wallets: use Meteor or HERE, or the demo patron)");
        commissionId = String(ev.data.commission_id); add(`Escrow ${bid.priceNear} NEAR (your wallet)`, j.tx.hash);
      }
      setPhase("painting");
      const p = await post("/api/commission/paint", { quoteToken: qt.current, commissionId });
      add("Pay NEAR AI compute", p.tx.hash); setPreview(p.preview); setPainted(p.painted);
      setPhase("delivering");
      const d = await post("/api/commission/deliver", { paintedToken: p.paintedToken, deliverTo: how === "demo" ? deliverTo : undefined });
      add(`Mint #${d.tokenId} to buyer + split`, d.tx.hash);
      if (d.handover) add(`Hand over to ${d.handover.to}`, d.handover.hash);
      setResult({ ...d, commissionId, bid }); setT1(Date.now()); setPhase("done");
      s.refresh();
    } catch (e) {
      const data = (e as { data?: { refundTx?: string } }).data; if (data?.refundTx) add("Refund (escrow returned)", data.refundTx);
      setError((e as Error).message); setPhase("error");
    }
  }, [quote, pick, s]);

  return { phase, quote, pick, setPick, txs, error, preview, result, painted, intents, loadIntents, ask, commission, reset, t0, t1 };
}
export type CommissionApi = ReturnType<typeof useCommission>;
