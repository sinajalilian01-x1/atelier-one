"use client";
/* eslint-disable react-hooks/immutability -- three.js objects are mutated per frame by design */
// The main Atelier One scene: a small farm on one floating island. The painter's cabin and barn, a vegetable garden,
// crop rows, a fenced pasture with sheep, chickens in the yard, her dog, a spring-fed stream that pours off the rim as a
// waterfall into the clouds, and a full day/night cycle. Procedural, flat-shaded low-poly; no model or texture files.
import * as THREE from "three";
import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { glowTexture, rand, fbm, type ArtSource } from "../scenes/kit";
import { paint, rockGeo, type V3 } from "../fox/geo";
import { Cabin, Easel, GEO, Gramophone, Instances, M, Notes, vmat, WarmEnv, type Inst } from "../fox/FoxWorld";
import { FARM, MAIN, BACK, POND, POND_R, groundH, islandR, pathDist, rOf, streamDist } from "./island";
import { SKY, SkyController, SkyDome, Stars, SunGlow } from "./sky";
import { Water } from "./water";
import { Flock, Lantern, Robin } from "./characters";
import { Chickens, Dog, Sheep, Woman } from "./folk";

export interface DreamWorldProps { art: ArtSource | null; sketching: boolean; working: boolean; playing: boolean; lite: boolean; perch: boolean; saleKey: string | null; zoom: number }

const y0 = (x: number, z: number) => groundH(x, z);
const EASEL: V3 = [FARM.easel[0], 0, FARM.easel[1]];
const GRAM: V3 = [FARM.gram[0], 0, FARM.gram[1]];
const EASEL_ROT = Math.atan2(-0.55, 1) - 0.25, EASEL_S = 1.08;
const inRect = (x: number, z: number, r: { x0: number; x1: number; z0: number; z1: number }, pad = 0) => x > r.x0 - pad && x < r.x1 + pad && z > r.z0 - pad && z < r.z1 + pad;
const BUILD: { c: [number, number]; hx: number; hz: number }[] = [
  { c: FARM.cabin, hx: 3.0, hz: 2.6 }, { c: FARM.barn, hx: 3.2, hz: 3.6 }, { c: FARM.coop, hx: 1.0, hz: 1.0 },
  { c: FARM.garden, hx: 2.2, hz: 1.4 }, { c: [EASEL[0] - 0.5, EASEL[2] + 0.4], hx: 2.0, hz: 1.6 },
];
const blocked = (x: number, z: number, pad = 0) => BUILD.some((b) => Math.abs(x - b.c[0]) < b.hx + pad && Math.abs(z - b.c[1]) < b.hz + pad) || inRect(x, z, FARM.field, pad) || pathDist(x, z) < 0.9 + pad;

/** Easel canvas frame in world space (centre + axes) so the painter's brush can find it. */
function canvasFrame() {
  const o = new THREE.Object3D(); o.position.set(EASEL[0], y0(EASEL[0], EASEL[2]), EASEL[2]); o.rotation.y = EASEL_ROT; o.scale.setScalar(EASEL_S); o.updateMatrixWorld();
  const inner = new THREE.Object3D(); inner.position.set(0, 1.38, 0.12); inner.rotation.x = -0.1; o.add(inner); o.updateMatrixWorld(true);
  const c = new THREE.Vector3(0, 0, 0.035).applyMatrix4(inner.matrixWorld);
  const q = new THREE.Quaternion(); inner.getWorldQuaternion(q);
  return { c, right: new THREE.Vector3(1, 0, 0).applyQuaternion(q), up: new THREE.Vector3(0, 1, 0).applyQuaternion(q), normal: new THREE.Vector3(0, 0, 1).applyQuaternion(q), top: new THREE.Vector3(0, 2.3, 0.02).applyMatrix4(o.matrixWorld) };
}

