"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { linesFor, type Line, type EntryLike } from "./lines";
import { CONTRACT_ID, DEMO_STUDIO_ID } from "./config";

export type StepState = "idle" | "active" | "done" | "fail";
export interface StepInfo { key: string; label: string; state: StepState; hash?: string; note?: string }
export interface ArtView { title: string; thinking: string; svg: string | null; dataUrl: string | null; media: string; provider: string; model: string; price: number; palette: string; motif: string }
export type Phase = "idle" | "painting" | "minting" | "listing" | "awaiting-buyer" | "buying" | "paying" | "done" | "error" | "killed";

const STEP_DEFS = [
  { key: "generate", label: "Generate" },
  { key: "mint", label: "Mint NEP-171" },
  { key: "list", label: "List at ≥ floor" },
  { key: "buy", label: "Collector buys" },
  { key: "split", label: "Auto-split payout" },
];

async function post(url: string, body: object) {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
  return { ok: r.ok, status: r.status, data: j };
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function useStudio() {
  const [state, setState] = useState<any>(null);
  const [studioId, setStudioId] = useState<string>(DEMO_STUDIO_ID);
  const [phase, setPhase] = useState<Phase>("idle");
  const [steps, setSteps] = useState<StepInfo[]>(STEP_DEFS.map((s) => ({ ...s, state: "idle" })));
  const [art, setArt] = useState<ArtView | null>(null);
  const [runLines, setRunLines] = useState<Line[]>([]);
  const [ledger, setLedger] = useState<EntryLike[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tokenId, setTokenId] = useState<string | null>(null);
  const [price, setPrice] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [finishedAt, setFinishedAt] = useState<number | null>(null);
  const [account, setAccount] = useState<string | null>(null);
  const [killBusy, setKillBusy] = useState(false);
  const [toast, setToast] = useState<{ text: string; hash?: string } | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const selectorRef = useRef<any>(null);
  const modalRef = useRef<any>(null);
  const buyChoice = useRef<((v: "wallet" | "demo") => void) | null>(null);
  const running = useRef(false);

  const refresh = useCallback(async (sid = studioId) => {
    try {
      const [s, l] = await Promise.all([fetch(`/api/state?studio=${sid}`).then((r) => r.json()), fetch(`/api/ledger?limit=80`).then((r) => r.json())]);
      if (!s.error) setState(s);
      if (l.entries) setLedger(l.entries);
    } catch {}
  }, [studioId]);

  // The shared demo kill switch auto-releases after 60 s: poll the server right when it is due.
  const killReleaseAt: number | null = state?.killReleaseAt ?? null;
  useEffect(() => {
    if (!killReleaseAt) return;
    const t = setTimeout(() => refresh(), Math.max(1000, killReleaseAt - Date.now() + 1500));
    return () => clearTimeout(t);
  }, [killReleaseAt, refresh]);

  useEffect(() => { refresh(); const t = setInterval(() => { if (!running.current) refresh(); }, 20000); return () => clearInterval(t); }, [refresh]);

  // ---- wallet selector (lazy, client only) ----
  const initWallet = useCallback(async () => {
    if (selectorRef.current) return selectorRef.current;
    const [{ setupWalletSelector }, { setupModal }, { setupMyNearWallet }, { setupMeteorWallet }, { setupHereWallet }] = await Promise.all([
      import("@near-wallet-selector/core"), import("@near-wallet-selector/modal-ui"), import("@near-wallet-selector/my-near-wallet"),
      import("@near-wallet-selector/meteor-wallet"), import("@near-wallet-selector/here-wallet"),
    ]);
    const selector = await setupWalletSelector({ network: "testnet", modules: [setupMyNearWallet(), setupMeteorWallet(), setupHereWallet()] as any });
    const modal = setupModal(selector, { contractId: CONTRACT_ID, description: "Connect a NEAR testnet wallet to own a studio or buy art yourself." } as any);
    selectorRef.current = selector; modalRef.current = modal;
    const sync = () => { const accs = selector.store.getState().accounts; setAccount(accs.find((a: any) => a.active)?.accountId || accs[0]?.accountId || null); };
    selector.store.observable.subscribe(sync); sync();
    return selector;
  }, []);

  useEffect(() => {
    // Restore session + handle redirect-wallet results (?transactionHashes=…)
    const hasSession = typeof window !== "undefined" && Object.keys(localStorage).some((k) => k.startsWith("near-wallet-selector") || k.includes("near_app_wallet"));
    const u = new URL(window.location.href);
    const hashes = u.searchParams.get("transactionHashes");
    if (hasSession || hashes) initWallet().then(async (sel) => {
      if (!hashes) return;
      const accs = sel.store.getState().accounts;
      const signer = accs[0]?.accountId;
      u.searchParams.delete("transactionHashes"); window.history.replaceState({}, "", u.toString());
      if (signer) for (const h of hashes.split(",")) {
        const r = await post("/api/ledger/record", { hash: h, signerId: signer });
        setToast({ text: r.ok ? "Your wallet transaction is on-chain and in the ledger." : `Recorded with issue: ${r.data.error}`, hash: h });
      }
      refresh();
    });
  }, [initWallet, refresh]);

  const connect = useCallback(async () => { await initWallet(); modalRef.current?.show(); }, [initWallet]);
  const disconnect = useCallback(async () => { const s = await initWallet(); const w = await s.wallet(); await w.signOut(); setAccount(null); setStudioId(DEMO_STUDIO_ID); refresh(DEMO_STUDIO_ID); }, [initWallet, refresh]);

  const walletTx = useCallback(async (method: string, args: object, depositYocto = "0", gasT = 100) => {
    const sel = await initWallet();
    const w = await sel.wallet();
    const { actionCreators } = await import("@near-js/transactions");
    const res: any = await w.signAndSendTransaction({ receiverId: CONTRACT_ID, actions: [actionCreators.functionCall(method, args, BigInt(gasT) * 10n ** 12n, BigInt(depositYocto))] } as any);
    const hash = res?.transaction?.hash || res?.transaction_outcome?.id;
    const signer = sel.store.getState().accounts[0]?.accountId;
    if (hash && signer) return (await post("/api/ledger/record", { hash, signerId: signer })).data;
    return null; // redirect wallets come back via ?transactionHashes
  }, [initWallet]);

  /** NEP-413: the owner signs once (valid 12 h) so the server will run a non-demo studio. */
  const ownerAuth = useCallback(async (sid: string) => {
    const k = `ao-auth:${sid}`;
    try {
      const c = JSON.parse(localStorage.getItem(k) || "null");
      const until = c && Date.parse(String(c.message).split(" until ")[1]);
      if (c && until > Date.now() + 5 * 60_000) return c;
    } catch {}
    const sel = await initWallet();
    const w = await sel.wallet();
    const until = new Date(Date.now() + 12 * 3600_000).toISOString();
    const message = `Atelier One: run studio ${sid} until ${until}`;
    const nonce = crypto.getRandomValues(new Uint8Array(32));
    const callbackUrl = window.location.href;
    const r: any = await w.signMessage({ message, recipient: CONTRACT_ID, nonce, callbackUrl } as any);
    if (!r?.signature) throw new Error("The wallet did not return a signature");
    const auth = { accountId: r.accountId, publicKey: r.publicKey, signature: r.signature, message, nonce: btoa(String.fromCharCode(...nonce)), callbackUrl };
    localStorage.setItem(k, JSON.stringify(auth));
    return auth;
  }, [initWallet]);

  const addLines = (entry: EntryLike) => setRunLines((ls) => [...ls, ...linesFor(entry)]);
  const setStep = (key: string, patch: Partial<StepInfo>) => setSteps((ss) => ss.map((s) => (s.key === key ? { ...s, ...patch } : s)));

  const fail = (key: string, msg: string, hash?: string) => { setStep(key, { state: "fail", hash, note: msg }); setError(msg); setPhase("error"); running.current = false; };

  const start = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setError(null); setRunLines([]); setTokenId(null); setPrice(null); setFinishedAt(null); setStartedAt(Date.now());
    setSteps(STEP_DEFS.map((s) => ({ ...s, state: "idle" })));
    setArt(null); setPhase("painting"); setProgress(4); setStep("generate", { state: "active" });
    const tick = setInterval(() => setProgress((p) => (p < 55 ? p + 1.5 : p)), 250);
    let auth: any = undefined;
    if (studioId !== DEMO_STUDIO_ID) {
      try { auth = await ownerAuth(studioId); } catch (e) { clearInterval(tick); return fail("generate", `Owner signature needed: ${(e as Error).message}`); }
    }
    const g = await post("/api/agent/generate", { studio: studioId, auth });
    if (g.status === 401 && g.data.needAuth) localStorage.removeItem(`ao-auth:${studioId}`);
    clearInterval(tick);
    if (g.status === 409 && g.data.killed) {
      addLines({ hash: g.data.tx.hash, at: g.data.tx.at, ok: false, error: g.data.tx.error, action: "agent_charge_inference", studioId, events: [] });
      setStep("generate", { state: "fail", hash: g.data.tx.hash, note: "Kill switch engaged — the contract refused" });
      setPhase("killed"); running.current = false; refresh(); return;
    }
    if (!g.ok) return fail("generate", g.data.error || "generation failed", g.data.tx?.hash);
    const a = g.data.art;
    setArt({ title: a.title, thinking: a.thinking, svg: a.svg, dataUrl: a.dataUrl, media: a.media, provider: a.provider, model: a.model, price: a.price, palette: a.palette, motif: a.motif });
    addLines({ hash: g.data.tx.hash, at: g.data.tx.at, ok: true, action: "agent_charge_inference", studioId, events: g.data.tx.events });
    setStep("generate", { state: "done", hash: g.data.tx.hash, note: a.provider });
    setProgress(60);
    await sleep(2600); // let the painting finish on screen

    setPhase("minting"); setStep("mint", { state: "active" });
    const m = await post("/api/agent/mint", { jobToken: g.data.jobToken });
    if (!m.ok) return fail("mint", m.data.error || "mint failed", m.data.tx?.hash);
    setTokenId(m.data.tokenId);
    addLines({ hash: m.data.tx.hash, at: m.data.tx.at, ok: true, action: "agent_mint", studioId, title: a.title, events: m.data.tx.events });
    setStep("mint", { state: "done", hash: m.data.tx.hash, note: `token #${m.data.tokenId}` }); setProgress(72);

    setPhase("listing"); setStep("list", { state: "active" });
    const l = await post("/api/agent/list", { jobToken: g.data.jobToken, tokenId: m.data.tokenId });
    if (!l.ok) return fail("list", l.data.error || "listing failed", l.data.tx?.hash);
    setPrice(l.data.price);
    addLines({ hash: l.data.tx.hash, at: l.data.tx.at, ok: true, action: "agent_list", studioId, events: l.data.tx.events });
    setStep("list", { state: "done", hash: l.data.tx.hash }); setProgress(82);

    // Buyer: real wallet if the visitor wants, otherwise the demo collector.
    setPhase("awaiting-buyer"); setStep("buy", { state: "active" });
    const hasWallet = !!selectorRef.current?.store.getState().accounts.length;
    const waitS = hasWallet ? 15 : 3;
    const choice = await new Promise<"wallet" | "demo">((resolve) => {
      buyChoice.current = resolve;
      let n = waitS; setCountdown(n);
      const iv = setInterval(() => { n -= 1; setCountdown(n); if (n <= 0) { clearInterval(iv); resolve("demo"); } }, 1000);
      buyChoice.current = (v) => { clearInterval(iv); resolve(v); };
    });
    setCountdown(null); buyChoice.current = null;
    setPhase("buying");
    let buyTx: any = null;
    if (choice === "wallet") {
      try {
        const rec = await walletTx("buy", { token_id: m.data.tokenId }, l.data.price, 100);
        if (!rec) { running.current = false; return; } // redirected to wallet
        buyTx = rec.tx;
        if (!buyTx.ok) return fail("buy", buyTx.error || "buy failed", buyTx.hash);
      } catch (e) { return fail("buy", `Wallet: ${(e as Error).message}`); }
    } else {
      const b = await post("/api/collector/buy", { tokenId: m.data.tokenId });
      if (!b.ok) return fail("buy", b.data.error || "buy failed", b.data.tx?.hash);
      buyTx = b.data.tx;
    }
    const entry = { hash: buyTx.hash, at: buyTx.at, ok: true, action: "buy", studioId, title: a.title, events: buyTx.events };
    const all = linesFor(entry);
    setStep("buy", { state: "done", hash: buyTx.hash, note: choice === "wallet" ? "your wallet" : "demo collector" }); setProgress(92);
    setRunLines((ls) => [...ls, ...all.filter((x) => x.kind !== "payout")]);
    setPhase("paying"); setStep("split", { state: "active" });
    await sleep(1200);
    setRunLines((ls) => [...ls, ...all.filter((x) => x.kind === "payout")]);
    setStep("split", { state: "done", hash: buyTx.hash, note: "paid in the same transaction" }); setProgress(100);
    setPhase("done"); setFinishedAt(Date.now()); running.current = false;
    refresh();
  }, [studioId, refresh, walletTx, ownerAuth]);

  const chooseBuyer = useCallback((v: "wallet" | "demo") => { buyChoice.current?.(v); }, []);

  const toggleKill = useCallback(async () => {
    if (!state?.studio) return;
    setKillBusy(true);
    const engaged = !state.studio.kill_switch;
    try {
      if (studioId === DEMO_STUDIO_ID) {
        const r = await post("/api/owner/kill", { engaged });
        setToast({ text: engaged ? "Kill switch engaged on-chain. The agent can no longer spend, mint or list." : "Kill switch released. The artist is back at work.", hash: r.data.tx?.hash });
      } else {
        const r = await walletTx("set_kill_switch", { engaged }, "0", 30);
        if (r?.tx) setToast({ text: engaged ? "Kill switch engaged from your wallet." : "Kill switch released from your wallet.", hash: r.tx.hash });
      }
    } catch (e) { setToast({ text: `Kill switch failed: ${(e as Error).message}` }); }
    setKillBusy(false); refresh();
  }, [state, studioId, walletTx, refresh]);

  const openStudio = useCallback(async (f: { name: string; style: string; floor: string; cap: string; split: number; royalty: number; budget: string }) => {
    const { nearToYocto } = await import("./config");
    const r = await walletTx("open_studio", { name: f.name, style: f.style, floor: nearToYocto(f.floor), split_owner_bps: Math.round(f.split * 100), royalty_bps: Math.round(f.royalty * 100), daily_ai_cap: nearToYocto(f.cap) }, nearToYocto(f.budget), 50);
    if (r?.tx) { setToast({ text: "Your studio is open on-chain. Press Start to put the artist to work for you.", hash: r.tx.hash }); }
    if (account) { setStudioId(account); refresh(account); }
    return r;
  }, [walletTx, account, refresh]);

  const useStudioOf = useCallback((id: string) => { setStudioId(id); refresh(id); }, [refresh]);

  const globalLines: Line[] = ledger.flatMap((e) => linesFor(e));
  return {
    state, studioId, phase, steps, art, runLines, globalLines, ledger, error, tokenId, price, progress, startedAt, finishedAt,
    account, connect, disconnect, walletTx, start, chooseBuyer, countdown, toggleKill, killBusy, openStudio, useStudioOf, toast, setToast, refresh,
    isDemo: studioId === DEMO_STUDIO_ID, killReleaseAt,
  };
}
export type StudioApi = ReturnType<typeof useStudio>;
