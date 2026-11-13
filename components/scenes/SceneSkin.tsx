"use client";
// Shared UI for the four 3D skins (/s/lake, /s/island, /s/fox, /s/robot).
// Same real loop and data as / and /clay: useStudio() drives generate → mint → list → buy → split on NEAR testnet.
import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useStudio } from "@/lib/useStudio";
import { deriveView, fmtAmt, useNow, useTyped } from "@/lib/view";
import { mediaUrl, toNear, txUrl, accountUrl } from "@/lib/config";
import { Lofi, PRESETS } from "@/lib/lofi";
import { ArtCanvas } from "../ArtCanvas";
import { OwnerPanel } from "../OwnerPanel";
import { Toast } from "../Toast";
import type { ArtSource } from "./kit";
import { SKINS, SKIN_KEYS, type SceneKey } from "./skins";

const Scene3D = dynamic(() => import("./Scene3D"), { ssr: false, loading: () => null });

const ORDER = SKIN_KEYS;
const STEP_LABEL: Record<string, string> = { generate: "Paint", mint: "Mint", list: "List", buy: "Buy", split: "Split" };

function Logo() {
  return (
    <svg viewBox="0 0 40 36" width="34" height="31" aria-hidden className="sk-mark">
      <path d="M20 2 L38 34 H2 Z" fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
      <path d="M20 2 L26 22 L20 34 L14 22 Z" fill="currentColor" opacity=".55" />
      <path d="M14 22 H26" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function useWebGLMode() {
  const [mode, setMode] = useState<"pending" | "3d" | "lite" | "none">("pending");
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    let ok = false;
    try { const c = document.createElement("canvas"); ok = !!(c.getContext("webgl2") || c.getContext("webgl")); } catch {}
    if (!ok || q.get("3d") === "0") return setMode("none");
    const lite = q.get("lite") === "1" || matchMedia("(max-width: 820px), (pointer: coarse)").matches || (navigator.hardwareConcurrency || 8) <= 4;
    setMode(lite ? "lite" : "3d");
  }, []);
  return mode;
}

function MusicChip({ skin, playing, muted, onPlay, onMute, lofi }: { skin: SceneKey; playing: boolean; muted: boolean; onPlay: () => void; onMute: () => void; lofi: React.RefObject<Lofi | null> }) {
  const bars = useRef<(HTMLSpanElement | null)[]>([]);
  useEffect(() => {
    if (!playing) { bars.current.forEach((b) => b && (b.style.transform = "scaleY(.15)")); return; }
    let raf = 0;
    const loop = () => { const v = lofi.current?.bands(7) || []; bars.current.forEach((b, i) => b && (b.style.transform = `scaleY(${Math.max(0.12, Math.min(1, (v[i] || 0) * 2.2))})`)); raf = requestAnimationFrame(loop); };
    loop(); return () => cancelAnimationFrame(raf);
  }, [playing, lofi]);
  return (
    <div className="sk-card sk-music" data-playing={playing}>
      <span className="disc" aria-hidden />
      <div className="mt">
        <b>{PRESETS[skin].name}</b>
        <small>{playing ? (muted ? "muted" : "now playing") : "studio radio"} · generated live</small>
        <span className="eq" aria-hidden>{Array.from({ length: 7 }, (_, i) => <span key={i} ref={(el) => { bars.current[i] = el; }} />)}</span>
      </div>
      <button className="mb" onClick={onMute} aria-label={muted ? "Unmute music" : "Mute music"} title={muted ? "Unmute" : "Mute"} disabled={!playing}>{muted ? "🔇" : "🔊"}</button>
      <button className="pb" onClick={onPlay} aria-label={playing ? "Pause music" : "Play music"}>{playing ? <i className="pause" /> : <i className="play" />}</button>
    </div>
  );
}