// ---------- the island: open grass, dirt paths, the tilled field, layered rock underneath ----------
const GRASS = ["#8DB05C", "#86A956", "#93B562", "#7FA250"], PAST = ["#9CBC66", "#A4C26C"], STRATA = ["#B08A66", "#A07A58", "#BC9874", "#94704F"];
function Island({ lite }: { lite: boolean }) {
  const geo = useMemo(() => {
    const NA = lite ? 120 : 200, NR = lite ? 36 : 60; const r = rand(9);
    const pos: number[] = []; const idx: number[] = []; let rows = 0;
    const ring = (fn: (a: number, j: number) => V3) => { for (let j = 0; j < NA; j++) pos.push(...fn((j / NA) * Math.PI * 2, j)); rows++; };
    for (let i = 1; i <= NR; i++) {
      const f = i / NR;
      ring((a) => { const R = islandR(a) * f; const ja = i < NR ? (r() - 0.5) * 0.4 / NA * Math.PI * 2 : 0; const jr = i < NR ? (r() - 0.5) * 0.14 : 0; const x = Math.cos(a + ja) * (R + jr), z = Math.sin(a + ja) * (R + jr); return [x, y0(x, z), z]; });
    }
    const UNDER: [number, number][] = [[1.0, -0.6], [0.985, -1.4], [0.94, -2.5], [0.86, -3.7], [0.75, -5.0], [0.62, -6.4], [0.48, -7.9], [0.34, -9.4], [0.2, -11.0], [0.09, -12.6]];
    UNDER.forEach(([f, d], k) => ring((a) => {
      const n = fbm(Math.cos(a) * 2.2 + k * 0.7, Math.sin(a) * 2.2 - k * 0.4); const R = islandR(a) * f * (0.9 + n * 0.2);
      return [Math.cos(a) * R + 0.3 * (1 - f), d + (n - 0.5) * 1.0 * Math.min(1, k * 0.5), Math.sin(a) * R - 0.2 * (1 - f)];
    }));
    const apex = pos.length / 3; pos.push(0.5, -13.8, -0.4); const center = pos.length / 3; pos.push(0, y0(0, 0), 0);
    for (let i = 0; i < rows - 1; i++) for (let j = 0; j < NA; j++) { const a = i * NA + j, b = i * NA + (j + 1) % NA, c = (i + 1) * NA + j, d = (i + 1) * NA + (j + 1) % NA; idx.push(a, b, c, b, d, c); }
    for (let j = 0; j < NA; j++) { idx.push(center, (j + 1) % NA, j); const L = (rows - 1) * NA; idx.push(L + j, L + (j + 1) % NA, apex); }
    let g: THREE.BufferGeometry = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
    const r2 = rand(12); const F = FARM.field;
    g = paint(g, (c, f) => {
      const row = Math.floor(f.i / 2 / NA); const isTop = row < NR - 1 || (f.y > -0.5 && f.ny > 0.3);
      if (isTop) {
        const { d, w } = streamDist(f.x, f.z); const pd = Math.hypot(f.x - POND[0], f.z - POND[1]);
        if (d < w + 0.15 || pd < POND_R + 0.2) { c.set("#6F7F78"); return; }
        if (d < w + 0.5 || pd < POND_R + 0.6) { c.set(r2() > 0.5 ? "#A49A80" : "#9A9078"); return; }
        if (inRect(f.x, f.z, F)) { const stripe = Math.floor((f.x - F.x0) / 0.9) % 2 === 0; c.set(stripe ? "#8A6646" : "#7A583C"); c.offsetHSL(0, 0, (r2() - 0.5) * 0.03); return; }
        const pdist = pathDist(f.x, f.z);
        if (pdist < 0.55) { c.set(r2() > 0.5 ? "#D2B386" : "#C9A97C"); return; }
        if (Math.hypot(f.x - FARM.yard[0], f.z - FARM.yard[1]) < 2.6) { c.set(r2() > 0.5 ? "#B9A57A" : "#AE9C70"); return; }
        const n = fbm(f.x * 0.18 + 11, f.z * 0.18 - 4);
        if (inRect(f.x, f.z, FARM.pasture)) c.set(PAST[Math.floor(r2() * 2)]); else c.set(GRASS[Math.floor(r2() * 4)]);
        c.offsetHSL(0, 0, (n - 0.5) * 0.06 + (r2() - 0.5) * 0.025); return;
      }
      if (f.y > -1.0) { c.set(r2() > 0.5 ? "#6A4A30" : "#5E4029"); return; }
      const band = Math.floor((f.y + (fbm(f.x * 0.3, f.z * 0.3) - 0.5) * 1.4) / 1.3);
      c.set(STRATA[((band % STRATA.length) + STRATA.length) % STRATA.length]);
      c.offsetHSL(0, -0.04, (r2() - 0.5) * 0.04 + Math.max(-0.1, f.ny * 0.08) - 0.03);
    });
    return g;
  }, [lite]);
  const mat = useMemo(() => vmat({ roughness: 1 }), []);
  return <mesh geometry={geo} material={mat} receiveShadow />;
}

function Underside({ lite }: { lite: boolean }) {
  const rocks = useMemo(() => {
    const r = rand(77); const out: Inst[] = [];
    for (let i = 0; i < (lite ? 10 : 20); i++) { const a = r() * Math.PI * 2, f = 0.3 + r() * 0.6; const R = islandR(a) * f * 0.92; out.push({ p: [Math.cos(a) * R, -3 - (1 - f) * 8 - r() * 1.4, Math.sin(a) * R], s: 0.5 + r() * 0.8, r: [r() * 3, r() * 3, r() * 3] }); }
    out.push({ p: [0.5, -12.8, -0.4], s: [1.6, 2.0, 1.5], r: [0.3, 0.5, 0.1] }, { p: [1.4, -11.8, 0.3], s: [1.3, 1.4, 1.2], r: [1, 2, 0.4] }, { p: [-0.4, -11.6, -1.0], s: [1.4, 1.3, 1.3], r: [2, 1, 0.3] });
    return out;
  }, [lite]);
  const rg = useMemo(() => rockGeo(8, ["#A88462", "#B4906C", "#977656"]), []); const tm = useMemo(() => vmat(), []);
  return <Instances geo={rg} items={rocks} mat={tm} />;
}

