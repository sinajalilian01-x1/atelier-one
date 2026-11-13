"use client";
/* eslint-disable react-hooks/immutability -- three.js objects are mutated per frame by design (react-three-fiber useFrame) */
// The four worlds. Each one matches a concept render Sina picked.
import * as THREE from "three";
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Butterfly, Cabin, Cloud, Easel, Flowers, G, Leaves, M, Mountain, Notes, Pine, RecordPlayer, Rig, Rock, RoundTree, Sky, Sparkles, Sun, Terrain, Tufts, Water, fbm, rand, scatter, type ArtSource, type V3 } from "./kit";
import { Fox, Painter, Robot } from "./characters";

export interface WorldProps { art: ArtSource | null; sketching: boolean; working: boolean; playing: boolean; lite: boolean }
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

// ============ 1 · Lakeside Low-Poly ============
function lakeDist(x: number, z: number) { const cx = 4 + (-z) * 0.12 + Math.sin(z * 0.12) * 2.5; return Math.abs(x - cx); }
function lakeW(z: number) { return 5 + clamp(-z, 0, 60) * 0.18; }
export const lakeH = (x: number, z: number) => clamp((lakeDist(x, z) - lakeW(z)) * 0.35, -1.2, 2.4) + (fbm(x * 0.12 + 20, z * 0.12) - 0.5) * 1.1 + (z > 3 ? (z - 3) * 0.12 : 0);

