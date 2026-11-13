"use client";
// Atelier One · Autumn Fox (the main design, "/").
// The same real loop as every other skin: useStudio() drives pay-AI → paint → mint (NEP-171) → list → buy → split on NEAR testnet.
import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useStudio } from "@/lib/useStudio";
import { deriveView, fmtAmt, useNow, useTyped } from "@/lib/view";
import { imgUrl, mediaUrl, toNear, txUrl, accountUrl } from "@/lib/config";
import { Lofi, PRESETS } from "@/lib/lofi";
import { ArtCanvas } from "../ArtCanvas";
import { OwnerPanel } from "../OwnerPanel";
import { Toast } from "../Toast";
import type { ArtSource } from "../scenes/kit";

const FoxCanvas = dynamic(() => import("./FoxCanvas"), { ssr: false, loading: () => null });
const DreamCanvas = dynamic(() => import("../dream/DreamCanvas"), { ssr: false, loading: () => null });

export function FoxMark({ size = 46 }: { size?: number }) {
  return (
    <svg viewBox="0 0 64 60" width={size} height={size * 60 / 64} aria-hidden className="fx-mark">
      <path d="M4 2 L22 18 L32 16 L42 18 L60 2 L56 30 L32 58 L8 30 Z" fill="#F08A24" />
      <path d="M4 2 L22 18 L14 30 L8 30 Z" fill="#C9541C" /><path d="M60 2 L42 18 L50 30 L56 30 Z" fill="#E06A1E" />
      <path d="M22 18 L32 16 L42 18 L32 34 Z" fill="#F6A93B" />
      <path d="M8 30 L14 30 L32 44 L32 58 Z" fill="#FBE9D4" /><path d="M56 30 L50 30 L32 44 L32 58 Z" fill="#F0D7BC" />
      <path d="M28 52 L36 52 L32 58 Z" fill="#2A1E1A" />
      <path d="M8 6 L16 16 L12 20 Z" fill="#2A1E1A" opacity=".55" /><path d="M56 6 L48 16 L52 20 Z" fill="#2A1E1A" opacity=".55" />
    </svg>
  );
}
function NearMark() {
  return <svg viewBox="0 0 24 24" width="22" height="22" aria-label="NEAR" className="fx-near"><circle cx="12" cy="12" r="11" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="M7.5 17V7l9 10V7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" /></svg>;
}

/** Decide how to show the scene: full 3D, lite 3D (phones, low-end), or the static poster (no GPU / software GL / reduced motion). */
function useSceneMode() {
  const [mode, setMode] = useState<"pending" | "3d" | "lite" | "poster">("pending");
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    let ok = false, software = false;
    try {
      const c = document.createElement("canvas"); const gl = (c.getContext("webgl2") || c.getContext("webgl")) as WebGLRenderingContext | null; ok = !!gl;
      const ext = gl?.getExtension("WEBGL_debug_renderer_info");
      const r = ext && gl ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : "";
      software = /swiftshader|llvmpipe|software|softpipe|basic render/i.test(r);
      gl?.getExtension("WEBGL_lose_context")?.loseContext();
    } catch {}
    const force = q.get("3d") === "1";
    const poster = !force && (!ok || software || q.get("3d") === "0" || matchMedia("(prefers-reduced-motion: reduce)").matches);
    const lite = q.get("lite") === "1" || (q.get("hq") !== "1" && (matchMedia("(max-width: 820px), (pointer: coarse)").matches || (navigator.hardwareConcurrency || 8) <= 4 || ((navigator as { deviceMemory?: number }).deviceMemory ?? 8) <= 4));
    // Let the page paint and settle first; the 3D bundle loads when the browser is idle.
    const go = () => setMode(poster ? "poster" : lite ? "lite" : "3d");
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
    if (w.requestIdleCallback && !poster) w.requestIdleCallback(go, { timeout: 1200 }); else setTimeout(go, 0);
  }, []);
  return [mode, setMode] as const;
}

const STEPS: { key: string; step: string; label: string }[] = [
  { key: "ai", step: "generate", label: "Pay AI" }, { key: "paint", step: "generate", label: "Paint" }, { key: "mint", step: "mint", label: "Mint" },
  { key: "list", step: "list", label: "List" }, { key: "buy", step: "buy", label: "Sell" }, { key: "split", step: "split", label: "Split" },
];

