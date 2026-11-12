import "server-only";
import { createHash } from "crypto";
import { PublicKey } from "@near-js/crypto";
import { CONTRACT_ID, RPC_URLS } from "./config";

/**
 * NEP-413 owner authorization for running a non-demo studio.
 * The owner signs once in their wallet: "Atelier One: run studio <id> until <ISO time>".
 * We check the ed25519 signature over the NEP-413 payload hash and that the public key is a
 * FULL-ACCESS key of the studio owner's account on-chain.
 */
export interface OwnerAuth { accountId: string; publicKey: string; signature: string; message: string; nonce: string; callbackUrl?: string | null }

export const AUTH_RECIPIENT = CONTRACT_ID;
export const authMessage = (studioId: string, untilIso: string) => `Atelier One: run studio ${studioId} until ${untilIso}`;
const MAX_TTL_MS = 24 * 3600_000;

function borshString(s: string) {
  const b = Buffer.from(s, "utf8");
  const len = Buffer.alloc(4); len.writeUInt32LE(b.length);
  return Buffer.concat([len, b]);
}
export function nep413Hash(message: string, nonce: Buffer, recipient: string, callbackUrl?: string | null) {
  const tag = Buffer.alloc(4); tag.writeUInt32LE(2 ** 31 + 413);
  const parts = [tag, borshString(message), nonce, borshString(recipient)];
  parts.push(callbackUrl ? Buffer.concat([Buffer.from([1]), borshString(callbackUrl)]) : Buffer.from([0]));
  return createHash("sha256").update(Buffer.concat(parts)).digest();
}

async function isFullAccessKey(accountId: string, publicKey: string) {
  for (const url of RPC_URLS) {
    try {
      const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "query", params: { request_type: "view_access_key", finality: "final", account_id: accountId, public_key: publicKey } }) });
      const j = await r.json();
      if (j.result) return j.result.permission === "FullAccess";
      if (j.error) return false;
    } catch {}
  }
  return false;
}

export async function verifyOwnerAuth(studioId: string, a: OwnerAuth | undefined): Promise<string | null> {
  if (!a || typeof a !== "object") return "Running your own studio needs a one-time owner signature (NEP-413). Connect your wallet and press Start again.";
  if (a.accountId !== studioId) return "The signature is from a different account than the studio owner";
  const m = /^Atelier One: run studio (\S+) until (\S+)$/.exec(String(a.message || ""));
  if (!m || m[1] !== studioId) return "Signed message does not match this studio";
  const until = Date.parse(m[2]);
  if (!Number.isFinite(until) || until < Date.now() || until - Date.now() > MAX_TTL_MS) return "Owner signature expired. Sign again.";
  let nonce: Buffer, sig: Buffer;
  try { nonce = Buffer.from(a.nonce, "base64"); sig = Buffer.from(a.signature, "base64"); } catch { return "Malformed signature"; }
  if (nonce.length !== 32 || sig.length !== 64) return "Malformed signature";
  let pk: PublicKey;
  try { pk = PublicKey.fromString(a.publicKey); } catch { return "Malformed public key"; }
  const ok = [a.callbackUrl || null, null].some((cb) => { try { return pk.verify(nep413Hash(a.message, nonce, AUTH_RECIPIENT, cb), sig); } catch { return false; } });
  if (!ok) return "Owner signature is invalid";
  if (!(await isFullAccessKey(studioId, a.publicKey))) return "That key is not a full-access key of the studio owner";
  return null;
}

/** Best-effort per-IP rate limit (in-memory per server instance; the contract's daily AI cap is the hard limit). */
const buckets = new Map<string, number[]>();
export function rateLimit(req: Request, name: string, max: number, windowMs: number): { ok: boolean; retryAfter: number } {
  const ip = (req.headers.get("x-real-ip") || req.headers.get("x-forwarded-for")?.split(",")[0] || "unknown").trim();
  const key = `${name}:${ip}`, now = Date.now();
  const hits = (buckets.get(key) || []).filter((t) => now - t < windowMs);
  if (hits.length >= max) { buckets.set(key, hits); return { ok: false, retryAfter: Math.ceil((hits[0] + windowMs - now) / 1000) }; }
  hits.push(now); buckets.set(key, hits);
  if (buckets.size > 5000) for (const [k, v] of buckets) if (!v.some((t) => now - t < windowMs)) buckets.delete(k);
  return { ok: true, retryAfter: 0 };
}
