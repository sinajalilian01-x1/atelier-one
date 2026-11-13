import { json } from "@/lib/studio";
import { getCommission } from "@/lib/commission";
import { view } from "@/lib/near";

export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (id && !/^\d{1,10}$/.test(id)) return json({ error: "bad id" }, 400);
  if (id) return json({ commission: await getCommission(id) });
  const [styles, recent] = await Promise.all([view("get_styles"), view("get_commissions", { limit: 20 })]);
  return json({ styles, recent });
}
