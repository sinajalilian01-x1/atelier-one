import "server-only";
import { createHash, randomInt } from "crypto";
import { IMAGE_MODEL, TEXT_MODEL, nearAiImage, nearAiJson, nearUsd, usdToYocto, FALLBACK_FEE_YOCTO } from "./ai";
import { PERSONAS, persona, type StyleId } from "./styles";
import { composePoster, renderPng } from "./poster";
import { pin } from "./ipfs";
import { agentCall, collectorCall, view, type TxResult } from "./near";
import { signToken, verifyToken } from "./job";
import { record } from "./ledger";
import { COLLECTOR_ID, DEMO_STUDIO_ID, nearToYocto, renderArtFallback } from "./commission-fallback";

export const sha256 = (s: string | Buffer) => createHash("sha256").update(s).digest("hex");

export interface Bid { styleId: StyleId; persona: string; style: string; human: boolean; artist?: string; artistBps: number; priceNear: number; priceYocto: string; pitch: string }
export interface Quote { brief: string; briefHash: string; title: string; subtitle: string; details: string; subject: string; bids: Bid[]; model: string; ms: number; at: number }
export interface OnchainCommission { id: string; buyer_id: string; studio_id: string; style_id: string; price: string; brief_hash: string; status: "Open" | "Delivered" | "Refunded"; token_id: string | null; created_at_ms: string }

const clean = (s: unknown, n: number) => String(s ?? "").replace(/\s+/g, " ").replace(/[<>]/g, "").trim().slice(0, n);
const round = (x: number) => Math.round(x * 200) / 200; // 0.005 NEAR steps

/** Step 1 (free): read the brief, write the poster copy, and have the three studio hands bid. */
export async function makeQuote(briefRaw: string): Promise<{ quote: Quote; token: string }> {
  const brief = clean(briefRaw, 400);
  if (brief.length < 3) throw new Error("Tell the studio what the poster is for");
  const t0 = Date.now();
  let data: any = null, model = "atelier-quote-rules-v1 (fallback: NEAR AI unavailable)"; // eslint-disable-line @typescript-eslint/no-explicit-any
  if (process.env.NEAR_AI_API_KEY) {
    try {
      const system = "You are the front desk of Atelier One, a small poster studio run by an AI painter on NEAR. You turn a customer's brief into poster copy and three bids. Reply with JSON only. Never name or imitate a real living artist other than Sina Jalilian.";
      const prompt = `Customer brief: """${brief}"""
Return JSON: {"title": "poster headline, max 32 chars, from the brief", "subtitle": "one line, max 60 chars", "details": "date / place / time if the brief gives them, else a 2-4 word tagline, max 40 chars", "subject": "one vivid sentence describing the picture to paint, no text in the image, no real people", "complexity": 1|2|3,
"pitches": {"paper-fox": "Pip (warm paper-cutout house style) pitches in max 16 words, first person", "grid-ink": "Ora (Swiss grid, huge type, one hot colour) pitches in max 16 words", "sina-neon": "Sina Jalilian's neon style pitch in max 16 words, third person about Sina"}}`;
      const r = await nearAiJson(prompt, system, { temperature: 0.7, maxTokens: 500, timeoutMs: 15_000 });
      data = r.data; model = TEXT_MODEL;
    } catch (e) { console.error("quote LLM failed, using rules", e); }
  }
  if (!data) {
    const words = brief.split(" ");
    data = { title: words.slice(0, 5).join(" "), subtitle: brief.slice(0, 60), details: "Made at Atelier One", subject: brief, complexity: 2,
      pitches: { "paper-fox": "Warm cut paper, soft shadows, made to hang in a kitchen.", "grid-ink": "Big type, one hot colour, readable from across the street.", "sina-neon": "Sina's neon rim light on black: built to glow on a wall." } };
  }
  const cx = Math.min(3, Math.max(1, Number(data.complexity) || 2));
  const bids: Bid[] = PERSONAS.map((p) => {
    const priceNear = round(p.minNear * (1 + 0.2 * (cx - 1)));
    return { styleId: p.id, persona: p.name, style: p.style, human: p.human, artist: p.artist, artistBps: p.artistBps, priceNear, priceYocto: nearToYocto(priceNear), pitch: clean(data.pitches?.[p.id], 120) || p.tagline };
  });
  const quote: Quote = {
    brief, briefHash: sha256(brief), title: clean(data.title, 40) || "Untitled", subtitle: clean(data.subtitle, 70), details: clean(data.details, 44),
    subject: clean(data.subject, 300) || brief, bids, model, ms: Date.now() - t0, at: Date.now(),
  };
  return { quote, token: signToken("quote", quote) };
}
export const readQuote = (token: string) => verifyToken<Quote>("quote", token, 30 * 60_000);

