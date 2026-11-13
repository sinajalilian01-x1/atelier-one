"use client";
/* eslint-disable react-hooks/immutability -- three.js objects are mutated per frame by design (react-three-fiber useFrame) */
// Autumn Fox: the main Atelier One scene. A faceted low-poly fox paints at an easel in an autumn forest,
// next to a brass gramophone, a log cabin and a cobbled stream. Everything is procedural (no model files),
// vertex-coloured and instanced, so the whole world is a few dozen draw calls and ~0 network.
import * as THREE from "three";
import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { glowTexture, rand, useArtTexture, fbm, type ArtSource } from "../scenes/kit";
import { autumnTree, groundH, jitter, paint, pineTree, rockGeo, solid, STREAM, streamDist, streamW, type V3 } from "./geo";

export interface FoxWorldProps { art: ArtSource | null; sketching: boolean; working: boolean; playing: boolean; lite: boolean }

// ---------- generic instancing ----------
type Inst = { p: V3; s?: V3 | number; r?: V3; c?: string };
function Instances({ geo, items, mat, shadow = false, receive = false }: { geo: THREE.BufferGeometry; items: Inst[]; mat: THREE.Material; shadow?: boolean; receive?: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const m = ref.current; if (!m) return; const o = new THREE.Object3D(); const c = new THREE.Color();
    items.forEach((it, i) => {
      o.position.set(...it.p); const s = it.s ?? 1; if (typeof s === "number") o.scale.setScalar(s); else o.scale.set(...s);
      o.rotation.set(...(it.r ?? [0, 0, 0])); o.updateMatrix(); m.setMatrixAt(i, o.matrix); m.setColorAt(i, c.set(it.c ?? "#ffffff"));
    });
    m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; m.computeBoundingSphere();
  }, [items]);
  return <instancedMesh ref={ref} args={[geo, mat, items.length]} castShadow={shadow} receiveShadow={receive} frustumCulled={false} />;
}
const vmat = (o: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9, metalness: 0, ...o });
const mcache = new Map<string, THREE.MeshStandardMaterial>();
const M = (color: string, o: THREE.MeshStandardMaterialParameters = {}) => { const k = color + JSON.stringify(o); if (!mcache.has(k)) mcache.set(k, new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.85, ...o })); return mcache.get(k)!; };
const ico = (d = 1, j = 0.08, seed = 1) => { const g = jitter(new THREE.IcosahedronGeometry(1, d), j, rand(seed)); g.computeVertexNormals(); return g; };
const GEO = {
  ico0: ico(0, 0.1, 2), ico1: ico(1, 0.07, 3), ico1b: ico(1, 0.1, 4),
  cone4: new THREE.ConeGeometry(1, 1, 4), cone5: new THREE.ConeGeometry(1, 1, 5), cone6: new THREE.ConeGeometry(1, 1, 6),
  cyl6: new THREE.CylinderGeometry(1, 1, 1, 6), cyl8: new THREE.CylinderGeometry(1, 1, 1, 8), cyl16: new THREE.CylinderGeometry(1, 1, 1, 16),
  box: new THREE.BoxGeometry(1, 1, 1), sphere: new THREE.IcosahedronGeometry(1, 2),
};

// ---------- layout ----------
export const FOX: V3 = [-3.3, 0, 0.9];
const EASEL: V3 = [-1.75, 0, 0.35];
const GRAM: V3 = [0.15, 0, 1.0];
const CABIN: V3 = [5.7, 0, -9.8];
const y0 = (x: number, z: number) => groundH(x, z);
const angTo = (a: V3, b: V3) => Math.atan2(b[0] - a[0], b[2] - a[2]);
const keepOut = (x: number, z: number) =>
  (Math.hypot(x - FOX[0], z - FOX[2]) < 1.6) || (Math.hypot(x - EASEL[0], z - EASEL[2]) < 1.1) || (Math.hypot(x - GRAM[0], z - GRAM[2]) < 1.0) ||
  (Math.abs(x - CABIN[0]) < 3.3 && Math.abs(z - CABIN[2]) < 3.0);

// ---------- ground ----------
function Ground({ lite }: { lite: boolean }) {
  const geo = useMemo(() => {
    const W = 64, D = 56, seg = lite ? 90 : 150, r = rand(9);
    let g: THREE.BufferGeometry = new THREE.PlaneGeometry(W, D, seg, Math.round(seg * D / W)); g.rotateX(-Math.PI / 2); g.translate(0, 0, -16);
    const p = g.attributes.position; const cell = W / seg;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i) + (r() - 0.5) * cell * 0.55, z = p.getZ(i) + (r() - 0.5) * cell * 0.55; p.setXYZ(i, x, y0(x, z), z); }
    g = paint(g, (c, f) => {
      const { d } = streamDist(f.x, f.z); const w = streamW(f.z);
      if (d < w + 0.15) { c.set(r() > 0.5 ? "#5C6E6A" : "#4E625F"); return; }
      if (d < w + 0.5) { c.set(r() > 0.5 ? "#5E5E52" : "#6B685A"); return; }
      const n = fbm(f.x * 0.45 + 11, f.z * 0.45 - 4), n2 = fbm(f.x * 1.3, f.z * 1.3 + 7);
      if (n > 0.66 || (n > 0.58 && n2 > 0.62) || r() < 0.06) c.set(["#D9782C", "#C9632A", "#E89A3A", "#B5502A"][Math.floor(r() * 4)]);
      else if (n < 0.4) c.set(["#34501F", "#3C5A23", "#2F4A1C"][Math.floor(r() * 3)]);
      else c.set(["#4C6A26", "#5A782C", "#456224", "#687E2E"][Math.floor(r() * 4)]);
      c.offsetHSL(0, 0, (r() - 0.5) * 0.05 + f.ny * 0.02);
    });
    return g;
  }, [lite]);
  return <mesh geometry={geo} receiveShadow material={vmat({ roughness: 1 })} />;
}

function Stream({ lite }: { lite: boolean }) {
  const { geo, mat } = useMemo(() => {
    const pos: number[] = [], col: number[] = [], idx: number[] = []; const c = new THREE.Color();
    const pts = STREAM.filter((_, i) => i % (lite ? 3 : 2) === 0);
    pts.forEach(([x, z], i) => {
      const n = pts[Math.min(pts.length - 1, i + 1)], pv = pts[Math.max(0, i - 1)];
      const dx = n[0] - pv[0], dz = n[1] - pv[1], L = Math.hypot(dx, dz) || 1; const nx = -dz / L, nz = dx / L; const w = streamW(z) + 0.12;
      for (let k = 0; k <= 4; k++) { const t = k / 4 - 0.5; pos.push(x + nx * w * 2 * t, -0.17, z + nz * w * 2 * t); c.set(k === 2 ? "#3A7FA6" : k === 1 || k === 3 ? "#2D6C93" : "#22567A"); col.push(c.r, c.g, c.b); }
      if (i < pts.length - 1) for (let k = 0; k < 4; k++) { const a = i * 5 + k, b = a + 5; idx.push(a, b, a + 1, a + 1, b, b + 1); }
    });
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, emissive: "#0E3A50", emissiveIntensity: 0.7, transparent: true, opacity: 0.95 });
    return { geo: g, mat: m };
  }, [lite]);
  // glints that drift downstream
  const glints = useRef<THREE.Points>(null);
  const N = lite ? 40 : 110;
  const g2 = useMemo(() => { const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(N * 3), 3)); return g; }, [N]);
  const seeds = useMemo(() => { const r = rand(5); return Array.from({ length: N }, () => ({ t: r(), o: (r() - 0.5) * 1.4, s: 0.6 + r() * 0.8 })); }, [N]);
  const gm = useMemo(() => new THREE.PointsMaterial({ color: "#FFE2A8", size: 0.09, map: glowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.8 }), []);
  useFrame((_, dt) => {
    const p = g2.attributes.position as THREE.BufferAttribute;
    seeds.forEach((s, i) => { s.t = (s.t + dt * 0.012 * s.s) % 1; const j = Math.floor((1 - s.t) * (STREAM.length - 1)); const [x, z] = STREAM[j]; p.setXYZ(i, x + s.o * streamW(z) * 0.8, -0.17, z); });
    p.needsUpdate = true;
  });
  return <><mesh geometry={geo} material={mat} receiveShadow /><points ref={glints} geometry={g2} material={gm} /></>;
}

