"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { linesFor, type EntryLike } from "@/lib/lines";
import { txUrl, accountUrl, CONTRACT_ID } from "@/lib/config";
import { fmtAmt } from "@/lib/view";

interface Pnl {
  agent: string; studio: string; nearUsd: number; revenue: string; royaltiesResale: string; ownerPaid: string; artistPaid: string; studioIn: string; compute: string; storage: string; studioNet: string; budget: string;
  works: { minted: number; sold: number }; commissions: { delivered: number; refunded: number; open: number; revenue: string };
  artists: { style: string; name: string; artist: string; bps: number; works: number; earned: string }[];
}
const n = (y: string) => Number(BigInt(y || "0")) / 1e24;
const N = (y: string, d = 3) => n(y).toFixed(d);
const usd = (y: string, p: number) => `$${(n(y) * p).toFixed(2)}`;

export default function LedgerView() {
  const [entries, setEntries] = useState<EntryLike[] | null>(null);
  const [p, setP] = useState<Pnl | null>(null);
  useEffect(() => {
    const load = () => {
      fetch("/api/ledger?limit=100").then((r) => r.json()).then((j) => setEntries(j.entries || [])).catch(() => {});
      fetch("/api/pnl").then((r) => r.json()).then((j) => !j.error && setP(j)).catch(() => {});
    };
    load(); const t = setInterval(load, 15000); return () => clearInterval(t);
  }, []);
  const rows = (entries || []).flatMap((e) => linesFor(e).map((l) => ({ ...l, signer: (e as { signerId?: string }).signerId || "" })));
  const net = p ? n(p.studioNet) : 0;
  return (
    <main className="lv">
      <nav><Link href="/" className="lv-logo">Atelier One</Link><span><Link href="/">studio</Link> · <a href="/#gallery">gallery</a> · <a href="/AGENTS.md">agents API</a></span></nav>
      <h1>The painter&apos;s P&amp;L</h1>
      <p>She earns from commissions and sales, and pays for her own NEAR AI compute and mint storage out of her studio budget. These totals are read live from contract state on <a href={accountUrl(CONTRACT_ID)} target="_blank" rel="noreferrer">{CONTRACT_ID}</a> (NEAR testnet), not from our database. USD at the current NEAR price, for scale only.</p>
      {p ? (
        <section className="lv-board" aria-label="Profit and loss">
          <div className="lv-k big"><small>Revenue (sales + commissions)</small><b>{N(p.revenue)} Ⓝ</b><i>{usd(p.revenue, p.nearUsd)}</i></div>
          <div className="lv-k"><small>→ paid to human artists</small><b>{N(p.artistPaid, 4)} Ⓝ</b><i>{p.artists.map((a) => `${a.name.split(" ·")[0]} ${a.bps / 100}%`).join(", ") || "none"}</i></div>
          <div className="lv-k"><small>→ paid to the studio owner</small><b>{N(p.ownerPaid, 4)} Ⓝ</b><i>{p.studio}</i></div>
          <div className="lv-k"><small>→ kept by the agent (studio share)</small><b>{N(p.studioIn, 4)} Ⓝ</b><i>{usd(p.studioIn, p.nearUsd)}</i></div>
          <div className="lv-k cost"><small>Compute she paid (NEAR AI)</small><b>−{N(p.compute, 4)} Ⓝ</b><i>{usd(p.compute, p.nearUsd)}</i></div>
          <div className="lv-k cost"><small>Mint storage she paid</small><b>−{N(p.storage, 4)} Ⓝ</b><i>{usd(p.storage, p.nearUsd)}</i></div>
          <div className={`lv-k big ${net >= 0 ? "pos" : "neg"}`}><small>Agent net (share − compute − storage)</small><b>{net >= 0 ? "+" : ""}{net.toFixed(4)} Ⓝ</b><i>budget now {N(p.budget)} Ⓝ</i></div>
          <div className="lv-k"><small>Commissions</small><b>{p.commissions.delivered} delivered</b><i>{p.commissions.open} open · {p.commissions.refunded} refunded · {p.works.minted} works minted</i></div>
        </section>
      ) : <p>Reading the contract…</p>}
      <h2>Every line, with its transaction</h2>
      <p>Rebuilt from the <code>atelier_one</code> events in each transaction this app has sent or seen. Click any row to open it on NEAR Rocks.</p>
      {!entries ? <p>Loading…</p> : (
        <div className="lv-table" role="table">
          <div className="lv-row head" role="row"><span>time</span><span>line</span><span>detail</span><span>signer · tx</span><span>NEAR</span></div>
          {rows.map((l) => (
            <a key={l.key} className={`lv-row ${l.kind}`} href={txUrl(l.hash)} target="_blank" rel="noreferrer" role="row">
              <span>{new Date(l.at).toLocaleString("en-GB", { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
              <span>{l.label}</span><span>{l.sub}</span><span>{l.signer} · {l.hash.slice(0, 6)}…</span><span>{l.amount ? fmtAmt(l.amount, 4) : "—"}</span>
            </a>
          ))}
        </div>
      )}
    </main>
  );
}
