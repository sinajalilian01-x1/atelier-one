// An example buying agent for the Atelier One agent API (NEAR testnet only).
//   BUYER_ACCOUNT_ID=you.testnet BUYER_PRIVATE_KEY=ed25519:... node examples/agent-buyer.mjs "poster brief" [styleId]
// 1) asks for a quote, 2) pays the escrow on-chain from its own account, 3) signs a NEP-413 message proving it is the
// payer, 4) asks the painter to fulfil. The key never leaves this process; it is read from the environment.
import { createHash, randomBytes } from "node:crypto";
import { Account, JsonRpcProvider, KeyPair, KeyPairSigner, actions } from "near-api-js";

const BASE = process.env.ATELIER_URL || "https://atelier-one-near.vercel.app";
const [brief = "A poster for a small farmers' market, Saturday 9:00, Prague Holešovice", pick] = process.argv.slice(2);
const id = process.env.BUYER_ACCOUNT_ID, sk = process.env.BUYER_PRIVATE_KEY;
if (!id || !sk) { console.error("set BUYER_ACCOUNT_ID and BUYER_PRIVATE_KEY (testnet)"); process.exit(1); }
const post = async (p, b) => { const r = await fetch(BASE + p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) }); const j = await r.json(); if (!r.ok) throw new Error(`${p}: ${j.error}`); return j; };
const t0 = Date.now(); const at = () => `${((Date.now() - t0) / 1000).toFixed(1)}s`;

const api = await (await fetch(BASE + "/api/v1")).json();
const q = await post("/api/v1/quote", { brief });
const bid = q.bids.find((b) => b.styleId === pick) || q.bids[0];
console.log(at(), "quote:", q.title, "→", bid.persona, bid.priceNear, "NEAR");

const kp = KeyPair.fromString(sk);
const acct = new Account(id, new JsonRpcProvider({ url: "https://rpc.testnet.near.org" }), new KeyPairSigner(kp));
const res = await acct.signAndSendTransaction({ receiverId: api.contract, actions: [actions.functionCall("commission", { ...q.next.args, style_id: bid.styleId }, 30_000_000_000_000n, BigInt(bid.priceYocto))], waitUntil: "EXECUTED_OPTIMISTIC" });
const c = JSON.parse(Buffer.from(res.status.SuccessValue, "base64").toString());
console.log(at(), "escrow paid: commission", c.id, "tx", res.transaction.hash);

// NEP-413: sha256(borsh({tag: 2^31+413, message, nonce[32], recipient, callbackUrl: None})) signed with ed25519
const message = `Atelier One: commission ${c.id}`, nonce = randomBytes(32);
const str = (s) => { const b = Buffer.from(s); const l = Buffer.alloc(4); l.writeUInt32LE(b.length); return Buffer.concat([l, b]); };
const tag = Buffer.alloc(4); tag.writeUInt32LE(2 ** 31 + 413);
const hash = createHash("sha256").update(Buffer.concat([tag, str(message), nonce, str(api.contract), Buffer.from([0])])).digest();
const { signature } = kp.sign(hash);
const auth = { accountId: id, publicKey: kp.getPublicKey().toString(), signature: Buffer.from(signature).toString("base64"), nonce: nonce.toString("base64") };

const done = await post(`/api/v1/commissions/${c.id}/fulfil`, { quoteToken: q.quoteToken, auth });
console.log(at(), "delivered: token", done.tokenId, "to", done.owner);
console.log(JSON.stringify({ files: done.files, split: done.split, txs: done.txs }, null, 2));
