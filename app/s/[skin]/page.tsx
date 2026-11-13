import { notFound } from "next/navigation";
import SceneSkin from "@/components/scenes/SceneSkin";
import FoxStudio from "@/components/fox/FoxStudio";
import { SKINS, SKIN_KEYS, type SceneKey } from "@/components/scenes/skins";
import "../../fox.css";

export const dynamicParams = false;
export function generateStaticParams() { return SKIN_KEYS.map((skin) => ({ skin })); }
export async function generateMetadata({ params }: { params: Promise<{ skin: string }> }) {
  const { skin } = await params;
  const c = SKINS[skin as SceneKey];
  return { title: `Atelier One · ${c?.title ?? "3D studio"}`, description: c?.sub };
}
export default async function ScenePage({ params }: { params: Promise<{ skin: string }> }) {
  const { skin } = await params;
  if (!(SKIN_KEYS as string[]).includes(skin)) notFound();
  // The fox is the main design: /s/fox renders the same studio as "/".
  if (skin === "fox") return <FoxStudio />;
  return <SceneSkin skin={skin as SceneKey} />;
}
