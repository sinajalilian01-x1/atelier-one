import "server-only";
import { createHash } from "crypto";
import { IPFS_GATEWAY } from "./config";

export async function pin(bytes: Buffer, name: string, mime: string) {
  const jwt = process.env.PINATA_JWT;
  const media_hash = createHash("sha256").update(bytes).digest("base64");
  if (!jwt) throw new Error("PINATA_JWT not configured");
  const fd = new FormData();
  fd.append("file", new Blob([new Uint8Array(bytes)], { type: mime }), name);
  fd.append("pinataMetadata", JSON.stringify({ name, keyvalues: { app: "atelier-one" } }));
  const r = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", { method: "POST", headers: { Authorization: `Bearer ${jwt}` }, body: fd, signal: AbortSignal.timeout(20_000) });
  if (!r.ok) throw new Error(`Pinata ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  return { cid: j.IpfsHash as string, url: IPFS_GATEWAY + j.IpfsHash, media_hash };
}
