"use client";
/* eslint-disable react-hooks/immutability -- three.js objects are mutated per frame by design */
// Dream Island: the main Atelier One scene. One floating island in the sky: a bearded painter at his easel,
// his fox friend, the log cabin, the gramophone, an autumn wood and a spring-fed stream that pours off the rim
// as waterfalls into a sea of clouds. Procedural, vertex-coloured, instanced; no model or texture files.
import * as THREE from "three";
import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { glowTexture, rand, fbm, type ArtSource } from "../scenes/kit";
import { autumnTree, jitter, paint, pineTree, rockGeo, type V3 } from "../fox/geo";
import { Cabin, Easel, FallingLeaves, GEO, Gramophone, Instances, Notes, vmat, WarmEnv, type Inst } from "../fox/FoxWorld";
import { BACK, MAIN, POND, POND_R, groundH, islandR, rOf, streamDist } from "./island";
import { SKY, SkyController, SkyDome, Stars, SunGlow } from "./sky";
import { Water } from "./water";
import { Flock, Lantern, Painter, Robin, WanderFox } from "./characters";

export interface DreamWorldProps { art: ArtSource | null; sketching: boolean; working: boolean; playing: boolean; lite: boolean; perch: boolean; saleKey: string | null; zoom: number }

// ---------- layout ----------
const PAINTER: V3 = [-3.3, 0, 0.9];
const EASEL: V3 = [-1.75, 0, 0.35];
const GRAM: V3 = [0.15, 0, 1.0];
const CABIN: V3 = [4.4, 0, -6.6];
const y0 = (x: number, z: number) => groundH(x, z);
const angTo = (a: V3, b: V3) => Math.atan2(b[0] - a[0], b[2] - a[2]);
const EASEL_ROT = Math.atan2(-0.55, 1) - 0.25, EASEL_S = 1.08;
const keepOut = (x: number, z: number) =>
  Math.hypot(x - PAINTER[0], z - PAINTER[2]) < 1.5 || Math.hypot(x - EASEL[0], z - EASEL[2]) < 1.1 || Math.hypot(x - GRAM[0], z - GRAM[2]) < 1.0 ||
  (Math.abs(x - CABIN[0]) < 3.2 && Math.abs(z - CABIN[2]) < 2.9) || Math.hypot(x - POND[0], z - POND[1]) < POND_R + 0.5;
/** Easel canvas frame in world space (centre + axes) so the painter's brush can find it. */
function canvasFrame() {
  const o = new THREE.Object3D(); o.position.set(EASEL[0], y0(EASEL[0], EASEL[2]), EASEL[2]); o.rotation.y = EASEL_ROT; o.scale.setScalar(EASEL_S); o.updateMatrixWorld();
  const inner = new THREE.Object3D(); inner.position.set(0, 1.38, 0.12); inner.rotation.x = -0.1; o.add(inner); o.updateMatrixWorld(true);
  const c = new THREE.Vector3(0, 0, 0.035).applyMatrix4(inner.matrixWorld);
  const q = new THREE.Quaternion(); inner.getWorldQuaternion(q);
  return { c, right: new THREE.Vector3(1, 0, 0).applyQuaternion(q), up: new THREE.Vector3(0, 1, 0).applyQuaternion(q), normal: new THREE.Vector3(0, 0, 1).applyQuaternion(q), top: new THREE.Vector3(0, 2.3, 0.02).applyMatrix4(o.matrixWorld) };
}

