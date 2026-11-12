"use client";
import Link from "next/link";
import { useState } from "react";
import { useStudio } from "@/lib/useStudio";
import { deriveView, fmtAmt, useNow, useTyped } from "@/lib/view";
import { txUrl, toNear, mediaUrl } from "@/lib/config";
import { ArtCanvas } from "./ArtCanvas";
import { OwnerPanel } from "./OwnerPanel";
import { ThemeToggle } from "./ThemeToggle";
import { Toast } from "./Toast";
import { HowItWorks } from "./HowItWorks";

const ICON: Record<string, [string, string]> = { cost: ["⚡", "#FFE7D6"], sale: ["🛍", "#FFF1C9"], payout: ["💸", "#DDF0FB"], royalty: ["🔁", "#E6F3EF"], info: ["📌", "#F0F5F3"], fund: ["🪙", "#E6F3EF"], fail: ["⛔", "#FFE0E0"] };
const CHIP: Record<string, string> = { generate: "Generate", mint: "Mint", list: "List", buy: "Buy", split: "Split" };

function Painter({ active }: { active: boolean }) {
  return (
    <svg className={`cl-painter ${active ? "on" : ""}`} width="180" height="230" viewBox="0 0 180 230" aria-hidden>
      <defs>
        <radialGradient id="cl" cx="35%" cy="30%"><stop offset="0" stopColor="#FFE0C7" /><stop offset="1" stopColor="#FFAE85" /></radialGradient>
        <radialGradient id="be" cx="35%" cy="30%"><stop offset="0" stopColor="#FF8FA8" /><stop offset="1" stopColor="#E8507A" /></radialGradient>
      </defs>
      <ellipse cx="95" cy="222" rx="60" ry="8" fill="#c9784433" />
      <path d="M40 210 Q30 110 95 100 Q160 110 150 210Z" fill="url(#cl)" />
      <g className="cl-head"><circle cx="95" cy="80" r="52" fill="url(#cl)" />
        <ellipse cx="88" cy="36" rx="48" ry="18" fill="url(#be)" transform="rotate(-12 88 36)" /><circle cx="66" cy="22" r="7" fill="#E8507A" />
        <g className="cl-eyes"><circle cx="78" cy="82" r="6" fill="#23423B" /><circle cx="110" cy="82" r="6" fill="#23423B" /></g><circle cx="80" cy="80" r="2" fill="#fff" /><circle cx="112" cy="80" r="2" fill="#fff" />
        <path d="M84 100 Q94 108 104 100" stroke="#23423B" strokeWidth="4" fill="none" strokeLinecap="round" />
        <ellipse cx="66" cy="96" rx="9" ry="5" fill="#FF8A8A" opacity=".6" /><ellipse cx="124" cy="96" rx="9" ry="5" fill="#FF8A8A" opacity=".6" /></g>
      <g className="cl-arm"><path d="M50 150 Q20 140 10 110" stroke="#FFB892" strokeWidth="20" fill="none" strokeLinecap="round" />
        <rect x="-2" y="60" width="10" height="60" rx="5" fill="#FFB443" transform="rotate(-25 5 90)" /></g>
      <ellipse cx="120" cy="170" rx="34" ry="22" fill="#fff" /><circle cx="108" cy="164" r="6" fill="#FF6A4D" /><circle cx="124" cy="160" r="6" fill="#3CCB9A" /><circle cx="136" cy="172" r="6" fill="#FFB443" />
    </svg>
  );
}