export async function getCommission(id: string | number): Promise<OnchainCommission | null> {
  return view<OnchainCommission | null>("get_commission", { commission_id: String(id) });
}

/** The demo patron (a funded testnet account) pays the escrow for visitors without a wallet. */
export async function payAsDemoPatron(q: Quote, styleId: StyleId): Promise<TxResult & { commissionId?: string }> {
  const bid = q.bids.find((b) => b.styleId === styleId);
  if (!bid) throw new Error("Unknown bid");
  const tx = await collectorCall("commission", { studio_id: DEMO_STUDIO_ID, style_id: styleId, brief_hash: q.briefHash }, bid.priceYocto);
  const ev = tx.events.find((e) => e.event === "commissioned");
  await record({ hash: tx.hash, signerId: tx.signerId, at: Date.now(), action: "commission", studioId: DEMO_STUDIO_ID, ok: tx.ok, error: tx.error, title: q.title, events: tx.events });
  return { ...tx, commissionId: ev ? String(ev.data.commission_id) : undefined };
}

export interface Painted {
  commissionId: string; styleId: StyleId; title: string; description: string;
  media: string; mediaHash: string; printCid: string; svgCid: string; extra: string;
  provider: string; model: string; costYocto: string; costUsd: number | null; ms: number;
}

/** Check that an on-chain commission really pays for this quote and bid. */
export async function checkCommission(q: Quote, commissionId: string): Promise<OnchainCommission> {
  const c = await getCommission(commissionId);
  if (!c) throw new Error(`Commission #${commissionId} not found on-chain`);
  if (c.status !== "Open") throw new Error(`Commission #${commissionId} is already ${c.status.toLowerCase()}`);
  if (c.brief_hash !== q.briefHash) throw new Error("This commission was paid for a different brief");
  const bid = q.bids.find((b) => b.styleId === c.style_id);
  if (!bid) throw new Error("Unknown style on the commission");
  if (BigInt(c.price) < BigInt(bid.priceYocto)) throw new Error("The escrow is below the quoted price");
  if (c.studio_id !== DEMO_STUDIO_ID) throw new Error("Commission is for another studio");
  return c;
}