// ---------- trees: a few round, simple ones ----------
function roundTree(seed: number) {
  const r = rand(seed); const parts: THREE.BufferGeometry[] = [];
  const trunk = new THREE.CylinderGeometry(0.12, 0.18, 1.4, 6); trunk.translate(0, 0.7, 0); parts.push(paint(trunk, (c) => c.set("#7A5838")));
  const G2 = ["#6E9C4E", "#78A656", "#64904A"];
  for (let i = 0; i < 3; i++) { const g = new THREE.IcosahedronGeometry(i === 0 ? 1.05 : 0.75, 0); g.translate((r() - 0.5) * 0.7, 1.9 + i * 0.35 + (i ? 0.1 : 0), (r() - 0.5) * 0.6); parts.push(paint(g, (c, f) => { c.set(G2[i % 3]); c.offsetHSL(0, 0, f.ny * 0.06 - 0.02); })); }
  const all = parts.map((p) => (p.index ? p.toNonIndexed() : p)); let n = 0; all.forEach((p) => (n += p.attributes.position.count));
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3); let o = 0;
  all.forEach((p) => { pos.set(p.attributes.position.array as Float32Array, o); col.set(p.attributes.color.array as Float32Array, o); o += p.attributes.position.count * 3; });
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.setAttribute("color", new THREE.BufferAttribute(col, 3)); g.computeVertexNormals(); return g;
}
const TREES: [number, number, number][] = [[-12.6, -6.0, 1.15], [-14.2, -1.0, 1.0], [11.2, -9.6, 1.2], [15.0, 2.6, 1.05], [-4.6, 15.2, 0.95], [1.6, -14.6, 1.0], [-6.8, -4.4, 0.9]];