// ---------- vegetation + scatter ----------
function useScatter(lite: boolean) {
  return useMemo(() => {
    const r = rand(42);
    const trees: Inst[][] = [[], [], []]; const pines: Inst[] = []; const rocks: Inst[][] = [[], [], []]; const litter: Inst[] = []; const tufts: Inst[] = []; const bushes: Inst[] = [];
    const t = (k: number, x: number, z: number, s: number) => trees[k].push({ p: [x, y0(x, z) - 0.05, z], s: [s, s * (0.9 + r() * 0.25), s], r: [0, r() * 6.28, 0], c: new THREE.Color(1, 1, 1).offsetHSL((r() - 0.5) * 0.02, 0, (r() - 0.5) * 0.1).getStyle() });
    // hero trees framing the shot (big canopies reaching the top corners)
    t(0, -7.6, -1.2, 2.0); t(2, -6.4, -5.6, 1.5); t(1, -9.2, 3.2, 1.9); t(1, 9.8, -2.0, 1.9); t(0, 10.5, -7.5, 1.5); t(2, 11.2, 1.6, 1.8);
    t(1, -3.6, -7.4, 1.25); t(0, -1.6, -11.5, 1.3); t(1, 9.6, -10.8, 1.5); t(0, 3.0, -12.5, 1.4); t(2, -0.8, -13.6, 1.5);
    for (let i = 0; i < (lite ? 30 : 70); i++) {
      const x = (r() - 0.5) * 44, z = -3 - r() * 26; const { d } = streamDist(x, z);
      if (d < streamW(z) + 1.2 || keepOut(x, z) || (x > -3 && x < 5 && z > -12) || (Math.abs(x) < 4 && z > -6)) continue;
      t(Math.floor(r() * 3), x, z, 0.9 + r() * 0.8);
    }
    for (let i = 0; i < (lite ? 40 : 90); i++) {
      const x = (r() - 0.5) * 56, z = -10 - r() * 22; if (streamDist(x, z).d < streamW(z) + 1) continue;
      const s = 1.6 + r() * 1.6; pines.push({ p: [x, y0(x, z) - 0.1, z], s: [s, s * (1 + r() * 0.3), s], r: [0, r() * 6, 0], c: new THREE.Color(1, 1, 1).offsetHSL(0, 0, (r() - 0.5) * 0.12).getStyle() });
    }
    for (let i = 0; i < (lite ? 14 : 30); i++) {
      const x = -8 + r() * 20, z = -9 - r() * 6; if (streamDist(x, z).d < streamW(z) + 1 || keepOut(x, z)) continue;
      const s = 0.8 + r() * 0.7; pines.push({ p: [x, y0(x, z) - 0.1, z], s: [s, s * (1.1 + r() * 0.3), s], r: [0, r() * 6, 0], c: new THREE.Color(1, 1, 1).offsetHSL(0, 0, (r() - 0.5) * 0.1).getStyle() });
    }
    // dark pines right behind the fox so her silhouette pops
    pines.push({ p: [-4.6, y0(-4.6, -3.2) - 0.1, -3.2], s: [1.1, 1.35, 1.1], r: [0, 1, 0], c: "#cfd8cf" }, { p: [-2.4, y0(-2.4, -4.4) - 0.1, -4.4], s: [0.95, 1.2, 0.95], r: [0, 2, 0], c: "#d8e0d8" });
    // stones: banks + cobbled bed
    STREAM.forEach(([x, z], i) => {
      if (z > 11 || z < -20) return; const w = streamW(z); const n = STREAM[Math.min(STREAM.length - 1, i + 1)]; const dx = n[0] - x, dz = n[1] - z, L = Math.hypot(dx, dz) || 1; const nx = -dz / L, nz = dx / L;
      const per = lite ? 1 : 2;
      for (let k = 0; k < per; k++) for (const side of [-1, 1]) {
        if (r() < 0.55) continue; const o = side * (w + 0.1 + r() * 0.4); const sx = x + nx * o, sz = z + nz * o; const s = 0.1 + r() * 0.15;
        rocks[Math.floor(r() * 3)].push({ p: [sx, y0(sx, sz) - 0.02, sz], s: [s * 1.3, s * 0.6, s], r: [0, r() * 6, 0], c: new THREE.Color(0.66, 0.7, 0.76).multiplyScalar(0.85 + r() * 0.3).getStyle() });
      }
      if (i % (lite ? 4 : 2) === 0) { const o = (r() - 0.5) * w * 1.6; const sx = x + nx * o, sz = z + nz * o; const s = 0.08 + r() * 0.12; rocks[Math.floor(r() * 3)].push({ p: [sx, -0.24, sz], s: [s * 1.4, s * 0.45, s * 1.1], r: [0, r() * 6, 0], c: new THREE.Color(0.62, 0.72, 0.8).offsetHSL(0, 0, (r() - 0.5) * 0.1).getStyle() }); }
    });
    // boulders
    for (let i = 0; i < (lite ? 14 : 30); i++) { const x = (r() - 0.5) * 24, z = 7 - r() * 20; if (keepOut(x, z) || streamDist(x, z).d < streamW(z) + 0.4) continue; const s = 0.2 + r() * 0.4; rocks[i % 3].push({ p: [x, y0(x, z), z], s: [s * 1.2, s * 0.8, s], r: [0, r() * 6, 0] }); }
    // leaf litter, tufts, bushes
    const LC = ["#E8822C", "#D2592A", "#F2A53A", "#B9452A", "#F5C25A", "#9C5A2A"];
    for (let i = 0; i < (lite ? 200 : 600); i++) { const x = (r() - 0.5) * 14, z = 2 + r() * 7; if (streamDist(x, z).d < streamW(z) + 0.1) continue; const s = 0.06 + r() * 0.07; litter.push({ p: [x, y0(x, z) + 0.025, z], s: [s, s, s * 0.6], r: [-Math.PI / 2 + (r() - 0.5) * 0.5, 0, r() * 6.28], c: LC[Math.floor(r() * LC.length)] }); }
    for (let i = 0; i < (lite ? 380 : 1100); i++) { const x = (r() - 0.5) * 26, z = 9 - r() * 22; if (streamDist(x, z).d < streamW(z) + 0.1) continue; const s = 0.07 + r() * 0.08; litter.push({ p: [x, y0(x, z) + 0.025, z], s: [s, s, s * 0.6], r: [-Math.PI / 2 + (r() - 0.5) * 0.5, 0, r() * 6.28], c: LC[Math.floor(r() * LC.length)] }); }
    for (let i = 0; i < (lite ? 140 : 380); i++) { const x = (r() - 0.5) * 26, z = 9 - r() * 22; if (streamDist(x, z).d < streamW(z) + 0.35 || keepOut(x, z) && r() < 0.7) continue; const s = 0.1 + r() * 0.12; tufts.push({ p: [x, y0(x, z) + s * 0.4, z], s: [s * 0.45, s * 1.1, s * 0.45], r: [0, r() * 6, (r() - 0.5) * 0.3], c: ["#6E8E30", "#86A23A", "#5C7A2A", "#9AA83E"][Math.floor(r() * 4)] }); }
    for (let i = 0; i < (lite ? 16 : 40); i++) { const x = (r() - 0.5) * 30, z = 6 - r() * 18; if (keepOut(x, z) || streamDist(x, z).d < streamW(z) + 0.7 || (z > -1.5 && x > -6 && x < 6)) continue; const s = 0.18 + r() * 0.24; bushes.push({ p: [x, y0(x, z) + s * 0.4, z], s: [s * 1.3, s, s * 1.2], r: [r(), r(), r()], c: ["#D86A26", "#E89234", "#5E7A2C", "#C2501F", "#7C8E34"][Math.floor(r() * 5)] }); }
    return { trees, pines, rocks, litter, tufts, bushes };
  }, [lite]);
}