// ---------- the island: grassy top + layered rock underside ----------
const GRASS = ["#4C6A26", "#5A782C", "#456224", "#687E2E"], DARKG = ["#34501F", "#3C5A23", "#2F4A1C"], LEAF = ["#D9782C", "#C9632A", "#E89A3A", "#B5502A"];
const STRATA = ["#9A6B45", "#B07D50", "#7C5A40", "#A8825E", "#8A6650", "#C08A5A"];
function Island({ lite }: { lite: boolean }) {
  const geo = useMemo(() => {
    const NA = lite ? 100 : 160, NR = lite ? 30 : 46; const r = rand(9);
    const pos: number[] = []; const idx: number[] = []; let rows = 0;
    const ring = (fn: (a: number, j: number) => V3) => { for (let j = 0; j < NA; j++) pos.push(...fn((j / NA) * Math.PI * 2, j)); rows++; };
    // top surface: concentric rings with jitter, following the height field
    for (let i = 1; i <= NR; i++) {
      const f = i / NR;
      ring((a) => { const R = islandR(a) * f; const ja = i < NR ? (r() - 0.5) * 0.5 / NA * Math.PI * 2 : 0; const jr = i < NR ? (r() - 0.5) * 0.18 : 0; const x = Math.cos(a + ja) * (R + jr), z = Math.sin(a + ja) * (R + jr); return [x, y0(x, z), z]; });
    }
    // underside: rings sweeping in and down to a craggy point
    const UNDER: [number, number][] = [[1.0, -0.55], [0.985, -1.3], [0.93, -2.3], [0.85, -3.4], [0.74, -4.6], [0.6, -5.9], [0.46, -7.2], [0.32, -8.6], [0.19, -10.0], [0.08, -11.4]];
    UNDER.forEach(([f, d], k) => ring((a) => {
      const n = fbm(Math.cos(a) * 2.2 + k * 0.7, Math.sin(a) * 2.2 - k * 0.4); const R = islandR(a) * f * (0.88 + n * 0.24 + (r() - 0.5) * 0.06);
      return [Math.cos(a) * R + 0.3 * (1 - f), d + (n - 0.5) * 1.1 * Math.min(1, k * 0.5) + (r() - 0.5) * 0.25, Math.sin(a) * R - 0.2 * (1 - f)];
    }));
    const apex = pos.length / 3; pos.push(0.5, -12.6, -0.4); const center = pos.length / 3; pos.push(0, y0(0, 0), 0);
    for (let i = 0; i < rows - 1; i++) for (let j = 0; j < NA; j++) { const a = i * NA + j, b = i * NA + (j + 1) % NA, c = (i + 1) * NA + j, d = (i + 1) * NA + (j + 1) % NA; idx.push(a, b, c, b, d, c); }
    for (let j = 0; j < NA; j++) { idx.push(center, (j + 1) % NA, j); const L = (rows - 1) * NA; idx.push(L + j, L + (j + 1) % NA, apex); }
    let g: THREE.BufferGeometry = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
    const topRows = NR; const r2 = rand(12);
    g = paint(g, (c, f) => {
      const tri = f.i; const row = Math.floor(tri / 2 / NA); const isTop = row < topRows - 1 || (f.y > -0.45 && f.ny > 0.3);
      if (isTop) {
        const { d, w } = streamDist(f.x, f.z); const pd = Math.hypot(f.x - POND[0], f.z - POND[1]);
        if (d < w + 0.15 || pd < POND_R + 0.2) { c.set(r2() > 0.5 ? "#5C6E6A" : "#4E625F"); return; }
        if (d < w + 0.5 || pd < POND_R + 0.6) { c.set(r2() > 0.5 ? "#6E6A5A" : "#7A7562"); return; }
        const n = fbm(f.x * 0.45 + 11, f.z * 0.45 - 4), n2 = fbm(f.x * 1.3, f.z * 1.3 + 7);
        if (n > 0.66 || (n > 0.58 && n2 > 0.62) || r2() < 0.06) c.set(LEAF[Math.floor(r2() * 4)]);
        else if (n < 0.4) c.set(DARKG[Math.floor(r2() * 3)]); else c.set(GRASS[Math.floor(r2() * 4)]);
        c.offsetHSL(0, 0, (r2() - 0.5) * 0.05 + f.ny * 0.02); return;
      }
      if (f.y > -1.0) { c.set(r2() > 0.5 ? "#4A2F1E" : "#553624"); c.offsetHSL(0, 0, (r2() - 0.5) * 0.05); return; } // soil lip with grass overhang
      const band = Math.floor((f.y + (fbm(f.x * 0.3, f.z * 0.3) - 0.5) * 1.6) / 1.15);
      c.set(STRATA[((band % STRATA.length) + STRATA.length) % STRATA.length]);
      c.offsetHSL((r2() - 0.5) * 0.02, -0.05, (r2() - 0.5) * 0.06 + Math.max(-0.1, f.ny * 0.08) + Math.max(0, (f.y + 12) / 12) * 0.04 - 0.04);
    });
    return g;
  }, [lite]);
  const mat = useMemo(() => vmat({ roughness: 1 }), []);
  return <mesh geometry={geo} material={mat} receiveShadow castShadow={false} />;
}

