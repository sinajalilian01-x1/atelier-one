"use client";
/* eslint-disable react-hooks/immutability -- three.js objects are mutated per frame by design */
// The dream island's cast: the bearded painter (procedural low-poly, IK brush arm), his fox friend who wanders,
// sniffs the easel and naps by the gramophone, gliding flocks, a robin that lands on the easel, and the sale lantern.
import * as THREE from "three";
import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { glowTexture, rand, useArtTexture, type ArtSource } from "../scenes/kit";
import { jitter, paint, solid, type V3 } from "../fox/geo";
import { Brush, GEO, M, Palette, vmat } from "../fox/FoxWorld";
import { groundH } from "./island";

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);
/** Stretch a unit cylinder (height 1, along Y) between two points. */
function limb(m: THREE.Object3D | null, a: THREE.Vector3, b: THREE.Vector3, r: number) {
  if (!m) return; const d = V().subVectors(b, a); const L = d.length();
  m.position.copy(a).addScaledVector(d, 0.5); m.quaternion.setFromUnitVectors(UP, d.normalize()); m.scale.set(r, L, r);
}
/** Two-bone IK: elbow position for shoulder → hand with bone lengths l1, l2, bending towards the pole. */
function elbowOf(s: THREE.Vector3, h: THREE.Vector3, l1: number, l2: number, pole: THREE.Vector3) {
  const d = V().subVectors(h, s); const dist = Math.min(Math.max(d.length(), 0.01), l1 + l2 - 1e-3); d.normalize();
  const a = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist); const hh = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const perp = V().subVectors(pole, s); perp.addScaledVector(d, -perp.dot(d)).normalize();
  return V().copy(s).addScaledVector(d, a).addScaledVector(perp, hh);
}
/** A tapered, slightly flattened tube along a curve: hair locks, the beard, the fox's tail. */
function taperTube(pts: V3[], r0: number, r1: number, color: (t: number, r: () => number) => string, flat = 1, seed = 1, belly = 0) {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => V(...p))); const N = 12, R = 6; const r = rand(seed);
  let g: THREE.BufferGeometry = new THREE.TubeGeometry(curve, N, 1, R, false); const p = g.attributes.position;
  for (let i = 0; i <= N; i++) {
    const t = i / N; const rad = r0 + (r1 - r0) * t + Math.sin(t * Math.PI) * belly; const c = curve.getPointAt(t);
    for (let k = 0; k <= R; k++) { const j = i * (R + 1) + k; const v = V().fromBufferAttribute(p, j).sub(c); v.x *= flat; v.multiplyScalar(rad * (0.9 + r() * 0.2)).add(c); p.setXYZ(j, v.x, v.y, v.z); }
  }
  g = paint(g, (c, f) => { const t = Math.max(0, Math.min(1, (pts[0][1] - f.y) / Math.max(0.01, pts[0][1] - pts[pts.length - 1][1]))); c.set(color(t, r)); c.offsetHSL(0, 0, (r() - 0.5) * 0.05 + f.ny * 0.03); });
  return g;
}

