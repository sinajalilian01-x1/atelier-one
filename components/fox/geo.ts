// Faceted low-poly geometry helpers for the Autumn Fox world.
// Everything is baked into a few vertex-coloured, merged, instanced geometries so the whole forest is ~40 draw calls.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { fbm, rand } from "../scenes/kit";

export type V3 = [number, number, number];
export type Rnd = () => number;
const C = new THREE.Color();

/** Shake shared vertices so the surface reads as hand-cut facets. */
export function jitter(g: THREE.BufferGeometry, amt: number, r: Rnd) {
  const p = g.attributes.position; const map = new Map<string, V3>();
  for (let i = 0; i < p.count; i++) {
    const k = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
    if (!map.has(k)) map.set(k, [(r() - 0.5) * amt, (r() - 0.5) * amt, (r() - 0.5) * amt]);
    const d = map.get(k)!; p.setXYZ(i, p.getX(i) + d[0], p.getY(i) + d[1], p.getZ(i) + d[2]);
  }
  return g;
}

/** Non-indexed copy with one colour per triangle (flat, faceted look) and only position/normal/color attributes. */
export function paint(g: THREE.BufferGeometry, fn: (c: THREE.Color, f: { x: number; y: number; z: number; nx: number; ny: number; nz: number; i: number }) => void) {
  const n = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(n.attributes)) if (k !== "position") n.deleteAttribute(k);
  n.computeVertexNormals();
  const p = n.attributes.position, nr = n.attributes.normal; const cols = new Float32Array(p.count * 3);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), fnm = new THREE.Vector3();
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
    fnm.subVectors(c, b).cross(new THREE.Vector3().subVectors(a, b)).normalize();
    void nr;
    fn(C, { x: (a.x + b.x + c.x) / 3, y: (a.y + b.y + c.y) / 3, z: (a.z + b.z + c.z) / 3, nx: fnm.x, ny: fnm.y, nz: fnm.z, i: i / 3 });
    for (let k = 0; k < 3; k++) { cols[(i + k) * 3] = C.r; cols[(i + k) * 3 + 1] = C.g; cols[(i + k) * 3 + 2] = C.b; }
  }
  n.setAttribute("color", new THREE.BufferAttribute(cols, 3));
  return n;
}
export const solid = (g: THREE.BufferGeometry, color: string, vary = 0.04, r: Rnd = Math.random) =>
  paint(g, (c) => c.set(color).offsetHSL((r() - 0.5) * vary * 0.3, 0, (r() - 0.5) * vary));
export function merge(gs: THREE.BufferGeometry[]) { const m = mergeGeometries(gs, false)!; m.computeBoundingSphere(); return m; }
export function at(g: THREE.BufferGeometry, pos: V3, scale: V3 | number = 1, rot: V3 = [0, 0, 0]) {
  const s = typeof scale === "number" ? [scale, scale, scale] : scale;
  const m = new THREE.Matrix4().compose(new THREE.Vector3(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), new THREE.Vector3(...(s as V3)));
  return g.applyMatrix4(m);
}