export function LakeWorld({ art, sketching, working, playing, lite }: WorldProps) {
  const P: V3 = [-2.2, lakeH(-2.2, 2.6), 2.6];
  const pines = useMemo(() => scatter(lite ? 45 : 110, 3, (r) => {
    const x = (r() - 0.5) * 70, z = -r() * 55 + 4; const h = lakeH(x, z);
    if (h < 0.35 || (Math.abs(x - P[0]) < 3.2 && Math.abs(z - P[2]) < 3.5) || (z > 3 && x > -6)) return null; return [x, z];
  }), [lite]); // eslint-disable-line react-hooks/exhaustive-deps
  const rocks = useMemo(() => scatter(lite ? 14 : 30, 8, (r) => { const x = (r() - 0.5) * 40, z = -r() * 30 + 4; const h = lakeH(x, z); return h > -0.4 && h < 0.35 ? [x, z] : null; }), []);
  const flowers = useMemo(() => scatter(lite ? 50 : 140, 11, (r) => { const x = P[0] + (r() - 0.5) * 9, z = P[2] + (r() - 0.3) * 6; return lakeH(x, z) > 0.3 ? [x, z] : null; }).map(([x, z]) => [x, lakeH(x, z) + 0.05, z] as V3), []); // eslint-disable-line react-hooks/exhaustive-deps
  const tufts = useMemo(() => scatter(lite ? 40 : 120, 12, (r) => { const x = P[0] + (r() - 0.5) * 12, z = P[2] + (r() - 0.4) * 8; return lakeH(x, z) > 0.3 ? [x, z] : null; }).map(([x, z]) => [x, lakeH(x, z), z] as V3), []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <Sky top="#E79CB0" mid="#F7C1A2" bottom="#FFE1B5" />
      <fog attach="fog" args={["#F3BFA9", 28, 120]} />
      <hemisphereLight args={["#FFE2D0", "#4E6E45", 0.9]} />
      <directionalLight position={[30, 14, -40]} intensity={2.4} color="#FFC48A" castShadow={!lite} shadow-mapSize={[1024, 1024]} shadow-camera-left={-12} shadow-camera-right={12} shadow-camera-top={12} shadow-camera-bottom={-12} shadow-camera-far={120} />
      <ambientLight intensity={0.25} color="#FFD9C9" />
      <Sun position={[48, 9, -110]} color="#FFE6B0" size={5} glow={45} />
      {[[-40, 2, -70, 13, 16, 1, "#A88FA6"], [-18, 0, -78, 15, 22, 2, "#9C86A6"], [6, 0, -82, 12, 18, 3, "#B396A8"], [24, 0, -74, 16, 25, 4, "#9887A8"], [46, 2, -80, 14, 17, 5, "#B39BAE"], [-62, 0, -60, 12, 14, 6, "#A992A8"], [64, 0, -65, 12, 15, 7, "#A28FAA"]].map(([x, y, z, r, h, sd, c]) => (
        <Mountain key={sd as number} position={[x as number, (y as number) - 1, z as number]} r={r as number} h={h as number} seed={sd as number} color={c as string} snow="#FFEDE8" />
      ))}
      <Terrain size={110} depth={90} seg={lite ? 56 : 90} position={[0, 0, -32]} height={lakeH} seed={5}
        color={(h, x, z, r) => h < -0.25 ? "#5DB6A8" : h < 0.25 ? (r > 0.5 ? "#B8B0A2" : "#A39D93") : z > -12 ? (r > 0.6 ? "#7DB55A" : r > 0.3 ? "#6FA94F" : "#88BE5F") : (r > 0.5 ? "#4F8A4A" : "#5C9650")} />
      <Water w={160} d={110} seg={lite ? 40 : 70} position={[0, -0.12, -40]} color="#3FC6CF" amp={0.06} speed={0.9} />
      {pines.map(([x, z, r], i) => <Pine key={i} position={[x, lakeH(x, z) - 0.1, z]} s={0.8 + r * 0.9} shade={(r - 0.5) * 0.12} color={r > 0.5 ? "#2E6B45" : "#3B7A4C"} shadow={!lite && z > -6} />)}
      {[[-6.5, 4.5, 1.6], [-7.6, 1.2, 1.9], [-5.6, -1.5, 1.3]].map(([x, z, s], i) => <Pine key={"f" + i} position={[x, lakeH(x, z) - 0.1, z]} s={s} shadow={!lite} />)}
      {rocks.map(([x, z, r], i) => <Rock key={i} position={[x, lakeH(x, z), z]} s={0.3 + r * 0.6} v={i} rot={r * 6} color={r > 0.5 ? "#B7B0B4" : "#A29AA2"} />)}
      <Rock position={[P[0] - 2.4, P[1], P[2] + 0.4]} s={[0.9, 0.6, 0.8]} v={1} color="#C1BAC0" shadow={!lite} />
      <Flowers points={flowers} colors={["#FFFFFF", "#F7B6C8", "#FFE07A", "#F49AB8"]} />
      <Tufts points={tufts} color="#6EAE4E" />
      {Array.from({ length: lite ? 5 : 9 }, (_, i) => { const r = rand(i + 40); return <Cloud key={i} position={[(r() - 0.5) * 120, 16 + r() * 14, -50 - r() * 40]} s={2.4 + r() * 2.5} speed={0.6 + r() * 0.5} range={140} color="#FFE0D8" emissive="#3A1F1F" />; })}
      <group position={P} rotation={[0, -0.25, 0]}>
        <Painter position={[0, 0, 0]} working={working} />
        <Easel position={[0.55, 0, -1.35]} rotation={[0, -0.2, 0]} art={art} sketching={sketching} />
        <RecordPlayer position={[0.9, 0, 0.75]} rotation={[0, -0.4, 0]} s={0.7} playing={playing} />
        <Notes origin={[1.0, 0.5, 0.6]} playing={playing} color="#F0607A" />
      </group>
      {!lite && <Sparkles count={30} area={[20, 4, 20]} center={[0, 2, -6]} color="#FFE7B8" size={0.18} speed={0.25} />}
      <Rig base={[-4.4, P[1] + 2.4, P[2] + 6.2]} target={[1.5, 1.4, -6]} amount={[1.2, 0.5]} />
    </>
  );
}

