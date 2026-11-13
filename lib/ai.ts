import "server-only";
import { localConcept, MOTIFS, PALETTES, renderSvg, hashSeed, type Motif } from "./art";

const BASE = process.env.NEAR_AI_BASE_URL || "https://cloud-api.near.ai/v1";
const TEXT_MODEL = process.env.NEAR_AI_TEXT_MODEL || "Qwen/Qwen3.6-35B-A3B-FP8";
const IMAGE_MODEL = process.env.NEAR_AI_IMAGE_MODEL || "black-forest-labs/FLUX.2-klein-4B";
/** Flat compute fee charged to the studio budget (paid to the treasury) when the local fallback painter is used. */
export const FALLBACK_FEE_YOCTO = "2000000000000000000000"; // 0.002 NEAR

export function aiMode() {
  const key = !!process.env.NEAR_AI_API_KEY;
  return {
    nearAiKey: key,
    provider: key ? "NEAR AI Cloud" : "Local generative painter (fallback)",
    textModel: key ? TEXT_MODEL : null,
    imageModel: key && process.env.NEAR_AI_IMAGE !== "off" ? IMAGE_MODEL : null,
  };
}

export interface Artwork {
  title: string;
  thinking: string;
  motif: Motif;
  paletteName: string;
  price: number;
  mime: "image/svg+xml" | "image/png";
  bytes: Buffer;
  svg?: string;
  provider: string;
  model: string;
  costUsd: number | null;
  costYocto: string;
  usage?: Record<string, number>;
}

let priceCache: { v: number; t: number } | null = null;
async function nearUsd(): Promise<number> {
  if (priceCache && Date.now() - priceCache.t < 10 * 60_000) return priceCache.v;
  try {
    const r = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=near&vs_currencies=usd", { signal: AbortSignal.timeout(2500) });
    const j = await r.json();
    const v = Number(j?.near?.usd);
    if (v > 0) { priceCache = { v, t: Date.now() }; return v; }
  } catch {}
  return 2.5;
}

function usdToYocto(usd: number, nearUsdPrice: number): string {
  const near = Math.max(usd / nearUsdPrice, 0.0001);
  return BigInt(Math.round(near * 1e9)).toString() + "000000000000000"; // 1e9 * 1e15 = 1e24
}

async function nearAiJson(prompt: string, system: string) {
  const r = await fetch(`${BASE}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${process.env.NEAR_AI_API_KEY}` },
    body: JSON.stringify({ model: TEXT_MODEL, temperature: 0.9, max_tokens: 700, messages: [{ role: "system", content: system }, { role: "user", content: prompt }] }),
    signal: AbortSignal.timeout(25_000),
  });
  if (!r.ok) throw new Error(`NEAR AI chat ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  const text: string = (j.choices?.[0]?.message?.content || "").replace(/<think>[\s\S]*?<\/think>/g, "");
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("NEAR AI returned no JSON");
  return { data: JSON.parse(m[0]), usage: j.usage || {} };
}

async function nearAiImage(prompt: string): Promise<Buffer> {
  const r = await fetch(`${BASE}/images/generations`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${process.env.NEAR_AI_API_KEY}` },
    body: JSON.stringify({ model: IMAGE_MODEL, prompt, n: 1, size: "1024x1024", response_format: "b64_json" }),
    signal: AbortSignal.timeout(40_000),
  });
  if (!r.ok) throw new Error(`NEAR AI image ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  const b64 = j.data?.[0]?.b64_json;
  if (b64) return Buffer.from(b64, "base64");
  const url = j.data?.[0]?.url;
  if (url) return Buffer.from(await (await fetch(url)).arrayBuffer());
  throw new Error("NEAR AI image: empty response");
}

export async function paint(jobId: string, style: string, floorNear: number): Promise<Artwork> {
  const seed = hashSeed(jobId);
  if (process.env.NEAR_AI_API_KEY) {
    try {
      const system = "You are Atelier One, a solo AI painter who runs his own art studio as a business on NEAR. You think out loud briefly, in first person, warm and witty. Reply with JSON only.";
      const prompt = `Owner's style rules: "${style}". Price floor: ${floorNear} NEAR (never price below it, at most ${(floorNear * 1.6).toFixed(3)}).
Pick one motif from ${JSON.stringify(MOTIFS)} and one palette from ${JSON.stringify(PALETTES.map((p) => p.name))}.
Return {"title": "2-3 word title", "motif": "...", "palette": "...", "price_near": number, "thinking": "max 28 words: what you're painting and why that price", "image_prompt": "one vivid sentence describing the painting"}`;
      const { data, usage } = await nearAiJson(prompt, system);
      const motif: Motif = MOTIFS.includes(data.motif) ? data.motif : localConcept(jobId, floorNear).motif;
      const palette = PALETTES.find((p) => p.name === data.palette) || PALETTES[seed % PALETTES.length];
      const price = Math.min(Math.max(Number(data.price_near) || floorNear, floorNear), floorNear * 1.6);
      const title = String(data.title || "Untitled").slice(0, 40);
      const usd = await nearUsd();
      let costUsd = ((usage.prompt_tokens || 0) * 1.7e-7 + (usage.completion_tokens || 0) * 1e-6);
      let bytes: Buffer, mime: Artwork["mime"] = "image/svg+xml", svg: string | undefined, model = TEXT_MODEL;
      if (process.env.NEAR_AI_IMAGE !== "off") {
        try {
          bytes = await nearAiImage(`${data.image_prompt}. Flat naive painting, bold black outlines, ${palette.name.toLowerCase()} palette (${[palette.sky, palette.sun, palette.ground, palette.paper].join(", ")}), playful, gallery print, no text.`);
          mime = "image/png"; costUsd += 0.012; model = `${TEXT_MODEL} + ${IMAGE_MODEL}`;
        } catch (e) {
          console.error("image gen failed, using SVG painter", e);
          svg = renderSvg({ motif, palette, seed, title }); bytes = Buffer.from(svg);
        }
      } else { svg = renderSvg({ motif, palette, seed, title }); bytes = Buffer.from(svg); }
      return { title, thinking: String(data.thinking || "").slice(0, 220), motif, paletteName: palette.name, price: Math.round(price * 1000) / 1000, mime, bytes: bytes!, svg, provider: "NEAR AI Cloud", model, costUsd, costYocto: usdToYocto(costUsd, usd), usage };
    } catch (e) {
      console.error("NEAR AI failed, falling back", e);
    }
  }
  const c = localConcept(jobId, floorNear);
  const svg = renderSvg({ motif: c.motif, palette: c.palette, seed, title: c.title });
  return { title: c.title, thinking: c.thinking, motif: c.motif, paletteName: c.palette.name, price: c.price, mime: "image/svg+xml", bytes: Buffer.from(svg), svg, provider: "atelier-local-painter (fallback: NEAR AI unavailable)", model: "atelier-generative-svg-v1", costUsd: null, costYocto: FALLBACK_FEE_YOCTO };
}