// ---------------- trees ----------------
const AUTUMN = [["#F08A24", "#F6A93B", "#E06A1E", "#FBC254", "#C9501C"], ["#F7B23E", "#FAC95A", "#EE9A2E", "#FFD978", "#E38326"], ["#D9541E", "#E8702A", "#C2401A", "#F08A30", "#A8361A"]];
export function autumnTree(seed: number, kind = 0, detail = 1) {
  const r = rand(seed); const pal = AUTUMN[kind % AUTUMN.length]; const gs: THREE.BufferGeometry[] = [];
  // trunk + two branches
  const trunk = jitter(new THREE.CylinderGeometry(0.11, 0.2, 2.4, 6, 3), 0.05, r); at(trunk, [0, 1.2, 0]);
  gs.push(solid(trunk, "#5A3A26", 0.08, r));
  for (let b = 0; b < 3; b++) { const br = new THREE.CylinderGeometry(0.04, 0.08, 1.1, 5); const a = b * 2.1 + r(); at(br, [Math.cos(a) * 0.3, 1.9 + b * 0.2, Math.sin(a) * 0.3], 1, [Math.sin(a) * 0.7, 0, -Math.cos(a) * 0.7]); gs.push(solid(br, "#5A3A26", 0.08, r)); }
  // canopy: a cluster of faceted blobs, lighter on top, darker underneath
  const n = 7 + Math.floor(r() * 4);
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2, rr = i === 0 ? 0 : 0.55 + r() * 0.75, y = 2.9 + (i === 0 ? 0.5 : (r() - 0.35) * 1.3);
    const s = i === 0 ? 1.25 : 0.62 + r() * 0.5;
    const g = jitter(new THREE.IcosahedronGeometry(1, detail), 0.16, r); at(g, [Math.cos(a) * rr, y, Math.sin(a) * rr], [s * (1 + r() * 0.2), s * (0.82 + r() * 0.2), s * (1 + r() * 0.2)], [r(), r(), r()]);
    gs.push(paint(g, (c, f) => { c.set(pal[Math.floor(r() * pal.length)]); const l = f.ny * 0.09 + (f.y - 3) * 0.035; c.offsetHSL((r() - 0.5) * 0.02, 0, l + (r() - 0.5) * 0.06); }));
  }
  return merge(gs);
}
export function pineTree(seed: number) {
  const r = rand(seed); const gs: THREE.BufferGeometry[] = [];
  const t = new THREE.CylinderGeometry(0.08, 0.14, 1, 5); at(t, [0, 0.5, 0]); gs.push(solid(t, "#3E2C20", 0.05, r));
  const tiers = 4 + Math.floor(r() * 2);
  for (let i = 0; i < tiers; i++) {
    const k = 1 - i / tiers; const g = jitter(new THREE.ConeGeometry(0.95 * k + 0.25, 1.35, 7, 1), 0.1, r); at(g, [0, 0.9 + i * 0.78, 0], 1, [0, r() * 3, 0]);
    gs.push(paint(g, (c, f) => { c.set(r() > 0.5 ? "#1F3B2C" : "#26473A"); c.offsetHSL(0, 0, f.ny * 0.04 + (r() - 0.5) * 0.04); }));
  }
  return merge(gs);
}
export function rockGeo(seed: number, colors = ["#8E8A82", "#9F9A90", "#7E7B76", "#A9A396"]) {
  const r = rand(seed); const g = jitter(new THREE.DodecahedronGeometry(1, 0), 0.4, r);
  return paint(g, (c, f) => { c.set(colors[Math.floor(r() * colors.length)]); c.offsetHSL(0, 0, f.ny * 0.06); });
}

// ---------------- stream + ground ----------------
const PATH: [number, number][] = [[0.4, 14], [0.9, 9], [1.4, 5.5], [2.4, 2.5], [2.2, 0], [2.9, -2.6], [4.0, -5], [3.3, -8.2], [4.0, -11.5], [5.5, -15], [5, -22]];
const curve = new THREE.CatmullRomCurve3(PATH.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, "catmullrom", 0.5);
export const STREAM = curve.getSpacedPoints(260).map((v) => [v.x, v.z] as [number, number]);
export function streamDist(x: number, z: number) {
  let best = 1e9, bi = 0;
  for (let i = 0; i < STREAM.length; i++) { const dx = x - STREAM[i][0], dz = z - STREAM[i][1]; const d = dx * dx + dz * dz; if (d < best) { best = d; bi = i; } }
  return { d: Math.sqrt(best), i: bi };
}
export const streamW = (z: number) => 0.55 + Math.max(0, Math.min(1, (z + 12) / 22)) * 0.6;
export function groundH(x: number, z: number) {
  const { d } = streamDist(x, z); const w = streamW(z);
  const channel = d < w + 0.6 ? -0.32 * Math.cos(Math.min(1, d / (w + 0.6)) * Math.PI / 2) : 0;
  const hills = (fbm(x * 0.12 + 3, z * 0.12 - 2) - 0.5) * 0.9 + Math.max(0, -z - 10) * 0.08 + Math.max(0, Math.abs(x) - 9) * 0.12;
  return hills * Math.max(0, Math.min(1, (d - w) / 2.5 + 0.2)) + channel;
}