// ============ 2 · Floating Island ============
function islandTopGeo() {
  let g: THREE.BufferGeometry = new THREE.CylinderGeometry(6.2, 5.6, 0.8, 14, 1); const r = rand(21); const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { if (p.getY(i) > 0) p.setY(i, p.getY(i) + (r() - 0.5) * 0.15); p.setX(i, p.getX(i) * (1 + (r() - 0.5) * 0.1)); p.setZ(i, p.getZ(i) * (1 + (r() - 0.5) * 0.1)); }
  g = g.toNonIndexed(); g.computeVertexNormals(); return g;
}
function islandRockGeo() {
  let g: THREE.BufferGeometry = new THREE.ConeGeometry(5.8, 7, 12, 5); g.rotateX(Math.PI); const r = rand(31); const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const y = p.getY(i); if (y < 3.4) { p.setX(i, p.getX(i) + (r() - 0.5) * 1.1); p.setZ(i, p.getZ(i) + (r() - 0.5) * 1.1); p.setY(i, y + (r() - 0.5) * 0.6); } }
  g = g.toNonIndexed(); const q = g.attributes.position; const cols: number[] = []; const c = new THREE.Color();
  for (let i = 0; i < q.count; i += 3) { const v = r(); c.set(v > 0.66 ? "#8F8D93" : v > 0.33 ? "#7D7B82" : "#A3A0A6"); if ((q.getY(i) + q.getY(i + 1) + q.getY(i + 2)) / 3 > 3) c.set("#6B5A4A"); for (let k = 0; k < 3; k++) cols.push(c.r, c.g, c.b); }
  g.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3)); g.computeVertexNormals(); return g;
}
function Windmill({ position, s = 1 }: { position: V3; s?: number }) {
  const blades = useRef<THREE.Group>(null);
  useFrame((_, dt) => { if (blades.current) blades.current.rotation.z += dt * 0.9; });
  return (
    <group position={position} scale={s}>
      <mesh geometry={G.cone6} material={M("#B9B2A8")} position={[0, 1.6, 0]} scale={[0.9, 3.2, 0.9]} castShadow />
      <mesh geometry={G.cone6} material={M("#8C7E70")} position={[0, 3.35, 0]} scale={[0.6, 0.6, 0.6]} castShadow />
      <mesh geometry={G.box} material={M("#6E5236")} position={[0, 0.5, 0.75]} scale={[0.35, 0.6, 0.05]} />
      <group ref={blades} position={[0, 2.9, 0.62]}>
        {[0, 1, 2, 3].map((i) => (
          <group key={i} rotation={[0, 0, (i * Math.PI) / 2]}>
            <mesh geometry={G.box} material={M("#7A5A3C")} position={[0, 1.05, 0]} scale={[0.06, 2.1, 0.05]} />
            <mesh geometry={G.box} material={M("#F2EEE6")} position={[0.17, 1.2, 0]} scale={[0.32, 1.6, 0.02]} castShadow />
          </group>
        ))}
        <mesh geometry={G.cyl6} material={M("#5A4636")} rotation={[Math.PI / 2, 0, 0]} scale={[0.12, 0.15, 0.12]} />
      </group>
    </group>
  );
}
function Waterfall({ position, height = 7 }: { position: V3; height?: number }) {
  const tex = useMemo(() => {
    const c = document.createElement("canvas"); c.width = 64; c.height = 256; const x = c.getContext("2d")!;
    x.fillStyle = "#58B9F0"; x.fillRect(0, 0, 64, 256); const r = rand(77);
    for (let i = 0; i < 70; i++) { x.fillStyle = r() > 0.5 ? "rgba(255,255,255,.75)" : "rgba(170,225,255,.8)"; x.fillRect(r() * 64, r() * 256, 2 + r() * 5, 10 + r() * 40); }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1, 2); t.colorSpace = THREE.SRGBColorSpace; return t;
  }, []);
  useFrame((_, dt) => { tex.offset.y += dt * 0.9; });
  return (
    <group position={position}>
      <mesh position={[0, -height / 2, 0]}><planeGeometry args={[1.3, height, 1, 8]} /><meshBasicMaterial map={tex} transparent opacity={0.92} side={THREE.DoubleSide} /></mesh>
      <mesh position={[0, -height / 2, -0.15]} rotation={[0, 0.5, 0]}><planeGeometry args={[0.9, height * 0.95]} /><meshBasicMaterial map={tex} transparent opacity={0.6} side={THREE.DoubleSide} /></mesh>
      <Sparkles count={40} area={[1.8, 1.4, 1.2]} center={[0, -height + 0.3, 0.2]} color="#FFFFFF" size={0.35} speed={1.4} additive={false} />
    </group>
  );
}
export function IslandWorld({ art, sketching, working, playing, lite }: WorldProps) {
  const isle = useRef<THREE.Group>(null);
  const top = useMemo(() => islandTopGeo(), []); const rock = useMemo(() => islandRockGeo(), []);
  useFrame(({ clock }) => { if (isle.current) { isle.current.position.y = Math.sin(clock.elapsedTime * 0.6) * 0.18; isle.current.rotation.y = Math.sin(clock.elapsedTime * 0.12) * 0.06; } });
  const flowers = useMemo(() => scatter(lite ? 40 : 90, 5, (r) => { const a = r() * 6.28, d = 1 + r() * 4.6; return [Math.cos(a) * d, Math.sin(a) * d]; }).map(([x, z]) => [x, 0.45, z] as V3), [lite]);
  const tufts = useMemo(() => scatter(lite ? 30 : 70, 6, (r) => { const a = r() * 6.28, d = r() * 5.4; return [Math.cos(a) * d, Math.sin(a) * d]; }).map(([x, z]) => [x, 0.4, z] as V3), [lite]);
  return (
    <>
      <Sky top="#2A78DC" mid="#4E9FEA" bottom="#9CCFF5" />
      <fog attach="fog" args={["#A9D6F7", 45, 140]} />
      <hemisphereLight args={["#FFFFFF", "#6D8FB0", 1.0]} />
      <directionalLight position={[12, 20, 10]} intensity={2.6} color="#FFF4E0" castShadow={!lite} shadow-mapSize={[1024, 1024]} shadow-camera-left={-9} shadow-camera-right={9} shadow-camera-top={9} shadow-camera-bottom={-9} />
      <ambientLight intensity={0.3} />
      {Array.from({ length: lite ? 7 : 14 }, (_, i) => { const r = rand(i + 7); const below = i % 3 === 0; return <Cloud key={i} position={[(r() - 0.5) * 80, below ? -10 - r() * 5 : 2 + r() * 12, -18 - r() * 40 + (below ? 12 : 0)]} s={1.8 + r() * 2.4} speed={0.5 + r() * 0.4} range={90} emissive="#8F9CAE" />; })}
      {[[-16, -1, -14, 1.1], [17, 3, -20, 0.8], [-12, 6, -30, 0.6]].map(([x, y, z, s], i) => (
        <group key={i} position={[x, y, z]} scale={s * 0.3}>
          <mesh geometry={top} material={M("#7CC25A")} /><mesh geometry={rock} position={[0, -3.6, 0]}><meshStandardMaterial vertexColors flatShading /></mesh>
          <Pine position={[1, 0.4, 0]} s={1.6} color="#3E8A55" />
        </group>
      ))}
      <group ref={isle}>
        <mesh geometry={top} castShadow receiveShadow><meshStandardMaterial color="#79C257" flatShading roughness={1} /></mesh>
        <mesh geometry={rock} position={[0, -3.9, 0]} castShadow><meshStandardMaterial vertexColors flatShading roughness={1} /></mesh>
        {/* path + stream */}
        {Array.from({ length: 9 }, (_, i) => <mesh key={i} geometry={G.cyl6} material={M(i % 2 ? "#D8CBB4" : "#CBBDA4")} position={[-1.2 + i * 0.35, 0.42, 2.2 - i * 0.35]} rotation={[0, i, 0]} scale={[0.28, 0.06, 0.24]} receiveShadow />)}
        <mesh position={[3.4, 0.43, 2.2]} rotation={[-Math.PI / 2, 0, -0.75]}><planeGeometry args={[1.1, 4.4]} /><meshStandardMaterial color="#5DBDF2" flatShading roughness={0.2} /></mesh>
        <Waterfall position={[4.75, 0.4, 3.75]} height={8} />
        <Cabin position={[0.8, 0.4, -1.8]} rotation={[0, -0.35, 0]} s={1.05} wall="#A8784C" roof="#3E66C2" />
        <mesh geometry={G.box} material={M("#8B5E3C")} position={[1.6, 0.6, 0.0]} scale={[0.5, 0.35, 0.35]} castShadow />
        <Windmill position={[3.6, 0.4, -2.6]} s={1.05} />
        <RoundTree position={[-3.6, 0.4, -1.2]} s={1.25} color="#4FB59C" />
        <RoundTree position={[4.2, 0.4, -0.2]} s={1.15} color="#F2953A" />
        <RoundTree position={[-1.8, 0.4, -3.8]} s={1.0} color="#F2A341" />
        <Pine position={[-4.6, 0.3, 1.2]} s={0.9} color="#3E8A55" />
        <Pine position={[-2.6, 0.3, -4.4]} s={0.8} color="#3E8A55" />
        {[[-4.8, 2.6], [2.6, 4.4], [-0.6, 4.9], [5.1, 1.6], [-3.4, 3.6]].map(([x, z], i) => <Rock key={i} position={[x, 0.45, z]} s={0.35 + (i % 3) * 0.15} v={i} color="#A9A6AC" shadow={!lite} />)}
        <Flowers points={flowers} colors={["#FFFFFF", "#FFE07A", "#F49AB8", "#FFB366"]} size={0.08} />
        <Tufts points={tufts} color="#5FAE48" size={0.22} />
        <group position={[-2.2, 0.4, 1.8]} rotation={[0, 0.6, 0]}>
          <Painter position={[0, 0, 0]} working={working} pose="stand" s={0.85} shirt="#F6E7D2" overalls="#3E6FC4" pants="#3E6FC4" hair="#2B211C" hat="none" />
          <Easel position={[0.35, 0, -1.1]} rotation={[0, -0.15, 0]} art={art} sketching={sketching} s={0.9} />
          <group position={[-0.9, 0, -0.3]}>
            <mesh geometry={G.box} material={M("#E8EEF5")} position={[0, 0.2, 0]} scale={[0.55, 0.36, 0.22]} castShadow />
            <mesh geometry={G.cyl12} material={M("#3E66C2")} position={[0, 0.2, 0.115]} rotation={[Math.PI / 2, 0, 0]} scale={[0.11, 0.02, 0.11]} />
            <mesh geometry={G.box} material={M("#B9C2CC")} position={[0.18, 0.5, 0]} rotation={[0, 0, -0.3]} scale={[0.02, 0.35, 0.02]} />
          </group>
          <Notes origin={[-0.9, 0.5, -0.3]} playing={playing} color="#FFFFFF" />
        </group>
      </group>
      <Butterfly center={[-1, 0.6, 1]} radius={2.5} color="#FFB347" />
      <Rig base={[13.5, 8.5, 19]} target={[-2.6, -1.2, 0]} amount={[1.4, 0.8]} drift={0.4} narrow={{ base: [15, 9, 21], target: [0.3, -1.6, 0] }} />
    </>
  );
}

