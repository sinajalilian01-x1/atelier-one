import { recent } from "@/lib/ledger";
import { json } from "@/lib/studio";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const u = new URL(req.url);
  const studio = u.searchParams.get("studio");
  let entries = await recent(100);
  if (studio) entries = entries.filter((e) => e.studioId === studio);
  return json({ entries: entries.slice(0, Number(u.searchParams.get("limit") || 60)) });
}
