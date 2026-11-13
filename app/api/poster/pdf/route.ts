import { PDFDocument } from "pdf-lib";

export const dynamic = "force-dynamic";
export const maxDuration = 30;
const CID = /^(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{20,100})$/;
const GATEWAYS = ["https://gateway.pinata.cloud/ipfs/", "https://ipfs.io/ipfs/"];

/** Print-ready PDF (A4 portrait-ish 3:4 page, 210 x 280 mm) built from a pinned print PNG. */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const cid = u.searchParams.get("cid") || "";
  const name = (u.searchParams.get("name") || "atelier-one-poster").replace(/[^a-z0-9-]+/gi, "-").slice(0, 60);
  if (!CID.test(cid)) return new Response("bad cid", { status: 400 });
  let png: ArrayBuffer | null = null;
  for (const g of GATEWAYS) {
    try { const r = await fetch(g + cid, { signal: AbortSignal.timeout(12000), cache: "force-cache" }); if (r.ok && (r.headers.get("content-type") || "").startsWith("image/png")) { png = await r.arrayBuffer(); break; } } catch {}
  }
  if (!png || png.byteLength > 12 * 1024 * 1024) return new Response("not found", { status: 404 });
  const doc = await PDFDocument.create();
  doc.setTitle(name); doc.setCreator("Atelier One"); doc.setProducer("Atelier One poster engine");
  const img = await doc.embedPng(png);
  const mm = 72 / 25.4, pw = 210 * mm, ph = 280 * mm;
  doc.addPage([pw, ph]).drawImage(img, { x: 0, y: 0, width: pw, height: ph });
  const bytes = await doc.save();
  return new Response(Buffer.from(bytes), { headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="${name}.pdf"`, "cache-control": "public, max-age=31536000, immutable" } });
}
