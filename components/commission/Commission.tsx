"use client";
// Chat commission panel: type (or say) what you need, three studio hands bid, you pick one and pay into the
// contract's escrow, the painter paints it live on the island, and the poster is minted straight to the buyer.
import { useEffect, useRef, useState } from "react";
import { txUrl, accountUrl, imgUrl } from "@/lib/config";
import type { CommissionApi } from "@/lib/useCommission";
import type { StudioApi } from "@/lib/useStudio";

const IDEAS = ["A poster for my sister's bakery opening, Saturday 9 am, Vinohrady", "Rooftop jazz night in Prague, Friday 20 Nov, 21:00", "A calm poster for a sunrise yoga class by the river"];
const AVATAR: Record<string, React.ReactNode> = {
  "paper-fox": <svg viewBox="0 0 40 40" aria-hidden><rect width="40" height="40" rx="12" fill="#F4E9D8" /><path d="M9 28 L20 10 L31 28 Z" fill="#E0662C" /><path d="M14 28 L20 18 L26 28 Z" fill="#2F4A3A" /></svg>,
  "grid-ink": <svg viewBox="0 0 40 40" aria-hidden><rect width="40" height="40" rx="12" fill="#EEEAE1" /><rect x="9" y="9" width="10" height="22" fill="#111" /><rect x="22" y="9" width="9" height="9" fill="#E8432E" /></svg>,
  "sina-neon": <svg viewBox="0 0 40 40" aria-hidden><rect width="40" height="40" rx="12" fill="#07080B" /><text x="20" y="26" textAnchor="middle" fontSize="15" fontWeight="900" fill="#FFE9EC" stroke="#FF3B5C" strokeWidth=".6">SJ</text><rect x="5" y="5" width="30" height="30" rx="9" fill="none" stroke="#3DF2E0" strokeOpacity=".7" /></svg>,
};
type SR = { start: () => void; stop: () => void; onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void; onend: () => void; lang: string; interimResults: boolean };

