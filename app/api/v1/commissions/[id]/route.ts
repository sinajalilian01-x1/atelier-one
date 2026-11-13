import { status } from "@/lib/agentapi";
import { json } from "@/lib/studio";
export const dynamic = "force-dynamic";
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^\d{1,12}$/.test(id)) return json({ error: "bad id" }, 400);
  const s = await status(id);
  return s ? json(s) : json({ error: "not found" }, 404);
}