function Forest({ lite }: { lite: boolean }) {
  const S = useScatter(lite);
  const g = useMemo(() => ({
    trees: [autumnTree(11, 0, lite ? 0 : 1), autumnTree(23, 1, lite ? 0 : 1), autumnTree(37, 2, lite ? 0 : 1)],
    pine: pineTree(5), rocks: [rockGeo(1, ["#7F848A", "#8F949A", "#6F757C", "#9AA0A4"]), rockGeo(2, ["#7F848A", "#8F949A", "#6F757C", "#9AA0A4"]), rockGeo(3, ["#857F78", "#93908A", "#76726C"])],
    leaf: (() => { const sh = new THREE.Shape(); sh.moveTo(0, -1); sh.quadraticCurveTo(0.9, -0.2, 0, 1); sh.quadraticCurveTo(-0.9, -0.2, 0, -1); return new THREE.ShapeGeometry(sh, 2); })(),
  }), [lite]);
  const tm = useMemo(() => vmat(), []); const lm = useMemo(() => new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.9, flatShading: true }), []);
  const bm = useMemo(() => new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.95 }), []);
  return (
    <>
      {g.trees.map((geo, i) => <Instances key={i} geo={geo} items={S.trees[i]} mat={tm} shadow={!lite} />)}
      <Instances geo={g.pine} items={S.pines} mat={tm} />
      {g.rocks.map((geo, i) => <Instances key={"r" + i} geo={geo} items={S.rocks[i]} mat={tm} receive />)}
      <Instances geo={g.leaf} items={S.litter} mat={lm} />
      <Instances geo={GEO.cone4} items={S.tufts} mat={bm} />
      <Instances geo={GEO.ico0} items={S.bushes} mat={bm} shadow={!lite} />
    </>
  );
}