/** Roots and rocks hanging under the island, plus little crystals catching the light. */
function Underside({ lite }: { lite: boolean }) {
  const items = useMemo(() => {
    const r = rand(77); const roots: Inst[] = []; const rocks: Inst[] = [];
    for (let i = 0; i < (lite ? 26 : 60); i++) {
      const a = r() * Math.PI * 2, f = 0.55 + r() * 0.42; const R = islandR(a) * f; const y = -0.9 - (1 - f) * 9 - r() * 0.5;
      roots.push({ p: [Math.cos(a) * R, y, Math.sin(a) * R], s: [0.05 + r() * 0.06, 0.8 + r() * 1.8, 0.05 + r() * 0.06], r: [Math.PI + (r() - 0.5) * 0.4, 0, (r() - 0.5) * 0.4], c: r() > 0.5 ? "#5A3E2A" : "#6E4C34" });
    }
    for (let i = 0; i < (lite ? 10 : 22); i++) { const a = r() * Math.PI * 2, f = 0.3 + r() * 0.6; const R = islandR(a) * f * 0.92; rocks.push({ p: [Math.cos(a) * R, -2.5 - (1 - f) * 8 - r() * 1.4, Math.sin(a) * R], s: 0.4 + r() * 0.7, r: [r() * 3, r() * 3, r() * 3] }); }
    // a craggy cluster at the keel hides the converging facets of the point
    rocks.push({ p: [0.5, -11.6, -0.4], s: [1.5, 1.9, 1.4], r: [0.3, 0.5, 0.1] }, { p: [1.3, -10.6, 0.3], s: [1.2, 1.3, 1.1], r: [1, 2, 0.4] }, { p: [-0.4, -10.4, -1.0], s: [1.3, 1.2, 1.2], r: [2, 1, 0.3] }, { p: [0.4, -12.6, -0.3], s: [0.8, 1.2, 0.8], r: [0.5, 0.2, 1] });
    return { roots, rocks };
  }, [lite]);
  const rg = useMemo(() => rockGeo(8, ["#8A6650", "#9A7458", "#7A5A46"]), []); const tm = useMemo(() => vmat(), []);
  const bm = useMemo(() => new THREE.MeshStandardMaterial({ flatShading: true, roughness: 1 }), []);
  return <><Instances geo={GEO.cone5} items={items.roots} mat={bm} /><Instances geo={rg} items={items.rocks} mat={tm} /></>;
}

