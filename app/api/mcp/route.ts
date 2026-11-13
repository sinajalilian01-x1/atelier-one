import { discovery, fulfil, pnl, quote, status } from "@/lib/agentapi";
import { rateLimit } from "@/lib/auth";

/** Minimal MCP server (Streamable HTTP, JSON responses only): the same four steps as /api/v1, as tools. */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TOOLS = [
  { name: "list_styles", description: "The studio, its three bidding styles (one is a real human artist with an on-chain royalty) and the payment flow.", inputSchema: { type: "object", properties: {} } },
  { name: "get_quote", description: "Free. Turn a poster brief into poster copy and three bids. Returns quoteToken, briefHash and, per bid, priceYocto to escrow.", inputSchema: { type: "object", properties: { brief: { type: "string", description: "What the poster is for (max 400 chars)" } }, required: ["brief"] } },
  { name: "fulfil_commission", description: "After you have paid the escrow on-chain (commission on the studio contract), have her paint and deliver it. Needs a NEP-413 signature of 'Atelier One: commission <id>' by the paying account. Takes ~30 s.", inputSchema: { type: "object", properties: { commissionId: { type: "string" }, quoteToken: { type: "string" }, auth: { type: "object", properties: { accountId: { type: "string" }, publicKey: { type: "string" }, signature: { type: "string" }, nonce: { type: "string" } }, required: ["accountId", "publicKey", "signature", "nonce"] } }, required: ["commissionId", "quoteToken", "auth"] } },
  { name: "commission_status", description: "On-chain status of a commission (Open, Delivered, Refunded) and its token id.", inputSchema: { type: "object", properties: { commissionId: { type: "string" } }, required: ["commissionId"] } },
  { name: "get_pnl", description: "The painter's public P&L from contract state: revenue, artist royalties, owner payouts, compute and storage she paid, net.", inputSchema: { type: "object", properties: {} } },
];

const ok = (id: unknown, result: unknown) => Response.json({ jsonrpc: "2.0", id, result });
const fail = (id: unknown, code: number, message: string) => Response.json({ jsonrpc: "2.0", id, error: { code, message } });
const text = (v: unknown, isError = false) => ({ content: [{ type: "text", text: JSON.stringify(v, null, 2) }], structuredContent: v, isError });

export function GET() { return new Response("Atelier One MCP endpoint. POST JSON-RPC 2.0 (initialize, tools/list, tools/call).", { status: 405, headers: { allow: "POST" } }); }

export async function POST(req: Request) {
  const m = await req.json().catch(() => null);
  if (!m || m.jsonrpc !== "2.0" || typeof m.method !== "string") return fail(null, -32600, "invalid request");
  const { id, method, params } = m;
  if (id === undefined) return new Response(null, { status: 202 }); // notification
  switch (method) {
    case "initialize": return ok(id, { protocolVersion: params?.protocolVersion || "2025-06-18", capabilities: { tools: { listChanged: false } }, serverInfo: { name: "atelier-one", version: "1.0.0" }, instructions: "Testnet only. Quote, pay the escrow from your own NEAR testnet account, then fulfil_commission with a NEP-413 signature." });
    case "ping": return ok(id, {});
    case "tools/list": return ok(id, { tools: TOOLS });
    case "tools/call": {
      const name = params?.name, a = params?.arguments || {};
      try {
        if (name === "list_styles") return ok(id, text(discovery()));
        if (name === "get_quote") { if (!rateLimit(req, "mcpq", 20, 600_000).ok) throw new Error("rate limited"); return ok(id, text(await quote(String(a.brief || "")))); }
        if (name === "commission_status") return ok(id, text((await status(String(a.commissionId))) || { error: "not found" }));
        if (name === "get_pnl") return ok(id, text(await pnl()));
        if (name === "fulfil_commission") { if (!rateLimit(req, "mcpf", 6, 600_000).ok) throw new Error("rate limited"); return ok(id, text(await fulfil(String(a.commissionId), String(a.quoteToken || ""), a.auth))); }
        return fail(id, -32602, `unknown tool ${name}`);
      } catch (e) { return ok(id, text({ error: (e as Error).message }, true)); }
    }
    default: return fail(id, -32601, `method not found: ${method}`);
  }
}