// ---------- the farm ----------
function Farm({ lite }: { lite: boolean }) {
  const tree = useMemo(() => roundTree(4), []); const tm = useMemo(() => vmat({ roughness: 0.95 }), []);
  const items = useMemo(() => {
    const r = rand(5);
    const trees: Inst[] = TREES.map(([x, z, s]) => ({ p: [x, y0(x, z) - 0.05, z], s: [s, s * (0.95 + r() * 0.1), s], r: [0, r() * 6, 0] }));
    // crops: alternating rows of cabbages and wheat in the tilled field
    const cabb: Inst[] = [], wheat: Inst[] = []; const F = FARM.field;
    for (let x = F.x0 + 0.45, row = 0; x < F.x1; x += 0.9, row++) for (let z = F.z0 + 0.4; z < F.z1 - 0.3; z += row % 3 === 2 ? 0.28 : 0.62) {
      if (Math.hypot(x - FARM.scarecrow[0], z - FARM.scarecrow[1]) < 0.7) continue;
      if (row % 3 === 2) wheat.push({ p: [x + (r() - 0.5) * 0.12, y0(x, z) + 0.28, z], s: [0.06, 0.6 + r() * 0.12, 0.06], r: [(r() - 0.5) * 0.15, 0, (r() - 0.5) * 0.15], c: r() > 0.5 ? "#E8C46A" : "#DDB55A" });
      else { const s = 0.17 + r() * 0.05; cabb.push({ p: [x, y0(x, z) + s * 0.6, z], s: [s, s * 0.75, s], r: [0, r() * 6, 0], c: row % 3 ? "#7DAA4E" : "#94BA5A" }); }
    }
    // fence round the pasture (gate gap on the path side)
    const posts: Inst[] = [], rails: Inst[] = []; const P = FARM.pasture;
    const side = (ax: number, az: number, bx: number, bz: number, gap?: [number, number]) => {
      const L = Math.hypot(bx - ax, bz - az); const n = Math.round(L / 1.6); const ang = Math.atan2(bx - ax, bz - az);
      for (let i = 0; i <= n; i++) { const x = ax + (bx - ax) * i / n, z = az + (bz - az) * i / n; posts.push({ p: [x, y0(x, z) + 0.45, z], s: [0.09, 0.9, 0.09], c: "#8A6844" }); }
      for (let i = 0; i < n; i++) {
        const k = (i + 0.5) / n; const x = ax + (bx - ax) * k, z = az + (bz - az) * k;
        if (gap && k > gap[0] && k < gap[1]) continue;
        for (const h of [0.38, 0.72]) rails.push({ p: [x, y0(x, z) + h, z], s: [0.05, 0.08, L / n + 0.05], r: [0, ang, 0], c: "#A07C54" });
      }
    };
    side(P.x0, P.z0, P.x1, P.z0); side(P.x1, P.z0, P.x1, P.z1); side(P.x1, P.z1, P.x0, P.z1); side(P.x0, P.z1, P.x0, P.z0, [0.55, 0.75]);
    // hay: round bales by the barn, one stack in the field
    const bales: Inst[] = [[10.4, -5.6, 0.3], [11.4, -6.4, 1.2], [9.6, -6.8, 2.2]].map(([x, z, a]) => ({ p: [x, y0(x, z) + 0.45, z], s: [0.45, 0.6, 0.45], r: [Math.PI / 2, a, 0], c: "#E2C070" }));
    // garden: two raised beds with a handful of bright flowers
    const blooms: Inst[] = [], stems: Inst[] = [], leaves: Inst[] = [], beds: Inst[] = [];
    const FL = ["#E8463A", "#F6C33B", "#F28AA8", "#FFF4E6", "#F0803A", "#E8463A"];
    [[-1.0, 0], [1.1, 0]].forEach(([ox], b) => {
      const cx = FARM.garden[0] + ox, cz = FARM.garden[1];
      beds.push({ p: [cx, y0(cx, cz) + 0.12, cz], s: [1.6, 0.24, 1.0], c: "#9A7048" }, { p: [cx, y0(cx, cz) + 0.25, cz], s: [1.45, 0.04, 0.85], c: "#6E4E34" });
      for (let i = 0; i < 6; i++) {
        const x = cx - 0.55 + (i % 3) * 0.55 + (r() - 0.5) * 0.1, z = cz - 0.22 + Math.floor(i / 3) * 0.44, y = y0(cx, cz) + 0.27; const h = 0.3 + r() * 0.18;
        stems.push({ p: [x, y + h / 2, z], s: [0.015, h, 0.015], c: "#4E7A34" });
        blooms.push({ p: [x, y + h + 0.03, z], s: [0.09, 0.05, 0.09], r: [0, r() * 6, 0], c: FL[(i + b * 3) % FL.length] });
        leaves.push({ p: [x + 0.05, y + 0.08, z], s: [0.1, 0.06, 0.1], c: "#6E9C4E" });
      }
    });
    const rocks: Inst[] = [];
    for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2 + r() * 0.2, R = POND_R + 0.25 + r() * 0.25; const x = POND[0] + Math.cos(a) * R, z = POND[1] + Math.sin(a) * R; const s = 0.13 + r() * 0.15; rocks.push({ p: [x, y0(x, z), z], s: [s * 1.3, s * 0.7, s], r: [0, r() * 6, 0], c: "#B3B2AC" }); }
    for (const S of [MAIN, BACK]) S.forEach(([x, z], i) => { if (i % 9 || r() < 0.4) return; const { w } = streamDist(x, z); const o = (r() > 0.5 ? 1 : -1) * (w + 0.25); const sx = x + o, sz = z; if (rOf(sx, sz) > 0.96) return; const s = 0.12 + r() * 0.12; rocks.push({ p: [sx, y0(sx, sz), sz], s: [s * 1.3, s * 0.6, s], r: [0, r() * 6, 0], c: "#ADAAA2" }); });
    // a few grass tufts so the open fields are not bare
    const tufts: Inst[] = [];
    for (let i = 0; i < (lite ? 90 : 220); i++) { const x = (r() - 0.5) * 34, z = (r() - 0.5) * 34; if (rOf(x, z) > 0.93 || blocked(x, z, 0.2) || streamDist(x, z).d < 1.2) continue; const s = 0.1 + r() * 0.08; tufts.push({ p: [x, y0(x, z) + s * 0.4, z], s: [s * 0.5, s, s * 0.5], r: [0, r() * 6, 0], c: ["#7FA250", "#8DB05C", "#739848"][Math.floor(r() * 3)] }); }
    return { trees, cabb, wheat, posts, rails, bales, blooms, stems, leaves, beds, rocks, tufts };
  }, [lite]);
  const rg = useMemo(() => rockGeo(2, ["#A9A8A2", "#B6B4AE", "#9C9A94"]), []);
  const bm = useMemo(() => new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.95 }), []);
  const fm = useMemo(() => new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.6 }), []);
  return (
    <>
      <Instances geo={tree} items={items.trees} mat={tm} shadow={!lite} />
      <Instances geo={GEO.ico0} items={items.cabb} mat={bm} shadow={!lite} />
      <Instances geo={GEO.cone4} items={items.wheat} mat={bm} />
      <Instances geo={GEO.box} items={items.posts} mat={bm} shadow={!lite} />
      <Instances geo={GEO.box} items={items.rails} mat={bm} shadow={!lite} />
      <Instances geo={GEO.cyl8} items={items.bales} mat={bm} shadow={!lite} receive />
      <Instances geo={GEO.box} items={items.beds} mat={bm} shadow={!lite} receive />
      <Instances geo={GEO.cyl6} items={items.stems} mat={bm} />
      <Instances geo={GEO.ico0} items={items.leaves} mat={bm} />
      <Instances geo={GEO.ico1} items={items.blooms} mat={fm} />
      <Instances geo={rg} items={items.rocks} mat={useMemo(() => vmat(), [])} receive />
      <Instances geo={GEO.cone4} items={items.tufts} mat={bm} />
    </>
  );
}