/** Step 3: paint (NEAR AI image), set the type, render print files, pin to IPFS, and pay the compute bill on-chain. */
export async function paintCommission(q: Quote, c: OnchainCommission): Promise<{ painted: Painted; charge: TxResult; previewPng: string }> {
  const t0 = Date.now();
  const p = persona(c.style_id)!;
  const seed = randomInt(1, 2 ** 31 - 1);
  const imgPrompt = p.imagePrompt(q.subject);
  let img: { b64: string; mime: string }, provider = "NEAR AI Cloud", model = IMAGE_MODEL, costUsd: number | null = 0.012;
  try {
    const bytes = await nearAiImage(imgPrompt, "768x1024", seed);
    img = { b64: bytes.toString("base64"), mime: bytes[0] === 0xff ? "image/jpeg" : "image/png" };
  } catch (e) {
    console.error("image gen failed, using the local painter", e);
    const svg = renderArtFallback(seed, q.title);
    img = { b64: renderPng(svg, 900).toString("base64"), mime: "image/png" };
    provider = "atelier-local-painter (fallback: NEAR AI unavailable)"; model = "atelier-generative-svg-v1"; costUsd = null;
  }
  const no = `No. ${c.id}`;
  const svg = composePoster(c.style_id as StyleId, img, { title: q.title, subtitle: q.subtitle, details: q.details, no });
  const web = renderPng(svg, 1200);
  const print = renderPng(svg, 1800);
  const usd = await nearUsd();
  const textCost = q.model.includes("/") ? 0.0004 : 0; // the quote call, ~600 tokens
  const costYocto = costUsd == null ? FALLBACK_FEE_YOCTO : usdToYocto(costUsd + textCost, usd);
  const fullModel = costUsd == null ? model : `${TEXT_MODEL} + ${IMAGE_MODEL}`;
  // pay the compute bill on-chain while the files upload
  const chargeP = agentCall("agent_charge_inference", {
    studio_id: c.studio_id, amount: costYocto, model: fullModel.slice(0, 80), provider: provider.slice(0, 60), job_id: `commission-${c.id}`,
  });
  const [pWeb, pPrint, pSvg, charge] = await Promise.all([
    pin(web, `atelier-one-c${c.id}.png`, "image/png"),
    pin(print, `atelier-one-c${c.id}-print-1800x2400.png`, "image/png"),
    pin(Buffer.from(svg), `atelier-one-c${c.id}.svg`, "image/svg+xml"),
    chargeP,
  ]);
  await record({ hash: charge.hash, signerId: charge.signerId, at: Date.now(), action: "agent_charge_inference", studioId: c.studio_id, ok: charge.ok, error: charge.error, title: q.title, events: charge.events });
  // A recorded provenance record (what was asked, which model, when, which seed). It documents how the piece was
  // made; it is not proof of originality or copyright.
  const extra = JSON.stringify({
    provenance: { v: 1, commission: c.id, style: c.style_id, brief_sha256: q.briefHash, prompt_sha256: sha256(imgPrompt), model: fullModel, provider, seed, at: new Date().toISOString() },
    files: { print_png: pPrint.cid, svg: pSvg.cid },
    note: "Provenance record only; not a proof of originality or copyright.",
  });
  const painted: Painted = {
    commissionId: c.id, styleId: c.style_id as StyleId, title: q.title, description: `${q.subtitle}`.slice(0, 120),
    media: pWeb.cid, mediaHash: pWeb.media_hash, printCid: pPrint.cid, svgCid: pSvg.cid, extra,
    provider, model: fullModel, costYocto, costUsd: costUsd == null ? null : costUsd + textCost, ms: Date.now() - t0,
  };
  return { painted, charge, previewPng: renderPng(svg, 600).toString("base64") };
}
export const signPainted = (p: Painted) => signToken("painted", p);
export const readPainted = (t: string) => verifyToken<Painted>("painted", t, 30 * 60_000);

/** Step 4: mint straight to the buyer; the same transaction pays the artist royalty, the owner and the studio budget. */
export async function deliver(p: Painted) {
  const tx = await agentCall("agent_deliver", {
    commission_id: p.commissionId,
    metadata: { title: p.title, description: p.description, media: p.media, media_hash: p.mediaHash, extra: p.extra },
  });
  const ev = tx.events.find((e) => e.event === "commission_delivered");
  await record({ hash: tx.hash, signerId: tx.signerId, at: Date.now(), action: "agent_deliver", studioId: DEMO_STUDIO_ID, ok: tx.ok, error: tx.error, title: p.title, tokenId: ev?.data?.token_id as string | undefined, events: tx.events });
  return { tx, tokenId: ev?.data?.token_id as string | undefined, result: tx.returnValue as Record<string, string> | undefined };
}

/** If the demo patron paid, hand the token to the visitor's own testnet account. */
export async function handOver(tokenId: string, to: string) {
  const tx = await collectorCall("nft_transfer", { receiver_id: to, token_id: tokenId, memo: "Atelier One commission delivery" }, "1");
  await record({ hash: tx.hash, signerId: tx.signerId, at: Date.now(), action: "nft_transfer", studioId: DEMO_STUDIO_ID, ok: tx.ok, error: tx.error, tokenId, events: tx.events });
  return tx;
}

export async function refund(commissionId: string) {
  const tx = await agentCall("refund_commission", { commission_id: commissionId });
  await record({ hash: tx.hash, signerId: tx.signerId, at: Date.now(), action: "refund_commission", studioId: DEMO_STUDIO_ID, ok: tx.ok, error: tx.error, events: tx.events });
  return tx;
}
export { COLLECTOR_ID };
