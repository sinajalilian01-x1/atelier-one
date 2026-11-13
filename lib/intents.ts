import "server-only";
// NEAR Intents 1Click: live, read-only price quotes for paying a commission in another token.
// Every request is `dry: true`: no deposit address is created and nothing can be sent or spent.
// Settlement in this build is testnet NEAR only (NEAR Intents has no testnet).
const API = "https://1click.chaindefuser.com/v0";
export const PAY_TOKENS = [
  { id: "usdc-base", label: "USDC", chain: "Base", asset: "nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near" },
  { id: "usdc-sol", label: "USDC", chain: "Solana", asset: "nep141:sol-5ce3bf3a31af18be40ba30f721101b4341690186.omft.near" },
  { id: "eth", label: "ETH", chain: "Ethereum", asset: "nep141:eth.omft.near" },
  { id: "sol", label: "SOL", chain: "Solana", asset: "nep141:sol.omft.near" },
  { id: "usdt-near", label: "USDT", chain: "NEAR", asset: "nep141:usdt.tether-token.near" },
  { id: "btc", label: "BTC", chain: "Bitcoin", asset: "nep141:btc.omft.near" },
] as const;
const WNEAR = "nep141:wrap.near";

export interface IntentQuote { token: string; label: string; chain: string; ok: boolean; amountIn?: string; amountInUsd?: string; seconds?: number; error?: string }

export async function dryQuotes(yoctoOut: string): Promise<{ at: number; quotes: IntentQuote[] }> {
  const deadline = new Date(Date.now() + 30 * 60_000).toISOString();
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (process.env.ONECLICK_JWT) headers.authorization = `Bearer ${process.env.ONECLICK_JWT}`;
  const quotes = await Promise.all(PAY_TOKENS.map(async (t): Promise<IntentQuote> => {
    try {
      const r = await fetch(`${API}/quote`, {
        method: "POST", headers, signal: AbortSignal.timeout(8000),
        body: JSON.stringify({
          dry: true, swapType: "EXACT_OUTPUT", slippageTolerance: 100, originAsset: t.asset, depositType: "ORIGIN_CHAIN",
          destinationAsset: WNEAR, amount: yoctoOut, refundTo: "near", refundType: "INTENTS",
          // Placeholder mainnet recipient for a read-only price check; no funds can move on a dry quote.
          recipient: process.env.INTENTS_QUOTE_RECIPIENT || "near", recipientType: "DESTINATION_CHAIN", deadline, referral: "atelier-one",
        }),
      });
      const j = await r.json();
      if (!r.ok || !j.quote) {
        const m = String(j.message || `HTTP ${r.status}`);
        const min = m.match(/at least (\d+)/);
        return { token: t.id, label: t.label, chain: t.chain, ok: false, error: min ? `minimum ≈ ${(Number(min[1]) / 1e24).toFixed(2)} NEAR` : m.slice(0, 80) };
      }
      return { token: t.id, label: t.label, chain: t.chain, ok: true, amountIn: j.quote.amountInFormatted, amountInUsd: j.quote.amountInUsd, seconds: j.quote.timeEstimate };
    } catch (e) {
      return { token: t.id, label: t.label, chain: t.chain, ok: false, error: (e as Error).name === "TimeoutError" ? "timeout" : "unavailable" };
    }
  }));
  return { at: Date.now(), quotes };
}
