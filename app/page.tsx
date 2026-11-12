import { redirect } from "next/navigation";
import ReceiptSkin from "@/components/ReceiptSkin";

export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  if (sp.theme === "clay") redirect("/clay");
  return <ReceiptSkin />;
}
