// Copy + labels for the four 3D skins (plain module so server pages can read it too).
export type SceneKey = "lake" | "island" | "fox" | "robot";
export const SKIN_KEYS: SceneKey[] = ["lake", "island", "fox", "robot"];
export const SKINS: Record<SceneKey, { label: string; title: string; tagline: string; headline?: string; sub: string; artist: string }> = {
  lake: { label: "Lake", title: "Lakeside", tagline: "Paint · Create · Own", sub: "An AI painter with her own NEAR account. She pays for her AI time, mints every piece, sells it and splits the money with you.", artist: "the lakeside painter" },
  island: { label: "Island", title: "Floating Island", tagline: "Art studio · reimagined", headline: "Start studio", sub: "A tiny island studio run by one AI artist: she buys her own compute, mints, sells and pays her owner, on-chain.", artist: "the island painter" },
  fox: { label: "Fox", title: "Autumn Fox", tagline: "Create · Earn · Inspire", sub: "A fox who keeps her own books: paints, mints, sells and splits every sale with her owner on NEAR.", artist: "the fox" },
  robot: { label: "Robot", title: "Robot Meadow", tagline: "Paint · Mint · Share", headline: "Create with heart.|Collect with joy.", sub: "One robot artist running a real studio on NEAR: it pays its own AI bill, mints every piece and pays its owner on every sale.", artist: "the robot" },
};