// ---------- vegetation ----------
function useScatter(lite: boolean) {
  return useMemo(() => {
    const r = rand(42); const trees: Inst[][] = [[], [], []]; const pines: Inst[] = []; const rocks: Inst[][] = [[], [], []]; const litter: Inst[] = []; const tufts: Inst[] = []; const bushes: Inst[] = []; const flowers: Inst[] = [];
    const inIsland = (x: number, z: number, m = 0.9) => rOf(x, z) < m;
    const nearWater = (x: number, z: number, pad: number) => { const { d, w } = streamDist(x, z); return d < w + pad || Math.hypot(x - POND[0], z - POND[1]) < POND_R + pad; };
    const t = (k: number, x: number, z: number, s: number) => trees[k].push({ p: [x, y0(x, z) - 0.05, z], s: [s, s * (0.9 + r() * 0.25), s], r: [0, r() * 6.28, 0], c: new THREE.Color(1, 1, 1).offsetHSL((r() - 0.5) * 0.02, 0, (r() - 0.5) * 0.1).getStyle() });
    // hero trees framing the cozy shot
    t(0, -7.4, -1.6, 1.9); t(2, -6.0, -5.2, 1.45); t(1, -8.6, 2.8, 1.7); t(1, 8.6, -1.2, 1.75); t(0, 8.0, -6.0, 1.4);
    t(1, -2.8, -9.8, 1.15); t(2, 6.8, -9.0, 1.2); t(1, -6.6, 6.2, 1.3);
    for (let i = 0; i < (lite ? 24 : 46); i++) {
      const a = r() * Math.PI * 2, f = 0.35 + r() * 0.55; const x = Math.cos(a) * islandR(a) * f, z = Math.sin(a) * islandR(a) * f;
      if (!inIsland(x, z, 0.9) || nearWater(x, z, 1.0) || keepOut(x, z) || (z > -3.5 && x > -5.5 && x < 6.5)) continue;
      t(Math.floor(r() * 3), x, z, 0.8 + r() * 0.6);
    }
    for (let i = 0; i < (lite ? 22 : 40); i++) {
      const a = r() * Math.PI * 2, f = 0.45 + r() * 0.47; const x = Math.cos(a) * islandR(a) * f, z = Math.sin(a) * islandR(a) * f;
      if (nearWater(x, z, 0.9) || keepOut(x, z) || (z > -4 && x > -6 && x < 7)) continue;
      const s = 0.8 + r() * 0.75; pines.push({ p: [x, y0(x, z) - 0.1, z], s: [s, s * (1.05 + r() * 0.3), s], r: [0, r() * 6, 0], c: new THREE.Color(1, 1, 1).offsetHSL(0, 0, (r() - 0.5) * 0.12).getStyle() });
    }
    pines.push({ p: [-4.8, y0(-4.8, -3.0) - 0.1, -3.0], s: [1.0, 1.25, 1.0], r: [0, 1, 0], c: "#cfd8cf" }, { p: [-2.2, y0(-2.2, -4.6) - 0.1, -4.6], s: [0.9, 1.15, 0.9], r: [0, 2, 0], c: "#d8e0d8" });
    // stream + pond stones
    for (const S of [MAIN, BACK]) S.forEach(([x, z], i) => {
      if (i % 2) return; const n = S[Math.min(S.length - 1, i + 1)]; const dx = n[0] - x, dz = n[1] - z, L = Math.hypot(dx, dz) || 1; const nx = -dz / L, nz = dx / L; const { w } = streamDist(x, z);
      for (const side of [-1, 1]) { if (r() < (lite ? 0.75 : 0.5)) continue; const o = side * (w + 0.12 + r() * 0.35); const sx = x + nx * o, sz = z + nz * o; if (rOf(sx, sz) > 0.97) continue; const s = 0.09 + r() * 0.14; rocks[Math.floor(r() * 3)].push({ p: [sx, y0(sx, sz) - 0.02, sz], s: [s * 1.3, s * 0.6, s], r: [0, r() * 6, 0], c: new THREE.Color(0.68, 0.7, 0.74).multiplyScalar(0.85 + r() * 0.3).getStyle() }); }
      if (i % 8 === 0 && rOf(x, z) < 0.94) { const o = (r() - 0.5) * w; const sx = x + nx * o, sz = z + nz * o; const s = 0.08 + r() * 0.08; rocks[Math.floor(r() * 3)].push({ p: [sx, y0(sx, sz) + 0.12, sz], s: [s * 1.4, s * 0.6, s * 1.1], r: [0, r() * 6, 0], c: "#9AA4AA" }); }
    });
    for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2 + r() * 0.2, R = POND_R + 0.2 + r() * 0.25; const x = POND[0] + Math.cos(a) * R, z = POND[1] + Math.sin(a) * R; const s = 0.12 + r() * 0.16; rocks[i % 3].push({ p: [x, y0(x, z), z], s: [s * 1.3, s * 0.7, s], r: [0, r() * 6, 0], c: "#A9ACAE" }); }
    // boulders near the rim
    for (let i = 0; i < (lite ? 12 : 26); i++) { const a = r() * Math.PI * 2; const R = islandR(a) * (0.86 + r() * 0.08); const x = Math.cos(a) * R, z = Math.sin(a) * R; if (nearWater(x, z, 0.6) || keepOut(x, z)) continue; const s = 0.25 + r() * 0.45; rocks[i % 3].push({ p: [x, y0(x, z), z], s: [s * 1.2, s * 0.8, s], r: [0, r() * 6, 0] }); }
    const LC = ["#E8822C", "#D2592A", "#F2A53A", "#B9452A", "#F5C25A", "#9C5A2A"];
    for (let i = 0; i < (lite ? 500 : 1400); i++) {
      const near = i < (lite ? 160 : 450); const x = near ? (r() - 0.5) * 12 - 1 : (r() - 0.5) * 24, z = near ? 0.5 + r() * 6 : (r() - 0.5) * 24;
      if (!inIsland(x, z, 0.95) || nearWater(x, z, 0.1)) continue; const s = 0.06 + r() * 0.07;
      litter.push({ p: [x, y0(x, z) + 0.025, z], s: [s, s, s * 0.6], r: [-Math.PI / 2 + (r() - 0.5) * 0.5, 0, r() * 6.28], c: LC[Math.floor(r() * LC.length)] });
    }
    for (let i = 0; i < (lite ? 180 : 460); i++) { const x = (r() - 0.5) * 24, z = (r() - 0.5) * 24; if (!inIsland(x, z, 0.96) || nearWater(x, z, 0.3) || (keepOut(x, z) && r() < 0.7)) continue; const s = 0.1 + r() * 0.12; tufts.push({ p: [x, y0(x, z) + s * 0.4, z], s: [s * 0.45, s * 1.1, s * 0.45], r: [0, r() * 6, (r() - 0.5) * 0.3], c: ["#6E8E30", "#86A23A", "#5C7A2A", "#9AA83E"][Math.floor(r() * 4)] }); }
    for (let i = 0; i < (lite ? 22 : 46); i++) { const x = (r() - 0.5) * 24, z = (r() - 0.5) * 24; if (!inIsland(x, z, 0.93) || keepOut(x, z) || nearWater(x, z, 0.7) || (z > -1.5 && x > -5.5 && x < 5.5)) continue; const s = 0.18 + r() * 0.24; bushes.push({ p: [x, y0(x, z) + s * 0.4, z], s: [s * 1.3, s, s * 1.2], r: [r(), r(), r()], c: ["#D86A26", "#E89234", "#5E7A2C", "#C2501F", "#7C8E34"][Math.floor(r() * 5)] }); }
    for (let i = 0; i < (lite ? 50 : 120); i++) { const x = (r() - 0.5) * 22, z = (r() - 0.5) * 22; if (!inIsland(x, z, 0.94) || nearWater(x, z, 0.3) || keepOut(x, z)) continue; flowers.push({ p: [x, y0(x, z) + 0.07, z], s: 0.045, c: ["#FFE07A", "#FFF4E0", "#FF9A5A", "#F6C33B"][Math.floor(r() * 4)] }); }
    return { trees, pines, rocks, litter, tufts, bushes, flowers };
  }, [lite]);
}
function Forest({ lite }: { lite: boolean }) {
  const S = useScatter(lite);
  const g = useMemo(() => ({
    trees: [autumnTree(11, 0, lite ? 0 : 1), autumnTree(23, 1, lite ? 0 : 1), autumnTree(37, 2, lite ? 0 : 1)], pine: pineTree(5),
    rocks: [rockGeo(1, ["#7F848A", "#8F949A", "#6F757C", "#9AA0A4"]), rockGeo(2, ["#7F848A", "#8F949A", "#6F757C", "#9AA0A4"]), rockGeo(3, ["#857F78", "#93908A", "#76726C"])],
    leaf: (() => { const sh = new THREE.Shape(); sh.moveTo(0, -1); sh.quadraticCurveTo(0.9, -0.2, 0, 1); sh.quadraticCurveTo(-0.9, -0.2, 0, -1); return new THREE.ShapeGeometry(sh, 2); })(),
  }), [lite]);
  const tm = useMemo(() => vmat(), []); const lm = useMemo(() => new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.9, flatShading: true }), []);
  const bm = useMemo(() => new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.95 }), []);
  const fm = useMemo(() => new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.6, emissive: "#3A2A10", emissiveIntensity: 0.4 }), []);
  return (
    <>
      {g.trees.map((geo, i) => <Instances key={i} geo={geo} items={S.trees[i]} mat={tm} shadow={!lite} />)}
      <Instances geo={g.pine} items={S.pines} mat={tm} shadow={!lite} />
      {g.rocks.map((geo, i) => <Instances key={"r" + i} geo={geo} items={S.rocks[i]} mat={tm} receive />)}
      <Instances geo={g.leaf} items={S.litter} mat={lm} />
      <Instances geo={GEO.cone4} items={S.tufts} mat={bm} />
      <Instances geo={GEO.ico0} items={S.bushes} mat={bm} shadow={!lite} />
      <Instances geo={GEO.ico0} items={S.flowers} mat={fm} />
    </>
  );
}

