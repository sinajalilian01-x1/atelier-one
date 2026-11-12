"use client";
import { useEffect, useState } from "react";
import type { StudioApi } from "@/lib/useStudio";
import { toNear, accountUrl } from "@/lib/config";

export function OwnerPanel({ s, onClose, className = "" }: { s: StudioApi; onClose: () => void; className?: string }) {
  const [own, setOwn] = useState<any>(undefined);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ name: "My Atelier", style: "Sunny naive landscapes, bold outlines, lime + coral", floor: "0.05", cap: "0.2", split: 70, royalty: 10, budget: "0.5" });
  useEffect(() => {
    if (!s.account) { setOwn(undefined); return; }
    fetch(`/api/state?studio=${s.account}`).then((r) => r.json()).then((j) => setOwn(j.studio || null)).catch(() => setOwn(null));
  }, [s.account, s.state]);
  const set = (k: string, v: any) => setF((x) => ({ ...x, [k]: v }));
  return (
    <div className={`ao-modal ${className}`} role="dialog" aria-modal onClick={onClose}>
      <div className="ao-sheet" onClick={(e) => e.stopPropagation()}>
        <button className="ao-x" onClick={onClose} aria-label="Close">×</button>
        <h3>Own a studio</h3>
        {!s.account ? (
          <>
            <p>Connect a NEAR <b>testnet</b> wallet to open your own studio (you fund the AI budget and set the rules) or to buy the artist&apos;s work yourself. No wallet? Just press Start: the demo owner and demo collector use real testnet accounts.</p>
            <button className="ao-btn" onClick={() => s.connect()}>Connect NEAR wallet</button>
          </>
        ) : (
          <>
            <p>Connected as <a href={accountUrl(s.account)} target="_blank" rel="noreferrer"><b>{s.account}</b></a> · <button className="ao-link" onClick={() => s.disconnect()}>disconnect</button></p>
            {own === undefined ? <p>Checking your studio…</p> : own ? (
              <>
                <div className="ao-kv"><span>Budget</span><b>{toNear(own.budget, 3)} N</b><span>Floor</span><b>{toNear(own.floor, 3)} N</b><span>AI cap/day</span><b>{toNear(own.daily_ai_cap, 3)} N</b><span>Split</span><b>{own.split_owner_bps / 100} / {100 - own.split_owner_bps / 100}</b><span>Royalty</span><b>{own.royalty_bps / 100}%</b><span>Kill switch</span><b>{own.kill_switch ? "ENGAGED" : "armed"}</b></div>
                {s.studioId === s.account ? (
                  <><p>The artist is working for <b>your</b> studio. Press Start; sales pay your wallet {own.split_owner_bps / 100}%.</p>
                    <button className="ao-btn ghost" onClick={() => s.useStudioOf(s.state.demoStudioId)}>Back to the demo studio</button></>
                ) : <button className="ao-btn" onClick={() => { s.useStudioOf(s.account!); onClose(); }}>Run my studio</button>}
              </>
            ) : (
              <form className="ao-form" onSubmit={async (e) => { e.preventDefault(); setBusy(true); try { await s.openStudio(f); } catch (err) { alert((err as Error).message); } setBusy(false); }}>
                <label>Studio name<input value={f.name} onChange={(e) => set("name", e.target.value)} maxLength={64} /></label>
                <label>Style / theme<input value={f.style} onChange={(e) => set("style", e.target.value)} maxLength={280} /></label>
                <div className="ao-row">
                  <label>Price floor (NEAR)<input type="number" step="0.01" min="0.01" value={f.floor} onChange={(e) => set("floor", e.target.value)} /></label>
                  <label>AI cap / day (NEAR)<input type="number" step="0.01" min="0.001" value={f.cap} onChange={(e) => set("cap", e.target.value)} /></label>
                </div>
                <div className="ao-row">
                  <label>Owner split %<input type="number" min="0" max="100" value={f.split} onChange={(e) => set("split", Number(e.target.value))} /></label>
                  <label>Resale royalty %<input type="number" min="0" max="25" value={f.royalty} onChange={(e) => set("royalty", Number(e.target.value))} /></label>
                </div>
                <label>Starting AI budget (NEAR, min 0.1)<input type="number" step="0.1" min="0.1" value={f.budget} onChange={(e) => set("budget", e.target.value)} /></label>
                <button className="ao-btn" disabled={busy}>{busy ? "Waiting for wallet…" : `Open studio & fund ${f.budget} NEAR`}</button>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  );
}
