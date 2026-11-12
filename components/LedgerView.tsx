"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { linesFor, type EntryLike } from "@/lib/lines";
import { txUrl, accountUrl, CONTRACT_ID } from "@/lib/config";
import { fmtAmt } from "@/lib/view";

export default function LedgerView() {
  const [entries, setEntries] = useState<EntryLike[] | null>(null);
  useEffect(() => { const load = () => fetch("/api/ledger?limit=100").then((r) => r.json()).then((j) => setEntries(j.entries || [])); load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, []);
  const rows = (entries || []).flatMap((e) => linesFor(e).map((l) => ({ ...l, signer: (e as any).signerId as string })));
  return (
    <main className="lv">
      <nav><Link href="/" className="rc-logo">atelier one<span /></Link><span><Link href="/">receipt</Link> · <Link href="/clay">clay</Link></span></nav>
      <h1>Public ledger</h1>
      <p>Every cost, sale and payout the studio made, rebuilt from the <code>atelier_one</code> events of <a href={accountUrl(CONTRACT_ID)} target="_blank" rel="noreferrer">{CONTRACT_ID}</a> on NEAR testnet. Click any row to open the transaction on NEAR Rocks (the explorer recommended by explorer.testnet.near.org); every hash also works on NearBlocks.</p>
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
