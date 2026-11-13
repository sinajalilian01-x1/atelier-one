"use client";
// The farm's cast: the painter (a stylized low-poly woman with procedural IK legs and arms, a real walk cycle with
// planted feet, gardening, sitting and painting), her dog, chickens in the yard and sheep in the pasture.
// Motion is deliberately plain and physical: eased starts and stops, distance-driven gaits, no wobble.
import * as THREE from "three";
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { rand } from "../scenes/kit";
import { Brush, GEO, M, Palette } from "../fox/FoxWorld";
import { FARM, PATHS, groundH, type V2 } from "./island";
import { SKY } from "./sky";

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const SKIRT = new THREE.CylinderGeometry(0.55, 1, 1, 8);
const UP = V(0, 1, 0);
const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const ss = (x: number) => { x = clamp(x); return x * x * (3 - 2 * x); };
const damp = (cur: number, to: number, rate: number, dt: number) => cur + (to - cur) * (1 - Math.exp(-rate * dt));
const angDamp = (cur: number, to: number, rate: number, dt: number) => { const d = Math.atan2(Math.sin(to - cur), Math.cos(to - cur)); return cur + d * (1 - Math.exp(-rate * dt)); };
function limb(m: THREE.Object3D | null, a: THREE.Vector3, b: THREE.Vector3, r: number) {
  if (!m) return; const d = V().subVectors(b, a); const L = d.length();
  m.position.copy(a).addScaledVector(d, 0.5); m.quaternion.setFromUnitVectors(UP, d.normalize()); m.scale.set(r, L, r);
}
function elbowOf(s: THREE.Vector3, h: THREE.Vector3, l1: number, l2: number, pole: THREE.Vector3) {
  const d = V().subVectors(h, s); const dist = Math.min(Math.max(d.length(), 0.01), l1 + l2 - 1e-3); d.normalize();
  const a = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist); const hh = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const perp = V().subVectors(pole, s); perp.addScaledVector(d, -perp.dot(d)); if (perp.lengthSq() < 1e-6) perp.set(0, 0, 1); perp.normalize();
  return V().copy(s).addScaledVector(d, a).addScaledVector(perp, hh);
}

// ------------------------------------------------------------------ navigation along the farm paths
type Node = { p: V2; n: number[] };
const GRAPH: Node[] = (() => {
  const nodes: Node[] = []; const idx = (p: V2) => { let i = nodes.findIndex((q) => Math.hypot(q.p[0] - p[0], q.p[1] - p[1]) < 0.05); if (i < 0) { nodes.push({ p, n: [] }); i = nodes.length - 1; } return i; };
  for (const path of PATHS) for (let i = 0; i < path.length - 1; i++) { const a = idx(path[i]), b = idx(path[i + 1]); nodes[a].n.push(b); nodes[b].n.push(a); }
  return nodes;
})();
const d2 = (a: V2, b: V2) => Math.hypot(a[0] - b[0], a[1] - b[1]);
/** Route from a to b: walk to the nearest path node, follow the paths (Dijkstra), then step off to b. */
export function route(a: V2, b: V2): V2[] {
  if (d2(a, b) < 3) return [b];
  const near = (p: V2) => GRAPH.reduce((best, n, i) => (d2(n.p, p) < d2(GRAPH[best].p, p) ? i : best), 0);
  const s = near(a), t = near(b); const dist = GRAPH.map(() => Infinity); const prev = GRAPH.map(() => -1); const done = GRAPH.map(() => false); dist[s] = 0;
  for (;;) {
    let u = -1; for (let i = 0; i < GRAPH.length; i++) if (!done[i] && (u < 0 || dist[i] < dist[u])) u = i;
    if (u < 0 || dist[u] === Infinity || u === t) break; done[u] = true;
    for (const v of GRAPH[u].n) { const nd = dist[u] + d2(GRAPH[u].p, GRAPH[v].p); if (nd < dist[v]) { dist[v] = nd; prev[v] = u; } }
  }
  const out: V2[] = []; for (let u = t; u >= 0; u = prev[u]) out.unshift(GRAPH[u].p);
  // skip a first node that lies behind us, and the last one if the goal is closer than it
  if (out.length > 1 && d2(a, out[1]) < d2(out[0], out[1])) out.shift();
  if (out.length > 1 && d2(out[out.length - 2], b) < d2(out[out.length - 2], out[out.length - 1])) out.pop();
  return [...out, b];
}

// shared so the dog can follow her
export const HER = { pos: V(FARM.garden[0], 0, FARM.garden[1] + 1.2), heading: 0, speed: 0, still: 0 };