// ---------- clouds: a soft sea below + distant puffs ----------
function cloudGeo(seed: number) {
  const r = rand(seed); const gs: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 5; i++) { const g = jitter(new THREE.IcosahedronGeometry(1, 1), 0.12, r); const s = i === 0 ? 1 : 0.55 + r() * 0.35; g.scale(s, s * 0.8, s); g.translate((r() - 0.5) * 1.8, (r() - 0.2) * 0.4, (r() - 0.5) * 1.2); gs.push(g); }
  const m = new THREE.BufferGeometry(); const parts = gs.map((g) => (g.index ? g.toNonIndexed() : g)); let n = 0; parts.forEach((p) => (n += p.attributes.position.count));
  const arr = new Float32Array(n * 3); let o = 0; parts.forEach((p) => { arr.set(p.attributes.position.array as Float32Array, o); o += p.attributes.position.count * 3; });
  m.setAttribute("position", new THREE.BufferAttribute(arr, 3));
  return paint(m, (c, f) => { c.set("#FFFFFF"); c.offsetHSL(0, 0, Math.min(0, f.ny * 0.12) - (f.y < 0 ? 0.08 : 0)); });
}
function Clouds({ lite }: { lite: boolean }) {
  const geos = useMemo(() => [cloudGeo(3), cloudGeo(8)], []);
  const { sea, far } = useMemo(() => {
    const r = rand(64); const sea: Inst[][] = [[], []], far: Inst[][] = [[], []];
    for (let i = 0; i < (lite ? 40 : 80); i++) { const a = r() * Math.PI * 2, R = 6 + Math.pow(r(), 0.7) * 75; const s = 3 + r() * 6 + R * 0.06; sea[i % 2].push({ p: [Math.cos(a) * R, -17.5 - r() * 3 + R * 0.05, Math.sin(a) * R], s: [s, s * 0.45, s], r: [0, r() * 6, 0], c: new THREE.Color(1, 1, 1).offsetHSL(0.02, 0.1, -r() * 0.06).getStyle() }); }
    for (let i = 0; i < (lite ? 12 : 26); i++) { const a = r() * Math.PI * 2, R = 70 + r() * 35; const s = 5 + r() * 8; far[i % 2].push({ p: [Math.cos(a) * R, -4 + r() * 22, Math.sin(a) * R], s: [s * 1.4, s * 0.55, s], r: [0, r() * 6, 0] }); }
    return { sea, far };
  }, [lite]);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1, emissive: new THREE.Color("#FFE0C0"), emissiveIntensity: 0.35 }), []);
  const ring = useRef<THREE.Group>(null);
  useFrame((_, dt) => { mat.emissive.copy(SKY.hor).lerp(SKY.low, 0.3); mat.emissiveIntensity = 0.2 + SKY.p * 0.1; if (ring.current) ring.current.rotation.y += dt * 0.006; });
  return (
    <>
      {sea.map((it, i) => <Instances key={"s" + i} geo={geos[i]} items={it} mat={mat} />)}
      <group ref={ring}>{far.map((it, i) => <Instances key={"f" + i} geo={geos[i]} items={it} mat={mat} />)}</group>
      <Haze />
    </>
  );
}
/** Big soft glows under the island so the cloud sea reads as luminous mist. */
function Haze() {
  const items = useMemo(() => { const r = rand(5); return Array.from({ length: 14 }, () => ({ p: [(r() - 0.5) * 70, -18 + r() * 2, (r() - 0.5) * 70] as V3, s: 20 + r() * 25 })); }, []);
  const mat = useMemo(() => new THREE.SpriteMaterial({ map: glowTexture(), transparent: true, depthWrite: false, opacity: 0.16, fog: false }), []);
  useFrame(() => { mat.color.copy(SKY.hor).lerp(new THREE.Color(1, 1, 1), 0.4); });
  return <>{items.map((b, i) => <sprite key={i} material={mat} position={b.p} scale={[b.s, b.s * 0.45, 1]} />)}</>;
}

