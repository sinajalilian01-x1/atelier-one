// Dream island geometry helpers: the island outline, two streams fed by a spring pond, and the ground height field.
import * as THREE from "three";
import { fbm } from "../scenes/kit";

export type V2 = [number, number];
export const POND: V2 = [-3.6, -7.6];
export const POND_R = 1.35;

/** Island radius at a given angle: a lumpy, organic outline around ~12.3 units. */
export function islandR(a: number) {
  return 12.3 + Math.sin(a * 3 + 0.7) * 0.7 + Math.sin(a * 5 - 1.3) * 0.45 + Math.sin(a * 9 + 2.1) * 0.22;
}
export const rOf = (x: number, z: number) => Math.hypot(x, z) / islandR(Math.atan2(z, x));

function makeStream(pts: V2[], n: number) {
  const c = new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, "catmullrom", 0.5);
  const all = c.getSpacedPoints(n).map((v) => [v.x, v.z] as V2);
  // cut the stream where it reaches the island rim: that point is the waterfall lip
  let lip = all.length - 1;
  for (let i = 0; i < all.length; i++) if (rOf(all[i][0], all[i][1]) >= 0.985) { lip = i; break; }
  return all.slice(0, lip + 1);
}
// main stream: spring pond → past the cabin → across the meadow → off the front-right edge
export const MAIN = makeStream([POND, [-1.6, -6.4], [1.0, -5.0], [2.6, -2.6], [2.5, 0.0], [3.5, 2.6], [5.0, 5.0], [6.1, 7.6], [6.8, 10.2], [7.3, 13.2]], 240);
// overflow: the pond also spills off the back-left edge
export const BACK = makeStream([POND, [-5.6, -6.9], [-7.6, -5.6], [-9.6, -4.0], [-11.6, -2.6], [-13.6, -1.4]], 90);
export const STREAMS = [{ pts: MAIN, w: (i: number) => 0.55 + (i / MAIN.length) * 0.32 }, { pts: BACK, w: () => 0.42 }];

export function streamDist(x: number, z: number) {
  let best = 1e9, w = 0.5;
  for (const s of STREAMS) for (let i = 0; i < s.pts.length; i += 2) {
    const dx = x - s.pts[i][0], dz = z - s.pts[i][1]; const d = dx * dx + dz * dz;
    if (d < best) { best = d; w = s.w(i); }
  }
  return { d: Math.sqrt(best), w };
}
export function groundH(x: number, z: number) {
  const { d, w } = streamDist(x, z); const pd = Math.hypot(x - POND[0], z - POND[1]);
  const channel = d < w + 0.6 ? -0.32 * Math.cos(Math.min(1, d / (w + 0.6)) * Math.PI / 2) : 0;
  const pond = pd < POND_R + 0.7 ? -0.36 * Math.cos(Math.min(1, pd / (POND_R + 0.7)) * Math.PI / 2) : 0;
  const r = rOf(x, z);
  const hills = (fbm(x * 0.13 + 3, z * 0.13 - 2) - 0.5) * 0.9 + Math.max(0, -z - 4) * 0.05 + Math.max(0, 0.75 - Math.hypot(x - 7, z + 3) / 5) * 0.8;
  const rim = r > 0.88 ? -Math.pow((r - 0.88) / 0.12, 2) * 0.28 : 0; // soft roll-off at the edge
  const flat = Math.max(0, Math.min(1, (Math.min(d - w, pd - POND_R)) / 2.5 + 0.2));
  return hills * flat + Math.min(channel, pond) + rim;
}
