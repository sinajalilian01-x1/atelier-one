// Same-origin, CDN-cached copy of an IPFS artwork (by CID) for <img> tags and the 3D easel texture.
// IPFS content is immutable, so it is cached for a year. The gateway link stays the canonical, on-chain media URL.
// Only images are passed through, and a sandboxing CSP stops any script inside an SVG from running.
const GATEWAYS = ["https://gateway.pinata.cloud/ipfs/", "https://ipfs.io/ipfs/", "https://dweb.link/ipfs/"];
const CID = /^(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{20,100})$/;
const MAX = 3 * 1024 * 1024;

export async function GET(_req: Request, { params }: { params: Promise<{ cid: string }> }) {
  const { cid } = await params;
  if (!CID.test(cid)) return new Response("bad cid", { status: 400 });
  for (const g of GATEWAYS) {
    try {
      const r = await fetch(g + cid, { signal: AbortSignal.timeout(8000), cache: "force-cache" });
      const type = r.headers.get("content-type") || "";
      if (!r.ok || !/^image\//.test(type)) continue;
      const body = await r.arrayBuffer();
      if (body.byteLength > MAX) return new Response("too large", { status: 413 });
      return new Response(body, {
        headers: {
          "content-type": type, "cache-control": "public, max-age=31536000, immutable",
          "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox", "x-content-type-options": "nosniff",
        },
      });
    } catch { /* try the next gateway */ }
  }
  return new Response("not found", { status: 404 });
}