// ---------- fireflies (brighter as dusk falls) ----------
function Fireflies({ count }: { count: number }) {
  const { geo, mat } = useMemo(() => {
    const r = rand(31); const pos: number[] = [], sd: number[] = [];
    for (let i = 0; i < count; i++) { const a = r() * Math.PI * 2, R = Math.sqrt(r()) * 10.5; pos.push(Math.cos(a) * R, 0.6 + r() * 3.2, Math.sin(a) * R); sd.push(r() * 100); }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("seed", new THREE.Float32BufferAttribute(sd, 1));
    const m = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uScale: { value: 1 }, uGlow: { value: 1 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `attribute float seed; uniform float uTime, uScale, uGlow; varying float vA;
        void main(){ vec3 p = position; float t = uTime*0.35 + seed; p += vec3(sin(t*1.3)*0.6, sin(t*1.7+seed)*0.35, cos(t*1.1)*0.6);
          vec4 mv = modelViewMatrix*vec4(p,1.0); gl_Position = projectionMatrix*mv;
          vA = uGlow * (0.35 + 0.65*pow(0.5+0.5*sin(uTime*2.2+seed*3.0), 3.0)); gl_PointSize = uScale*(80.0 + fract(seed)*60.0) / -mv.z; }`,
      fragmentShader: `varying float vA; void main(){ float d = length(gl_PointCoord-0.5); float a = smoothstep(0.5,0.0,d); a = a*a; gl_FragColor = vec4(vec3(1.0,0.74,0.3)*(0.8+0.6*smoothstep(0.15,0.0,d)), a*vA); }`,
    });
    return { geo: g, mat: m };
  }, [count]);
  const { gl } = useThree();
  useFrame(({ clock }) => { mat.uniforms.uTime.value = clock.elapsedTime; mat.uniforms.uScale.value = gl.getPixelRatio() * 1.6; mat.uniforms.uGlow.value = 0.35 + SKY.p * 0.85; });
  return <points geometry={geo} material={mat} />;
}