// ============ 3 · Autumn Fox ============
const foxH = (x: number, z: number) => { const cx = Math.sin(z * 0.25) * 1.6 + 1.2; const d = Math.abs(x - cx); return (d < 1.1 ? -0.35 : clamp((d - 1.1) * 0.3, 0, 0.6)) + (fbm(x * 0.2, z * 0.2) - 0.5) * 0.5; };
function Gramophone({ position, rotation = [0, 0, 0], playing }: { position: V3; rotation?: V3; playing: boolean }) {
  const disc = useRef<THREE.Mesh>(null); const horn = useRef<THREE.Group>(null);
  useFrame(({ clock }, dt) => { if (disc.current && playing) disc.current.rotation.y += dt * 3; if (horn.current) horn.current.scale.setScalar(playing ? 1 + Math.sin(clock.elapsedTime * 9) * 0.015 : 1); });
  const gold = M("#D7A443", { metalness: 0.75, roughness: 0.3 });
  return (
    <group position={position} rotation={rotation}>
      <mesh geometry={G.box} material={M("#5A3A26")} position={[0, 0.3, 0]} scale={[0.75, 0.6, 0.6]} castShadow />
      <mesh geometry={G.box} material={M("#7A4E30")} position={[0, 0.62, 0]} scale={[0.78, 0.05, 0.64]} />
      <mesh ref={disc} geometry={G.cyl12} material={M("#1A1A1A")} position={[0, 0.66, 0]} scale={[0.27, 0.02, 0.27]} />
      <mesh geometry={G.cyl6} material={gold} position={[0.22, 0.85, 0.12]} rotation={[0, 0, 0.3]} scale={[0.03, 0.4, 0.03]} />
      <group ref={horn} position={[0.25, 1.05, 0.1]} rotation={[-2.1, 0, 0.5]}>
        <mesh material={gold} position={[0, -0.37, 0]} castShadow><coneGeometry args={[0.38, 0.75, 10, 1, true]} /></mesh>
        <mesh position={[0, -0.37, 0]}><coneGeometry args={[0.37, 0.74, 10, 1, true]} /><meshStandardMaterial color="#8C5A20" side={THREE.BackSide} flatShading /></mesh>
      </group>
    </group>
  );
}
export function FoxWorld({ art, sketching, working, playing, lite }: WorldProps) {
  const trees = useMemo(() => scatter(lite ? 26 : 60, 17, (r) => { const x = (r() - 0.5) * 40, z = -2 - r() * 26; return Math.abs(x - (Math.sin(z * 0.25) * 1.6 + 1.2)) < 2 || (x > 3 && x < 9 && z > -10 && z < -3) ? null : [x, z]; }), [lite]);
  const pines = useMemo(() => scatter(lite ? 20 : 45, 18, (r) => { const x = (r() - 0.5) * 60, z = -14 - r() * 20; return [x, z]; }), [lite]);
  const stones = useMemo(() => scatter(lite ? 30 : 70, 19, (r) => { const z = 4 - r() * 22; const cx = Math.sin(z * 0.25) * 1.6 + 1.2; const side = r() > 0.5 ? 1 : -1; return [cx + side * (1.0 + r() * 0.5), z]; }), [lite]);
  const flowers = useMemo(() => scatter(lite ? 40 : 110, 20, (r) => { const x = (r() - 0.5) * 16, z = 4 - r() * 12; return foxH(x, z) > 0.0 ? [x, z] : null; }).map(([x, z]) => [x, foxH(x, z) + 0.04, z] as V3), [lite]);
  return (
    <>
      <Sky top="#2A2420" mid="#6B4A30" bottom="#B07A45" />
      <fog attach="fog" args={["#4A3526", 10, 42]} />
      <hemisphereLight args={["#FFD9A8", "#2A3A22", 0.7]} />
      <directionalLight position={[-8, 10, 6]} intensity={1.7} color="#FFC27A" castShadow={!lite} shadow-mapSize={[1024, 1024]} shadow-camera-left={-10} shadow-camera-right={10} shadow-camera-top={10} shadow-camera-bottom={-10} />
      <pointLight position={[6.5, 1.5, -5]} intensity={8} distance={9} color="#FFB85A" />
      <ambientLight intensity={0.25} color="#FFCFA0" />
      <Terrain size={60} seg={lite ? 50 : 80} position={[0, 0, -12]} height={foxH} seed={9}
        color={(h, x, z, r) => { if (h < -0.2) return "#3D5E4E"; const n = fbm(x * 0.35 + 7, z * 0.35); return n > 0.58 ? (r > 0.5 ? "#D98A2F" : "#C9762E") : n > 0.5 ? (r > 0.5 ? "#A8862F" : "#8E8A35") : (r > 0.5 ? "#5F7D35" : "#56732F"); }} />
      <Water w={8} d={60} seg={lite ? 16 : 30} position={[1.2, -0.22, -12]} color="#4A7FA0" amp={0.03} speed={1.6} opacity={0.88} />
      {pines.map(([x, z, r], i) => <Pine key={"p" + i} position={[x, foxH(x, z), z]} s={1.6 + r * 1.4} color="#24402E" shade={(r - 0.5) * 0.06} />)}
      {trees.map(([x, z, r], i) => <RoundTree key={i} position={[x, foxH(x, z), z]} s={1 + r * 1.1} color={r > 0.66 ? "#E7832B" : r > 0.33 ? "#F2B13A" : "#D1612A"} shadow={!lite && z > -8} />)}
      <RoundTree position={[-5.2, foxH(-5.2, 1.5), 1.5]} s={2.3} color="#E07A2A" shadow={!lite} />
      <RoundTree position={[7.5, foxH(7.5, 1), 1]} s={2.0} color="#F0A23A" shadow={!lite} />
      {stones.map(([x, z, r], i) => <Rock key={i} position={[x, foxH(x, z) - 0.05, z]} s={[0.25 + r * 0.25, 0.12, 0.22 + r * 0.2]} v={i} color={r > 0.5 ? "#8A8A86" : "#9C9A94"} />)}
      <Flowers points={flowers} colors={["#E8782A", "#F2B33D", "#D2522B", "#F5E6C8"]} size={0.08} />
      <Cabin position={[6.2, foxH(6.2, -6.5) - 0.05, -6.5]} rotation={[0, -0.6, 0]} s={1.2} wall="#7A5234" roof="#4A3F3A" night />
      <group position={[-2.6, foxH(-2.6, 2), 2]} rotation={[0, -1.25, 0]}>
        <Fox position={[0, 0, 0]} working={working} />
        <Easel position={[0.25, 0, -1.25]} rotation={[0, 1.1, 0]} art={art} sketching={sketching} />
      </group>
      <group position={[1.4, foxH(1.4, 1.2), 1.2]} scale={0.75}>
        <mesh geometry={G.cyl6} material={M("#6E4A30")} position={[0, 0.25, 0]} scale={[0.5, 0.5, 0.5]} castShadow />
        <Gramophone position={[0, 0.5, 0]} rotation={[0, -0.5, 0]} playing={playing} />
        <Notes origin={[0.4, 1.7, 0.6]} playing={playing} color="#F2C14E" />
      </group>
      <Sparkles count={lite ? 30 : 70} area={[22, 4, 18]} center={[0, 1.8, -5]} color="#FFD36B" size={0.22} speed={0.35} />
      <Leaves count={lite ? 18 : 40} area={[16, 8, 12]} center={[0, 4, -2]} />
      <Rig base={[0.4, 2.6, 8.2]} target={[0, 1.2, -2]} amount={[1.0, 0.4]} narrow={{ base: [-2.2, 2.8, 9.6], target: [-1.2, 1.1, -1] }} />
    </>
  );
}