export default function SceneSkin({ skin }: { skin: SceneKey }) {
  const s = useStudio();
  const now = useNow(true);
  const v = deriveView(s, now);
  const typed = useTyped(v.thinking);
  const mode = useWebGLMode();
  const [ready, setReady] = useState(false);
  const [panel, setPanel] = useState(false);
  const cfg = SKINS[skin];

  // ---- music: generated in the browser, starts only on a user gesture ----
  const lofi = useRef<Lofi | null>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const userPaused = useRef(false);
  const play = useCallback(async () => { if (!lofi.current) lofi.current = new Lofi(PRESETS[skin]); await lofi.current.play(); setPlaying(true); }, [skin]);
  const togglePlay = useCallback(() => { if (playing) { lofi.current?.pause(); setPlaying(false); userPaused.current = true; } else { userPaused.current = false; play(); } }, [playing, play]);
  const toggleMute = useCallback(() => { const m = !muted; setMuted(m); lofi.current?.setMuted(m); }, [muted]);
  useEffect(() => () => lofi.current?.dispose(), []);
  const onStart = useCallback(() => { if (!userPaused.current && !playing) play().catch(() => {}); s.start(); }, [s, playing, play]);

  // ---- what the easel in the 3D scene shows: the real artwork ----
  // nft_tokens comes back in string order ("14" < "2"), so sort by numeric id, newest first.
  const recent: any[] = useMemo(() => [...(s.state?.recent || [])].sort((a, b) => Number(b.token_id) - Number(a.token_id)), [s.state?.recent]); // eslint-disable-line @typescript-eslint/no-explicit-any
  const recent0 = recent[0];
  const artSrc: ArtSource | null = useMemo(() => {
    if (s.art) return { key: "run:" + (s.art.media || s.art.title), svg: s.art.svg, url: s.art.svg ? null : s.art.dataUrl || mediaUrl(s.art.media), fresh: true };
    if (recent0?.metadata?.media) return { key: "tok:" + recent0.token_id, url: mediaUrl(recent0.metadata.media), fresh: false };
    return null;
  }, [s.art, recent0?.token_id, recent0?.metadata?.media]); // eslint-disable-line react-hooks/exhaustive-deps
  const sketching = s.phase === "painting" && !s.art;

  // ---- receipt data (real ledger lines for this run, or the studio's last real run) ----
  const sale = v.lines.find((l) => l.kind === "sale");
  const pOwner = v.lines.find((l) => l.kind === "payout" && l.who === "owner");
  const pStudio = v.lines.find((l) => l.kind === "payout" && l.who === "studio");
  const costs = v.lines.filter((l) => l.kind === "cost");
  const costSum = costs.reduce((a, l) => a + BigInt(l.amount || "0"), 0n);
  const fresh = v.receiptMode === "run";
  const st = v.st;
  const title = s.art?.title || (v.running ? "a new piece" : recent0?.metadata?.title);
  const paintLabel = s.phase === "idle" ? (recent0 ? "Last painted" : "Easel ready") : s.phase === "done" ? "Sold" : s.phase === "killed" ? "Paused" : s.phase === "error" ? "Stopped" : sketching ? "Sketching" : "Now painting";
  const progress = s.phase === "idle" ? (recent0 ? 100 : 0) : Math.round(s.progress);
  const headline = cfg.headline?.split("|");

  return (
    <div className={`sk sk-${skin}`}>
      <section className="sk-hero">
        <div className="sk-stage">
          <div className="sk-poster" data-hide={ready && mode !== "none"} />
          {(mode === "3d" || mode === "lite") && (
            <Scene3D scene={skin} art={artSrc} sketching={sketching} working={v.running} playing={playing && !muted} lite={mode === "lite"} onReady={() => setTimeout(() => setReady(true), 250)} />
          )}
          {mode === "none" && <div className="sk-flat"><ArtCanvas art={s.art} phase={s.phase} /></div>}
          {!ready && mode !== "none" && <div className="sk-loading">Opening the studio…</div>}
        </div>

        <header className="sk-top">
          <Link href={`/s/${skin}`} className="sk-brand"><Logo /><span><b>Atelier One</b><small>{cfg.tagline}</small></span></Link>
          <nav className="sk-nav">
            <a href="#gallery">Gallery</a>
            <Link href="/ledger">Ledger</Link>
            <a href="#how">How it works</a>
            <button className="sk-wallet" onClick={() => setPanel(true)}>{s.account ? s.account.replace(".testnet", "") : "Connect NEAR"}</button>
          </nav>
        </header>

        <div className="sk-ui">
          <div className="sk-hero-copy">
            {headline && <h1>{headline.map((h, i) => <span key={i}>{i === headline.length - 1 && headline.length > 1 ? <>{h.replace(/ \w+\.$/, " ")}<em>{h.match(/\w+\.$/)?.[0]}</em></> : h}</span>)}</h1>}
            <p>{cfg.sub}</p>
            <button className="sk-start" onClick={onStart} disabled={v.running}>
              <span>{v.running ? `Working… ${v.elapsed ?? 0}s` : s.phase === "done" ? `Paint another (${v.elapsed}s)` : "Start studio"}</span>
              <i aria-hidden>{v.running ? <span className="spin" /> : "›"}</i>
            </button>
            {s.phase === "awaiting-buyer" && (
              <div className="sk-card sk-buy">
                <b>Listed at {s.price ? toNear(s.price, 3) : ""} NEAR</b>
                {s.account ? <button onClick={() => s.chooseBuyer("wallet")}>Buy with my wallet</button> : <button onClick={() => setPanel(true)}>Use my wallet</button>}
                <button className="alt" onClick={() => s.chooseBuyer("demo")}>Demo collector {s.countdown != null ? `(${s.countdown})` : ""}</button>
              </div>
            )}
          </div>

          <div className="sk-card sk-paint">
            <div className="thumb">
              {s.art || !recent0 ? <ArtCanvas art={s.art} phase={s.phase} idlePalette={2} />
                // eslint-disable-next-line @next/next/no-img-element
                : <img src={mediaUrl(recent0.metadata.media)} alt={recent0.metadata.title} />}
            </div>
            <div className="pi">
              <div className="ph"><span>{paintLabel}</span><b>{progress}%</b></div>
              <div className="pt" title={title}>{title ? (s.art || !v.running ? `“${title}”` : "A new piece…") : "…"}</div>
              <div className="bar"><div style={{ width: `${progress}%` }} /></div>
              <div className="chips">
                {s.steps.map((x) => x.hash
                  ? <a key={x.key} className={x.state} href={txUrl(x.hash)} target="_blank" rel="noreferrer" title={x.note}>{STEP_LABEL[x.key]} ↗</a>
                  : <span key={x.key} className={x.state}>{STEP_LABEL[x.key]}</span>)}
              </div>
            </div>
            <p className="think">{typed}</p>
          </div>

          <div className="sk-card sk-receipt">
            <div className="rh"><span>{sale ? "✓ NEAR sale" : fresh ? "Receipt" : "Last sale"}</span><small>{fresh ? "this run" : "last real run"} · testnet</small></div>
            {sale ? (
              <>
                <div className="rr"><span>Price</span><b>{toNear(sale.amount!, 3)} NEAR</b></div>
                {pOwner && <div className="rr own"><span>Owner ({v.split}%)</span><b>{toNear(pOwner.amount!, 4)} NEAR</b></div>}
                {pStudio && <div className="rr"><span>Studio ({100 - v.split}%)</span><b>{toNear(pStudio.amount!, 4)} NEAR</b></div>}
                <div className="rr dim"><span>AI + mint costs</span><b>{fmtAmt(costSum.toString(), 4)}</b></div>
                <div className="rr tot"><span>Studio P&amp;L</span><b className={v.pl.studioNet >= 0n ? "pos" : "neg"}>{fmtAmt(v.pl.studioNet.toString(), 4)}</b></div>
                <a className="rx" href={txUrl(sale.hash)} target="_blank" rel="noreferrer">View sale + split on NEAR explorer ↗</a>
              </>
            ) : v.lines.length ? (
              <>
                {v.lines.slice(-5).map((l) => (
                  <a key={l.key} className="rr" href={txUrl(l.hash)} target="_blank" rel="noreferrer"><span>{l.label}</span><b className={l.kind === "cost" ? "neg" : ""}>{l.amount ? fmtAmt(l.amount, 4) : "↗"}</b></a>
                ))}
              </>
            ) : <div className="rr dim"><span>Press Start to print the first line</span><b /></div>}
          </div>

          <div className="sk-card sk-rules">
            <div className="rh"><span>{s.isDemo ? "Owner rules" : "Your rules"}</span><a href={accountUrl(s.studioId)} target="_blank" rel="noreferrer"><small>{s.studioId.replace(".testnet", "")} ↗</small></a></div>
            <div className="kv">
              <span>Floor</span><b>{v.floor} N</b>
              <span>AI cap/day</span><b>{v.cap.replace(/0+$/, "").replace(/\.$/, "")} N</b>
              <span>Split</span><b>{v.split} / {100 - v.split}</b>
              <span>Spent today</span><b>{v.spent.replace(/0+$/, "").replace(/\.$/, "") || "0"} N</b>
            </div>
            <div className="ks">
              <span>Kill switch {st?.kill_switch ? <em>ENGAGED{s.killReleaseAt && now ? ` · ${Math.max(0, Math.ceil((s.killReleaseAt - now) / 1000))}s` : ""}</em> : <em className="ok">armed</em>}</span>
              <button className={`sw ${st?.kill_switch ? "off" : ""}`} onClick={s.toggleKill} disabled={s.killBusy || v.running || (!s.isDemo && s.account !== s.studioId)} aria-label={st?.kill_switch ? "Release kill switch" : "Engage kill switch"} />
            </div>
          </div>

          <MusicChip skin={skin} playing={playing} muted={muted} onPlay={togglePlay} onMute={toggleMute} lofi={lofi} />
        </div>

        <nav className="sk-switch" aria-label="Skin">
          {ORDER.map((k) => <Link key={k} href={`/s/${k}`} className={k === skin ? "on" : ""}>{SKINS[k].label}</Link>)}
          <Link href="/clay">Clay</Link>
          <Link href="/receipt">Receipt</Link>
        </nav>
      </section>

      <section className="sk-below" id="gallery">
        <h2>Fresh off the easel</h2>
        <div className="sk-gal">
          {recent.slice(0, 6).map((t) => (
            <a key={t.token_id} className="sk-card" href={mediaUrl(t.metadata?.media)} target="_blank" rel="noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={mediaUrl(t.metadata?.media)} alt={t.metadata?.title} loading="lazy" />
              <b>{t.metadata?.title}</b><small>#{t.token_id} · {String(t.owner_id).replace(".testnet", "")}</small>
            </a>
          ))}
        </div>
        <div className="sk-how" id="how">
          <div><b>1 · You own the studio</b><p>Fund a small AI budget and set the rules: style, price floor, daily AI cap, revenue split, resale royalty and a kill switch. The contract enforces them.</p></div>
          <div><b>2 · {cfg.artist[0].toUpperCase() + cfg.artist.slice(1)} runs it</b><p>The agent account holds only a function-call key. It pays for inference (fees go to the treasury), mints NEP-171 art and lists it at or above your floor.</p></div>
          <div><b>3 · Every sale pays you</b><p>A collector buys and the same transaction pays you {v.split}% and refills the studio&apos;s AI budget with {100 - v.split}%. Resales pay a NEP-199 royalty.</p></div>
        </div>
        <p className="sk-proof">
          contract <a href={accountUrl(s.state?.contractId || "")} target="_blank" rel="noreferrer">{s.state?.contractId}</a> · artist <a href={accountUrl(s.state?.agentId || "")} target="_blank" rel="noreferrer">{s.state?.agentId}</a> · works minted {s.state?.config?.total_supply ?? "…"} · sold {st?.works_sold ?? "…"} · owner earned {st ? toNear(st.owner_earned_total, 3) : "…"} NEAR (testnet) · AI: {s.state?.ai ? (s.state.ai.nearAiKey ? "NEAR AI Cloud" : "local generative painter until a NEAR AI key is set") : "…"} · music is synthesised live in your browser (no samples).
          <br />One agent under an on-chain policy contract. Also by Sina at NEAR HACKATHON: <b>Muse Swarm</b>, a multi-agent swarm of four robots in a low-poly 3D room.
        </p>
      </section>
      <Toast toast={s.toast} onClose={() => s.setToast(null)} />
      {panel && <OwnerPanel s={s} onClose={() => setPanel(false)} className="sk-modal" />}
    </div>
  );
}