function Barn() {
  const roofGeo = useMemo(() => { const s = new THREE.Shape(); s.moveTo(-2.1, 0); s.lineTo(2.1, 0); s.lineTo(0, 1.7); s.closePath(); const g = new THREE.ExtrudeGeometry(s, { depth: 5.2, bevelEnabled: false }); g.translate(0, 0, -2.6); return g; }, []);
  const red = M("#B4563E"), red2 = M("#A24A36"), white = M("#F2E8DA"), roof = M("#5E463A"), dk = M("#3A2A22");
  return (
    <group>
      <mesh geometry={GEO.box} material={red} position={[0, 1.4, 0]} scale={[4, 2.8, 5]} castShadow receiveShadow />
      <mesh geometry={roofGeo} material={red2} position={[0, 2.8, 0]} scale={[0.95, 1, 0.99]} castShadow />
      {[-1, 1].map((k) => <mesh key={k} geometry={GEO.box} material={roof} position={[k * 1.12, 3.68, 0]} rotation={[0, 0, -k * 0.69]} scale={[2.85, 0.12, 5.5]} castShadow />)}
      {/* big door with the white X, loft window, corner trim */}
      <group position={[0, 0, 2.52]}>
        <mesh geometry={GEO.box} material={red2} position={[0, 1.05, 0]} scale={[1.9, 2.1, 0.06]} />
        {[[0, 1.05, 1.9, 0.12], [0, 2.1, 2.05, 0.12], [0, 0.05, 2.05, 0.12]].map(([x, y, w, h], i) => <mesh key={i} geometry={GEO.box} material={white} position={[x, y, 0.04]} scale={[w, h, 0.05]} />)}
        {[-1, 1].map((k) => <mesh key={"v" + k} geometry={GEO.box} material={white} position={[k * 0.98, 1.05, 0.04]} scale={[0.12, 2.15, 0.05]} />)}
        {[-1, 1].map((k) => <mesh key={"x" + k} geometry={GEO.box} material={white} position={[0, 1.05, 0.05]} rotation={[0, 0, k * 0.83]} scale={[0.09, 2.5, 0.04]} />)}
        <mesh geometry={GEO.box} material={dk} position={[0, 3.35, 0.02]} scale={[0.7, 0.6, 0.05]} />
        <mesh geometry={GEO.box} material={white} position={[0, 3.35, 0.05]} scale={[0.82, 0.08, 0.04]} />
      </group>
      {[[-2, 2.5], [2, 2.5], [-2, -2.5], [2, -2.5]].map(([x, z], i) => <mesh key={i} geometry={GEO.box} material={white} position={[x, 1.4, z]} scale={[0.14, 2.82, 0.14]} />)}
    </group>
  );
}
function Coop() {
  return (
    <group>
      <mesh geometry={GEO.box} material={M("#C9A36E")} position={[0, 0.55, 0]} scale={[1.3, 0.8, 1.0]} castShadow />
      {[-1, 1].map((k) => <mesh key={k} geometry={GEO.box} material={M("#7A5236")} position={[k * 0.35, 1.08, 0]} rotation={[0, 0, -k * 0.6]} scale={[0.85, 0.07, 1.15]} castShadow />)}
      <mesh geometry={GEO.box} material={M("#3A2A22")} position={[0, 0.42, 0.51]} scale={[0.3, 0.36, 0.02]} />
      <mesh geometry={GEO.box} material={M("#9A7048")} position={[0, 0.2, 0.75]} rotation={[0.5, 0, 0]} scale={[0.25, 0.04, 0.6]} />
      {[[-0.55, -0.4], [0.55, -0.4], [-0.55, 0.4], [0.55, 0.4]].map(([x, z], i) => <mesh key={i} geometry={GEO.box} material={M("#7A5236")} position={[x, 0.15, z]} scale={[0.08, 0.3, 0.08]} />)}
    </group>
  );
}
function Scarecrow() {
  return (
    <group>
      <mesh geometry={GEO.box} material={M("#8A6844")} position={[0, 0.9, 0]} scale={[0.07, 1.8, 0.07]} castShadow />
      <mesh geometry={GEO.box} material={M("#8A6844")} position={[0, 1.35, 0]} scale={[1.1, 0.06, 0.06]} />
      <mesh geometry={GEO.box} material={M("#5E86A8")} position={[0, 1.2, 0]} scale={[0.42, 0.5, 0.2]} castShadow />
      <mesh geometry={GEO.ico1} material={M("#E8D2A2")} position={[0, 1.65, 0]} scale={0.15} castShadow />
      <mesh geometry={GEO.cyl8} material={M("#C8A050")} position={[0, 1.77, 0]} scale={[0.3, 0.03, 0.3]} />
      <mesh geometry={GEO.cone6} material={M("#C8A050")} position={[0, 1.88, 0]} scale={[0.14, 0.18, 0.14]} />
    </group>
  );
}
function Bench() {
  const w = M("#9A6E44");
  return (
    <group>
      <mesh geometry={GEO.box} material={w} position={[0, 0.44, 0]} scale={[1.4, 0.07, 0.42]} castShadow />
      <mesh geometry={GEO.box} material={w} position={[0, 0.78, -0.2]} rotation={[-0.15, 0, 0]} scale={[1.4, 0.3, 0.05]} castShadow />
      {[-0.6, 0.6].map((x) => <mesh key={x} geometry={GEO.box} material={M("#7A5236")} position={[x, 0.22, 0]} scale={[0.07, 0.44, 0.38]} />)}
    </group>
  );
}