// ------------------------------------------------------------------ the painter
const HAIR = ["#EDE6DA", "#DCD3C4", "#F6F1E8", "#CFC5B5"];
export function Painter({ working, canvasWorld, canvasRight, canvasUp, canvasNormal }: { working: boolean; canvasWorld: THREE.Vector3; canvasRight: THREE.Vector3; canvasUp: THREE.Vector3; canvasNormal: THREE.Vector3 }) {
  const root = useRef<THREE.Group>(null); const head = useRef<THREE.Group>(null); const torso = useRef<THREE.Group>(null);
  const upper = useRef<THREE.Mesh>(null), fore = useRef<THREE.Mesh>(null), hand = useRef<THREE.Mesh>(null), brush = useRef<THREE.Group>(null), elbowJ = useRef<THREE.Mesh>(null);
  const locks = useRef<(THREE.Group | null)[]>([]); const beard = useRef<THREE.Group>(null);
  const mix = useRef(0);
  const SKIN = M("#E7B08A"), COAT = M("#35594F"), COAT2 = M("#2A4840"), PANTS = M("#5A4130"), BOOT = M("#3A2418"), SC = M("#C8401F"), SC2 = M("#F08A2C"), BERET = M("#B8361E"), DK = M("#2A1E1A");
  const geo = useMemo(() => {
    const hairCol = (t: number, r: () => number) => HAIR[Math.floor(r() * HAIR.length)] + (t > 2 ? "" : "");
    // long flowing locks from the back of the head down past the shoulders
    const L: { g: THREE.BufferGeometry; pivot: V3 }[] = [];
    const r = rand(13);
    for (let i = 0; i < 9; i++) {
      const a = Math.PI * (1.08 + (i / 8) * 0.84) + (r() - 0.5) * 0.12; // around the back half of the head (z < 0)
      const sx = Math.cos(a) * 0.17, sz = Math.sin(a) * 0.16 - 0.02; const len = 0.75 + r() * 0.3 - Math.abs(Math.cos(a)) * 0.15;
      const out = 1.25 + r() * 0.2;
      const pts: V3[] = [[sx * 0.8, 0.12, sz * 0.8], [sx * out, -0.12, sz * out - 0.04], [sx * (out + 0.12), -0.42, sz * (out + 0.1) - 0.1], [sx * (out + 0.05), -0.42 - len * 0.6, sz * out - 0.14], [sx * out * 0.9 + (r() - 0.5) * 0.05, -0.42 - len, sz * out - 0.12]];
      L.push({ g: taperTube(pts, 0.075, 0.018, hairCol, 1.3, 20 + i, 0.03), pivot: [sx, 0.1, sz] });
    }
    // long beard: chin → chest, a little wavy, flattened front-to-back
    const beard = taperTube([[0, -0.08, 0.13], [0, -0.22, 0.2], [0.01, -0.42, 0.22], [-0.02, -0.62, 0.2], [0.02, -0.8, 0.16]], 0.15, 0.02, (t, r) => HAIR[Math.floor(r() * HAIR.length)], 1.15, 33, 0.03);
    const jaw = solid(jitter(new THREE.IcosahedronGeometry(1, 1), 0.12, rand(5)), "#E3DBCE", 0.06, rand(6));
    const cap = solid(jitter(new THREE.IcosahedronGeometry(1, 1), 0.08, rand(7)), "#E9E2D6", 0.06, rand(8));
    const torso = solid(jitter(new THREE.CylinderGeometry(0.24, 0.31, 0.66, 8, 2), 0.04, rand(9)), "#35594F", 0.07, rand(10));
    const stump = solid(jitter(new THREE.CylinderGeometry(0.4, 0.5, 0.6, 10, 2), 0.04, rand(3)), "#6B4429", 0.1, rand(4));
    return { locks: L, beard, jaw, cap, torso, stump };
  }, []);
  const tm = useMemo(() => vmat({ roughness: 0.85 }), []);
  // static joints in painter-local space
  const SH_B = useMemo(() => V(0.24, 1.36, 0.02), []), SH_P = useMemo(() => V(-0.24, 1.36, 0.02), []);
  const tmp = useMemo(() => ({ s: V(), h: V(), e: V(), tip: V(), dir: V(), pole: V(0.9, 0.7, -0.5) }), []);
  useFrame(({ clock }, dt) => {
    const g = root.current; if (!g) return; const t = clock.elapsedTime;
    mix.current += ((working ? 1 : 0) - mix.current) * Math.min(1, dt * 2.5); const w = mix.current;
    // brush target on the canvas (world): sweeping strokes, lifting off between them
    const stroke = t * 1.9; const lift = Math.max(0, Math.sin(stroke + 1.6)) * 0.14;
    const ax = Math.sin(stroke) * 0.3 + Math.sin(t * 0.37) * 0.12, ay = Math.sin(t * 0.61) * 0.22 + Math.sin(stroke * 2) * 0.04;
    const paintPt = V().copy(canvasWorld).addScaledVector(canvasRight, ax).addScaledVector(canvasUp, ay).addScaledVector(canvasNormal, 0.02 + lift);
    // at rest the brush hand sits on his knee, brush tip pointing up and out
    const rest = V(0.55 + Math.sin(t * 0.5) * 0.02, 1.08, 0.9);
    g.updateWorldMatrix(true, false); const tip = rest.lerp(g.worldToLocal(paintPt), w);
    // hand sits 0.5 back from the brush tip, along the line from the shoulder
    tmp.dir.subVectors(tip, SH_B).normalize(); const handP = V().copy(tip).addScaledVector(tmp.dir, -0.6);
    const el = elbowOf(SH_B, handP, 0.42, 0.4, V(0.75, 0.75, -0.6));
    limb(upper.current, SH_B, el, 0.075); limb(fore.current, el, handP, 0.065); elbowJ.current?.position.copy(el); hand.current?.position.copy(handP);
    if (brush.current) { brush.current.position.copy(handP); brush.current.quaternion.setFromUnitVectors(V(0, -1, 0), tmp.dir); }
    // head: watches the canvas while painting, glances at the camera when idle; hair and beard sway in the breeze
    if (head.current) { head.current.rotation.y = 0.55 * w + (1 - w) * (Math.sin(t * 0.33) * 0.35 + 0.1) + Math.sin(stroke) * 0.04 * w; head.current.rotation.x = 0.06 + Math.sin(t * 0.7) * 0.03 + w * 0.05; }
    if (torso.current) { torso.current.rotation.y = 0.12 * w + Math.sin(stroke) * 0.03 * w; torso.current.scale.y = 1 + Math.sin(t * 1.5) * 0.01; }
    locks.current.forEach((l, i) => { if (l) { l.rotation.x = -0.05 + Math.sin(t * 1.1 + i * 0.6) * 0.06; l.rotation.z = Math.sin(t * 0.8 + i) * 0.04; } });
    if (beard.current) beard.current.rotation.x = Math.sin(t * 0.9) * 0.04;
  });
  return (
    <group ref={root}>
      {/* stump seat */}
      <mesh geometry={geo.stump} material={tm} position={[0, 0.3, -0.05]} castShadow receiveShadow />
      <mesh geometry={GEO.cyl16} material={M("#D9A86A")} position={[0, 0.605, -0.05]} scale={[0.39, 0.012, 0.39]} />
      {/* legs: thighs forward, shins down, boots */}
      {[-1, 1].map((k) => {
        const hip = V(k * 0.13, 0.7, 0.02), knee = V(k * 0.17, 0.68, 0.46), foot = V(k * 0.2, 0.1, 0.56);
        return (
          <group key={k}>
            <mesh ref={(m) => limb(m, hip, knee, 0.105)} geometry={GEO.cyl8} material={PANTS} castShadow />
            <mesh ref={(m) => limb(m, knee, foot, 0.09)} geometry={GEO.cyl8} material={PANTS} castShadow />
            <mesh geometry={GEO.ico1} material={PANTS} position={knee} scale={0.1} />
            <mesh geometry={GEO.ico1b} material={BOOT} position={[k * 0.2, 0.07, 0.64]} scale={[0.1, 0.08, 0.17]} castShadow />
          </group>
        );
      })}
      <group ref={torso} position={[0, 0.66, 0]}>
        <mesh geometry={geo.torso} material={tm} position={[0, 0.36, 0]} rotation={[0.08, 0, 0]} castShadow />
        <mesh geometry={GEO.ico1b} material={COAT} position={[0, 0.08, 0.05]} scale={[0.3, 0.14, 0.3]} />
        {/* coat flaps over the lap */}
        {[-1, 1].map((k) => <mesh key={k} geometry={GEO.box} material={COAT2} position={[k * 0.13, 0.04, 0.22]} rotation={[-1.35, 0, k * 0.08]} scale={[0.2, 0.3, 0.04]} castShadow />)}
        {/* buttons */}
        {[0.22, 0.36].map((y, i) => <mesh key={i} geometry={GEO.ico1} material={M("#D9A34A", { metalness: 0.5, roughness: 0.4 })} position={[0.03, y, 0.27]} scale={0.022} />)}
      </group>
      {/* scarf */}
      <mesh material={SC} position={[0, 1.42, 0.02]} rotation={[Math.PI / 2 + 0.1, 0, 0]} castShadow><torusGeometry args={[0.16, 0.075, 6, 14]} /></mesh>
      <mesh material={SC2} position={[0, 1.42, 0.02]} rotation={[Math.PI / 2 + 0.1, 0, 0]}><torusGeometry args={[0.165, 0.045, 4, 14]} /></mesh>
      <group position={[-0.13, 1.36, 0.14]} rotation={[0.15, 0, 0.2]}>
        <mesh geometry={GEO.box} material={SC} position={[0, -0.2, 0]} scale={[0.12, 0.42, 0.045]} castShadow />
        {[-0.08, -0.24].map((y, i) => <mesh key={i} geometry={GEO.box} material={SC2} position={[0, y, 0.002]} scale={[0.122, 0.045, 0.047]} />)}
      </group>
      {/* palette arm (his right, towards the camera) */}
      {(() => { const hp = V(-0.42, 1.0, 0.36); const el = elbowOf(SH_P, hp, 0.4, 0.36, V(-0.9, 0.9, -0.6)); return (
        <group>
          <mesh ref={(m) => limb(m, SH_P, el, 0.075)} geometry={GEO.cyl8} material={COAT} castShadow />
          <mesh ref={(m) => limb(m, el, hp, 0.065)} geometry={GEO.cyl8} material={COAT} castShadow />
          <mesh geometry={GEO.ico1} material={COAT} position={el} scale={0.075} />
          <mesh geometry={GEO.ico1} material={SKIN} position={hp} scale={0.06} />
          <group position={[hp.x - 0.06, hp.y + 0.02, hp.z + 0.08]} rotation={[0.45, 0.5, 0.25]} scale={0.95}><Palette /></group>
        </group>
      ); })()}
      {/* brush arm (IK, driven per frame) */}
      <mesh geometry={GEO.ico1} material={COAT} position={SH_B} scale={0.09} />
      <mesh geometry={GEO.ico1} material={COAT} position={SH_P} scale={0.09} />
      <mesh ref={upper} geometry={GEO.cyl8} material={COAT} castShadow />
      <mesh ref={elbowJ} geometry={GEO.ico1} material={COAT} scale={0.075} />
      <mesh ref={fore} geometry={GEO.cyl8} material={COAT} castShadow />
      <mesh ref={hand} geometry={GEO.ico1} material={SKIN} scale={0.06} />
      <group ref={brush}><Brush /></group>
      {/* head */}
      <group ref={head} position={[0, 1.62, 0.02]}>
        <mesh geometry={GEO.ico1b} material={SKIN} scale={[0.17, 0.2, 0.18]} castShadow />
        <mesh geometry={GEO.ico1} material={SKIN} position={[0, -0.02, 0.17]} scale={[0.045, 0.06, 0.05]} />
        <mesh geometry={GEO.ico1} material={M("#E08A6A")} position={[0, -0.035, 0.205]} scale={0.03} />
        {[-1, 1].map((k) => (
          <group key={k}>
            <mesh geometry={GEO.ico1} material={DK} position={[k * 0.07, 0.03, 0.155]} scale={[0.024, 0.03, 0.02]} />
            <mesh geometry={GEO.ico1} material={M("#ffffff", { emissive: "#ffffff", emissiveIntensity: 0.6 })} position={[k * 0.065, 0.04, 0.17]} scale={0.008} />
            <mesh geometry={GEO.box} material={M("#F2ECE2")} position={[k * 0.075, 0.085, 0.15]} rotation={[0, 0, k * -0.25]} scale={[0.08, 0.025, 0.03]} />
            <mesh geometry={GEO.ico1} material={M("#EE9A80")} position={[k * 0.11, -0.03, 0.13]} scale={[0.035, 0.025, 0.02]} />
            <mesh geometry={GEO.ico1} material={SKIN} position={[k * 0.17, 0, 0]} scale={[0.03, 0.05, 0.04]} />
            {/* moustache */}
            <mesh geometry={GEO.cone5} material={M("#ECE5D9")} position={[k * 0.06, -0.075, 0.175]} rotation={[0, 0, k * 1.9]} scale={[0.035, 0.13, 0.03]} />
          </group>
        ))}
        {/* hair cap + beret */}
        <mesh geometry={geo.cap} material={tm} position={[0, 0.05, -0.04]} scale={[0.19, 0.19, 0.19]} />
        <mesh geometry={GEO.ico1} material={BERET} position={[0.02, 0.19, -0.03]} rotation={[0.15, 0, -0.22]} scale={[0.21, 0.07, 0.2]} castShadow />
        <mesh geometry={GEO.cyl6} material={BERET} position={[0.04, 0.26, -0.03]} scale={[0.015, 0.05, 0.015]} />
        {/* beard */}
        <mesh geometry={geo.jaw} material={tm} position={[0, -0.08, 0.06]} scale={[0.17, 0.13, 0.14]} />
        <group ref={beard}><mesh geometry={geo.beard} material={tm} castShadow /></group>
        {geo.locks.map((l, i) => <group key={i} ref={(e) => { locks.current[i] = e; }} position={l.pivot}><group position={[-l.pivot[0], -l.pivot[1], -l.pivot[2]]}><mesh geometry={l.g} material={tm} castShadow /></group></group>)}
      </group>
    </group>
  );
}