// ---------- the fox ----------
function useDab(active: boolean) {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => { const g = ref.current; if (!g) return; const t = clock.elapsedTime; const a = active ? 1 : 0.3; g.rotation.x = -1.15 + Math.sin(t * 3.2) * 0.16 * a; g.rotation.y = Math.sin(t * 1.6) * 0.12 * a; });
  return ref;
}
function Palette() {
  const geo = useMemo(() => {
    const s = new THREE.Shape(); s.absellipse(0, 0, 0.26, 0.19, 0, Math.PI * 2, false, 0);
    const h = new THREE.Path(); h.absellipse(-0.14, -0.04, 0.04, 0.035, 0, Math.PI * 2, true, 0); s.holes.push(h);
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.025, bevelEnabled: false, curveSegments: 10 }); g.rotateX(-Math.PI / 2); return g;
  }, []);
  const dabs: [number, number, string][] = [[0.02, 0.1, "#E8452C"], [0.12, 0.08, "#F6C33B"], [0.18, -0.02, "#3E8FD0"], [0.1, -0.11, "#5FB04A"], [-0.02, -0.12, "#F5F0E6"], [-0.06, 0.06, "#F08A24"]];
  return (
    <group>
      <mesh geometry={geo} material={M("#E2BE86")} castShadow />
      {dabs.map(([x, z, c], i) => <mesh key={i} geometry={GEO.ico1} material={M(c, { roughness: 0.4 })} position={[x, 0.03, -z]} scale={[0.035, 0.014, 0.035]} />)}
    </group>
  );
}
function Brush({ tip = "#E8582E" }: { tip?: string }) {
  return (
    <group>
      <mesh geometry={GEO.cyl6} material={M("#7A2E22")} position={[0, -0.22, 0]} scale={[0.018, 0.44, 0.018]} />
      <mesh geometry={GEO.cyl6} material={M("#C9C3B8", { metalness: 0.6, roughness: 0.35 })} position={[0, -0.47, 0]} scale={[0.022, 0.07, 0.022]} />
      <mesh geometry={GEO.cone6} material={M(tip)} position={[0, -0.55, 0]} rotation={[Math.PI, 0, 0]} scale={[0.024, 0.1, 0.024]} />
    </group>
  );
}
function Fox({ working }: { working: boolean }) {
  const arm = useDab(working);
  const head = useRef<THREE.Group>(null); const tail = useRef<THREE.Group>(null); const ears = useRef<(THREE.Group | null)[]>([]); const body = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (head.current) { head.current.rotation.y = Math.sin(t * 0.5) * 0.12 + (working ? Math.sin(t * 3.2) * 0.04 : 0); head.current.rotation.x = 0.05 + Math.sin(t * 0.7) * 0.04; }
    if (tail.current) tail.current.rotation.y = Math.sin(t * 0.9) * 0.08;
    if (body.current) body.current.scale.y = 1 + Math.sin(t * 1.6) * 0.012;
    const flick = (t % 5.3) < 0.18; ears.current.forEach((e, i) => { if (e) e.rotation.x = flick && i === 1 ? -0.35 : 0; });
  });
  const OR = M("#E26F24"), OR2 = M("#C95A1C"), WH = M("#F6EEE2"), DK = M("#2A1E1A"), SC = M("#C8401F"), SC2 = M("#F08A2C");
  const tailGeo = useMemo(() => {
    // one bushy tapered tube: thin at the root, fat in the middle, white tip
    const curve = new THREE.CatmullRomCurve3([[-0.02, 0.1, -0.22], [-0.25, 0.02, -0.4], [-0.52, -0.2, -0.32], [-0.64, -0.45, -0.05], [-0.58, -0.58, 0.25], [-0.42, -0.6, 0.45]].map((p) => new THREE.Vector3(...(p as V3))));
    const N = 14, R = 8; let g: THREE.BufferGeometry = new THREE.TubeGeometry(curve, N, 1, R, false);
    const p = g.attributes.position; const r = rand(77);
    for (let i = 0; i <= N; i++) {
      const t = i / N; const rad = t < 0.55 ? 0.07 + Math.sin((t / 0.55) * Math.PI / 2) * 0.16 : 0.23 - Math.pow((t - 0.55) / 0.45, 1.6) * 0.21;
      const c = curve.getPointAt(t);
      for (let k = 0; k <= R; k++) { const j = i * (R + 1) + k; const v = new THREE.Vector3().fromBufferAttribute(p, j).sub(c).multiplyScalar(rad * (0.9 + r() * 0.2)).add(c); p.setXYZ(j, v.x, v.y, v.z); }
    }
    g = paint(g, (c, f) => { const d = curve.getPointAt(0.82); const tip = Math.hypot(f.x - d.x, f.y - d.y, f.z - d.z) < 0.17 || f.z > 0.33; c.set(tip ? "#F6EEE2" : r() > 0.5 ? "#E26F24" : "#D5621D"); c.offsetHSL(0, 0, (r() - 0.5) * 0.05); });
    return g;
  }, []);
  const tm = useMemo(() => vmat({ roughness: 0.8 }), []);
  return (
    <group>
      {/* stump */}
      <mesh geometry={useMemo(() => solid(jitter(new THREE.CylinderGeometry(0.46, 0.55, 0.64, 10, 2), 0.04, rand(3)), "#6B4429", 0.1, rand(4)), [])} material={tm} position={[0, 0.32, 0]} castShadow receiveShadow />
      <mesh geometry={GEO.cyl16} material={M("#D9A86A")} position={[0, 0.645, 0]} scale={[0.44, 0.012, 0.44]} receiveShadow />
      <mesh geometry={GEO.cyl16} material={M("#C08C52")} position={[0, 0.652, 0]} scale={[0.28, 0.012, 0.28]} />
      <mesh geometry={GEO.cyl16} material={M("#D9A86A")} position={[0, 0.658, 0]} scale={[0.14, 0.012, 0.14]} />
      {[0, 1.9, 3.8, 5.1].map((a, i) => <mesh key={i} geometry={GEO.cone5} material={M("#5E3B24")} position={[Math.sin(a) * 0.52, 0.08, Math.cos(a) * 0.52]} rotation={[Math.cos(a) * 1.1, 0, -Math.sin(a) * 1.1]} scale={[0.12, 0.35, 0.1]} castShadow />)}
      <group position={[0, 0.66, 0]}>
        <group ref={body}>
          <mesh geometry={GEO.ico1b} material={OR} position={[0, 0.42, -0.02]} rotation={[-0.18, 0, 0]} scale={[0.33, 0.45, 0.31]} castShadow />
          <mesh geometry={GEO.ico1} material={WH} position={[0, 0.46, 0.16]} rotation={[-0.2, 0, 0]} scale={[0.15, 0.26, 0.12]} />
          {[-1, 1].map((k) => (
            <group key={k}>
              <mesh geometry={GEO.ico1b} material={OR2} position={[k * 0.22, 0.17, -0.02]} scale={[0.19, 0.21, 0.3]} castShadow />
              <mesh geometry={GEO.ico1} material={DK} position={[k * 0.25, 0.04, 0.24]} scale={[0.075, 0.05, 0.12]} />
              <mesh geometry={GEO.cyl6} material={OR} position={[k * 0.1, 0.2, 0.2]} rotation={[0.12, 0, 0]} scale={[0.055, 0.36, 0.055]} />
              <mesh geometry={GEO.ico1} material={DK} position={[k * 0.1, 0.03, 0.24]} scale={[0.06, 0.04, 0.08]} />
            </group>
          ))}
          {/* knitted scarf */}
          <mesh material={SC} position={[0, 0.76, 0.02]} rotation={[Math.PI / 2 + 0.12, 0, 0]} castShadow><torusGeometry args={[0.18, 0.085, 6, 14]} /></mesh>
          <mesh material={SC2} position={[0, 0.76, 0.02]} rotation={[Math.PI / 2 + 0.12, 0, 0]}><torusGeometry args={[0.185, 0.05, 4, 14]} /></mesh>
          <group position={[0.12, 0.66, 0.2]} rotation={[0.25, 0, -0.18]}>
            <mesh geometry={GEO.box} material={SC} position={[0, -0.18, 0]} scale={[0.13, 0.38, 0.05]} castShadow />
            <mesh geometry={GEO.box} material={SC2} position={[0, -0.12, 0.002]} scale={[0.132, 0.05, 0.052]} />
            <mesh geometry={GEO.box} material={SC2} position={[0, -0.26, 0.002]} scale={[0.132, 0.05, 0.052]} />
            {[-0.045, 0, 0.045].map((x, i) => <mesh key={i} geometry={GEO.box} material={SC} position={[x, -0.4, 0]} scale={[0.018, 0.07, 0.02]} />)}
          </group>
          <group position={[0.2, 0.7, 0.12]} rotation={[0.15, 0.4, -0.6]}>
            <mesh geometry={GEO.box} material={SC} position={[0, -0.14, 0]} scale={[0.12, 0.3, 0.05]} />
          </group>
          {/* head */}
          <group ref={head} position={[0, 1.0, 0.08]}>
            <mesh geometry={GEO.ico1b} material={OR} scale={[0.26, 0.22, 0.25]} castShadow />
            <mesh geometry={GEO.cone6} material={OR} position={[0, -0.04, 0.27]} rotation={[Math.PI / 2, 0, 0]} scale={[0.115, 0.34, 0.09]} />
            <mesh geometry={GEO.cone6} material={WH} position={[0, -0.085, 0.24]} rotation={[Math.PI / 2 - 0.05, 0, 0]} scale={[0.1, 0.28, 0.06]} />
            <mesh geometry={GEO.ico1} material={DK} position={[0, -0.035, 0.43]} scale={[0.038, 0.032, 0.03]} />
            {[-1, 1].map((k) => (
              <group key={k}>
                <mesh geometry={GEO.cone4} material={WH} position={[k * 0.2, -0.1, 0.06]} rotation={[0.2, 0, k * (Math.PI / 2 + 0.55)]} scale={[0.08, 0.2, 0.07]} />
                <mesh geometry={GEO.ico1} material={DK} position={[k * 0.115, 0.035, 0.2]} scale={[0.034, 0.04, 0.025]} />
                <mesh geometry={GEO.ico1} material={M("#ffffff", { emissive: "#ffffff", emissiveIntensity: 0.6 })} position={[k * 0.105, 0.05, 0.218]} scale={0.011} />
                <group ref={(e) => { ears.current[k > 0 ? 1 : 0] = e; }} position={[k * 0.13, 0.17, -0.03]} rotation={[0, 0, -k * 0.28]}>
                  <mesh geometry={GEO.cone4} material={OR} position={[0, 0.12, 0]} rotation={[0, Math.PI / 4, 0]} scale={[0.1, 0.28, 0.06]} castShadow />
                  <mesh geometry={GEO.cone4} material={M("#F3D9B8")} position={[0, 0.1, 0.03]} rotation={[0, Math.PI / 4, 0]} scale={[0.06, 0.2, 0.03]} />
                  <mesh geometry={GEO.cone4} material={DK} position={[0, 0.235, 0]} rotation={[0, Math.PI / 4, 0]} scale={[0.04, 0.07, 0.025]} />
                </group>
              </group>
            ))}
          </group>
          {/* brush arm (fox's right) reaching for the canvas */}
          <group ref={arm} position={[-0.2, 0.6, 0.12]}>
            <mesh geometry={GEO.cyl6} material={OR} position={[0, -0.2, 0]} scale={[0.055, 0.4, 0.055]} />
            <mesh geometry={GEO.ico1} material={DK} position={[0, -0.41, 0]} scale={0.06} />
            <group position={[0, -0.42, 0]} rotation={[-0.45, 0, 0]}><Brush /></group>
          </group>
          {/* palette arm (fox's left, facing the camera) */}
          <group position={[0.22, 0.58, 0.1]} rotation={[-0.9, 0, 0.45]}>
            <mesh geometry={GEO.cyl6} material={OR} position={[0, -0.18, 0]} scale={[0.055, 0.36, 0.055]} />
            <mesh geometry={GEO.ico1} material={DK} position={[0, -0.37, 0]} scale={0.055} />
          </group>
          <group position={[0.4, 0.42, 0.34]} rotation={[0.35, -0.6, 0.3]}><Palette /></group>
        </group>
        <group ref={tail}><mesh geometry={tailGeo} material={tm} castShadow /></group>
      </group>
      {/* tiny mushrooms at the stump */}
      {[[0.62, 0.25], [0.7, -0.15], [-0.55, 0.45]].map(([x, z], i) => (
        <group key={i} position={[x, 0, z]} scale={0.7 + i * 0.15}>
          <mesh geometry={GEO.cyl6} material={WH} position={[0, 0.06, 0]} scale={[0.03, 0.12, 0.03]} />
          <mesh geometry={GEO.ico1} material={M("#D94A24")} position={[0, 0.13, 0]} scale={[0.08, 0.05, 0.08]} />
        </group>
      ))}
    </group>
  );
}

