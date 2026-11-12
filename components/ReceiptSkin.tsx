"use client";
import Link from "next/link";
import { useState } from "react";
import { useStudio } from "@/lib/useStudio";
import { deriveView, fmtAmt, useNow, useTyped } from "@/lib/view";
import { txUrl, accountUrl, toNear, mediaUrl } from "@/lib/config";
import { ArtCanvas } from "./ArtCanvas";
import { OwnerPanel } from "./OwnerPanel";
import { ThemeToggle } from "./ThemeToggle";
import { Toast } from "./Toast";
import { HowItWorks } from "./HowItWorks";

export default function ReceiptSkin() {
  const s = useStudio();
  const now = useNow(true);
  const v = deriveView(s, now);
  const typed = useTyped(v.thinking);
  const [panel, setPanel] = useState(false);
  const date = now === 0 ? "" : new Date(now).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZoneName: "short" }).toUpperCase();
  const stepNote = s.state?.ai?.nearAiKey ? "NEAR AI Cloud" : "local painter (fallback)";
  return (
    <div className="rc">
      <section className="rc-left">
        <nav className="rc-nav">
          <Link href="/" className="rc-logo">atelier one<span /></Link>
          <div className="rc-menu"><a href="#studio">studio</a><a href="#works">works</a><Link href="/ledger">ledger</Link><a href="#rules">rules</a></div>
          <button className="rc-wb" onClick={() => setPanel(true)}>{s.account ? s.account.replace(".testnet", "") : "Connect NEAR"}</button>
        </nav>
        <div className="rc-head">
          <h1>Watch an AI artist<br /><span>earn a living.</span><br />Live.</h1>
          <button className={`rc-start ${v.running ? "busy" : ""}`} onClick={s.start} disabled={v.running} aria-label="Start the full loop">
            {v.running ? "LIVE" : s.phase === "done" ? "AGAIN" : "START"}
            <small>{v.elapsed != null ? `${v.elapsed}s ${v.running ? "· on-chain" : "· full loop"}` : "full loop · ~1 min"}</small>
          </button>
        </div>
        <div className="rc-studio" id="studio">
          <div className="rc-cv">
            <div className="rc-tag"><b>●</b> {s.art ? `${s.phase === "done" ? "sold" : "painting"} “${s.art.title}” · ${Math.round(s.progress)}%` : s.phase === "painting" ? `sketching · ${Math.round(s.progress)}%` : "easel ready · press START"}</div>
            <ArtCanvas art={s.art} phase={s.phase} />
            {s.phase === "awaiting-buyer" && (
              <div className="rc-buy">
                <span>Listed at <b>{s.price ? toNear(s.price, 3) : ""} NEAR</b></span>
                {s.account ? <button onClick={() => s.chooseBuyer("wallet")}>Buy with my wallet</button> : <button onClick={() => setPanel(true)}>Use my wallet</button>}
                <button className="alt" onClick={() => s.chooseBuyer("demo")}>Demo collector buys {s.countdown != null ? `(${s.countdown})` : ""}</button>
              </div>
            )}
          </div>
          <div className="rc-thoughts">
            <div className="rc-card"><h4>Artist is thinking</h4><div className="rc-think">“{typed}”</div></div>
            <div className="rc-card"><h4>Loop</h4>
              {s.steps.map((st) => (
                <div key={st.key} className={`rc-st ${st.state}`}>
                  <span className="ck">{st.state === "done" ? "✓" : st.state === "fail" ? "!" : ""}</span>
                  <span className="lbl">{st.label}{st.key === "generate" ? ` · ${stepNote}` : ""}{st.state === "active" ? " · in progress" : ""}</span>
                  {st.hash && <a href={txUrl(st.hash)} target="_blank" rel="noreferrer" title={st.note}>tx↗</a>}
                </div>
              ))}
            </div>
            <div className="rc-card" id="rules"><h4>Owner rules · <a href={accountUrl(s.studioId)} target="_blank" rel="noreferrer">{s.studioId.replace(".testnet", "")}</a></h4>
              <div className="rc-rules">
                <div>Floor<b>{v.floor} NEAR</b></div>
                <div>AI cap/day<b>{v.cap.replace(/0+$/, "").replace(/\.$/, "")} N</b></div>
                <div>Split<b>{v.split} / {100 - v.split}</b></div>
                <button className={`rc-kill ${v.st?.kill_switch ? "on" : ""}`} onClick={s.toggleKill} disabled={s.killBusy || v.running || (!s.isDemo && s.account !== s.studioId)} title="Owner kill switch (on-chain)">
                  Kill switch<b>{s.killBusy ? "…" : v.st?.kill_switch ? (s.killReleaseAt && now ? `■ ENGAGED · ${Math.max(0, Math.ceil((s.killReleaseAt - now) / 1000))}s` : "■ ENGAGED") : "● armed"}</b>
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <aside className="rc-right">
        <div className="rc-printer" />
        <div className={`rc-receipt ${v.running ? "printing" : ""}`}>
          <h2>STUDIO RECEIPT</h2>
          <div className="c">{s.studioId}<br />{date}</div>
          <div className="hr" />
          <div className="rc-mode">{v.receiptMode === "run" ? "THIS RUN" : "LAST RUN"} · TESTNET</div>
          {v.lines.length === 0 && <div className="rc-empty">No lines yet. Press START.</div>}
          {v.lines.map((l) => (
            <a key={l.key} className={`l ${l.kind}`} href={txUrl(l.hash)} target="_blank" rel="noreferrer">
              <div>{l.label}<i>{l.sub}</i></div><span>{l.amount ? fmtAmt(l.amount) : l.kind === "fail" ? "✕" : "↗"}</span>
            </a>
          ))}
          <div className="hr" />
          <div className="l tot"><span>STUDIO P&amp;L<i>{100 - v.split}% share − AI − mint</i></span><span>{fmtAmt(v.pl.studioNet.toString())} N</span></div>
          <div className="l tot own"><span>OWNER&apos;S CUT<i>{v.split}% to {s.studioId.replace(".testnet", "")}</i></span><span>{fmtAmt(v.pl.owner.toString())} N</span></div>
          <div className="l small"><span>AI spend today {v.spent} of {v.cap} N cap</span><span>budget {v.budget}</span></div>
          <Link href="/ledger" className="bc" aria-label="Open the full public ledger" />
          <div className="c small">every line links to NEAR Explorer ↗ · <Link href="/ledger">full ledger</Link></div>
        </div>
        <div className="rc-fresh" id="works">
          <div className="t">FRESH OFF THE EASEL</div>
          <div className="row">
            {(s.state?.recent || []).slice(0, 3).map((t: any) => (
              <a key={t.token_id} href={mediaUrl(t.metadata?.media)} target="_blank" rel="noreferrer" title={`#${t.token_id} ${t.metadata?.title} · owner ${t.owner_id}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={mediaUrl(t.metadata?.media)} alt={t.metadata?.title} loading="lazy" />
              </a>
            ))}
            {[0, 1, 2].slice((s.state?.recent || []).length).map((i) => <span key={i} className={`ph p${i}`} />)}
          </div>
        </div>
      </aside>
      <HowItWorks s={s} skin="receipt" />
      <ThemeToggle current="receipt" />
      <Toast toast={s.toast} onClose={() => s.setToast(null)} />
      {panel && <OwnerPanel s={s} onClose={() => setPanel(false)} className="rc-modal" />}
    </div>
  );
}