// ------------------------------------------------------------------ the painter
type Act = "stand" | "walk" | "water" | "tend" | "sit" | "look" | "paint" | "rest";
type Plan = { at: V2; act: Act; dur: number; face?: V2 };
const DAY_PLAN: Plan[] = [
  { at: [3.0, -4.3], act: "water", dur: 7, face: FARM.garden },
  { at: [2.0, -4.6], act: "tend", dur: 7, face: [2.0, -5.6] },
  { at: [10.0, 0.6], act: "look", dur: 5, face: FARM.yard },
  { at: [FARM.bench[0], FARM.bench[1] - 0.05], act: "sit", dur: 10, face: [-13, 12] },
  { at: [-4.4, 11.6], act: "look", dur: 7, face: [-14, 16] },
  { at: [3.6, 6.8], act: "look", dur: 6, face: [9, 9] },
  { at: [-2.4, -8.4], act: "look", dur: 5, face: [-3, -13] },
];
const NIGHT_PLAN: Plan = { at: [6.5, -6.2], act: "rest", dur: 999, face: [4, -3] };
const HIP = 0.9, THIGH = 0.45, SHIN = 0.43, UARM = 0.29, FARM_ = 0.27, STRIDE = 0.6;

const PAINT_PLAN: Plan = { at: FARM.paintSpot, act: "paint", dur: 999, face: [FARM.easel[0], FARM.easel[1]] };
export function Woman({ working, canvas }: { working: boolean; canvas: { c: THREE.Vector3; right: THREE.Vector3; up: THREE.Vector3; normal: THREE.Vector3 } }) {
  const root = useRef<THREE.Group>(null); const pelvis = useRef<THREE.Group>(null); const torso = useRef<THREE.Group>(null); const head = useRef<THREE.Group>(null);
  const seg = useRef<(THREE.Mesh | null)[]>([]); // 0..3 legs (thighL, shinL, thighR, shinR), 4..7 arms (upperL, foreL, upperR, foreR)
  const joints = useRef<(THREE.Object3D | null)[]>([]); // feet L/R, hands L/R, knees L/R, elbows L/R
  const brush = useRef<THREE.Group>(null); const palette = useRef<THREE.Group>(null); const can = useRef<THREE.Group>(null); const drops = useRef<(THREE.Mesh | null)[]>([]);
  const pin = useMemo(() => (typeof location !== "undefined" ? new URLSearchParams(location.search).get("her") : null), []);
  // a pinned pose (?her=paint|garden|water, used for screenshots) starts her already in place
  const start = pin === "paint" ? PAINT_PLAN.at : pin === "garden" ? DAY_PLAN[1].at : pin === "water" ? DAY_PLAN[0].at : ([HER.pos.x, HER.pos.z] as V2);
  const S = useRef({
    x: start[0], z: start[1], heading: 2.6, v: 0, phase: 0, plan: 0, act: "stand" as Act, actT: 0, way: [] as V2[], goal: null as Plan | null,
    w: { walk: 0, water: 0, tend: 0, sit: 0, look: 0, paint: 0 } as Record<string, number>, hip: HIP, lean: 0.02,
    hands: [V(-0.22, 0.86, 0.04), V(0.22, 0.86, 0.04)], feet: [V(-0.11, 0.06, 0.02), V(0.11, 0.06, 0.02)],
  });
  const SKIN = M("#E6B48E"), DRESS = M("#6F8F6B"), APRON = M("#F1E7D6"), HAIR = M("#5B3425"), SCARF = M("#D2693C"), SHOE = M("#4A3428"), LEGS = M("#E1AD88"), DK = M("#2A1E1A");
  const tmp = useMemo(() => ({ m: new THREE.Matrix4(), inv: new THREE.Matrix4() }), []);

  useFrame(({ clock }, dtRaw) => {
    const g = root.current; if (!g) return; const dt = Math.min(dtRaw, 0.05); const dtM = Math.min(dtRaw, 0.12); const t = clock.elapsedTime; const s = S.current;
    // ---- decide what to do
    const night = SKY.night > 0.65;
    let want: Plan;
    if (working || pin === "paint") want = PAINT_PLAN;
    else if (pin === "garden") want = DAY_PLAN[1];
    else if (pin === "water") want = DAY_PLAN[0];
    else if (night) want = NIGHT_PLAN;
    else want = DAY_PLAN[s.plan % DAY_PLAN.length];
    if (s.goal !== want) { s.goal = want; s.way = route([s.x, s.z], want.at); s.actT = 0; }
    // ---- walk the route: ease in, ease out, turn smoothly, feet stay planted (gait advances with distance)
    const tgt = s.way[0]; let moving = false;
    if (tgt) {
      const dx = tgt[0] - s.x, dz = tgt[1] - s.z; const dist = Math.hypot(dx, dz); const last = s.way.length === 1;
      if (dist < (last ? 0.06 : 0.45)) { s.way.shift(); if (last) { s.v = 0; } }
      else {
        moving = true; const remaining = dist + s.way.slice(1).reduce((a, p, i, arr) => a + d2(i ? arr[i - 1] : tgt, p), 0);
        const vmax = Math.min(s.goal === PAINT_PLAN ? 1.6 : 1.15, Math.sqrt(2 * 1.2 * Math.max(0, remaining - 0.03)) + 0.08); // a brisker walk when a commission comes in
        s.v = Math.min(vmax, s.v + 1.4 * dtM);
        s.heading = angDamp(s.heading, Math.atan2(dx, dz), 5, dtM);
        const fwd = Math.max(0, Math.cos(Math.atan2(Math.sin(Math.atan2(dx, dz) - s.heading), Math.cos(Math.atan2(dx, dz) - s.heading)))); // slow down while turning sharply
        const step = s.v * dtM * (0.35 + 0.65 * fwd); s.x += Math.sin(s.heading) * step; s.z += Math.cos(s.heading) * step; s.phase += (step / STRIDE) * Math.PI;
      }
    }
    if (!moving) {
      s.v = 0;
      if (s.goal?.face) s.heading = angDamp(s.heading, Math.atan2(s.goal.face[0] - s.x, s.goal.face[1] - s.z), 3, dt);
      s.actT += dt; if (s.goal && s.actT > s.goal.dur && s.goal.act !== "paint" && s.goal.act !== "rest") { s.plan++; }
    }
    // let the gait settle to the nearest double-support pose when stopping
    if (!moving) s.phase = damp(s.phase, Math.round(s.phase / Math.PI) * Math.PI, 6, dt);
    const act: Act = moving ? "walk" : s.goal?.act === "rest" ? "sit" : s.goal?.act || "stand";
    for (const k of Object.keys(s.w)) s.w[k] = damp(s.w[k], k === act ? 1 : 0, k === "walk" ? 10 : 3.2, dt);
    const W = s.w; const still = 1 - W.walk;
    HER.pos.set(s.x, 0, s.z); HER.heading = s.heading; HER.speed = s.v; HER.still = moving ? 0 : HER.still + dt;

    // ---- body pose (root space: +z forward)
    const p = s.phase; const uL = ((p / (2 * Math.PI)) % 1 + 1) % 1, uR = (uL + 0.5) % 1;
    const gait = (u: number, side: number) => { // foot target over a gait cycle
      const S2 = STRIDE * Math.min(1, s.v / 0.9 + 0.25);
      if (u < 0.5) return V(side * 0.1, 0.06, S2 / 2 - S2 * (u / 0.5));
      const k = (u - 0.5) / 0.5; return V(side * 0.1, 0.06 + Math.sin(k * Math.PI) * 0.1, -S2 / 2 + S2 * ss(k));
    };
    const hipWalk = HIP - 0.03 + 0.022 * Math.cos(4 * Math.PI * (uL - 0.25));
    const hip = W.walk * hipWalk + W.tend * 0.48 + W.sit * 0.52 + (still - W.tend - W.sit) * HIP;
    s.hip = hip;
    const lean = W.walk * 0.06 + W.tend * 0.5 + W.water * 0.14 + W.sit * -0.1 + W.paint * 0.05 + W.look * -0.02;
    const sway = W.walk * Math.sin(2 * Math.PI * uL) * 0.018;
    // feet
    const stand = [V(-0.11, 0.06, 0.02), V(0.11, 0.06, 0.0)];
    const kneelF = [V(-0.13, 0.06, 0.34), V(0.12, 0.05, -0.42)];
    const sitF = [V(-0.14, 0.06, 0.44), V(0.14, 0.06, 0.46)];
    const feet = [0, 1].map((i) => {
      const f = V().copy(stand[i]).multiplyScalar(still - W.tend - W.sit);
      f.addScaledVector(gait(i ? uR : uL, i ? 1 : -1), W.walk).addScaledVector(kneelF[i], W.tend).addScaledVector(sitF[i], W.sit); return f;
    });
    // torso frame
    const P = V(sway, hip, 0); const tor = (x: number, y: number, z: number) => V(x + sway, hip + y * Math.cos(lean) - z * Math.sin(lean), y * Math.sin(lean) + z * Math.cos(lean));
    if (pelvis.current) { pelvis.current.position.copy(P); pelvis.current.rotation.set(0, W.walk * Math.sin(2 * Math.PI * uL) * 0.06, 0); }
    if (torso.current) { torso.current.position.copy(P); torso.current.rotation.set(lean, W.walk * -Math.sin(2 * Math.PI * uL) * 0.08, W.walk * Math.sin(2 * Math.PI * uL) * 0.02); }
    // legs (IK, knees bend forward)
    [0, 1].forEach((i) => {
      const side = i ? 1 : -1; const H = V(side * 0.1 + sway, hip - 0.04, 0); const F = feet[i];
      const pole = V(side * 0.12, hip - 0.4, 1.2);
      const K = elbowOf(H, F, THIGH, SHIN, pole); limb(seg.current[i * 2], H, K, 0.068); limb(seg.current[i * 2 + 1], K, F, 0.055);
      joints.current[4 + i]?.position.copy(K); const fo = joints.current[i]; if (fo) { fo.position.copy(F); fo.rotation.set(W.walk * (F.y - 0.06) * -2.5 + W.tend * (i ? 1.2 : 0), 0, 0); }
    });
    // arms
    const shoulder = [tor(-0.18, 0.47, 0), tor(0.18, 0.47, 0)];
    const brushTip = V();
    g.updateWorldMatrix(true, false); tmp.inv.copy(g.matrixWorld).invert();
    // painting target on the canvas, in root space: steady strokes with a lift between them
    const st = t * 1.6; const lift = Math.max(0, Math.sin(st + 1.6)) * 0.12;
    brushTip.copy(canvas.c).addScaledVector(canvas.right, Math.sin(st) * 0.28 + Math.sin(t * 0.37) * 0.1).addScaledVector(canvas.up, Math.sin(t * 0.53) * 0.22).addScaledVector(canvas.normal, 0.03 + lift).applyMatrix4(tmp.inv);
    const swingL = W.walk * (gait(uR, 1).z) * 0.55, swingR = W.walk * (gait(uL, -1).z) * 0.55;
    const water = Math.sin(t * 1.2) * 0.04;
    const tend = Math.abs(Math.sin(t * 2.2)) * 0.05;
    const hands = [
      V().addScaledVector(V(-0.21, hip - 0.04, 0.04 + swingL), still - W.tend - W.sit - W.look - W.paint + W.walk * 0)
        .addScaledVector(V(-0.15, 0.1 + tend, 0.62), W.tend).addScaledVector(V(-0.15, 0.58, 0.3), W.sit).addScaledVector(V(-0.07, hip + 0.02, -0.17), W.look).addScaledVector(V(-0.24, 1.02, 0.28), W.paint),
      V().addScaledVector(V(0.21, hip - 0.04, 0.04 + swingR), still - W.tend - W.sit - W.look - W.paint - W.water)
        .addScaledVector(V(0.16, 0.12 + (0.05 - tend), 0.56), W.tend).addScaledVector(V(0.15, 0.58, 0.3), W.sit).addScaledVector(V(0.07, hip + 0.02, -0.17), W.look)
        .addScaledVector(V(0.2, 1.0 + water, 0.42), W.water),
    ];
    if (W.walk > 0.01) { hands[0].addScaledVector(V(-0.21, hip - 0.04, 0.04 + swingL), W.walk); hands[1].addScaledVector(V(0.21, hip - 0.04, 0.04 + swingR), W.walk); }
    // right hand holds the brush ~0.5 back from the tip when painting
    const dir = V().subVectors(brushTip, shoulder[1]).normalize(); const paintHand = V().copy(brushTip).addScaledVector(dir, -0.5);
    hands[1].addScaledVector(paintHand, W.paint);
    [0, 1].forEach((i) => {
      const side = i ? 1 : -1; const Sh = shoulder[i]; const Hd = hands[i];
      const E = elbowOf(Sh, Hd, UARM, FARM_, V(Sh.x + side * 0.5, Sh.y - 0.6, Sh.z - 0.6));
      limb(seg.current[4 + i * 2], Sh, E, 0.05); limb(seg.current[5 + i * 2], E, Hd, 0.042); joints.current[2 + i]?.position.copy(Hd); joints.current[6 + i]?.position.copy(E);
    });
    if (brush.current) { brush.current.position.copy(hands[1]); brush.current.quaternion.setFromUnitVectors(V(0, -1, 0), dir); brush.current.scale.setScalar(W.paint > 0.5 ? 0.85 : 0.0001); }
    if (palette.current) { palette.current.position.copy(hands[0]).add(V(0.02, 0.03, 0.06)); palette.current.scale.setScalar(W.paint > 0.5 ? 0.8 : 0.0001); }
    if (can.current) {
      can.current.position.copy(hands[1]).add(V(0, -0.05, 0.08)); can.current.rotation.set(0.35 + Math.sin(t * 1.2) * 0.12, 0, 0); can.current.scale.setScalar(W.water > 0.5 ? 1 : 0.0001);
      // drops fall from the spout to the bed on a short loop
      const spout = V(0, 0.08, 0.32).applyEuler(can.current.rotation).add(can.current.position);
      drops.current.forEach((d, i) => { if (!d) return; const k = ((t * 1.4 + i / drops.current.length) % 1); d.position.set(spout.x + (i % 2 ? 0.02 : -0.02), spout.y - 4.9 * (k * 0.45) ** 2, spout.z + 0.4 * k * 0.45); d.visible = W.water > 0.8 && d.position.y > 0.02; });
    }
    if (head.current) {
      const look = W.look * Math.sin(t * 0.25) * 0.45 + W.paint * 0.2 + W.walk * Math.sin(t * 0.3) * 0.12 + W.sit * Math.sin(t * 0.2) * 0.3;
      head.current.rotation.set(-0.06 * W.look + 0.25 * W.tend + 0.15 * W.water + 0.04 * Math.sin(t * 0.6) * still, look, 0);
    }
    g.position.set(s.x, groundH(s.x, s.z), s.z); g.rotation.y = s.heading;
  });

  return (
    <group ref={root}>
      {/* legs + shoes */}
      {[0, 1, 2, 3].map((i) => <mesh key={"l" + i} ref={(m) => { seg.current[i] = m; }} geometry={GEO.cyl8} material={LEGS} castShadow />)}
      {[0, 1].map((i) => <mesh key={"k" + i} ref={(m) => { joints.current[4 + i] = m; }} geometry={GEO.ico1} material={LEGS} scale={0.06} />)}
      {[0, 1].map((i) => <group key={"f" + i} ref={(m) => { joints.current[i] = m; }}><mesh geometry={GEO.ico1b} material={SHOE} position={[0, -0.02, 0.05]} scale={[0.065, 0.05, 0.13]} castShadow /></group>)}
      {/* skirt rides with the pelvis */}
      <group ref={pelvis}>
        <mesh geometry={SKIRT} material={DRESS} position={[0, -0.18, 0]} scale={[0.3, 0.6, 0.27]} castShadow />
        <mesh geometry={GEO.box} material={APRON} position={[0, -0.16, 0.2]} rotation={[-0.32, 0, 0]} scale={[0.3, 0.42, 0.02]} />
      </group>
      <group ref={torso}>
        <mesh geometry={GEO.cyl8} material={DRESS} position={[0, 0.25, 0]} scale={[0.17, 0.5, 0.13]} castShadow />
        <mesh geometry={GEO.box} material={APRON} position={[0, 0.2, 0.125]} scale={[0.22, 0.3, 0.02]} />
        <mesh geometry={GEO.ico1} material={DRESS} position={[0, 0.47, 0]} scale={[0.22, 0.07, 0.13]} />
        {/* scarf */}
        <mesh material={SCARF} position={[0, 0.54, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow><torusGeometry args={[0.085, 0.04, 6, 12]} /></mesh>
        <mesh geometry={GEO.box} material={SCARF} position={[0.05, 0.43, 0.11]} rotation={[0.2, 0, 0.18]} scale={[0.06, 0.16, 0.025]} />
        <group ref={head} position={[0, 0.66, 0]}>
          <mesh geometry={GEO.ico1b} material={SKIN} scale={[0.115, 0.135, 0.12]} castShadow />
          {[-1, 1].map((k) => <mesh key={k} geometry={GEO.ico1} material={DK} position={[k * 0.045, 0.01, 0.11]} scale={[0.014, 0.018, 0.01]} />)}
          {[-1, 1].map((k) => <mesh key={"c" + k} geometry={GEO.ico1} material={M("#EE9C86")} position={[k * 0.07, -0.035, 0.095]} scale={[0.022, 0.014, 0.01]} />)}
          {/* hair: cap, fringe and a bun */}
          <mesh geometry={GEO.ico1b} material={HAIR} position={[0, 0.035, -0.02]} scale={[0.128, 0.13, 0.13]} castShadow />
          <mesh geometry={GEO.box} material={HAIR} position={[0, 0.09, 0.085]} rotation={[0.5, 0, 0]} scale={[0.2, 0.05, 0.06]} />
          <mesh geometry={GEO.ico1} material={HAIR} position={[0, 0.07, -0.13]} scale={0.07} castShadow />
        </group>
      </group>
      {/* arms */}
      {[4, 5, 6, 7].map((i) => <mesh key={"a" + i} ref={(m) => { seg.current[i] = m; }} geometry={GEO.cyl8} material={i % 2 ? SKIN : DRESS} castShadow />)}
      {[0, 1].map((i) => <mesh key={"e" + i} ref={(m) => { joints.current[6 + i] = m; }} geometry={GEO.ico1} material={SKIN} scale={0.045} />)}
      {[0, 1].map((i) => <mesh key={"h" + i} ref={(m) => { joints.current[2 + i] = m; }} geometry={GEO.ico1} material={SKIN} scale={0.045} />)}
      <group ref={brush}><Brush /></group>
      <group ref={palette} rotation={[0.3, 0.4, 0.1]}><Palette /></group>
      {/* watering can */}
      <group ref={can}>
        <mesh geometry={GEO.cyl8} material={M("#5E8C86", { metalness: 0.3, roughness: 0.5 })} position={[0, 0, 0.08]} scale={[0.09, 0.16, 0.09]} castShadow />
        <mesh geometry={GEO.cyl6} material={M("#5E8C86", { metalness: 0.3, roughness: 0.5 })} position={[0, 0.04, 0.24]} rotation={[1.0, 0, 0]} scale={[0.015, 0.2, 0.015]} />
      </group>
      {Array.from({ length: 8 }, (_, i) => <mesh key={"d" + i} ref={(m) => { drops.current[i] = m; }} geometry={GEO.ico1} material={M("#BFE4F2", { roughness: 0.2 })} scale={0.016} />)}
    </group>
  );
}

// ------------------------------------------------------------------ the dog
export function Dog() {
  const root = useRef<THREE.Group>(null); const body = useRef<THREE.Group>(null); const head = useRef<THREE.Group>(null); const tail = useRef<THREE.Group>(null); const legs = useRef<(THREE.Group | null)[]>([]);
  const S = useRef({ x: HER.pos.x + 1, z: HER.pos.z, heading: 0, v: 0, phase: 0, sit: 0, lie: 0, wag: 0, sniffT: 0, sniff: null as V2 | null });
  const FUR = M("#C99A62"), FUR2 = M("#B7864F"), WH = M("#F4ECE0"), DK = M("#2A1E1A"), EAR = M("#8E6238");
  useFrame(({ clock }, dtRaw) => {
    const g = root.current; if (!g) return; const dt = Math.min(dtRaw, 0.05); const s = S.current; const t = clock.elapsedTime;
    const night = SKY.night > 0.65;
    // where to be: a step behind and to the right of her; a short sniff around when she stays put; the porch at night
    const right = V(Math.cos(HER.heading), 0, -Math.sin(HER.heading)), back = V(-Math.sin(HER.heading), 0, -Math.cos(HER.heading));
    let tx = HER.pos.x + back.x * 0.9 + right.x * 0.7, tz = HER.pos.z + back.z * 0.9 + right.z * 0.7;
    if (night) { tx = 5.6; tz = -6.4; }
    else if (HER.still > 8 && HER.still < 16) { if (!s.sniff) { const a = t * 1.7; s.sniff = [HER.pos.x + Math.cos(a) * 2.2, HER.pos.z + Math.sin(a) * 2.2]; } tx = s.sniff[0]; tz = s.sniff[1]; }
    else s.sniff = null;
    const dx = tx - s.x, dz = tz - s.z, dist = Math.hypot(dx, dz);
    const vmax = dist > 3 ? 2.6 : dist > 0.6 ? 1.3 : 0;
    const vt = Math.min(vmax, Math.sqrt(2 * 2.5 * Math.max(0, dist - 0.3)));
    s.v = damp(s.v, vt, 4, dt);
    if (s.v > 0.05) { s.heading = angDamp(s.heading, Math.atan2(dx, dz), 6, dt); const step = s.v * dt; s.x += Math.sin(s.heading) * step; s.z += Math.cos(s.heading) * step; s.phase += step / 0.42 * Math.PI; }
    else s.heading = angDamp(s.heading, Math.atan2(HER.pos.x - s.x, HER.pos.z - s.z), 2, dt);
    const resting = s.v < 0.05; const sleepy = night || HER.still > 22;
    s.sit = damp(s.sit, resting && !sleepy ? 1 : 0, 3, dt); s.lie = damp(s.lie, resting && sleepy ? 1 : 0, 2, dt);
    const trot = clamp(s.v / 1.2); const ph = s.phase;
    legs.current.forEach((l, i) => {
      if (!l) return; const diag = i === 0 || i === 3 ? 0 : Math.PI; // trot: diagonal pairs
      l.rotation.x = Math.sin(ph + diag) * 0.5 * trot;
      const rear = i >= 2; l.scale.y = 1 - s.lie * 0.8 - (rear ? s.sit * 0.55 : 0); l.rotation.x += rear ? -s.sit * 0.9 : -s.lie * 1.2;
    });
    if (body.current) { body.current.position.y = Math.abs(Math.sin(ph)) * 0.02 * trot - s.lie * 0.2 - s.sit * 0.06; body.current.rotation.x = -s.sit * 0.45; }
    s.wag = damp(s.wag, (s.v > 0.1 || (HER.still < 3 && !sleepy)) ? 1 : 0.15, 2, dt);
    if (tail.current) { tail.current.rotation.y = Math.sin(t * 9) * 0.45 * s.wag * (1 - s.lie); tail.current.rotation.x = -0.6 + s.lie * 0.9 + trot * 0.2; }
    if (head.current) { head.current.rotation.x = s.lie * 0.35 + (s.sniff && resting ? 0.5 : 0) + Math.sin(ph * 2) * 0.03 * trot; head.current.rotation.y = s.lie ? 0.5 * s.lie : Math.sin(t * 0.4) * 0.2 * (1 - trot); head.current.position.y = 0.52 - s.lie * 0.18 + s.sit * 0.08; }
    g.position.set(s.x, groundH(s.x, s.z), s.z); g.rotation.y = s.heading;
  });
  return (
    <group ref={root}>
      <group ref={body}>
        <mesh geometry={GEO.ico1b} material={FUR} position={[0, 0.4, 0]} scale={[0.15, 0.15, 0.32]} castShadow />
        <mesh geometry={GEO.ico1} material={WH} position={[0, 0.36, 0.22]} scale={[0.1, 0.12, 0.1]} />
        <group ref={head} position={[0, 0.52, 0.32]}>
          <mesh geometry={GEO.ico1b} material={FUR} scale={[0.12, 0.11, 0.12]} castShadow />
          <mesh geometry={GEO.box} material={FUR2} position={[0, -0.03, 0.12]} scale={[0.09, 0.07, 0.12]} />
          <mesh geometry={GEO.ico1} material={DK} position={[0, -0.01, 0.19]} scale={0.022} />
          {[-1, 1].map((k) => <group key={k}>
            <mesh geometry={GEO.ico1} material={DK} position={[k * 0.05, 0.03, 0.1]} scale={0.016} />
            <mesh geometry={GEO.box} material={EAR} position={[k * 0.1, 0.02, -0.01]} rotation={[0, 0, k * 0.25]} scale={[0.03, 0.12, 0.07]} castShadow />
          </group>)}
        </group>
        <group ref={tail} position={[0, 0.46, -0.3]}><mesh geometry={GEO.cyl6} material={FUR} position={[0, 0.1, 0]} scale={[0.03, 0.22, 0.03]} /></group>
      </group>
      {[[-0.08, 0.2], [0.08, 0.2], [-0.08, -0.2], [0.08, -0.2]].map(([x, z], i) => (
        <group key={i} ref={(e) => { legs.current[i] = e; }} position={[x, 0.32, z]}>
          <mesh geometry={GEO.cyl6} material={i < 2 ? FUR : FUR2} position={[0, -0.15, 0]} scale={[0.035, 0.3, 0.035]} castShadow />
          <mesh geometry={GEO.ico1} material={WH} position={[0, -0.3, 0.015]} scale={[0.035, 0.025, 0.045]} />
        </group>
      ))}
    </group>
  );
}

// ------------------------------------------------------------------ chickens
export function Chickens({ n = 5 }: { n?: number }) {
  const refs = useRef<(THREE.Group | null)[]>([]); const heads = useRef<(THREE.Group | null)[]>([]); const legs = useRef<(THREE.Object3D | null)[]>([]);
  const birds = useMemo(() => { const r = rand(17); return Array.from({ length: n }, (_, i) => ({ x: FARM.yard[0] + (r() - 0.5) * 3, z: FARM.yard[1] + (r() - 0.5) * 2.4, h: r() * 6, tx: 0, tz: 0, next: r() * 3, peck: -1, v: 0, ph: 0, brown: i % 2 === 1, sit: 0 })); }, [n]);
  useFrame(({ clock }, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05); const t = clock.elapsedTime; const night = SKY.night > 0.6; const r = Math.random;
    birds.forEach((b, i) => {
      const g = refs.current[i]; if (!g) return;
      if (night) { b.tx = FARM.coop[0] - 0.6 + (i % 3) * 0.35; b.tz = FARM.coop[1] + 0.9 + Math.floor(i / 3) * 0.3; }
      else if (t > b.next) { // choose: a few pecks, or a short walk inside the yard
        if (r() < 0.55) { b.peck = t; b.next = t + 0.9 + r() * 1.6; }
        else { b.tx = FARM.yard[0] + (r() - 0.5) * 3.6; b.tz = FARM.yard[1] + (r() - 0.5) * 2.8; b.next = t + 2 + r() * 3; }
        if (!b.tx) { b.tx = b.x; b.tz = b.z; }
      }
      const dx = b.tx - b.x, dz = b.tz - b.z, dist = Math.hypot(dx, dz);
      b.v = damp(b.v, dist > 0.08 ? Math.min(0.55, dist * 1.5) : 0, 6, dt);
      if (b.v > 0.02) { b.h = angDamp(b.h, Math.atan2(dx, dz), 8, dt); b.x += Math.sin(b.h) * b.v * dt; b.z += Math.cos(b.h) * b.v * dt; b.ph += b.v * dt / 0.07 * Math.PI; }
      b.sit = damp(b.sit, night && dist < 0.1 ? 1 : 0, 2, dt);
      g.position.set(b.x, groundH(b.x, b.z) - b.sit * 0.08, b.z); g.rotation.y = b.h;
      // peck: quick dip, short hold, return (0.4 s); while walking the head bobs forward and back
      const k = b.peck >= 0 ? (t - b.peck) % 0.5 : 1; const peckAmt = t - b.peck < 1.0 && !night ? (k < 0.12 ? ss(k / 0.12) : k < 0.2 ? 1 : 1 - ss((k - 0.2) / 0.2)) : 0;
      const hd = heads.current[i]; if (hd) { hd.rotation.x = peckAmt * 1.0 + b.sit * 0.3; hd.position.z = 0.1 + Math.sin(b.ph) * 0.015 * clamp(b.v / 0.3) - b.sit * 0.04; hd.position.y = 0.2 - peckAmt * 0.05 - b.sit * 0.04; }
      [0, 1].forEach((j) => { const l = legs.current[i * 2 + j]; if (l) { l.rotation.x = Math.sin(b.ph + j * Math.PI) * 0.6 * clamp(b.v / 0.3); l.scale.y = 1 - b.sit * 0.9; } });
    });
  });
  return (
    <>
      {birds.map((b, i) => {
        const body = b.brown ? M("#B9773E") : M("#F4EFE6");
        return (
          <group key={i} ref={(e) => { refs.current[i] = e; }} scale={0.95}>
            <mesh geometry={GEO.ico1b} material={body} position={[0, 0.14, 0]} scale={[0.085, 0.08, 0.11]} castShadow />
            <mesh geometry={GEO.cone4} material={body} position={[0, 0.19, -0.1]} rotation={[-0.9, 0, 0]} scale={[0.05, 0.08, 0.03]} />
            <group ref={(e) => { heads.current[i] = e; }} position={[0, 0.2, 0.1]}>
              <mesh geometry={GEO.ico1} material={body} position={[0, 0.03, 0]} scale={0.045} />
              <mesh geometry={GEO.box} material={M("#D2402E")} position={[0, 0.08, 0]} scale={[0.012, 0.035, 0.04]} />
              <mesh geometry={GEO.cone4} material={M("#F0B43C")} position={[0, 0.025, 0.05]} rotation={[Math.PI / 2, 0, 0]} scale={[0.014, 0.03, 0.012]} />
            </group>
            {[-1, 1].map((k, j) => <group key={k} ref={(e) => { legs.current[i * 2 + j] = e; }} position={[k * 0.03, 0.08, 0]}><mesh geometry={GEO.cyl6} material={M("#E2A23A")} position={[0, -0.04, 0]} scale={[0.008, 0.08, 0.008]} /></group>)}
          </group>
        );
      })}
    </>
  );
}

// ------------------------------------------------------------------ sheep
export function Sheep({ n = 5 }: { n?: number }) {
  const refs = useRef<(THREE.Group | null)[]>([]); const heads = useRef<(THREE.Group | null)[]>([]); const legs = useRef<(THREE.Object3D | null)[]>([]); const bodies = useRef<(THREE.Group | null)[]>([]);
  const P = FARM.pasture;
  const flock = useMemo(() => { const r = rand(23); return Array.from({ length: n }, () => ({ x: P.x0 + 1 + r() * (P.x1 - P.x0 - 2), z: P.z0 + 1 + r() * (P.z1 - P.z0 - 2), h: r() * 6, tx: NaN, tz: NaN, next: 2 + r() * 10, v: 0, ph: r() * 6, graze: 1, lie: 0, s: 0.9 + r() * 0.2 })); }, [n, P.x0, P.x1, P.z0, P.z1]);
  const wool = useMemo(() => { const g = new THREE.IcosahedronGeometry(1, 1); const p = g.attributes.position; const r = rand(5); for (let i = 0; i < p.count; i++) { const k = 1 + (r() - 0.5) * 0.12; p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k); } g.computeVertexNormals(); return g; }, []);
  useFrame(({ clock }, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05); const t = clock.elapsedTime; const night = SKY.night > 0.6;
    flock.forEach((sh, i) => {
      const g = refs.current[i]; if (!g) return;
      if (!night && t > sh.next) { sh.tx = P.x0 + 1 + Math.random() * (P.x1 - P.x0 - 2); sh.tz = P.z0 + 1 + Math.random() * (P.z1 - P.z0 - 2); sh.next = t + 10 + Math.random() * 14; }
      let moving = false;
      if (!night && Number.isFinite(sh.tx)) {
        const dx = sh.tx - sh.x, dz = sh.tz - sh.z, dist = Math.hypot(dx, dz);
        if (dist > 0.1) { moving = true; sh.v = damp(sh.v, Math.min(0.35, dist * 0.6), 2, dt); sh.h = angDamp(sh.h, Math.atan2(dx, dz), 1.6, dt); sh.x += Math.sin(sh.h) * sh.v * dt; sh.z += Math.cos(sh.h) * sh.v * dt; sh.ph += sh.v * dt / 0.18 * Math.PI; }
        else { sh.v = 0; sh.tx = NaN; }
      }
      sh.graze = damp(sh.graze, moving ? 0 : Math.sin(t * 0.13 + i * 2) > -0.6 ? 1 : 0, 1.5, dt);
      sh.lie = damp(sh.lie, night ? 1 : 0, 1.2, dt);
      g.position.set(sh.x, groundH(sh.x, sh.z), sh.z); g.rotation.y = sh.h;
      const walk = clamp(sh.v / 0.25);
      const b = bodies.current[i]; if (b) { b.position.y = -sh.lie * 0.26 + Math.abs(Math.sin(sh.ph)) * 0.015 * walk; }
      const hd = heads.current[i]; if (hd) { hd.rotation.x = sh.graze * 0.95 * (1 - sh.lie) + sh.lie * 0.2 + Math.sin(t * 2.2 + i) * 0.03 * sh.graze; hd.position.y = 0.62 - sh.lie * 0.26; }
      for (let j = 0; j < 4; j++) { const l = legs.current[i * 4 + j]; if (l) { l.rotation.x = Math.sin(sh.ph + (j === 0 || j === 3 ? 0 : Math.PI)) * 0.4 * walk; l.scale.y = 1 - sh.lie * 0.85; } }
    });
  });
  const W = M("#F3EFE6", { roughness: 1 }), F = M("#3B3330");
  return (
    <>
      {flock.map((sh, i) => (
        <group key={i} ref={(e) => { refs.current[i] = e; }} scale={sh.s}>
          <group ref={(e) => { bodies.current[i] = e; }}>
            <mesh geometry={wool} material={W} position={[0, 0.5, 0]} scale={[0.3, 0.26, 0.4]} castShadow />
          </group>
          <group ref={(e) => { heads.current[i] = e; }} position={[0, 0.62, 0.36]}>
            <mesh geometry={GEO.ico1b} material={F} position={[0, -0.02, 0.08]} scale={[0.09, 0.1, 0.14]} castShadow />
            <mesh geometry={wool} material={W} position={[0, 0.06, 0.02]} scale={[0.1, 0.06, 0.08]} />
            {[-1, 1].map((k) => <mesh key={k} geometry={GEO.box} material={F} position={[k * 0.1, 0.02, 0.02]} rotation={[0, 0, k * 0.5]} scale={[0.09, 0.025, 0.04]} />)}
          </group>
          {[[-0.13, 0.22], [0.13, 0.22], [-0.13, -0.22], [0.13, -0.22]].map(([x, z], j) => (
            <group key={j} ref={(e) => { legs.current[i * 4 + j] = e; }} position={[x, 0.36, z]}><mesh geometry={GEO.cyl6} material={F} position={[0, -0.17, 0]} scale={[0.035, 0.34, 0.035]} /></group>
          ))}
        </group>
      ))}
    </>
  );
}