// ------------------------------------------------------------------ the fox friend
type Way = { p: [number, number]; pause?: number; pose?: "sniff" | "curl" | "sit"; face?: [number, number] };
export function WanderFox({ path, scale = 0.85 }: { path: Way[]; scale?: number }) {
  const root = useRef<THREE.Group>(null); const body = useRef<THREE.Group>(null); const head = useRef<THREE.Group>(null); const tail = useRef<THREE.Group>(null);
  const legs = useRef<(THREE.Group | null)[]>([]);
  const pinPose = useMemo(() => (typeof location !== "undefined" ? new URLSearchParams(location.search).get("fox") : null), []);
  // precompute the timeline: walk legs at 0.85 u/s, then pause/pose at each waypoint
  const tl = useMemo(() => {
    const segs: { t0: number; t1: number; a: [number, number]; b: [number, number]; pose?: Way["pose"]; face?: [number, number] }[] = []; let t = 0;
    for (let i = 0; i < path.length; i++) {
      const a = path[i].p, b = path[(i + 1) % path.length].p;
      if (path[i].pause) { segs.push({ t0: t, t1: t + path[i].pause!, a, b: a, pose: path[i].pose, face: path[i].face }); t += path[i].pause!; }
      const d = Math.hypot(b[0] - a[0], b[1] - a[1]); segs.push({ t0: t, t1: t + d / 0.85, a, b }); t += d / 0.85;
    }
    return { segs, total: t };
  }, [path]);
  const st = useRef({ heading: 0, curl: 0, sniff: 0, walk: 0 });
  const O = M("#E26F24"), O2 = M("#C95A1C"), WH = M("#F6EEE2"), DK = M("#2A1E1A");
  const tailMat = useMemo(() => vmat({ roughness: 0.8 }), []);
  const tailGeo = useMemo(() => taperTube([[0, 0.02, 0], [0, 0.0, -0.22], [0, -0.1, -0.45], [0, -0.22, -0.62], [0, -0.26, -0.78]], 0.05, 0.03, (t) => (t > 0.8 ? "#F6EEE2" : "#E26F24"), 1, 61, 0.11), []);
  useFrame(({ clock }, dt) => {
    const g = root.current; if (!g) return; const s = st.current; let T = clock.elapsedTime % tl.total;
    if (pinPose === "curl") T = tl.segs.find((x) => x.pose === "curl")!.t0 + 4; else if (pinPose === "sniff") T = tl.segs.find((x) => x.pose === "sniff")!.t0 + 1;
    const seg = tl.segs.find((x) => T >= x.t0 && T < x.t1) || tl.segs[0]; const k = (T - seg.t0) / (seg.t1 - seg.t0);
    const x = seg.a[0] + (seg.b[0] - seg.a[0]) * k, z = seg.a[1] + (seg.b[1] - seg.a[1]) * k;
    const moving = seg.a !== seg.b; const want = moving ? Math.atan2(seg.b[0] - seg.a[0], seg.b[1] - seg.a[1]) : seg.face ? Math.atan2(seg.face[0] - x, seg.face[1] - z) : s.heading;
    let dh = want - s.heading; dh = Math.atan2(Math.sin(dh), Math.cos(dh)); s.heading += dh * Math.min(1, dt * 4);
    const ease = Math.min(1, dt * 3);
    s.walk += ((moving ? 1 : 0) - s.walk) * ease; s.curl += ((seg.pose === "curl" && k > 0.04 && k < 0.96 ? 1 : 0) - s.curl) * Math.min(1, dt * 1.8); s.sniff += ((seg.pose === "sniff" ? 1 : 0) - s.sniff) * ease;
    g.position.set(x, groundH(x, z), z); g.rotation.y = s.heading;
    const t = clock.elapsedTime; const ph = t * 9;
    legs.current.forEach((l, i) => { if (!l) return; const diag = i === 0 || i === 3 ? 0 : Math.PI; l.rotation.x = Math.sin(ph + diag) * 0.55 * s.walk; l.scale.y = 1 - s.curl * 0.75; });
    if (body.current) { body.current.position.y = Math.abs(Math.sin(ph)) * 0.025 * s.walk - s.curl * 0.2; body.current.rotation.z = s.curl * 0.25; }
    if (head.current) {
      head.current.rotation.x = s.sniff * (0.55 + Math.sin(t * 14) * 0.08 * (Math.sin(t * 1.3) > 0 ? 1 : 0)) + s.curl * 0.5;
      head.current.rotation.y = s.curl * 1.2 + Math.sin(t * 0.8) * 0.15 * (1 - s.curl);
      head.current.position.y = 0.6 - s.curl * 0.3;
    }
    if (tail.current) { tail.current.rotation.y = Math.sin(t * (s.sniff > 0.5 ? 9 : 2.2)) * (0.15 + s.sniff * 0.3) * (1 - s.curl) + s.curl * 2.3; tail.current.rotation.x = 0.2 - s.walk * 0.25 + s.curl * 0.6; }
  });
  return (
    <group ref={root} scale={scale}>
      <group ref={body}>
        <mesh geometry={GEO.ico1b} material={O} position={[0, 0.48, 0]} scale={[0.17, 0.17, 0.36]} castShadow />
        <mesh geometry={GEO.ico1} material={WH} position={[0, 0.44, 0.26]} scale={[0.11, 0.13, 0.12]} />
        <group ref={head} position={[0, 0.6, 0.38]}>
          <mesh geometry={GEO.ico1b} material={O} scale={[0.14, 0.12, 0.14]} castShadow />
          <mesh geometry={GEO.cone6} material={O} position={[0, -0.03, 0.15]} rotation={[Math.PI / 2, 0, 0]} scale={[0.065, 0.2, 0.055]} />
          <mesh geometry={GEO.cone6} material={WH} position={[0, -0.055, 0.13]} rotation={[Math.PI / 2 - 0.05, 0, 0]} scale={[0.06, 0.17, 0.035]} />
          <mesh geometry={GEO.ico1} material={DK} position={[0, -0.025, 0.25]} scale={0.022} />
          {[-1, 1].map((k) => (
            <group key={k}>
              <mesh geometry={GEO.ico1} material={DK} position={[k * 0.065, 0.025, 0.11]} scale={0.018} />
              <mesh geometry={GEO.cone4} material={O} position={[k * 0.075, 0.15, -0.01]} rotation={[0, Math.PI / 4, -k * 0.2]} scale={[0.06, 0.15, 0.035]} castShadow />
              <mesh geometry={GEO.cone4} material={DK} position={[k * 0.08, 0.215, -0.01]} rotation={[0, Math.PI / 4, -k * 0.2]} scale={[0.025, 0.04, 0.015]} />
            </group>
          ))}
        </group>
        <group ref={tail} position={[0, 0.5, -0.32]}><mesh geometry={tailGeo} material={tailMat} castShadow /></group>
      </group>
      {[[-0.09, 0.2], [0.09, 0.2], [-0.09, -0.22], [0.09, -0.22]].map(([x, z], i) => (
        <group key={i} ref={(e) => { legs.current[i] = e; }} position={[x, 0.4, z]}>
          <mesh geometry={GEO.cyl6} material={i < 2 ? O2 : O} position={[0, -0.13, 0]} scale={[0.04, 0.26, 0.04]} castShadow />
          <mesh geometry={GEO.cyl6} material={DK} position={[0, -0.33, 0.01]} scale={[0.036, 0.14, 0.04]} />
        </group>
      ))}
    </group>
  );
}