// ---------- night: porch lamp and lantern posts glow, fireflies over the pasture and pond ----------
const LAMPS: V3[] = [[5.4, 0, -6.6], [0.6, 0, -0.6], [-4.8, 0, 6.6], [8.8, 0, -1.8]];
function NightLights({ lite }: { lite: boolean }) {
  const glow = useMemo(() => new THREE.SpriteMaterial({ map: glowTexture(), color: "#FFC27A", transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }), []);
  const lampM = useMemo(() => new THREE.MeshStandardMaterial({ color: "#FFE2B0", emissive: "#FFB25A", emissiveIntensity: 0, flatShading: true }), []);
  const L1 = useRef<THREE.PointLight>(null), L2 = useRef<THREE.PointLight>(null);
  useFrame(() => { const n = Math.max(0, (SKY.night - 0.15) / 0.85); glow.opacity = n * 0.8; lampM.emissiveIntensity = 0.2 + n * 2.2; if (L1.current) L1.current.intensity = n * 9; if (L2.current) L2.current.intensity = n * 6; });
  return (
    <>
      {LAMPS.map((p, i) => { const y = y0(p[0], p[2]); return (
        <group key={i} position={[p[0], y, p[2]]}>
          <mesh geometry={GEO.box} material={M("#5A4636")} position={[0, 0.8, 0]} scale={[0.07, 1.6, 0.07]} castShadow />
          <mesh geometry={GEO.box} material={M("#5A4636")} position={[0.15, 1.55, 0]} scale={[0.32, 0.05, 0.05]} />
          <mesh geometry={GEO.box} material={lampM} position={[0.28, 1.38, 0]} scale={[0.14, 0.2, 0.14]} />
          <sprite material={glow} position={[0.28, 1.38, 0]} scale={[1.6, 1.6, 1]} />
        </group>
      ); })}
      <pointLight ref={L1} position={[LAMPS[0][0] + 0.3, y0(LAMPS[0][0], LAMPS[0][2]) + 1.5, LAMPS[0][2]]} color="#FFB870" intensity={0} distance={9} decay={1.6} />
      {!lite && <pointLight ref={L2} position={[LAMPS[1][0] + 0.3, y0(LAMPS[1][0], LAMPS[1][2]) + 1.5, LAMPS[1][2]]} color="#FFB870" intensity={0} distance={8} decay={1.6} />}
    </>
  );
}
function Fireflies({ count }: { count: number }) {
  const { geo, mat } = useMemo(() => {
    const r = rand(31); const pos: number[] = [], sd: number[] = [];
    for (let i = 0; i < count; i++) { const near = i % 2; const cx = near ? FARM.pasture.x0 + 4 : POND[0] + 1, cz = near ? FARM.pasture.z0 + 4 : POND[1] + 3; pos.push(cx + (r() - 0.5) * 9, 0.5 + r() * 2.2, cz + (r() - 0.5) * 9); sd.push(r() * 100); }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("seed", new THREE.Float32BufferAttribute(sd, 1));
    const m = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uScale: { value: 1 }, uGlow: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `attribute float seed; uniform float uTime, uScale, uGlow; varying float vA;
        void main(){ vec3 p = position; float t = uTime*0.25 + seed; p += vec3(sin(t*1.3)*0.5, sin(t*1.7+seed)*0.25, cos(t*1.1)*0.5);
          vec4 mv = modelViewMatrix*vec4(p,1.0); gl_Position = projectionMatrix*mv;
          vA = uGlow * (0.3 + 0.7*smoothstep(0.2, 1.0, 0.5+0.5*sin(uTime*1.4+seed*3.0))); gl_PointSize = uScale*(70.0 + fract(seed)*40.0) / -mv.z; }`,
      fragmentShader: `varying float vA; void main(){ float d = length(gl_PointCoord-0.5); float a = smoothstep(0.5,0.0,d); a = a*a; gl_FragColor = vec4(vec3(1.0,0.86,0.45), a*vA); }`,
    });
    return { geo: g, mat: m };
  }, [count]);
  const { gl } = useThree();
  useFrame(({ clock }) => { mat.uniforms.uTime.value = clock.elapsedTime; mat.uniforms.uScale.value = gl.getPixelRatio() * 1.5; mat.uniforms.uGlow.value = Math.max(0, (SKY.night - 0.4) / 0.6); });
  return <points geometry={geo} material={mat} />;
}