// ---------- camera: cozy close-up ↔ the whole island hanging in the sky ----------
type Pose = { pos: V3; tgt: V3; fov: number };
const POSES: Record<"wide" | "narrow", [Pose, Pose]> = {
  wide: [{ pos: [-0.5, 4.1, 9.6], tgt: [0.45, 1.45, -1.6], fov: 40 }, { pos: [11, 3.5, 33], tgt: [0.6, -3.4, 0], fov: 38 }],
  narrow: [{ pos: [-2.0, 3.3, 8.6], tgt: [-2.35, 1.35, 0.4], fov: 52 }, { pos: [14, 5, 52], tgt: [0.5, -3.8, 0], fov: 50 }],
};
function Rig({ lite, zoom }: { lite: boolean; zoom: number }) {
  const { camera, pointer, size } = useThree();
  const narrow = size.width / size.height < 0.9; const [A, B] = POSES[narrow ? "narrow" : "wide"];
  const z = useRef(zoom); const pos = useMemo(() => new THREE.Vector3(), []); const tgt = useMemo(() => new THREE.Vector3(), []);
  const a = useMemo(() => ({ p: new THREE.Vector3(...A.pos), t: new THREE.Vector3(...A.tgt), P: new THREE.Vector3(...B.pos), T: new THREE.Vector3(...B.tgt) }), [A, B]);
  useEffect(() => { camera.position.set(...A.pos); }, [camera, A]);
  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime; const k = lite ? 0.5 : 1;
    z.current += (zoom - z.current) * (1 - Math.exp(-dt * 2.2));
    const e = z.current * z.current * (3 - 2 * z.current);
    pos.lerpVectors(a.p, a.P, e); tgt.lerpVectors(a.t, a.T, e);
    pos.y += Math.sin(e * Math.PI) * 4; // arc up and out rather than sliding straight back
    // slow orbit when wide, gentle sway + pointer parallax when close
    const orb = Math.sin(t * 0.05) * 0.22 * e; const cs = Math.cos(orb), sn = Math.sin(orb); const px = pos.x, pz = pos.z; pos.x = px * cs - pz * sn; pos.z = px * sn + pz * cs;
    pos.x += (Math.sin(t * 0.13) * 0.35 + pointer.x * 0.5) * k * (1 - e); pos.y += (Math.sin(t * 0.21) * 0.08 + pointer.y * 0.2 * k) * (1 - e); pos.z += Math.sin(t * 0.09) * 0.2 * (1 - e);
    camera.position.lerp(pos, Math.min(1, dt * 3)); tgt.x += Math.sin(t * 0.17) * 0.12 * (1 - e); camera.lookAt(tgt);
    const c = camera as THREE.PerspectiveCamera; const fov = A.fov + (B.fov - A.fov) * e; if (Math.abs(c.fov - fov) > 0.01) { c.fov = fov; c.updateProjectionMatrix(); }
  });
  return null;
}