export default function ClaySkin() {
  const s = useStudio();
  const now = useNow(true);
  const v = deriveView(s, now);
  const typed = useTyped(v.thinking);
  const [panel, setPanel] = useState(false);
  const st = v.st;
  const ledgerLines = (s.runLines.length ? [...s.runLines].reverse() : s.globalLines.filter((l) => l.studioId === s.studioId)).slice(0, 6);
  return (
    <div className="cl">
      <nav className="cl-nav clay">
        <Link href="/clay" className="cl-logo"><span className="blob" />Atelier One</Link>
        <div className="m"><a href="#studio">Studio</a><a href="#collection">Collection</a><Link href="/ledger">Ledger</Link><a href="#faq">FAQ</a></div>
        <button className="pill" onClick={() => setPanel(true)}>{s.account ? s.account.replace(".testnet", "") : "Connect NEAR"}</button>
      </nav>
      <div className="cl-wrap" id="studio">
        <div className="cl-intro">
          <h1>Meet the artist who <span>pays her own bills.</span></h1>
          <p className="sub">A friendly AI painter with her own NEAR account. She buys her AI time, mints every piece, sells to collectors and splits the money with you, automatically.</p>
          <button className="cl-start" onClick={s.start} disabled={v.running}>
            <span className="play" />{v.running ? `Working… ${v.elapsed ?? 0}s` : s.phase === "done" ? `Again (${v.elapsed}s)` : "Start studio"}
          </button>
          <div className="mini">
            <div className="clay"><b>{s.state?.config?.total_supply ?? "…"}</b>works minted</div>
            <div className="clay"><b>{st?.works_sold ?? "…"}</b>sold</div>
            <div className="clay"><b>{st ? toNear(st.owner_earned_total, 2) : "…"} <small>NEAR</small></b>paid to owner · testnet</div>
          </div>
        </div>
        <div className="cl-desk">
          <div className="top" />
          <div className="canvasc clay">
            <ArtCanvas art={s.art} phase={s.phase} brush="#FFB443" tip="#FF6A4D" idlePalette={2} />
            {s.phase === "awaiting-buyer" && (
              <div className="cl-buy clay">
                <b>Listed at {s.price ? toNear(s.price, 3) : ""} NEAR</b>
                {s.account ? <button onClick={() => s.chooseBuyer("wallet")}>Buy with my wallet</button> : <button onClick={() => setPanel(true)}>Use my wallet</button>}
                <button className="alt" onClick={() => s.chooseBuyer("demo")}>Demo collector {s.countdown != null ? `(${s.countdown})` : ""}</button>
              </div>
            )}
          </div>
          <div className="cl-bubble clay">{typed}</div>
          <Painter active={v.running} />
          <div className="status clay">
            <div className="hd"><span>🎨 {s.art ? `${s.phase === "done" ? "Sold" : "Painting"} “${s.art.title}”` : s.phase === "painting" ? "Sketching…" : "Easel ready"}</span><span>{Math.round(s.progress)}%</span></div>
            <div className="bar"><div style={{ width: `${s.progress}%` }} /></div>
            <div className="chips">
              {s.steps.map((x) => x.hash
                ? <a key={x.key} className={x.state === "done" ? "ok" : x.state === "fail" ? "bad" : "now"} href={txUrl(x.hash)} target="_blank" rel="noreferrer">{CHIP[x.key]} ↗</a>
                : <span key={x.key} className={x.state === "active" ? "now" : x.state === "fail" ? "bad" : ""}>{CHIP[x.key]}</span>)}
            </div>
          </div>
        </div>
        <div className="cl-side">
          <div className="clay" id="rules"><h3>{s.isDemo ? "Owner rules" : "Your rules"} <small>{s.studioId.replace(".testnet", "")}</small></h3>
            <div className="rr"><span>Style</span><b title={st?.style}>{st ? st.style.split(/[:.,]/)[0].split(" ").slice(0, 3).join(" ") : "…"}</b></div>
            <div className="rr"><span>Price floor</span><b>{v.floor} NEAR</b></div>
            <div className="rr"><span>AI budget / day</span><b>{v.cap.replace(/0+$/, "").replace(/\.$/, "")} NEAR</b></div>
            <div className="rr"><span>You / Studio</span><b>{v.split}% · {100 - v.split}%</b></div>
            <div className="rr"><span>Kill switch{st?.kill_switch && s.killReleaseAt && now ? <small className="auto"> · auto-release {Math.max(0, Math.ceil((s.killReleaseAt - now) / 1000))}s</small> : null}</span>
              <button className={`sw ${st?.kill_switch ? "off" : ""}`} onClick={s.toggleKill} disabled={s.killBusy || v.running || (!s.isDemo && s.account !== s.studioId)} aria-label={st?.kill_switch ? "Release kill switch" : "Engage kill switch"} title={st?.kill_switch ? "ENGAGED: agent paused on-chain. Click to release." : "Armed: click to pause the agent on-chain"} />
            </div>
          </div>
          <div className="clay"><h3>Ledger <Link href="/ledger" className="live">● live · all ↗</Link></h3>
            {ledgerLines.length === 0 && <div className="lg"><span>Press Start to fill me up</span></div>}
            {ledgerLines.map((l) => (
              <a key={l.key} className="lg" href={txUrl(l.hash)} target="_blank" rel="noreferrer">
                <span><span className="ic" style={{ background: ICON[l.kind][1] }}>{ICON[l.kind][0]}</span>{l.label}</span>
                <span className={l.kind === "cost" ? "neg" : l.kind === "sale" || l.kind === "royalty" ? "pos" : ""}>{l.amount ? fmtAmt(l.amount) : "↗"}</span>
              </a>
            ))}
            <div className="lg tot"><span>AI spent today</span><span>{v.spent} / {v.cap.replace(/0+$/, "").replace(/\.$/, "")}</span></div>
          </div>
        </div>
      </div>
      <section className="cl-collection" id="collection">
        <h2>Fresh off the easel</h2>
        <div className="row">
          {(s.state?.recent || []).slice(0, 6).map((t: any) => (
            <a key={t.token_id} className="clay" href={mediaUrl(t.metadata?.media)} target="_blank" rel="noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={mediaUrl(t.metadata?.media)} alt={t.metadata?.title} loading="lazy" />
              <b>{t.metadata?.title}</b><small>#{t.token_id} · {t.owner_id.replace(".testnet", "")}</small>
            </a>
          ))}
        </div>
      </section>
      <div id="faq"><HowItWorks s={s} skin="clay" /></div>
      <ThemeToggle current="clay" />
      <Toast toast={s.toast} onClose={() => s.setToast(null)} />
      {panel && <OwnerPanel s={s} onClose={() => setPanel(false)} className="cl-modal" />}
    </div>
  );
}