function Music({ playing, muted, onPlay, onMute, lofi }: { playing: boolean; muted: boolean; onPlay: () => void; onMute: () => void; lofi: React.RefObject<Lofi | null> }) {
  const bar = useRef<HTMLDivElement>(null); const eq = useRef<(HTMLSpanElement | null)[]>([]);
  useEffect(() => {
    if (!playing) { eq.current.forEach((b) => b && (b.style.transform = "scaleY(.2)")); return; }
    let raf = 0; const t0 = performance.now(); const barLen = (60 / PRESETS.fox.bpm) * 4 * 4 * 1000; // a 4-bar phrase
    const loop = () => {
      const v = lofi.current?.bands(5) || []; eq.current.forEach((b, i) => b && (b.style.transform = `scaleY(${Math.max(0.2, Math.min(1, (v[i] || 0) * 2.4))})`));
      if (bar.current) bar.current.style.width = `${(((performance.now() - t0) % barLen) / barLen) * 100}%`;
      raf = requestAnimationFrame(loop);
    };
    loop(); return () => cancelAnimationFrame(raf);
  }, [playing, lofi]);
  return (
    <div className="fx-card fx-music" data-playing={playing}>
      <div className="row">
        <span className="disc" aria-hidden><i /></span>
        <div className="mt"><b>{PRESETS.fox.name}</b><small>{playing ? (muted ? "Muted" : "Gramophone · live") : "Gramophone · press play"}</small></div>
        <span className="eq" aria-hidden>{Array.from({ length: 5 }, (_, i) => <span key={i} ref={(el) => { eq.current[i] = el; }} />)}</span>
      </div>
      <div className="track"><div ref={bar} /></div>
      <div className="ctl">
        <button onClick={onMute} disabled={!playing} aria-label={muted ? "Unmute music" : "Mute music"} title={muted ? "Unmute" : "Mute"}>
          {muted ? <svg viewBox="0 0 24 24" width="18" height="18"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" /><path d="M16 9l5 6M21 9l-5 6" stroke="currentColor" strokeWidth="2" /></svg>
            : <svg viewBox="0 0 24 24" width="18" height="18"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" /><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" stroke="currentColor" strokeWidth="2" fill="none" /></svg>}
        </button>
        <button className="pp" onClick={onPlay} aria-label={playing ? "Pause music" : "Play music"}>
          {playing ? <svg viewBox="0 0 24 24" width="20" height="20"><rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" /><rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" /></svg>
            : <svg viewBox="0 0 24 24" width="20" height="20"><path d="M7 4.5v15l13-7.5z" fill="currentColor" /></svg>}
        </button>
        <small>made live in your browser</small>
      </div>
    </div>
  );
}