// ---------- clouds: a soft sea below + distant puffs ----------
function cloudGeo(seed: number) {
  const r = rand(seed); const gs: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 4; i++) { const g = new THREE.IcosahedronGeometry(1, 1); const s = i === 0 ? 1 : 0.55 + r() * 0.35; g.scale(s, s * 0.75, s); g.translate((r() - 0.5) * 1.8, (r() - 0.2) * 0.35, (r() - 0.5) * 1.2); gs.push(g.toNonIndexed()); }
  let n = 0; gs.forEach((p) => (n += p.attributes.position.count)); const arr = new Float32Array(n * 3); let o = 0; gs.forEach((p) => { arr.set(p.attributes.position.array as Float32Array, o); o += p.attributes.position.count * 3; });
  const m = new THREE.BufferGeometry(); m.setAttribute("position", new THREE.BufferAttribute(arr, 3));
  return paint(m, (c, f) => { c.set("#FFFFFF"); c.offsetHSL(0, 0, Math.min(0, f.ny * 0.1) - (f.y < 0 ? 0.06 : 0)); });
}
function Clouds({ lite }: { lite: boolean }) {
  const geos = useMemo(() => [cloudGeo(3), cloudGeo(8)], []);
  const { sea, far } = useMemo(() => {
    const r = rand(64); const sea: Inst[][] = [[], []], far: Inst[][] = [[], []];
    for (let i = 0; i < (lite ? 36 : 64); i++) { const a = r() * Math.PI * 2, R = 10 + Math.pow(r(), 0.7) * 80; const s = 4 + r() * 6 + R * 0.06; sea[i % 2].push({ p: [Math.cos(a) * R, -19 - r() * 3 + R * 0.05, Math.sin(a) * R], s: [s, s * 0.42, s], r: [0, r() * 6, 0] }); }
    for (let i = 0; i < (lite ? 10 : 20); i++) { const a = r() * Math.PI * 2, R = 75 + r() * 35; const s = 5 + r() * 8; far[i % 2].push({ p: [Math.cos(a) * R, -2 + r() * 22, Math.sin(a) * R], s: [s * 1.4, s * 0.5, s], r: [0, r() * 6, 0] }); }
    return { sea, far };
  }, [lite]);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1, emissive: new THREE.Color("#FFE0C0"), emissiveIntensity: 0.3 }), []);
  const ring = useRef<THREE.Group>(null);
  useFrame((_, dt) => { mat.emissive.copy(SKY.hor).lerp(SKY.low, 0.3); mat.emissiveIntensity = 0.18 + SKY.p * 0.12 - SKY.night * 0.08; if (ring.current) ring.current.rotation.y += dt * 0.005; });
  return (
    <>
      {sea.map((it, i) => <Instances key={"s" + i} geo={geos[i]} items={it} mat={mat} />)}
      <group ref={ring}>{far.map((it, i) => <Instances key={"f" + i} geo={geos[i]} items={it} mat={mat} />)}</group>
    </>
  );
}