// ------------------------------------------------------------------ birds
function birdGeo() {
  const body = new THREE.ConeGeometry(0.06, 0.32, 4); body.rotateX(Math.PI / 2);
  const wing = new THREE.BufferGeometry(); wing.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0.08, 0, 0, -0.08, 0.42, 0.02, -0.12], 3)); wing.computeVertexNormals();
  return { body, wing };
}
const BG = typeof window !== "undefined" ? birdGeo() : null;
export function Flock({ n, radius, height, speed, phase, color = "#3A2A22" }: { n: number; radius: number; height: number; speed: number; phase: number; color?: string }) {
  const g = useRef<THREE.Group>(null); const birds = useRef<(THREE.Group | null)[]>([]); const wings = useRef<(THREE.Mesh | null)[]>([]);
  const offs = useMemo(() => { const r = rand(phase * 100 + 7); return Array.from({ length: n }, (_, i) => ({ dx: (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 0.55 + (r() - 0.5) * 0.2, dz: -Math.ceil(i / 2) * 0.5 + (r() - 0.5) * 0.2, dy: (r() - 0.5) * 0.3, ph: r() * 6 })); }, [n, phase]);
  const mat = M(color, { side: THREE.DoubleSide });
  useFrame(({ clock }) => {
    const t = clock.elapsedTime * speed + phase; const R = radius + Math.sin(t * 0.7) * 2;
    if (g.current) { g.current.position.set(Math.cos(t) * R, height + Math.sin(t * 1.3) * 1.2, Math.sin(t) * R); g.current.rotation.y = -t + (speed > 0 ? Math.PI : 0); g.current.rotation.z = (speed > 0 ? 1 : -1) * 0.2; }
    birds.current.forEach((b, i) => { if (b) b.position.y = offs[i].dy + Math.sin(clock.elapsedTime * 1.4 + offs[i].ph) * 0.12; });
    wings.current.forEach((w, i) => { if (!w) return; const b = Math.floor(i / 2), side = i % 2 ? -1 : 1; const glide = Math.sin(clock.elapsedTime * 0.6 + offs[b].ph) > 0.2; const f = glide ? 0.12 + Math.sin(clock.elapsedTime * 2) * 0.05 : Math.sin(clock.elapsedTime * 13 + offs[b].ph) * 0.7; w.rotation.z = side * f; });
  });
  if (!BG) return null;
  return (
    <group ref={g}>
      {offs.map((o, i) => (
        <group key={i} ref={(e) => { birds.current[i] = e; }} position={[o.dx, o.dy, o.dz]} scale={0.9}>
          <mesh geometry={BG.body} material={mat} />
          <mesh ref={(e) => { wings.current[i * 2] = e; }} geometry={BG.wing} material={mat} />
          <mesh ref={(e) => { wings.current[i * 2 + 1] = e; }} geometry={BG.wing} material={mat} scale={[-1, 1, 1]} />
        </group>
      ))}
    </group>
  );
}

/** A robin that flies in and perches on the easel when a painting is finished, and flies off when the next one starts. */
export function Robin({ perch, spot, from }: { perch: boolean; spot: THREE.Vector3; from: THREE.Vector3 }) {
  const g = useRef<THREE.Group>(null); const wl = useRef<THREE.Mesh>(null), wr = useRef<THREE.Mesh>(null); const hd = useRef<THREE.Group>(null);
  const k = useRef(0); // 0 = away, 1 = perched
  const away = useMemo(() => from.clone(), [from]);
  const ctrl = useMemo(() => V().addVectors(from, spot).multiplyScalar(0.5).add(V(0, 2.5, 0)), [from, spot]);
  const curve = useMemo(() => new THREE.QuadraticBezierCurve3(away, ctrl, spot), [away, ctrl, spot]);
  useFrame(({ clock }, dt) => {
    const o = g.current; if (!o) return; const t = clock.elapsedTime;
    k.current = Math.max(0, Math.min(1, k.current + (perch ? 1 : -1) * dt / 4.5));
    const e = k.current < 0.5 ? 2 * k.current * k.current : 1 - Math.pow(-2 * k.current + 2, 2) / 2;
    o.visible = k.current > 0.001;
    const p = curve.getPoint(e); o.position.copy(p);
    const tan = curve.getTangent(Math.min(0.999, e)); if (k.current < 0.999) o.rotation.y = Math.atan2(tan.x, tan.z) + (perch ? 0 : Math.PI);
    const flying = k.current < 0.98; const f = flying ? Math.sin(t * 16) * 0.9 : 0.05;
    if (wl.current) wl.current.rotation.z = flying ? f : 1.2; if (wr.current) wr.current.rotation.z = flying ? -f : -1.2;
    if (hd.current) { const peck = !flying && Math.sin(t * 0.9) > 0.85; hd.current.rotation.x = peck ? 0.6 : 0; hd.current.rotation.y = flying ? 0 : Math.sin(t * 0.7) * 0.8; }
  });
  if (!BG) return null;
  return (
    <group ref={g} visible={false} scale={1.5}>
      <mesh geometry={GEO.ico1b} material={M("#6B4A34")} position={[0, 0.09, -0.02]} scale={[0.075, 0.075, 0.11]} castShadow />
      <mesh geometry={GEO.ico1} material={M("#E8642C")} position={[0, 0.08, 0.05]} scale={[0.06, 0.06, 0.05]} />
      <group ref={hd} position={[0, 0.16, 0.06]}>
        <mesh geometry={GEO.ico1} material={M("#6B4A34")} scale={0.055} />
        <mesh geometry={GEO.cone4} material={M("#E8A23A")} position={[0, -0.005, 0.06]} rotation={[Math.PI / 2, 0, 0]} scale={[0.015, 0.04, 0.015]} />
        {[-1, 1].map((s) => <mesh key={s} geometry={GEO.ico1} material={M("#1A1412")} position={[s * 0.03, 0.012, 0.035]} scale={0.011} />)}
      </group>
      <mesh geometry={GEO.box} material={M("#5A3E2C")} position={[0, 0.09, -0.15]} rotation={[0.3, 0, 0]} scale={[0.05, 0.015, 0.1]} />
      <mesh ref={wl} geometry={BG.wing} material={M("#5A3E2C", { side: THREE.DoubleSide })} position={[0.03, 0.12, 0]} scale={0.5} />
      <mesh ref={wr} geometry={BG.wing} material={M("#5A3E2C", { side: THREE.DoubleSide })} position={[-0.03, 0.12, 0]} scale={[-0.5, 0.5, 0.5]} />
      {[-1, 1].map((s) => <mesh key={"l" + s} geometry={GEO.cyl6} material={M("#3A2A20")} position={[s * 0.025, 0.02, 0]} scale={[0.006, 0.05, 0.006]} />)}
    </group>
  );
}

// ------------------------------------------------------------------ the sale lantern
/** When a painting sells it floats up from the easel as a glowing paper lantern carrying the artwork. */
export function Lantern({ art, fireKey, from, lite, demo }: { art: ArtSource | null; fireKey: string | null; from: THREE.Vector3; lite: boolean; demo?: boolean }) {
  const tex = useArtTexture(art, false);
  const g = useRef<THREE.Group>(null); const glow = useRef<THREE.Sprite>(null); const light = useRef<THREE.PointLight>(null);
  const [start, setStart] = useState<number | null>(null); const clockRef = useRef(0); const seen = useRef<string | null>(fireKey);
  useEffect(() => { if (fireKey && fireKey !== seen.current) { seen.current = fireKey; setStart(clockRef.current); } }, [fireKey]);
  const paper = useMemo(() => new THREE.MeshBasicMaterial({ color: new THREE.Color("#FFD9A0").multiplyScalar(1.5), toneMapped: false, side: THREE.DoubleSide, transparent: true }), []);
  const artM = useMemo(() => new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(1.05, 1.0, 0.9), toneMapped: false, transparent: true }), [tex]);
  const gm = useMemo(() => new THREE.SpriteMaterial({ map: glowTexture(), color: "#FFB45A", transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.9 }), []);
  const DUR = 22;
  useFrame(({ clock }) => {
    clockRef.current = clock.elapsedTime; const o = g.current; if (!o) return;
    let k = start == null ? -1 : (clock.elapsedTime - start) / DUR;
    if (demo) k = 0.12 + ((clock.elapsedTime % DUR) / DUR) * 0.12;
    o.visible = k >= 0 && k < 1; if (!o.visible) { if (light.current) light.current.intensity = 0; return; }
    const e = Math.pow(k, 2.2); const t = clock.elapsedTime; // lingers by the easel, then drifts up into the sky
    o.position.set(from.x + Math.sin(k * 7) * 0.4 * k + k * 2.4, from.y + 0.35 + Math.min(1, k * 8) * 0.25 + e * 15, from.z + Math.cos(k * 5) * 0.3 * k + k * 1.2);
    o.rotation.y = t * 0.35; o.rotation.z = Math.sin(t * 1.3) * 0.08;
    const fade = Math.min(1, k * 8) * (1 - Math.max(0, (k - 0.75) / 0.25)); const flick = 0.9 + Math.sin(t * 13) * 0.05 + Math.sin(t * 7.3) * 0.05;
    paper.opacity = fade; artM.opacity = fade; gm.opacity = 0.85 * fade * flick; o.scale.setScalar(Math.min(1, k * 10) * (1 - k * 0.3));
    if (light.current) light.current.intensity = lite ? 0 : 6 * fade * flick;
  });
  return (
    <group ref={g} visible={false}>
      {/* four paper sides carrying the artwork, wooden rims, a warm flame glow */}
      {[0, 1, 2, 3].map((i) => (
        <group key={i} rotation={[0, (i * Math.PI) / 2, 0]}>
          <mesh material={i % 2 ? paper : artM} position={[0, 0, 0.25]}><planeGeometry args={[0.5, 0.56]} /></mesh>
        </group>
      ))}
      <mesh geometry={GEO.box} material={M("#5A3520")} position={[0, 0.3, 0]} scale={[0.56, 0.05, 0.56]} />
      <mesh geometry={GEO.box} material={M("#5A3520")} position={[0, -0.3, 0]} scale={[0.56, 0.05, 0.56]} />
      <mesh geometry={GEO.cyl6} material={M("#5A3520")} position={[0, 0.4, 0]} scale={[0.015, 0.16, 0.015]} />
      <sprite ref={glow} material={gm} scale={[2.2, 2.2, 1]} />
      <pointLight ref={light} intensity={0} distance={7} decay={1.5} color="#FFA850" />
    </group>
  );
}
