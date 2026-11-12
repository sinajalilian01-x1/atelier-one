"use client";
import type { StudioApi } from "@/lib/useStudio";
import { accountUrl, toNear } from "@/lib/config";

export function HowItWorks({ s, skin }: { s: StudioApi; skin: "receipt" | "clay" }) {
  const st = s.state?.studio;
  const ai = s.state?.ai;
  return (
    <section className={`hiw hiw-${skin}`}>
      <div className="hiw-grid">
        <div><b>1 · You own the studio</b><p>Connect a wallet, fund a small AI budget and set the rules: style, price floor, daily AI cap, revenue split, resale royalty, kill switch. All rules live in the contract.</p></div>
        <div><b>2 · The artist runs it</b><p>Her own NEAR account holds only a function-call key: it can pay for inference, mint and list. It can&apos;t move your money, and the contract enforces your floor and cap. Inference fees go to the platform treasury, not to the agent.</p></div>
        <div><b>3 · Sales pay everyone</b><p>A collector buys, and the same transaction pays you {st ? st.split_owner_bps / 100 : 70}% and puts {st ? 100 - st.split_owner_bps / 100 : 30}% back into her AI budget. Resales pay a {st ? st.royalty_bps / 100 : 10}% royalty (NEP-199).</p></div>
      </div>
      <div className="hiw-proof">
        <span>contract <a href={accountUrl(s.state?.contractId || "")} target="_blank" rel="noreferrer">{s.state?.contractId}</a></span>
        <span>artist <a href={accountUrl(s.state?.agentId || "")} target="_blank" rel="noreferrer">{s.state?.agentId}</a> (function-call key only)</span>
        <span>demo collector <a href={accountUrl(s.state?.collectorId || "")} target="_blank" rel="noreferrer">{s.state?.collectorId}</a></span>
        <span>works minted {s.state?.config?.total_supply ?? "…"} · sold {st?.works_sold ?? "…"} · owner earned {st ? toNear(st.owner_earned_total, 3) : "…"} N</span>
        <span>AI: {ai ? (ai.nearAiKey ? `NEAR AI Cloud (${ai.textModel}${ai.imageModel ? " + " + ai.imageModel : ""})` : "local generative painter. NEAR AI Cloud is wired in and switches on when NEAR_AI_API_KEY is set") : "…"}</span>
        <span>treasury <a href={accountUrl(s.state?.config?.treasury_id || "")} target="_blank" rel="noreferrer">{s.state?.config?.treasury_id}</a> (receives inference fees)</span>
        <span>One agent under an on-chain policy contract. Also by Sina at NEAR HACKATHON: <b>Muse Swarm</b>, a multi-agent swarm of four robots in a low-poly 3D room</span>
      </div>
    </section>
  );
}