// ---------- camera: studio close-up ↔ the farm ↔ the whole island in the sky ----------
type Pose = { pos: V3; tgt: V3; fov: number };
const POSES: Record<"wide" | "narrow", [Pose, Pose, Pose]> = {
  wide: [{ pos: [0.6, 3.3, 9.2], tgt: [-1.9, 1.35, 1.6], fov: 40 }, { pos: [7.5, 10.5, 25], tgt: [0.5, 0, -1.5], fov: 40 }, { pos: [16, 6, 54], tgt: [0.5, -4.5, 0], fov: 40 }],
  narrow: [{ pos: [-0.6, 2.9, 8.4], tgt: [-2.2, 1.35, 1.8], fov: 54 }, { pos: [6, 14, 33], tgt: [0, 0, -1], fov: 52 }, { pos: [18, 7, 70], tgt: [0.5, -5, 0], fov: 50 }],
};
function Rig({ lite, zoom }: { lite: boolean; zoom: number }) {
  const { camera, pointer, size } = useThree();
  const narrow = size.width / size.height < 0.9; const P = POSES[narrow ? "narrow" : "wide"];
  const z = useRef(zoom); const pos = useMemo(() => new THREE.Vector3(), []); const tgt = useMemo(() => new THREE.Vector3(), []);
  const v = useMemo(() => P.map((p) => ({ p: new THREE.Vector3(...p.pos), t: new THREE.Vector3(...p.tgt), f: p.fov })), [P]);
  useEffect(() => { const k = Math.round(Math.min(2, zoom * 2)); camera.position.set(...P[k].pos); }, [camera, P]); // eslint-disable-line react-hooks/exhaustive-deps
  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime; const k = lite ? 0.5 : 1;
    z.current += (zoom - z.current) * (1 - Math.exp(-dt * 1.8));
    const zz = z.current * 2; const i = Math.min(1, Math.floor(zz)); let e = zz - i; e = e * e * (3 - 2 * e);
    pos.lerpVectors(v[i].p, v[i + 1].p, e); tgt.lerpVectors(v[i].t, v[i + 1].t, e); const fov = v[i].f + (v[i + 1].f - v[i].f) * e;
    pos.y += Math.sin(e * Math.PI) * (i ? 3 : 1.5);
    const close = 1 - Math.min(1, z.current * 2);
    const orb = Math.sin(t * 0.04) * 0.15 * z.current; const cs = Math.cos(orb), sn = Math.sin(orb); const px = pos.x, pz = pos.z; pos.x = px * cs - pz * sn; pos.z = px * sn + pz * cs;
    pos.x += (Math.sin(t * 0.11) * 0.2 + pointer.x * 0.35) * k * close; pos.y += pointer.y * 0.12 * k * close;
    camera.position.lerp(pos, 1 - Math.exp(-dt * 3)); camera.lookAt(tgt);
    const c = camera as THREE.PerspectiveCamera; if (Math.abs(c.fov - fov) > 0.01) { c.fov = fov; c.updateProjectionMatrix(); }
  });
  return null;
}

export function DreamWorld({ art, sketching, working, playing, lite, perch, saleKey, zoom }: DreamWorldProps) {
  const cf = useMemo(() => canvasFrame(), []);
  const q = useMemo(() => new URLSearchParams(typeof location !== "undefined" ? location.search : ""), []);
  const robinFrom = useMemo(() => new THREE.Vector3(-14, 9, -10), []);
  const at = (p: [number, number], dy = 0): V3 => [p[0], y0(p[0], p[1]) + dy, p[1]];
  return (
    <>
      <SkyDome />
      <SunGlow />
      <Stars count={lite ? 140 : 260} />
      <SkyController lite={lite} />
      {!lite && <WarmEnv />}
      <Island lite={lite} />
      <Underside lite={lite} />
      <Water lite={lite} />
      <Farm lite={lite} />
      <Clouds lite={lite} />
      <group position={at(FARM.cabin, -0.05)} rotation={[0, -0.55, 0]}><Cabin lite={lite} /></group>
      <group position={at(FARM.barn, -0.05)} rotation={[0, -1.25, 0]}><Barn /></group>
      <group position={at(FARM.coop, -0.02)} rotation={[0, -0.9, 0]}><Coop /></group>
      <group position={at(FARM.scarecrow)} rotation={[0, 0.4, 0]}><Scarecrow /></group>
      <group position={at(FARM.bench)} rotation={[0, Math.atan2(-13 - FARM.bench[0], 12 - FARM.bench[1]), 0]}><Bench /></group>
      <group position={at([6.5, -6.5])} rotation={[0, Math.atan2(4 - 6.5, -3 + 6.5), 0]}><Bench /></group>
      <group position={[EASEL[0], y0(EASEL[0], EASEL[2]), EASEL[2]]} rotation={[0, EASEL_ROT, 0]} scale={EASEL_S}><Easel art={art} sketching={sketching} /></group>
      <group position={[GRAM[0], y0(GRAM[0], GRAM[2]), GRAM[2]]} rotation={[0, 0.5, 0]} scale={1.1}><Gramophone playing={playing} /></group>
      <Notes origin={[GRAM[0] - 0.45, 1.7, GRAM[2] + 0.15]} playing={playing} count={lite ? 3 : 5} />
      <NightLights lite={lite} />
      <Woman working={working || q.get("paint") === "1"} canvas={cf} />
      <Dog />
      <Chickens n={lite ? 4 : 6} />
      <Sheep n={lite ? 4 : 6} />
      <Robin perch={perch || q.get("perch") === "1"} spot={cf.top} from={robinFrom} />
      <Lantern art={art} fireKey={saleKey} from={cf.c} lite={lite} demo={q.get("lantern") === "1"} />
      <Flock n={5} radius={20} height={8} speed={0.06} phase={0} />
      {!lite && <Flock n={3} radius={26} height={11} speed={-0.045} phase={2.5} color="#4A3428" />}
      <Fireflies count={lite ? 40 : 90} />
      <Rig lite={lite} zoom={q.get("zoom") ? Number(q.get("zoom")) : zoom} />
    </>
  );
}