/** world="dream" is the main design (the bearded painter on a floating island); world="fox" is the classic Autumn Fox. */
export default function FoxStudio({ world = "fox" }: { world?: "fox" | "dream" }) {
  const dream = world === "dream";
  const he = dream ? { s: "he", S: "He", p: "his" } : { s: "she", S: "She", p: "her" };
  const poster = dream ? "/dream/poster" : "/fox/poster";
  const [zoom, setZoom] = useState(0);
  const s = useStudio();
  // tick the clock only while something is counting (a run, or the demo kill-switch countdown)
  const now = useNow(!['idle', 'done', 'error', 'killed'].includes(s.phase) || !!s.killReleaseAt);
  const v = deriveView(s, now);
  const typed = useTyped(v.thinking);
  const [mode, setMode] = useSceneMode();
  const [ready, setReady] = useState(false);
  const [panel, setPanel] = useState(false);
  // ?clean=1 hides the UI (used to render the poster image)
  useEffect(() => { const q = new URLSearchParams(location.search); if (q.get("clean") === "1") document.documentElement.classList.add("fx-clean"); if (q.get("og") === "1") document.documentElement.classList.add("fx-og"); }, []);

  // ---- music: generated in the browser, starts only on a user gesture ----
  const lofi = useRef<Lofi | null>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const userPaused = useRef(false);
  const play = useCallback(async () => { if (!lofi.current) lofi.current = new Lofi(PRESETS.fox); await lofi.current.play(); setPlaying(true); }, []);
  const togglePlay = useCallback(() => { if (playing) { lofi.current?.pause(); setPlaying(false); userPaused.current = true; } else { userPaused.current = false; play(); } }, [playing, play]);
  const toggleMute = useCallback(() => { const m = !muted; setMuted(m); lofi.current?.setMuted(m); }, [muted]);
  useEffect(() => () => lofi.current?.dispose(), []);
  const onStart = useCallback(() => { if (!userPaused.current && !playing) play().catch(() => {}); s.start(); }, [s, playing, play]);

  // ---- the easel shows the real artwork: the fresh one during a run, else the newest minted token ----
  const recent: any[] = useMemo(() => [...(s.state?.recent || [])].sort((a, b) => Number(b.token_id) - Number(a.token_id)), [s.state?.recent]); // eslint-disable-line @typescript-eslint/no-explicit-any
  const recent0 = recent[0];
  const artSrc: ArtSource | null = useMemo(() => {
    if (s.art) return { key: "run:" + (s.art.media || s.art.title), svg: s.art.svg, url: s.art.svg ? null : s.art.dataUrl || imgUrl(s.art.media), fresh: true };
    if (recent0?.metadata?.media) return { key: "tok:" + recent0.token_id, url: imgUrl(recent0.metadata.media), fresh: false };
    return null;
  }, [s.art, recent0]);
  const sketching = s.phase === "painting" && !s.art;
  // the robin lands on the easel once the painting is finished; the lantern rises when this run's sale lands
  const perch = !!s.art && !["idle", "painting", "error"].includes(s.phase);

  // ---- session numbers: real ledger lines for this run, or the studio's last real run ----
  const sale = v.lines.find((l) => l.kind === "sale");
  const pOwner = v.lines.find((l) => l.kind === "payout" && l.who === "owner");
  const pStudio = v.lines.find((l) => l.kind === "payout" && l.who === "studio");
  const costSum = v.lines.filter((l) => l.kind === "cost").reduce((a, l) => a + BigInt(l.amount || "0"), 0n);
  const fresh = v.receiptMode === "run";
  const saleKey = fresh && s.phase === "done" && sale ? sale.hash : null;
  const st = v.st;
  const title = s.art?.title || (v.running ? null : recent0?.metadata?.title);
  const progress = s.phase === "idle" ? (recent0 ? 100 : 0) : Math.round(s.progress);
  const paintLabel = s.phase === "idle" ? "Last painting" : s.phase === "done" ? "Sold" : s.phase === "killed" ? "Paused" : s.phase === "error" ? "Stopped" : sketching ? "Sketching" : "Painting";
  const stepOf = (k: string) => s.steps.find((x) => x.key === k);
  const saleTok = sale?.label.match(/#(\d+)/)?.[1] || (s.tokenId ?? undefined);
  const when = sale ? new Date(sale.at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
  const provider = s.state?.ai ? (s.state.ai.nearAiKey ? "NEAR AI Cloud" : "local generative painter (NEAR AI Cloud once a key is set)") : "";

  return (
    <div className="fx">
      <section className="fx-hero" id="studio">
        <div className="fx-stage">
          <link rel="preload" as="image" href={`${poster}-mobile.webp`} media="(max-width: 820px)" fetchPriority="high" />
          <link rel="preload" as="image" href={`${poster}.webp`} media="(min-width: 821px)" fetchPriority="high" />
          <picture className="fx-poster" data-hide={ready && (mode === "3d" || mode === "lite")}>
            <source media="(max-width: 820px)" srcSet={`${poster}-mobile.webp`} type="image/webp" />
            <img src={`${poster}.webp`} alt="" fetchPriority="high" decoding="async" />
          </picture>
          {(mode === "3d" || mode === "lite") && dream && (
            <DreamCanvas art={artSrc} sketching={sketching} working={v.running} playing={playing && !muted} lite={mode === "lite"} perch={perch} saleKey={saleKey} zoom={zoom} onZoom={setZoom}
              onReady={() => setTimeout(() => setReady(true), 200)} onTooSlow={() => setMode("poster")} />
          )}
          {(mode === "3d" || mode === "lite") && !dream && (
            <FoxCanvas art={artSrc} sketching={sketching} working={v.running} playing={playing && !muted} lite={mode === "lite"} onReady={() => setTimeout(() => setReady(true), 200)} onTooSlow={() => setMode("poster")} />
          )}
          {mode === "poster" && <div className="fx-flies" aria-hidden>{Array.from({ length: 14 }, (_, i) => <i key={i} />)}</div>}
          <div className="fx-vignette" aria-hidden />
          {!ready && mode !== "poster" && <div className="fx-loading" aria-live="polite"><span />Lighting the studio…</div>}
        </div>

        <header className="fx-top">
          <Link href="/" className="fx-brand" aria-label="Atelier One home"><FoxMark /><span><b>Atelier One</b><small>Create · Earn · Inspire</small></span></Link>
          <nav className="fx-nav" aria-label="Main">
            <a href="#how">How it works</a>
            <a href="#gallery">Gallery</a>
            <Link href="/ledger">Ledger</Link>
            <button className="fx-link" onClick={() => setPanel(true)}>{s.account ? s.account.replace(".testnet", "") : "Own a studio"}</button>
            <button className="fx-start" onClick={onStart} disabled={v.running}>
              {v.running ? <><span className="spin" />Working… {v.elapsed ?? 0}s</> : s.phase === "done" ? <>Paint another<i>▶</i></> : <>Start studio<i>▶</i></>}
            </button>
          </nav>
        </header>

        <div className="fx-ui">
          <div className="fx-intro">
            <h1>{dream ? "An AI painter who runs his own art studio on NEAR." : "An AI fox that runs her own art studio on NEAR."}</h1>
            <p>Press <b>Start studio</b>: {he.s} pays {he.p} own AI bill, paints, mints an NEP-171, sells it and splits the money with {he.p} owner. Real testnet transactions, about a minute.</p>
            <button className="fx-start big" onClick={onStart} disabled={v.running}>{v.running ? <><span className="spin" />Working… {v.elapsed ?? 0}s</> : s.phase === "done" ? <>Paint another<i>▶</i></> : <>Start studio<i>▶</i></>}</button>
          </div>

          {s.phase === "awaiting-buyer" && (
            <div className="fx-card fx-buy" role="dialog" aria-label="Choose a buyer">
              <b>“{s.art?.title}” is listed at {s.price ? toNear(s.price, 3) : ""} NEAR</b>
              <p>Buy it yourself with a testnet wallet, or let the demo collector buy it.</p>
              <div>{s.account ? <button onClick={() => s.chooseBuyer("wallet")}>Buy with my wallet</button> : <button onClick={() => setPanel(true)}>Connect a wallet</button>}
                <button className="alt" onClick={() => s.chooseBuyer("demo")}>Demo collector {s.countdown != null ? `(${s.countdown})` : ""}</button></div>
            </div>
          )}

          <div className="fx-card fx-paint">
            <div className="top">
              <div className="thumb">
                {s.art || !recent0 ? <ArtCanvas art={s.art} phase={s.phase} idlePalette={2} />
                  // eslint-disable-next-line @next/next/no-img-element
                  : <img src={imgUrl(recent0.metadata.media)} alt={recent0.metadata.title} />}
              </div>
              <div className="pi">
                <div className="pt" title={title || ""}><span>{paintLabel}:</span> {title ? `${title}` : v.running ? "a new piece…" : "…"}</div>
                <div className="pp"><b>{progress}%</b>{v.elapsed != null && <small>{v.elapsed}s</small>}</div>
                <div className="bar"><div style={{ width: `${progress}%` }} /></div>
              </div>
            </div>
            <div className="chips" aria-label="Loop steps">
              {STEPS.map((x) => { const st = stepOf(x.step); const cls = st?.state || "idle"; return st?.hash
                ? <a key={x.key} className={cls} href={txUrl(st.hash)} target="_blank" rel="noreferrer" title={`${st.note ? st.note + " · " : ""}view on NEAR explorer`}>{x.label}</a>
                : <span key={x.key} className={cls}>{x.label}</span>; })}
            </div>
            <p className="think"><svg viewBox="0 0 24 24" width="14" height="14" aria-hidden><path d="M20 4C10 4 4 10 4 20c4-6 8-8 12-8-3 2-6 5-7 8 7-1 11-7 11-16z" fill="currentColor" /></svg><span>{typed || "\u00a0"}</span></p>
          </div>

          <div className="fx-card fx-rules">
            <div className="hd"><b>Owner rules</b><a href={accountUrl(s.studioId)} target="_blank" rel="noreferrer">{s.studioId.replace(".testnet", "")} ↗</a></div>
            <div className="kv">
              <span>Price floor</span><b>{v.floor} N</b>
              <span>AI cap / day</span><b>{v.cap.replace(/0+$/, "").replace(/\.$/, "")} N</b>
              <span>Split</span><b>{v.split} / {100 - v.split}</b>
              <span>Spent today</span><b>{v.spent.replace(/0+$/, "").replace(/\.$/, "") || "0"} N</b>
            </div>
            <div className="ks">
              <span>Kill switch {st?.kill_switch ? <em className="on">ENGAGED{s.killReleaseAt && now ? ` · ${Math.max(0, Math.ceil((s.killReleaseAt - now) / 1000))}s` : ""}</em> : <em>armed</em>}</span>
              <button className={`sw ${st?.kill_switch ? "off" : ""}`} onClick={s.toggleKill} disabled={s.killBusy || v.running || (!s.isDemo && s.account !== s.studioId)} aria-label={st?.kill_switch ? "Release kill switch" : "Engage kill switch"} />
            </div>
          </div>

          <div className="fx-col">
          <Music playing={playing} muted={muted} onPlay={togglePlay} onMute={toggleMute} lofi={lofi} />

          <div className="fx-card fx-session">
            <div className="hd"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden><path d="M6 2h12v20l-3-2-3 2-3-2-3 2z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /><path d="M9 7h6M9 11h6M9 15h4" stroke="currentColor" strokeWidth="1.8" /></svg><b>Studio session</b><small>{fresh ? "this run" : "last real run"} · testnet</small></div>
            {sale ? (
              <>
                <div className="earn" data-fresh={fresh && s.phase === "done"}><small>Owner earned</small>{fresh && s.phase === "done" && pOwner && <span className="pop" key={sale.hash} aria-hidden>+{toNear(pOwner.amount!, 4)} NEAR to the owner</span>}<div><b>{pOwner ? toNear(pOwner.amount!, 4) : "—"} NEAR</b><NearMark /></div></div>
                <div className="rr"><span>Sale price</span><b>{toNear(sale.amount!, 3)} NEAR</b></div>
                {pOwner && <div className="rr own"><span>Owner ({v.split}%)</span><b>{toNear(pOwner.amount!, 4)} NEAR</b></div>}
                {pStudio && <div className="rr"><span>Studio AI budget ({100 - v.split}%)</span><b>{toNear(pStudio.amount!, 4)} NEAR</b></div>}
                <div className="rr dim"><span>AI bill + mint storage</span><b>{fmtAmt(costSum.toString(), 4)}</b></div>
                <div className="rr tot"><span>Studio P&amp;L</span><b className={v.pl.studioNet >= 0n ? "pos" : "neg"}>{fmtAmt(v.pl.studioNet.toString(), 4)} NEAR</b></div>
                <div className="ft"><span>{saleTok ? `Token #${saleTok}` : ""}</span><span>{when}</span></div>
                <a className="rx" href={txUrl(sale.hash)} target="_blank" rel="noreferrer">Sale + split in one transaction ↗</a>
              </>
            ) : v.lines.length ? (
              <div className="live">{v.lines.slice(-6).map((l) => (
                <a key={l.key} className="rr" href={txUrl(l.hash)} target="_blank" rel="noreferrer"><span>{l.label}</span><b className={l.kind === "cost" ? "neg" : ""}>{l.amount ? fmtAmt(l.amount, 4) : "↗"}</b></a>
              ))}</div>
            ) : <div className="rr dim"><span>{s.state ? "Press Start studio to open a session" : "Reading the contract…"}</span><b /></div>}
          </div>
          </div>
        </div>
        {dream && (mode === "3d" || mode === "lite") && ready && (
          <div className="fx-zoom" role="group" aria-label="Camera zoom">
            <button onClick={() => setZoom((z) => Math.min(1, z < 0.5 ? 1 : z + 0.25))} disabled={zoom >= 0.99} aria-label="Zoom out to the whole island" title="Zoom out">
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M7.5 10.5h6M15.5 15.5 20 20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
            </button>
            <span>{zoom > 0.5 ? "Island" : "Studio"}</span>
            <button onClick={() => setZoom((z) => Math.max(0, z > 0.5 ? 0 : z - 0.25))} disabled={zoom <= 0.01} aria-label="Zoom back in to the studio" title="Zoom in">
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M7.5 10.5h6M10.5 7.5v6M15.5 15.5 20 20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
            </button>
          </div>
        )}
        <a className="fx-scroll" href="#how" aria-label="How it works">How it works ↓</a>
      </section>

      <section className="fx-below">
        <div className="fx-how" id="how">
          <h2>How it works</h2>
          <p className="lead">Atelier One is a one-artist business with its own NEAR account, its own budget and its own books. The owner sets the rules once; the contract enforces them on every transaction.</p>
          <ol>
            <li><i>1</i><b>You set the rules</b><p>Style, price floor, daily AI cap, revenue split ({v.split}/{100 - v.split}), resale royalty and a kill switch, stored in the studio contract.</p></li>
            <li><i>2</i><b>{he.S} pays {he.p} own AI bill</b><p>The artist account holds only a function-call key. Each piece starts with <code>agent_charge_inference</code>: the fee leaves the studio budget, capped per day.</p></li>
            <li><i>3</i><b>Paints, mints, lists</b><p>The artwork is pinned to IPFS, minted as an NEP-171 token (NEP-177 metadata) and listed, never below your floor.</p></li>
            <li><i>4</i><b>A sale pays everyone</b><p>A collector buys and the same transaction pays the owner {v.split}% and refills the AI budget with {100 - v.split}%. Resales pay an NEP-199 royalty.</p></li>
          </ol>
          <div className="fx-stats">
            <div><b>{s.state?.config?.total_supply ?? "…"}</b><small>works minted</small></div>
            <div><b>{st?.works_sold ?? "…"}</b><small>sold</small></div>
            <div><b>{st ? toNear(st.owner_earned_total, 3) : "…"}</b><small>NEAR paid to the owner</small></div>
            <div><b>{st ? toNear(st.budget, 3) : "…"}</b><small>NEAR AI budget left</small></div>
          </div>
        </div>

        <div className="fx-gal-wrap" id="gallery">
          <h2>Fresh off the easel</h2>
          <div className="fx-gal">
            {recent.slice(0, 8).map((t) => (
              <a key={t.token_id} className="fx-card" href={mediaUrl(t.metadata?.media)} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imgUrl(t.metadata?.media)} alt={t.metadata?.title} loading="lazy" width={256} height={256} />
                <b>{t.metadata?.title}</b><small>#{t.token_id} · {String(t.owner_id).replace(".testnet", "")}</small>
              </a>
            ))}
          </div>
        </div>

        <footer className="fx-proof">
          <p>
            Contract <a href={accountUrl(s.state?.contractId || "")} target="_blank" rel="noreferrer">{s.state?.contractId}</a> · artist <a href={accountUrl(s.state?.agentId || "")} target="_blank" rel="noreferrer">{s.state?.agentId}</a> · <Link href="/ledger">public ledger</Link><br />
            Painter: {provider || "…"} · Music: “Autumn Notes”, generated live in your browser with WebAudio (no samples, no license needed) · Scene: procedural three.js, no model or texture files.
          </p>
          <p>Built for NEAR HACKATHON · Autonomous Business · Agent Economy · NFTs That Do Something. Sina&apos;s other entry: <b>Muse Swarm</b>, a four-robot swarm in a low-poly 3D room.</p>
          <p className="looks">Other looks: {dream ? <Link href="/s/fox">Autumn Fox</Link> : <Link href="/">Dream Island</Link>} · <Link href="/receipt">Receipt</Link> · <Link href="/clay">Clay</Link> · <Link href="/s/lake">Lake</Link> · <Link href="/s/island">Island</Link> · <Link href="/s/robot">Robot</Link></p>
        </footer>
      </section>
      <Toast toast={s.toast} onClose={() => s.setToast(null)} />
      {panel && <OwnerPanel s={s} onClose={() => setPanel(false)} className="fx-modal" />}
    </div>
  );
}