// ---------- easel ----------
function Easel({ art, sketching }: { art: ArtSource | null; sketching: boolean }) {
  const tex = useArtTexture(art, sketching);
  const w = M("#9A6538"), w2 = M("#7C4E2C");
  return (
    <group>
      <mesh geometry={GEO.box} material={w} position={[-0.52, 1.1, 0.12]} rotation={[-0.1, 0, 0.1]} scale={[0.07, 2.25, 0.07]} castShadow />
      <mesh geometry={GEO.box} material={w} position={[0.52, 1.1, 0.12]} rotation={[-0.1, 0, -0.1]} scale={[0.07, 2.25, 0.07]} castShadow />
      <mesh geometry={GEO.box} material={w2} position={[0, 1.05, -0.38]} rotation={[0.32, 0, 0]} scale={[0.07, 2.2, 0.07]} castShadow />
      <mesh geometry={GEO.box} material={w} position={[0, 2.22, 0.01]} scale={[0.07, 0.3, 0.07]} />
      <mesh geometry={GEO.box} material={w} position={[0, 0.72, 0.17]} scale={[1.2, 0.07, 0.2]} castShadow />
      <mesh geometry={GEO.box} material={w2} position={[0, 0.42, 0.05]} scale={[1.0, 0.05, 0.05]} />
      <mesh geometry={GEO.box} material={w} position={[0, 2.08, 0.08]} scale={[0.34, 0.08, 0.1]} />
      <group position={[0, 1.38, 0.12]} rotation={[-0.1, 0, 0]}>
        <mesh geometry={GEO.box} material={M("#EFE4D0")} scale={[1.16, 1.16, 0.06]} castShadow />
        <mesh position={[0, 0, 0.032]} scale={[1.1, 1.1, 1]}><planeGeometry /><meshStandardMaterial map={tex} roughness={0.9} emissive="#ffffff" emissiveMap={tex} emissiveIntensity={0.28} /></mesh>
      </group>
      {/* paint box + jars at its feet */}
      <group position={[0.15, 0, 0.55]} rotation={[0, 0.4, 0]}>
        <mesh geometry={GEO.box} material={w2} position={[0, 0.12, 0]} scale={[0.55, 0.24, 0.36]} castShadow />
        <mesh geometry={GEO.box} material={w} position={[0, 0.25, 0]} scale={[0.57, 0.03, 0.38]} />
        {["#E8452C", "#F6C33B", "#3E8FD0", "#5FB04A"].map((c, i) => <mesh key={i} geometry={GEO.cyl8} material={M(c, { roughness: 0.5 })} position={[-0.18 + i * 0.12, 0.33, 0]} scale={[0.045, 0.13, 0.045]} />)}
        <mesh geometry={GEO.cyl8} material={M("#BFD3D8", { roughness: 0.2, transparent: true, opacity: 0.85 })} position={[0.42, 0.11, 0.1]} scale={[0.07, 0.22, 0.07]} />
        {[-0.2, 0, 0.25].map((r, i) => <mesh key={i} geometry={GEO.cyl6} material={M("#7A2E22")} position={[0.42 + r * 0.1, 0.32, 0.1]} rotation={[r * 0.6, 0, r]} scale={[0.012, 0.32, 0.012]} />)}
      </group>
    </group>
  );
}

// ---------- gramophone + notes ----------
function Gramophone({ playing }: { playing: boolean }) {
  const disc = useRef<THREE.Mesh>(null);
  useFrame((_, dt) => { if (disc.current) disc.current.rotation.y += dt * (playing ? 3.4 : 0.4); });
  const brass = useMemo(() => new THREE.MeshStandardMaterial({ color: "#E0A848", metalness: 0.85, roughness: 0.3, side: THREE.DoubleSide, emissive: "#5A3410", emissiveIntensity: 0.25 }), []);
  const horn = useMemo(() => {
    const pts: THREE.Vector2[] = []; for (let i = 0; i <= 18; i++) { const t = i / 18; pts.push(new THREE.Vector2(0.035 + Math.pow(t, 3.2) * 0.5 + t * 0.03, t * 0.95)); }
    const g = new THREE.LatheGeometry(pts, 18); return g;
  }, []);
  const neck = useMemo(() => new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0.2, 0.3, -0.12), new THREE.Vector3(0.24, 0.55, -0.16), new THREE.Vector3(0.16, 0.78, -0.08), new THREE.Vector3(0.04, 0.88, 0.0)]), 12, 0.035, 8), []);
  const wood = M("#6E2F1E", { roughness: 0.55 }), trim = M("#C98A3A", { metalness: 0.6, roughness: 0.35 });
  return (
    <group>
      {/* little side table */}
      <mesh geometry={GEO.box} material={M("#7A4A2A")} position={[0, 0.5, 0]} scale={[0.95, 0.07, 0.75]} castShadow receiveShadow />
      {[[-0.4, -0.3], [0.4, -0.3], [-0.4, 0.3], [0.4, 0.3]].map(([x, z], i) => <mesh key={i} geometry={GEO.box} material={M("#5E3820")} position={[x, 0.24, z]} scale={[0.07, 0.48, 0.07]} castShadow />)}
      <mesh geometry={GEO.box} material={M("#5E3820")} position={[0, 0.12, 0]} scale={[0.85, 0.04, 0.65]} />
      <group position={[0, 0.54, 0]}>
        <mesh geometry={GEO.box} material={wood} position={[0, 0.15, 0]} scale={[0.62, 0.3, 0.52]} castShadow />
        <mesh geometry={GEO.box} material={trim} position={[0, 0.305, 0]} scale={[0.64, 0.025, 0.54]} />
        <mesh geometry={GEO.box} material={trim} position={[0, 0.01, 0]} scale={[0.66, 0.025, 0.56]} />
        <mesh geometry={GEO.cyl8} material={trim} position={[0.33, 0.16, 0.05]} rotation={[0, 0, Math.PI / 2]} scale={[0.03, 0.06, 0.03]} />
        <mesh ref={disc} geometry={GEO.cyl16} material={M("#1A1716", { roughness: 0.3, flatShading: false })} position={[-0.05, 0.33, 0.04]} scale={[0.22, 0.015, 0.22]}>
          <mesh geometry={GEO.cyl16} material={M("#D9452C")} scale={[0.35, 1.3, 0.35]} />
        </mesh>
        <mesh geometry={neck} material={brass} />
        <group position={[0.03, 0.86, 0.0]} rotation={[0.55, 0, 0.75]} scale={0.78}><mesh geometry={horn} material={brass} castShadow /></group>
      </group>
    </group>
  );
}
function noteShapes() {
  const one = new THREE.Shape(); one.absellipse(0, 0, 0.13, 0.095, 0, Math.PI * 2, false, 0.4);
  const stem = new THREE.Shape(); stem.moveTo(0.1, 0.02); stem.lineTo(0.135, 0.02); stem.lineTo(0.135, 0.62); stem.quadraticCurveTo(0.34, 0.5, 0.3, 0.26); stem.quadraticCurveTo(0.3, 0.42, 0.135, 0.5); stem.lineTo(0.1, 0.62); stem.lineTo(0.1, 0.02);
  const a = new THREE.ExtrudeGeometry([one, stem], { depth: 0.035, bevelEnabled: false, curveSegments: 8 });
  const h1 = new THREE.Shape(); h1.absellipse(0, 0, 0.12, 0.09, 0, Math.PI * 2, false, 0.4);
  const h2 = new THREE.Shape(); h2.absellipse(0.42, 0.08, 0.12, 0.09, 0, Math.PI * 2, false, 0.4);
  const st = new THREE.Shape(); st.moveTo(0.09, 0.02); st.lineTo(0.12, 0.02); st.lineTo(0.12, 0.55); st.lineTo(0.51, 0.63); st.lineTo(0.51, 0.1); st.lineTo(0.54, 0.1); st.lineTo(0.54, 0.73); st.lineTo(0.09, 0.64); st.lineTo(0.09, 0.02);
  const b = new THREE.ExtrudeGeometry([h1, h2, st], { depth: 0.035, bevelEnabled: false, curveSegments: 8 });
  return [a, b];
}
function Notes({ origin, playing, count }: { origin: V3; playing: boolean; count: number }) {
  const geos = useMemo(() => noteShapes(), []);
  const refs = useRef<(THREE.Mesh | null)[]>([]);
  const mats = useMemo(() => Array.from({ length: count }, () => new THREE.MeshBasicMaterial({ color: "#FFC24A", transparent: true, opacity: 0, toneMapped: false, depthWrite: false, side: THREE.DoubleSide })), [count]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime; const sp = playing ? 0.16 : 0.08;
    refs.current.forEach((m, i) => {
      if (!m) return; const k = (t * sp + i / count) % 1;
      m.position.set(origin[0] + Math.sin(k * 5 + i * 1.7) * 0.35 - k * 0.9, origin[1] + k * 1.9, origin[2] + Math.cos(k * 4 + i) * 0.25);
      m.rotation.set(0, -0.4, Math.sin(t * 1.5 + i) * 0.35); m.scale.setScalar(0.32 + Math.sin(k * Math.PI) * 0.2);
      mats[i].opacity = Math.sin(k * Math.PI) * (playing ? 1 : 0.6);
    });
  });
  return <>{mats.map((m, i) => <mesh key={i} ref={(e) => { refs.current[i] = e; }} geometry={geos[i % 2]} material={m} />)}</>;
}