export function DreamWorld({ art, sketching, working, playing, lite, perch, saleKey, zoom }: DreamWorldProps) {
  const cf = useMemo(() => canvasFrame(), []);
  const q = useMemo(() => new URLSearchParams(typeof location !== "undefined" ? location.search : ""), []);
  const robinFrom = useMemo(() => new THREE.Vector3(-14, 9, -10), []);
  const painterRot = angTo(PAINTER, EASEL) - 0.9;
  const foxPath = useMemo(() => [
    { p: [-5.6, -2.2] as [number, number] }, { p: [-3.0, -1.5] as [number, number] }, { p: [-0.7, -0.7] as [number, number] },
    { p: [-1.05, 1.1] as [number, number], pause: 4.5, pose: "sniff" as const, face: [EASEL[0], EASEL[2]] as [number, number] },
    { p: [-0.4, 2.4] as [number, number] }, { p: [0.95, 1.85] as [number, number], pause: 18, pose: "curl" as const, face: [0.2, 2.6] as [number, number] },
    { p: [1.6, -0.6] as [number, number] }, { p: [0.4, -3.2] as [number, number], pause: 3, face: [2.6, -2.6] as [number, number] }, { p: [-3.4, -3.4] as [number, number] },
  ], []);
  return (
    <>
      <SkyDome />
      <SunGlow />
      <Stars count={lite ? 80 : 180} />
      <SkyController lite={lite} />
      {!lite && <WarmEnv />}
      <Island lite={lite} />
      <Underside lite={lite} />
      <Water lite={lite} />
      <Forest lite={lite} />
      <Clouds lite={lite} />
      <group position={[CABIN[0], y0(CABIN[0], CABIN[2]) - 0.05, CABIN[2]]} rotation={[0, -0.35, 0]}><Cabin lite={lite} /></group>
      <group position={[PAINTER[0], y0(PAINTER[0], PAINTER[2]), PAINTER[2]]} rotation={[0, painterRot, 0]} scale={1.3}>
        <Painter working={working || q.get("paint") === "1"} canvasWorld={cf.c} canvasRight={cf.right} canvasUp={cf.up} canvasNormal={cf.normal} />
      </group>
      <group position={[EASEL[0], y0(EASEL[0], EASEL[2]), EASEL[2]]} rotation={[0, EASEL_ROT, 0]} scale={EASEL_S}><Easel art={art} sketching={sketching} /></group>
      <group position={[GRAM[0], y0(GRAM[0], GRAM[2]), GRAM[2]]} rotation={[0, -0.35, 0]} scale={1.15}><Gramophone playing={playing} /></group>
      <Notes origin={[GRAM[0] - 0.45, 1.75, GRAM[2] + 0.15]} playing={playing} count={lite ? 4 : 6} />
      <WanderFox path={foxPath} />
      <Robin perch={perch || q.get("perch") === "1"} spot={cf.top} from={robinFrom} />
      <Lantern art={art} fireKey={saleKey} from={cf.c} lite={lite} demo={q.get("lantern") === "1"} />
      <Flock n={5} radius={15} height={7} speed={0.07} phase={0} />
      {!lite && <Flock n={4} radius={19} height={10} speed={-0.05} phase={2.5} color="#4A3428" />}
      <Fireflies count={lite ? 60 : 140} />
      <FallingLeaves count={lite ? 14 : 36} />
      <Rig lite={lite} zoom={q.get("zoom") ? Number(q.get("zoom")) : zoom} />
    </>
  );
}
