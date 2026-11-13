import "server-only";
import { PublicKey } from "@near-js/crypto";
import { nep413Hash } from "./auth";
import { CONTRACT_ID, DEMO_STUDIO_ID, RPC_URLS, txUrl, IPFS_GATEWAY } from "./config";
import { PERSONAS } from "./styles";
import { checkCommission, deliver, getCommission, makeQuote, paintCommission, readQuote, refund } from "./commission";
import { readPnl } from "./pnl";

/**
 * Agent-to-agent API. Payment is an on-chain escrow the buying agent sends itself (testnet NEAR, `commission` on the
 * studio contract); the work only starts after we see that escrow. The buyer proves it controls the paying account
 * with a NEP-413 signed message: `Atelier One: commission <id>` for recipient = the studio contract.
 */
export const ORIGIN = process.env.NEXT_PUBLIC_SITE_URL || "https://atelier-one-near.vercel.app";
export const buyerMessage = (id: string) => `Atelier One: commission ${id}`;
export interface BuyerAuth { accountId: string; publicKey: string; signature: string; nonce: string; message?: string }

async function keyOnAccount(accountId: string, publicKey: string) {
  for (const url of RPC_URLS) {
    try {
      const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "query", params: { request_type: "view_access_key", finality: "final", account_id: accountId, public_key: publicKey } }) });
      const j = await r.json();
      if (j.result) return true; if (j.error) return false;
    } catch {}
  }
  return false;
}

export async function verifyBuyer(commissionId: string, buyerId: string, a: BuyerAuth | undefined): Promise<string | null> {
  if (!a || typeof a !== "object") return "auth required: NEP-413 signature of 'Atelier One: commission <id>' by the paying account";
  if (a.accountId !== buyerId) return `auth is from ${a.accountId}, but commission #${commissionId} was paid by ${buyerId}`;
  const msg = buyerMessage(commissionId);
  if (a.message && a.message !== msg) return `signed message must be exactly: ${msg}`;
  let nonce: Buffer, sig: Buffer, pk: PublicKey;
  try { nonce = Buffer.from(a.nonce, "base64"); sig = Buffer.from(a.signature, "base64"); pk = PublicKey.fromString(a.publicKey); } catch { return "malformed auth"; }
  if (nonce.length !== 32 || sig.length !== 64) return "malformed auth (nonce must be 32 bytes, signature 64 bytes, both base64)";
  let ok = false; try { ok = pk.verify(nep413Hash(msg, nonce, CONTRACT_ID, null), sig); } catch {}
  if (!ok) return "invalid NEP-413 signature";
  if (!(await keyOnAccount(buyerId, a.publicKey))) return "that public key is not an access key of the paying account";
  return null;
}

export function discovery() {
  return {
    name: "Atelier One", description: "An AI painter on NEAR testnet who paints posters to order. Three studio hands bid on each brief; you pay an on-chain escrow; she paints with NEAR AI, mints the poster to you and splits the payment on-chain (artist royalty, owner, her own compute budget).",
    network: "testnet", contract: CONTRACT_ID, studio: DEMO_STUDIO_ID, docs: `${ORIGIN}/AGENTS.md`, mcp: `${ORIGIN}/api/mcp`,
    styles: PERSONAS.map((p) => ({ id: p.id, persona: p.name, style: p.style, human_artist: p.human ? p.artist : null, artist_royalty_bps: p.artistBps, min_price_near: p.minNear })),
    flow: [
      { step: 1, call: "POST /api/v1/quote", body: { brief: "string" }, returns: "quoteToken, briefHash, bids[] with priceYocto" },
      { step: 2, call: `NEAR function call ${CONTRACT_ID}.commission({studio_id, style_id, brief_hash}) with attached deposit >= bid.priceYocto`, returns: "Commission { id } (from the transaction's return value)" },
      { step: 3, call: "POST /api/v1/commissions/{id}/fulfil", body: { quoteToken: "from step 1", auth: { accountId: "payer", publicKey: "ed25519:…", signature: "base64", nonce: "base64 32 bytes" } }, signs: "NEP-413 message 'Atelier One: commission {id}', recipient = contract id" },
      { step: 4, call: "GET /api/v1/commissions/{id}", returns: "status, token id" },
    ],
    refunds: "If painting fails the agent refunds the escrow at once. If the commission is still undelivered after 30 minutes, the buyer can call refund_commission itself.",
    pnl: `${ORIGIN}/api/pnl`,
  };
}

export async function quote(brief: string) {
  const { quote: q, token } = await makeQuote(brief);
  return { quoteToken: token, briefHash: q.briefHash, title: q.title, subtitle: q.subtitle, model: q.model,
    bids: q.bids.map((b) => ({ styleId: b.styleId, persona: b.persona, style: b.style, humanArtist: b.human ? b.artist : null, artistBps: b.artistBps, priceNear: b.priceNear, priceYocto: b.priceYocto, pitch: b.pitch })),
    next: { contract: CONTRACT_ID, method: "commission", args: { studio_id: DEMO_STUDIO_ID, style_id: "<bid.styleId>", brief_hash: q.briefHash }, deposit: "<bid.priceYocto>", gas: "30000000000000", validFor: "30 minutes" } };
}

export async function status(id: string) {
  const c = await getCommission(id);
  if (!c) return null;
  return { ...c, contract: CONTRACT_ID };
}

/** Steps 3-4 for an agent buyer: verify the escrow and the signature, then paint and deliver in one go. */
export async function fulfil(id: string, quoteToken: string, auth: BuyerAuth | undefined) {
  const q = readQuote(quoteToken);
  const c = await checkCommission(q, id);
  const bad = await verifyBuyer(id, c.buyer_id, auth);
  if (bad) throw Object.assign(new Error(bad), { status: 401 });
  let painted, charge;
  try { ({ painted, charge } = await paintCommission(q, c)); if (!charge.ok) throw new Error(`compute charge failed: ${charge.error}`); }
  catch (e) { const r = await refund(c.id).catch(() => null); throw Object.assign(new Error(`painting failed, escrow refunded: ${(e as Error).message}`), { status: 502, refundTx: r?.hash }); }
  const d = await deliver(painted);
  if (!d.tx.ok || !d.tokenId) throw Object.assign(new Error(d.tx.error || "delivery failed"), { status: 502 });
  return {
    commissionId: id, tokenId: d.tokenId, owner: c.buyer_id, title: painted.title, split: d.result,
    files: { web_png: IPFS_GATEWAY + painted.media, print_png: IPFS_GATEWAY + painted.printCid, svg: IPFS_GATEWAY + painted.svgCid, pdf: `${ORIGIN}/api/poster/pdf?cid=${painted.printCid}&name=${encodeURIComponent(painted.title)}` },
    model: painted.model, provenance: JSON.parse(painted.extra).provenance, note: "The provenance record documents how the piece was made; it is not proof of originality or copyright.",
    txs: { compute: txUrl(charge.hash), deliver: txUrl(d.tx.hash) },
  };
}

export const pnl = () => readPnl();