// ---------- log cabin ----------
function Window({ p, rot = 0, glow, winGlow, frame }: { p: V3; rot?: number; glow: THREE.Material; winGlow: THREE.SpriteMaterial; frame: THREE.Material }) {
  return (
    <group position={p} rotation={[0, rot, 0]}>
      <mesh geometry={GEO.box} material={glow} scale={[0.6, 0.62, 0.04]} />
      <mesh geometry={GEO.box} material={frame} position={[0, 0, 0.03]} scale={[0.05, 0.66, 0.05]} />
      <mesh geometry={GEO.box} material={frame} position={[0, 0, 0.03]} scale={[0.64, 0.05, 0.05]} />
      {[[-0.33, 0, 0.07, 0.72], [0.33, 0, 0.07, 0.72]].map(([x, y, w, h], i) => <mesh key={i} geometry={GEO.box} material={frame} position={[x, y, 0.03]} scale={[w, h, 0.07]} />)}
      <mesh geometry={GEO.box} material={frame} position={[0, 0.35, 0.03]} scale={[0.76, 0.07, 0.08]} />
      <mesh geometry={GEO.box} material={frame} position={[0, -0.35, 0.06]} scale={[0.8, 0.07, 0.16]} />
      <sprite material={winGlow} position={[0, 0, 0.25]} scale={[2.2, 2.2, 1]} />
    </group>
  );
}

