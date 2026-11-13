// Farm island geometry helpers: the island outline, the spring-fed stream (and its overflow) that pour off the rim
// as waterfalls, the farm layout, walking paths, and the ground height field.
import * as THREE from "three";
import { fbm } from "../scenes/kit";

export type V2 = [number, number];
export const POND: V2 = [-8.6, -10.4];
export const POND_R = 1.6;

/** Island radius at a given angle: a soft, rounded outline around ~18 units. */
export function islandR(a: number) {
  return 18 + Math.sin(a * 2 + 0.7) * 0.9 + Math.sin(a * 3 - 1.3) * 0.5 + Math.sin(a * 7 + 2.1) * 0.18;
}
export const rOf = (x: number, z: number) => Math.hypot(x, z) / islandR(Math.atan2(z, x));

function makeStream(pts: V2[], n: number) {
  const c = new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, "catmullrom", 0.5);
  const all = c.getSpacedPoints(n).map((v) => [v.x, v.z] as V2);
  let lip = all.length - 1;
  for (let i = 0; i < all.length; i++) if (rOf(all[i][0], all[i][1]) >= 0.985) { lip = i; break; }
  return all.slice(0, lip + 1);
}
// main stream: spring pond (back left) → down the west side of the farm → off the front-left rim as the big waterfall
export const MAIN = makeStream([POND, [-9.6, -7.0], [-10.4, -3.4], [-10.2, 0.4], [-10.9, 4.0], [-12.2, 7.6], [-13.6, 10.6], [-15.0, 13.4]], 260);
// overflow: the pond also spills off the back edge
export const BACK = makeStream([POND, [-10.2, -12.4], [-11.4, -14.6], [-12.4, -16.6], [-13.2, -18.4]], 90);
export const STREAMS = [{ pts: MAIN, w: (i: number) => 0.6 + (i / MAIN.length) * 0.3 }, { pts: BACK, w: () => 0.45 }];

export function streamDist(x: number, z: number) {
  let best = 1e9, w = 0.5;
  for (const s of STREAMS) for (let i = 0; i < s.pts.length; i += 2) {
    const dx = x - s.pts[i][0], dz = z - s.pts[i][1]; const d = dx * dx + dz * dz;
    if (d < best) { best = d; w = s.w(i); }
  }
  return { d: Math.sqrt(best), w };
}

// ---------- farm layout (x, z) ----------
export const FARM = {
  cabin: [7.2, -9.0] as V2, barn: [13.0, -2.6] as V2, coop: [9.6, 1.4] as V2,
  garden: [3.0, -5.6] as V2, field: { x0: -6.8, x1: 0.6, z0: -15.2, z1: -9.4 }, pasture: { x0: 4.8, x1: 13.6, z0: 4.6, z1: 12.6 },
  easel: [-1.75, 1.85] as V2, paintSpot: [-2.85, 2.55] as V2, gram: [-3.6, 0.5] as V2, bench: [-6.6, 8.6] as V2, view: [-4.8, 12.8] as V2,
  yard: [10.2, -0.6] as V2, scarecrow: [-2.6, -12.4] as V2,
};
// walking paths (dirt), drawn into the ground colours; the painter strolls along them
export const PATHS: V2[][] = [
  [[6.4, -6.8], [4.6, -4.2], [2.0, -2.0], [-0.6, 0.4], [-2.2, 2.6], [-4.2, 5.8], [-6.0, 8.0]],   // cabin porch → easel → bench by the falls
  [[2.0, -2.0], [5.6, -1.2], [9.0, -0.6], [11.2, -1.4]],                                         // → yard and barn
  [[-0.6, 0.4], [-1.6, -4.4], [-2.6, -8.6]],                                                       // → the field
  [[-2.2, 2.6], [0.6, 6.0], [3.8, 7.6]],                                                           // → pasture gate
];
export function pathDist(x: number, z: number) {
  let best = 1e9;
  for (const p of PATHS) for (let i = 0; i < p.length - 1; i++) {
    const [ax, az] = p[i], [bx, bz] = p[i + 1]; const vx = bx - ax, vz = bz - az; const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz)));
    const d = Math.hypot(x - ax - vx * t, z - az - vz * t); if (d < best) best = d;
  }
  return best;
}

export function groundH(x: number, z: number) {
  const { d, w } = streamDist(x, z); const pd = Math.hypot(x - POND[0], z - POND[1]);
  const channel = d < w + 0.7 ? -0.34 * Math.cos(Math.min(1, d / (w + 0.7)) * Math.PI / 2) : 0;
  const pond = pd < POND_R + 0.8 ? -0.4 * Math.cos(Math.min(1, pd / (POND_R + 0.8)) * Math.PI / 2) : 0;
  const r = rOf(x, z);
  // gentle, open farmland: long low swells, a soft rise at the back, nearly flat where people walk and build
  const swell = (fbm(x * 0.07 + 3, z * 0.07 - 2) - 0.5) * 0.7 + Math.max(0, -z - 8) * 0.04;
  const rim = r > 0.9 ? -Math.pow((r - 0.9) / 0.1, 2) * 0.3 : 0;
  const flat = Math.max(0, Math.min(1, (Math.min(d - w, pd - POND_R)) / 3 + 0.15));
  return swell * flat + Math.min(channel, pond) + rim;
}
