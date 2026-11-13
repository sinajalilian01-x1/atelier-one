import { discovery } from "@/lib/agentapi";
import { json } from "@/lib/studio";
export const dynamic = "force-dynamic";
export function GET() { return json(discovery()); }