function Cabin({ lite }: { lite: boolean }) {
  const W = 3.6, D = 2.7, rows = 8, LR = 0.12;
  const logGeo = useMemo(() => { const r = rand(8); return paint(jitter(new THREE.CylinderGeometry(1, 1, 1, 7, 2), 0.06, r), (c, f) => { if (Math.abs(f.ny) > 0.9) c.set("#D9A066"); else { c.set(r() > 0.5 ? "#7A4E2E" : "#6A4128"); c.offsetHSL(0, 0, f.nx * 0.03 + (r() - 0.5) * 0.05); } }); }, []);
  const logs = useMemo(() => {
    const L: Inst[] = []; const r = rand(4);
    for (let i = 0; i < rows; i++) {
      const y = LR + i * LR * 1.95; const tint = new THREE.Color(1, 1, 1).offsetHSL(0, 0, (r() - 0.5) * 0.08).getStyle();
      for (const z of [-D / 2, D / 2]) L.push({ p: [0, y, z], s: [LR, W + 0.45, LR], r: [0, 0, Math.PI / 2], c: tint });
      for (const x of [-W / 2, W / 2]) L.push({ p: [x, y + LR * 0.97, 0], s: [LR, D + 0.45, LR], r: [Math.PI / 2, 0, 0], c: tint });
    }
    const top = LR + rows * LR * 1.95; const g = 6;
    for (let j = 0; j < g; j++) for (const x of [-W / 2, W / 2]) L.push({ p: [x, top + j * LR * 1.95, 0], s: [LR, (D + 0.1) * (1 - (j + 0.5) / g), LR], r: [Math.PI / 2, 0, 0] });
    return L;
  }, [D, W]);
  const H = LR + rows * LR * 1.95; const ridge = H + 6 * LR * 1.95 + 0.15; const slope = Math.atan2(ridge - H, D / 2 + 0.35); const len = Math.hypot(ridge - H + 0.1, D / 2 + 0.5);
  const shingles = useMemo(() => {
    const S: Inst[] = [];
    for (const side of [-1, 1]) for (let k = 0; k < 7; k++) {
      const f = (k + 0.5) / 7; const z = side * (D / 2 + 0.5) * (1 - f); const y = H - 0.08 + (ridge - H + 0.1) * f;
      S.push({ p: [0, y + 0.05, z], s: [W + 0.9, 0.12, len / 7 + 0.1], r: [side * (slope + 0.1), 0, 0], c: k % 2 ? "#ffffff" : "#C9C4C2" });
    }
    return S;
  }, [D, H, W, len, ridge, slope]);
  const stones = useMemo(() => {
    const S: Inst[] = []; const r = rand(12);
    for (let i = 0; i < 14; i++) for (let k = 0; k < 2; k++) S.push({ p: [-W / 2 + 0.75 + (k - 0.5) * 0.28 + (r() - 0.5) * 0.04, 0.6 + i * 0.27, -0.1 + (r() - 0.5) * 0.06], s: [0.18 + r() * 0.04, 0.15, 0.3], r: [0, r() * 0.4, 0], c: new THREE.Color(1, 1, 1).offsetHSL(0, 0, (r() - 0.5) * 0.25).getStyle() });
    return S;
  }, [W]);
  const glow = useMemo(() => new THREE.MeshStandardMaterial({ color: "#FFB45A", emissive: "#FF9A2E", emissiveIntensity: 2.6, toneMapped: false }), []);
  const winGlow = useMemo(() => new THREE.SpriteMaterial({ map: glowTexture(), color: "#FF9F45", transparent: true, opacity: 0.32, depthWrite: false, blending: THREE.AdditiveBlending }), []);
  const frame = M("#4A2E1C");
  const smoke = useRef<(THREE.Mesh | null)[]>([]);
  const smokeMats = useMemo(() => Array.from({ length: lite ? 5 : 8 }, () => new THREE.MeshStandardMaterial({ color: "#E8E0D6", emissive: "#6A5A4C", emissiveIntensity: 0.6, transparent: true, depthWrite: false, flatShading: true, roughness: 1 })), [lite]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    smoke.current.forEach((m, i) => { if (!m) return; const k = (t * 0.09 + i / smokeMats.length) % 1; m.position.set(-W / 2 + 0.75 + k * 0.9 + Math.sin(k * 6 + i) * 0.12, 4.6 + k * 3.0, -0.1 - k * 0.4); m.scale.setScalar(0.18 + k * 0.55); m.rotation.set(k * 2, i, k); smokeMats[i].opacity = Math.min(1, k * 6) * (1 - k) * 0.8; });
  });
  const tm = useMemo(() => vmat({ roughness: 0.95 }), []);
  return (
    <group>
      <mesh geometry={GEO.box} material={M("#4A3020")} position={[0, H / 2, 0]} scale={[W - 0.1, H, D - 0.1]} receiveShadow />
      <Instances geo={logGeo} items={logs} mat={tm} shadow receive />
      <Instances geo={GEO.box} items={shingles} mat={M("#5B5352", { roughness: 0.95 })} shadow />
      <mesh geometry={GEO.box} material={M("#3C3532")} position={[0, ridge + 0.08, 0]} scale={[W + 0.95, 0.14, 0.24]} />
      <Instances geo={GEO.box} items={stones} mat={M("#8C857D", { roughness: 1 })} shadow />
      <mesh geometry={GEO.box} material={M("#6F6861")} position={[-W / 2 + 0.75, 4.42, -0.1]} scale={[0.66, 0.12, 0.42]} />
      {/* front: two windows; gable end: door + window */}
      <Window glow={glow} winGlow={winGlow} frame={frame} p={[-0.85, 1.0, D / 2 + 0.1]} />
      <Window glow={glow} winGlow={winGlow} frame={frame} p={[0.9, 1.0, D / 2 + 0.1]} />
      <group position={[-W / 2 - 0.1, 0, 0]} rotation={[0, -Math.PI / 2, 0]}>
        <mesh geometry={GEO.box} material={glow} position={[0.35, 0.72, 0]} scale={[0.62, 1.32, 0.03]} />
        <mesh geometry={GEO.box} material={M("#5A3520")} position={[0.55, 0.72, 0.04]} rotation={[0, -0.7, 0]} scale={[0.6, 1.3, 0.06]} />
        <mesh geometry={GEO.box} material={frame} position={[0.35, 1.42, 0.04]} scale={[0.8, 0.09, 0.1]} />
        <Window glow={glow} winGlow={winGlow} frame={frame} p={[-0.75, 1.15, 0.02]} />
        <sprite material={winGlow} position={[0.35, 0.8, 0.5]} scale={[2.6, 2.6, 1]} />
        {[[0.35, 0.06, 0.45], [0.5, 0.02, 0.85]].map(([x, y, z], i) => <mesh key={i} geometry={GEO.box} material={M("#8C857D")} position={[x, y, z]} scale={[0.9 - i * 0.1, 0.12, 0.38]} receiveShadow />)}
        <pointLight position={[0.3, 1.0, 1.0]} intensity={lite ? 5 : 7} distance={7} decay={1.6} color="#FF9A3C" />
      </group>
      <pointLight position={[0, 1.2, D / 2 + 1.0]} intensity={lite ? 6 : 9} distance={8} decay={1.6} color="#FF9A3C" />
      {smokeMats.map((m, i) => <mesh key={i} ref={(e) => { smoke.current[i] = e; }} geometry={GEO.ico0} material={m} />)}
      {/* woodpile */}
      {Array.from({ length: 9 }, (_, i) => <mesh key={i} geometry={logGeo} material={tm} position={[W / 2 + 0.5, 0.12 + Math.floor(i / 4) * 0.2, D / 2 - 0.2 - (i % 4) * 0.22 + Math.floor(i / 4) * 0.1]} rotation={[0, 0, Math.PI / 2]} scale={[0.1, 0.7, 0.1]} castShadow />)}
    </group>
  );
}

// ---------- particles ----------
function Fireflies({ count, area, center }: { count: number; area: V3; center: V3 }) {
  const { geo, mat } = useMemo(() => {
    const r = rand(31); const pos = new Float32Array(count * 3), sd = new Float32Array(count);
    for (let i = 0; i < count; i++) { pos[i * 3] = center[0] + (r() - 0.5) * area[0]; pos[i * 3 + 1] = center[1] + (r() - 0.5) * area[1]; pos[i * 3 + 2] = center[2] + (r() - 0.5) * area[2]; sd[i] = r() * 100; }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.setAttribute("seed", new THREE.BufferAttribute(sd, 1));
    const m = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uScale: { value: 1 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `attribute float seed; uniform float uTime; uniform float uScale; varying float vA;
        void main(){ vec3 p = position; float t = uTime*0.35 + seed;
          p += vec3(sin(t*1.3)*0.6, sin(t*1.7+seed)*0.35, cos(t*1.1)*0.6);
          vec4 mv = modelViewMatrix*vec4(p,1.0); gl_Position = projectionMatrix*mv;
          vA = 0.35 + 0.65*pow(0.5+0.5*sin(uTime*2.2+seed*3.0), 3.0);
          gl_PointSize = uScale * (80.0 + fract(seed)*60.0) / -mv.z; }`,
      fragmentShader: `varying float vA; void main(){ float d = length(gl_PointCoord-0.5); float a = smoothstep(0.5,0.0,d); a = a*a; gl_FragColor = vec4(vec3(1.0,0.72,0.28)*(0.8+0.6*smoothstep(0.15,0.0,d)), a*vA); }`,
    });
    return { geo: g, mat: m };
  }, [count, area, center]);
  const { gl } = useThree();
  useFrame(({ clock }) => { mat.uniforms.uTime.value = clock.elapsedTime; mat.uniforms.uScale.value = gl.getPixelRatio() * 1.6; });
  return <points geometry={geo} material={mat} />;
}
function FallingLeaves({ count }: { count: number }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const geo = useMemo(() => { const sh = new THREE.Shape(); sh.moveTo(0, -1); sh.quadraticCurveTo(0.9, -0.2, 0, 1); sh.quadraticCurveTo(-0.9, -0.2, 0, -1); return new THREE.ShapeGeometry(sh, 2); }, []);
  const st = useMemo(() => { const r = rand(19); return Array.from({ length: count }, () => ({ x: (r() - 0.5) * 18, y: r() * 7, z: 5 - r() * 14, s: 0.5 + r() * 0.6, ph: r() * 6 })); }, [count]);
  useEffect(() => { const m = ref.current; if (!m) return; const c = new THREE.Color(); const cs = ["#F08A24", "#F6B23E", "#D9541E", "#E8702A"]; st.forEach((_, i) => m.setColorAt(i, c.set(cs[i % 4]))); if (m.instanceColor) m.instanceColor.needsUpdate = true; }, [st]);
  const o = useMemo(() => new THREE.Object3D(), []);
  useFrame(({ clock }, dt) => {
    const m = ref.current; if (!m) return; const t = clock.elapsedTime;
    st.forEach((l, i) => { l.y -= Math.min(dt, 0.05) * 0.45 * l.s; if (l.y < 0) l.y = 7; o.position.set(l.x + Math.sin(t * 0.7 + l.ph) * 0.9, l.y, l.z + Math.cos(t * 0.5 + l.ph) * 0.4); o.rotation.set(t * l.s + l.ph, t * 0.8, Math.sin(t + l.ph)); o.scale.setScalar(0.09); o.updateMatrix(); m.setMatrixAt(i, o.matrix); });
    m.instanceMatrix.needsUpdate = true;
  });
  return <instancedMesh ref={ref} args={[geo, undefined, count]} frustumCulled={false}><meshStandardMaterial side={THREE.DoubleSide} roughness={0.8} /></instancedMesh>;
}
/** Soft out-of-focus glows in the far woods and a few blurry leaves near the lens: a cheap bokeh feel. */
function Bokeh({ lite }: { lite: boolean }) {
  const items = useMemo(() => {
    const r = rand(55); const out: { p: V3; s: number; c: string; o: number }[] = [];
    for (let i = 0; i < (lite ? 10 : 22); i++) out.push({ p: [(r() - 0.5) * 30, 1.5 + r() * 4, -12 - r() * 12], s: 0.8 + r() * 1.6, c: r() > 0.5 ? "#FFB257" : "#FFD27A", o: 0.18 + r() * 0.2 });
    return out;
  }, [lite]);
  const mats = useMemo(() => items.map((b) => new THREE.SpriteMaterial({ map: glowTexture(), color: b.c, transparent: true, opacity: b.o, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })), [items]);
  const sun = useMemo(() => new THREE.SpriteMaterial({ map: glowTexture(), color: "#FF9A40", transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }), []);
  return <>{items.map((b, i) => <sprite key={i} material={mats[i]} position={b.p} scale={[b.s, b.s, 1]} />)}<sprite material={sun} position={[2.5, 3.5, -30]} scale={[30, 18, 1]} /></>;
}

