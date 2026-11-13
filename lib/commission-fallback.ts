import "server-only";
import { renderSvg, MOTIFS, PALETTES } from "./art";
export { COLLECTOR_ID, DEMO_STUDIO_ID, nearToYocto } from "./config";
/** Local generative painting, used only if NEAR AI Cloud fails, so a paid commission still gets delivered. */
export function renderArtFallback(seed: number, title: string) {
  return renderSvg({ motif: MOTIFS[seed % MOTIFS.length], palette: PALETTES[seed % PALETTES.length], seed, title });
}
