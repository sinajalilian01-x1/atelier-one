"use client";
import { useEffect, useState } from "react";
import type { StudioApi } from "./useStudio";
import { toNear } from "./config";
import { linesFor, net, pnl, type Line } from "./lines";

export function useNow(active: boolean) {
  const [now, setNow] = useState(0);
  useEffect(() => { setNow(Date.now()); if (!active) return; const t = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(t); }, [active]);
  return now;
}

export function useTyped(text: string, speed = 18) {
  const [n, setN] = useState(0);
  useEffect(() => { setN(0); const t = setInterval(() => setN((x) => { if (x >= text.length) { clearInterval(t); return x; } return x + 1; }), speed); return () => clearInterval(t); }, [text, speed]);
  return text.slice(0, n);
}

export function fmtAmt(y: string | null, d = 3) {
  if (y == null) return "";
  const neg = y.startsWith("-");
  const v = toNear(neg ? y.slice(1) : y, d);
  return (neg ? "−" : "+") + v;
}

export function deriveView(s: StudioApi, now: number) {
  const st = s.state?.studio;
  const floor = st ? toNear(st.floor, 3).replace(/0+$/, "").replace(/\.$/, "") : "…";
  const split = st ? st.split_owner_bps / 100 : 70;
  const provider = s.state?.ai?.nearAiKey ? "NEAR AI Cloud" : "my local painter";
  const priceN = s.price ? toNear(s.price, 3) : s.art ? String(s.art.price) : "";
  let thinking = "";
  switch (s.phase) {
    case "idle": thinking = st ? `Easel's clean. Press Start: I'll paint, pay my own AI bill, mint it and sell above my ${floor} NEAR floor.` : "Opening the studio…"; break;
    case "painting": thinking = s.art ? s.art.thinking : `Sketching… asking ${provider} for an idea that fits today's budget.`; break;
    case "minting": thinking = s.art?.thinking || "Minting…"; break;
    case "listing": thinking = `Minted. Listing it at ${priceN} NEAR — the contract won't let me go under ${floor}.`; break;
    case "awaiting-buyer": thinking = `“${s.art?.title}” is on the wall at ${priceN} NEAR. Who wants it?`; break;
    case "buying": thinking = "A collector is paying on-chain…"; break;
    case "paying": thinking = `Sold! Splitting ${priceN} NEAR: ${split}% to my owner, ${100 - split}% back into my AI budget.`; break;
    case "done": thinking = `Sold “${s.art?.title}” for ${priceN} NEAR. Bills paid, owner paid. Again?`; break;
    case "killed": thinking = "My owner pulled the kill switch. I tried to buy compute and the contract said no. I'll wait."; break;
    case "error": thinking = `Hmm, that didn't work: ${s.error}`; break;
  }
  const elapsed = s.startedAt ? Math.max(0, Math.round(((s.finishedAt || now || s.startedAt) - s.startedAt) / 1000)) : null;
  const running = !["idle", "done", "error", "killed"].includes(s.phase);

  let lines: Line[] = s.runLines;
  let receiptMode: "run" | "last" = "run";
  if (!lines.length) {
    receiptMode = "last";
    const mine = s.ledger.filter((e) => e.studioId === s.studioId);
    // the latest complete run: walk back from the latest buy to its charge
    const idx = mine.findIndex((e) => e.action === "buy");
    const slice = idx >= 0 ? mine.slice(idx, idx + 4) : mine.slice(0, 4);
    lines = slice.reverse().flatMap((e) => linesFor(e));
  }
  const netY = net(lines);
  const pl = pnl(lines);
  return {
    st, floor, split, thinking, elapsed, running, lines, receiptMode, netY, pl,
    spent: st ? toNear(st.spent_today, 3) : "0", cap: st ? toNear(st.daily_ai_cap, 3) : "0",
    budget: st ? toNear(st.budget, 3) : "0",
  };
}