// ============ 4 · Robot Meadow ============
const meadowH = (x: number, z: number) => { const rv = Math.abs(x - (Math.sin(z * 0.08) * 6 + z * 0.35 + 6)); const river = z < -14 && rv < 1.6 ? -0.6 : 0; return (z < -10 ? (fbm(x * 0.05 + 3, z * 0.05) - 0.3) * clamp((-z - 10) * 0.35, 0, 9) : (fbm(x * 0.3, z * 0.3) - 0.5) * 0.25) + river; };
function Boombox({ position, rotation = [0, 0, 0], playing }: { position: V3; rotation?: V3; playing: boolean }) {
  const l = useRef<THREE.Mesh>(null); const r = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => { const k = playing ? 1 + Math.abs(Math.sin(clock.elapsedTime * 7.3)) * 0.12 : 1; l.current?.scale.set(0.2 * k, 0.04, 0.2 * k); r.current?.scale.set(0.2 * k, 0.04, 0.2 * k); });
  return (
    <group position={position} rotation={rotation}>
      <mesh geometry={G.box} material={M("#E9DCC6")} position={[0, 0.3, 0]} scale={[1.2, 0.6, 0.38]} castShadow />
      <mesh geometry={G.box} material={M("#F07A22")} position={[0, 0.62, 0]} scale={[1.22, 0.06, 0.4]} />
      <mesh ref={l} geometry={G.cyl12} material={M("#3A3A3A")} position={[-0.36, 0.28, 0.2]} rotation={[Math.PI / 2, 0, 0]} />
      <mesh ref={r} geometry={G.cyl12} material={M("#3A3A3A")} position={[0.36, 0.28, 0.2]} rotation={[Math.PI / 2, 0, 0]} />
      <mesh geometry={G.box} material={M("#8FD3E8")} position={[0, 0.42, 0.2]} scale={[0.3, 0.12, 0.02]} />
      <mesh geometry={G.box} material={M("#C9B89E")} position={[0, 0.82, 0]} scale={[1.0, 0.05, 0.05]} />
      <mesh geometry={G.box} material={M("#C9B89E")} position={[-0.48, 0.72, 0]} scale={[0.05, 0.2, 0.05]} />
      <mesh geometry={G.box} material={M("#C9B89E")} position={[0.48, 0.72, 0]} scale={[0.05, 0.2, 0.05]} />
    </group>
  );
}
export function RobotWorld({ art, sketching, working, playing, lite }: WorldProps) {
  const daisies = useMemo(() => scatter(lite ? 120 : 320, 31, (r) => [(r() - 0.5) * 22, 6 - r() * 16]).map(([x, z]) => [x, meadowH(x, z) + 0.12, z] as V3), [lite]);
  const oranges = useMemo(() => scatter(lite ? 50 : 140, 32, (r) => [(r() - 0.5) * 22, 6 - r() * 16]).map(([x, z]) => [x, meadowH(x, z) + 0.16, z] as V3), [lite]);
  const tufts = useMemo(() => scatter(lite ? 120 : 300, 33, (r) => [(r() - 0.5) * 24, 6 - r() * 18]).map(([x, z]) => [x, meadowH(x, z), z] as V3), [lite]);
  const trees = useMemo(() => scatter(lite ? 16 : 36, 34, (r) => [(r() - 0.5) * 90, -18 - r() * 40]), [lite]);
  return (
    <>
      <Sky top="#3C8FE6" mid="#93CBF3" bottom="#E3F2FB" />
      <fog attach="fog" args={["#CFE6F5", 30, 110]} />
      <hemisphereLight args={["#FFFFFF", "#6E9A4A", 1.0]} />
      <directionalLight position={[10, 16, 8]} intensity={2.6} color="#FFF3DC" castShadow={!lite} shadow-mapSize={[1024, 1024]} shadow-camera-left={-8} shadow-camera-right={8} shadow-camera-top={8} shadow-camera-bottom={-8} />
      <ambientLight intensity={0.3} />
      <Terrain size={120} depth={90} seg={lite ? 60 : 100} position={[0, 0, -36]} height={meadowH} seed={13}
        color={(h, _x, z, r) => h < -0.35 ? "#6FB7D8" : z > -10 ? (r > 0.5 ? "#7CC352" : r > 0.2 ? "#8ACB5A" : "#6FB548") : (r > 0.55 ? "#8DBF57" : r > 0.25 ? "#A3C964" : "#76AE4E")} />
      <Water w={140} d={80} seg={lite ? 30 : 50} position={[0, -0.42, -55]} color="#5FB8E0" amp={0.04} />
      {trees.map(([x, z, r], i) => r > 0.5 ? <RoundTree key={i} position={[x, meadowH(x, z), z]} s={1.4 + r} color="#4E9A45" sway={false} /> : <Pine key={i} position={[x, meadowH(x, z), z]} s={1.3 + r} color="#3F7F48" />)}
      {Array.from({ length: lite ? 6 : 11 }, (_, i) => { const r = rand(i + 70); return <Cloud key={i} position={[(r() - 0.5) * 110, 14 + r() * 12, -40 - r() * 40]} s={2.6 + r() * 3} speed={0.5 + r() * 0.4} range={130} />; })}
      <Tufts points={tufts} color="#69B347" size={0.3} />
      <Flowers points={daisies} colors={["#FFFFFF", "#FFFFFF", "#FFF7E0"]} size={0.07} flat={0.45} />
      <Flowers points={oranges} colors={["#F28C28", "#FF7A3D", "#FFB347"]} size={0.09} flat={0.6} />
      <Butterfly center={[-2.6, 0, 1.5]} radius={1.6} color="#F28C28" speed={0.7} h={1.8} />
      <Butterfly center={[2.4, 0, 0]} radius={2.2} color="#FFB347" speed={0.5} phase={2} h={2.2} />
      {!lite && <Butterfly center={[0, 0, -2]} radius={3} color="#F5D04C" speed={0.4} phase={4} h={2.6} />}
      <group position={[-0.3, meadowH(-0.3, 0.8), 0.8]} rotation={[0, -1.9, 0]}>
        <Robot position={[0, 0, 0]} working={working} s={1.05} />
        <Easel position={[0.15, 0, -1.25]} rotation={[0, 1.2, 0]} art={art} sketching={sketching} />
      </group>
      <Boombox position={[-2.5, meadowH(-2.5, 1.0), 1.0]} rotation={[0, 0.45, 0]} playing={playing} />
      <Notes origin={[-2.3, 0.9, 1.0]} playing={playing} color="#F07A22" />
      <Rig base={[-0.6, 1.9, 6.4]} target={[0.4, 1.3, -1]} amount={[1.0, 0.35]} />
    </>
  );
}