// ---------- sky, env, lights ----------
function SkyDome() {
  const geo = useMemo(() => {
    const g = new THREE.SphereGeometry(120, 24, 16); const p = g.attributes.position; const cols: number[] = []; const c = new THREE.Color();
    const top = new THREE.Color("#1C1716"), mid = new THREE.Color("#6A4128"), low = new THREE.Color("#B56A34");
    for (let i = 0; i < p.count; i++) { const y = p.getY(i) / 120; if (y > 0.04) c.copy(mid).lerp(top, Math.min(1, (y - 0.04) / 0.4)); else c.copy(low).lerp(mid, Math.max(0, (y + 0.2) / 0.24)); cols.push(c.r, c.g, c.b); }
    g.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3)); return g;
  }, []);
  return <mesh geometry={geo} renderOrder={-1}><meshBasicMaterial vertexColors side={THREE.BackSide} fog={false} depthWrite={false} /></mesh>;
}
/** A tiny warm environment map so the brass and water have something to reflect (built once, ~1 ms). */
function WarmEnv() {
  const { gl, scene } = useThree();
  useEffect(() => {
    const s = new THREE.Scene(); const g = new THREE.SphereGeometry(10, 16, 8); const p = g.attributes.position; const cols: number[] = []; const c = new THREE.Color();
    for (let i = 0; i < p.count; i++) { const y = p.getY(i) / 10; c.set(y > 0.2 ? "#FFC98A" : y > -0.1 ? "#C8742E" : "#3A3020"); cols.push(c.r, c.g, c.b); }
    g.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3)); s.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(1.5, 8, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color("#FFE0B0").multiplyScalar(4) })); lamp.position.set(-5, 5, 5); s.add(lamp);
    const pm = new THREE.PMREMGenerator(gl); const rt = pm.fromScene(s, 0.04); scene.environment = rt.texture; scene.environmentIntensity = 0.55;
    return () => { scene.environment = null; rt.dispose(); pm.dispose(); };
  }, [gl, scene]);
  return null;
}
function Rig({ lite }: { lite: boolean }) {
  const { camera, pointer, size } = useThree();
  const narrow = size.width / size.height < 0.9;
  const base = useMemo(() => new THREE.Vector3(...(narrow ? [-2.0, 3.3, 8.6] : [-0.5, 4.1, 9.6])), [narrow]);
  const tgt = useMemo(() => new THREE.Vector3(...(narrow ? [-2.35, 1.35, 0.4] : [0.45, 1.45, -1.6])), [narrow]);
  const v = useMemo(() => new THREE.Vector3(), []); const look = useMemo(() => new THREE.Vector3(), []);
  useEffect(() => { const c = camera as THREE.PerspectiveCamera; c.fov = narrow ? 52 : 40; c.updateProjectionMatrix(); camera.position.copy(base); }, [narrow, camera, base]);
  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime; const k = lite ? 0.5 : 1;
    v.set(base.x + Math.sin(t * 0.13) * 0.35 * k + pointer.x * 0.5 * k, base.y + Math.sin(t * 0.21) * 0.08 + pointer.y * 0.2 * k, base.z + Math.sin(t * 0.09) * 0.2);
    camera.position.lerp(v, Math.min(1, dt * 1.5)); look.set(tgt.x + Math.sin(t * 0.17) * 0.12, tgt.y, tgt.z); camera.lookAt(look);
  });
  return null;
}

export function FoxWorld({ art, sketching, working, playing, lite }: FoxWorldProps) {
  const foxRot = angTo(FOX, EASEL) - 0.75;
  const easelRot = Math.atan2(-0.55, 1) - 0.25;
  return (
    <>
      <SkyDome />
      <fog attach="fog" args={["#3A2416", 14, 40]} />
      {!lite && <WarmEnv />}
      <hemisphereLight args={["#FFC387", "#2E3A1E", 0.55]} />
      <directionalLight position={[-7, 11, 7]} intensity={1.8} color="#FFC07A" castShadow={!lite}
        shadow-mapSize={[2048, 2048]} shadow-bias={-0.0004} shadow-normalBias={0.02} shadow-camera-left={-9} shadow-camera-right={9} shadow-camera-top={8} shadow-camera-bottom={-6} shadow-camera-far={40} />
      <directionalLight position={[6, 7, -12]} intensity={2.0} color="#FF9A48" />
      <ambientLight intensity={0.12} color="#FFD0A0" />
      <Ground lite={lite} />
      <Stream lite={lite} />
      <Forest lite={lite} />
      <group position={[CABIN[0], y0(CABIN[0], CABIN[2]) - 0.05, CABIN[2]]} rotation={[0, -0.3, 0]}><Cabin lite={lite} /></group>
      <group position={[FOX[0], y0(FOX[0], FOX[2]), FOX[2]]} rotation={[0, foxRot, 0]} scale={1.6}><Fox working={working} /></group>
      <group position={[EASEL[0], y0(EASEL[0], EASEL[2]), EASEL[2]]} rotation={[0, easelRot, 0]} scale={1.08}><Easel art={art} sketching={sketching} /></group>
      <group position={[GRAM[0], y0(GRAM[0], GRAM[2]), GRAM[2]]} rotation={[0, -0.35, 0]} scale={1.15}><Gramophone playing={playing} /></group>
      <Notes origin={[GRAM[0] - 0.45, 1.75, GRAM[2] + 0.15]} playing={playing} count={lite ? 4 : 6} />
      <Fireflies count={lite ? 60 : 150} area={[24, 4.5, 20]} center={[0.5, 1.9, -4]} />
      <FallingLeaves count={lite ? 16 : 42} />
      <Bokeh lite={lite} />
      <Rig lite={lite} />
    </>
  );
}
