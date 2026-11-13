export const NETWORK = "testnet" as const;
export const CONTRACT_ID = process.env.NEXT_PUBLIC_CONTRACT_ID || "studio.atelier-one.testnet";
export const AGENT_ID = process.env.NEXT_PUBLIC_AGENT_ID || "artist.atelier-one.testnet";
export const DEMO_STUDIO_ID = process.env.NEXT_PUBLIC_DEMO_STUDIO_ID || "sina.atelier-one.testnet";
export const TREASURY_ID = process.env.NEXT_PUBLIC_TREASURY_ID || "treasury.atelier-one.testnet";
export const COLLECTOR_ID = process.env.NEXT_PUBLIC_COLLECTOR_ID || "collector.atelier-one.testnet";
export const RPC_URLS = ["https://rpc.testnet.near.org", "https://test.rpc.fastnear.com"];
/** NEAR Rocks (FastNear) is the explorer the official explorer.testnet.near.org selector recommends. */
export const EXPLORER = "https://testnet.near.rocks";
export const txUrl = (h: string) => `${EXPLORER}/tx/${h}`;
export const accountUrl = (a: string) => `${EXPLORER}/account/${a}`;
export const nearblocksTxUrl = (h: string) => `https://testnet.nearblocks.io/txns/${h}`;
export const IPFS_GATEWAY = "https://gateway.pinata.cloud/ipfs/";
/** NEP-177: new tokens store a bare CID and the contract's base_uri is the IPFS gateway. */
export const mediaUrl = (m?: string | null) => (!m ? "" : /^(https?:|data:)/.test(m) ? m : IPFS_GATEWAY + m.replace(/^ipfs:\/\//, ""));
/** For <img>/textures: the same artwork through our CDN-cached same-origin proxy (/api/media/<cid>). Links keep mediaUrl. */
export const imgUrl = (m?: string | null) => {
  if (!m) return "";
  const cid = m.replace(/^ipfs:\/\//, "").replace(/^https?:\/\/[^/]+\/ipfs\//, "");
  return /^(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{20,100})$/.test(cid) ? `/api/media/${cid}` : mediaUrl(m);
};
/** Hard cap on what the demo collector will pay for one work (yoctoNEAR). */
export const DEMO_COLLECTOR_MAX = 250_000_000_000_000_000_000_000n; // 0.25 NEAR
export const YOCTO = 10n ** 24n;
export function toNear(y: string | bigint, digits = 4): string {
  const v = typeof y === "bigint" ? y : BigInt(y || "0");
  const neg = v < 0n;
  const a = neg ? -v : v;
  const whole = a / YOCTO;
  const frac = (a % YOCTO).toString().padStart(24, "0").slice(0, digits);
  return `${neg ? "-" : ""}${whole}.${frac}`;
}
export function nearToYocto(n: number | string): string {
  const [w, f = ""] = String(n).split(".");
  return (BigInt(w || "0") * YOCTO + BigInt((f + "0".repeat(24)).slice(0, 24))).toString();
}