export function Commission({ c, s, onClose }: { c: CommissionApi; s: StudioApi; onClose: () => void }) {
  const [brief, setBrief] = useState("");
  const [to, setTo] = useState("");
  const [listening, setListening] = useState(false);
  const sr = useRef<SR | null>(null);
  const [voice, setVoice] = useState(false);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { setVoice(!!((window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown }).SpeechRecognition || (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition)); }, []);
  const busy = ["quoting", "paying", "painting", "delivering"].includes(c.phase);
  useEffect(() => { if (!busy) return; const t = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(t); }, [busy]);
  const bid = c.quote?.bids.find((b) => b.styleId === c.pick);
  useEffect(() => { if (bid && c.phase === "bids") c.loadIntents(bid.priceNear); }, [bid?.priceNear, c.phase]); // eslint-disable-line react-hooks/exhaustive-deps

  const talk = () => {
    const W = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR };
    const C = W.SpeechRecognition || W.webkitSpeechRecognition; if (!C) return;
    if (listening) { sr.current?.stop(); return; }
    const r = new C(); r.lang = navigator.language || "en-US"; r.interimResults = true;
    r.onresult = (e) => setBrief(Array.from(e.results).map((x) => x[0].transcript).join(" "));
    r.onend = () => setListening(false); sr.current = r; setListening(true); r.start();
  };
  const elapsed = c.t0 ? Math.round(((c.t1 || now) - c.t0) / 1000) : null;
  const stepIdx = { paying: 0, painting: 1, delivering: 2, done: 3 }[c.phase as string] ?? -1;

  return (
    <div className="fx-card cm" role="dialog" aria-label="Commission a poster">
      <div className="cm-hd"><b>Commission a poster</b><small>testnet · real transactions</small><button className="x" onClick={onClose} aria-label="Close">×</button></div>

      {(c.phase === "idle" || c.phase === "quoting" || (c.phase === "error" && !c.quote)) && (
        <form className="cm-ask" onSubmit={(e) => { e.preventDefault(); if (brief.trim().length > 2) c.ask(brief); }}>
          <p className="cm-msg them">Hi! What should I paint for you? Tell me what the poster is for, and when and where if it&apos;s an event.</p>
          <div className="cm-in">
            <textarea value={brief} onChange={(e) => setBrief(e.target.value)} maxLength={400} rows={3} placeholder="Make me a poster for…" aria-label="Your brief"
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (brief.trim().length > 2) c.ask(brief); } }} />
            {voice && <button type="button" className={`mic ${listening ? "on" : ""}`} onClick={talk} aria-label={listening ? "Stop listening" : "Speak your brief"} title="Speak (Web Speech API)">
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden><rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor" /><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" /></svg></button>}
          </div>
          <div className="cm-ideas">{IDEAS.map((i) => <button type="button" key={i} onClick={() => setBrief(i)}>{i}</button>)}</div>
          <button className="fx-start" disabled={c.phase === "quoting" || brief.trim().length < 3}>{c.phase === "quoting" ? <><span className="spin" />Reading your brief…</> : <>Get three quotes<i>▶</i></>}</button>
          {c.error && <p className="cm-err">{c.error}</p>}
        </form>
      )}

      {c.quote && c.phase !== "idle" && c.phase !== "quoting" && (
        <div className="cm-flow">
          <p className="cm-msg me">{c.quote.brief}</p>
          <p className="cm-msg them">Poster copy: <b>“{c.quote.title}”</b>{c.quote.subtitle ? <> · {c.quote.subtitle}</> : null}. Three of us would love to paint it:</p>
          <div className="cm-bids" role="radiogroup" aria-label="Bids">
            {c.quote.bids.map((b) => (
              <button key={b.styleId} role="radio" aria-checked={c.pick === b.styleId} className={`cm-bid ${c.pick === b.styleId ? "on" : ""} ${b.human ? "human" : ""}`} disabled={c.phase !== "bids"} onClick={() => c.setPick(b.styleId)}>
                <span className="av">{AVATAR[b.styleId]}</span>
                <span className="who"><b>{b.persona}</b><small>{b.style}{b.human ? " · real artist" : " · house style"}</small></span>
                <span className="pr">{b.priceNear} <small>NEAR</small></span>
                <span className="pitch">{b.pitch}</span>
                {b.human && <span className="roy">{b.artistBps / 100}% of the price goes on-chain to <a href={accountUrl(b.artist!)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>{b.artist}</a></span>}
              </button>
            ))}
          </div>

          {c.phase === "bids" && bid && (
            <div className="cm-pay">
              <div className="cm-intents">
                <b>Or pay {bid.priceNear} NEAR in another token via NEAR Intents</b>
                <div className="q">{c.intents?.near === bid.priceNear ? c.intents.quotes.map((q) => (
                  <span key={q.token} title={q.ok ? `≈ $${Number(q.amountInUsd).toFixed(2)} · ~${q.seconds}s` : q.error}>{q.label}<small>{q.chain}</small><em>{q.ok ? Number(q.amountIn).toPrecision(3) : "—"}</em></span>
                )) : <span className="ld">live 1Click quotes…</span>}</div>
                <small>Live mainnet 1Click quotes, read-only (dry). Nothing is sent: this demo settles in testnet NEAR.</small>
              </div>
              <label className="cm-to">Deliver to (optional testnet account)<input value={to} onChange={(e) => setTo(e.target.value.trim())} placeholder="you.testnet" spellCheck={false} /></label>
              <div className="cm-btns">
                <button className="fx-start" onClick={() => c.commission("demo", to || undefined)}>Pay {bid.priceNear} NEAR · demo patron<i>▶</i></button>
                {s.account ? <button className="alt" onClick={() => c.commission("wallet")}>Pay with {s.account}</button> : <button className="alt" onClick={s.connect}>Connect a testnet wallet</button>}
              </div>
            </div>
          )}

          {stepIdx >= 0 && (
            <div className="cm-run">
              <ol>{["Escrow paid", "Painting", "Mint to buyer + split", "Delivered"].map((l, i) => <li key={l} className={i < stepIdx || c.phase === "done" ? "done" : i === stepIdx ? "on" : ""}>{l}</li>)}</ol>
              {elapsed != null && <span className="t">{c.phase === "done" ? `Delivered in ${elapsed} s` : `${elapsed} s`}</span>}
            </div>
          )}
          {c.preview && (
            <div className="cm-out">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={c.preview} alt={c.quote.title} width={300} height={400} />
              {c.phase === "done" && c.result && c.painted && (
                <div className="cm-done">
                  <b>Token #{c.result.tokenId} is yours{c.result.handover?.ok ? ` (in ${c.result.handover.to})` : c.result.handover ? "" : ""}.</b>
                  <div className="dl">
                    <a href={imgUrl(c.painted.printCid)} download target="_blank" rel="noreferrer">PNG 1800×2400</a>
                    <a href={imgUrl(c.painted.svgCid)} target="_blank" rel="noreferrer">SVG</a>
                    <a href={`/api/poster/pdf?cid=${c.painted.printCid}&name=${encodeURIComponent(c.quote.title)}`}>PDF</a>
                  </div>
                  {c.result.result && <div className="split">
                    <span>Paid {(Number(c.result.result.price) / 1e24).toFixed(3)}</span>
                    {Number(c.result.result.artist_amount) > 0 && <span>artist {(Number(c.result.result.artist_amount) / 1e24).toFixed(4)}</span>}
                    <span>owner {(Number(c.result.result.owner_amount) / 1e24).toFixed(4)}</span>
                    <span>studio {(Number(c.result.result.studio_amount) / 1e24).toFixed(4)}</span>
                  </div>}
                  <small>Provenance record (prompt hash, model, seed, time) is in the token metadata. It records how the piece was made; it is not proof of originality or copyright.</small>
                </div>
              )}
            </div>
          )}
          {c.txs.length > 0 && <div className="cm-txs">{c.txs.map((t) => <a key={t.hash} href={txUrl(t.hash)} target="_blank" rel="noreferrer">{t.label} ↗</a>)}</div>}
          {c.error && <p className="cm-err">{c.error}</p>}
          {(c.phase === "done" || c.phase === "error") && <button className="alt again" onClick={() => { c.reset(); setBrief(""); }}>Commission another</button>}
        </div>
      )}
    </div>
  );
}
