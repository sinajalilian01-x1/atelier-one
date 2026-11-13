"use client";
/* eslint-disable react-hooks/immutability -- three.js objects are mutated per frame by design (react-three-fiber useFrame) */
// Low-poly building blocks shared by the four 3D skins. Flat-shaded, cheap, cached.
import * as THREE from "three";
import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";

export type V3 = [number, number, number];

// ---------- materials / noise ----------
const matCache = new Map<string, THREE.Material>();
export function M(color: string, o: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
  const k = color + JSON.stringify(o);
  if (!matCache.has(k)) matCache.set(k, new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.92, metalness: 0, ...o }));
  return matCache.get(k) as THREE.MeshStandardMaterial;
}
export function rand(seed: number) {
  let a = seed || 1;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function h2(x: number, y: number) { let n = Math.imul(x, 374761393) + Math.imul(y, 668265263); n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967295; }
export function noise2(x: number, y: number) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const s = (t: number) => t * t * (3 - 2 * t); const u = s(xf), v = s(yf);
  const a = h2(xi, yi), b = h2(xi + 1, yi), c = h2(xi, yi + 1), d = h2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export const fbm = (x: number, y: number) => noise2(x, y) * 0.6 + noise2(x * 2.1 + 5, y * 2.1) * 0.3 + noise2(x * 4.3, y * 4.3 + 9) * 0.1;

function jitter(g: THREE.BufferGeometry, amt: number, seed: number) {
  const r = rand(seed); const p = g.attributes.position; const map = new Map<string, V3>();
  for (let i = 0; i < p.count; i++) {
    const k = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
    if (!map.has(k)) map.set(k, [(r() - 0.5) * amt, (r() - 0.5) * amt, (r() - 0.5) * amt]);
    const d = map.get(k)!; p.setXYZ(i, p.getX(i) + d[0], p.getY(i) + d[1], p.getZ(i) + d[2]);
  }
  g.computeVertexNormals(); return g;
}

// ---------- shared geometries ----------
export const G = {
  trunk: new THREE.CylinderGeometry(0.1, 0.16, 0.7, 5),
  cone1: jitter(new THREE.ConeGeometry(1, 1.5, 7, 1), 0.08, 1),
  cone2: jitter(new THREE.ConeGeometry(0.78, 1.25, 7, 1), 0.08, 2),
  cone3: jitter(new THREE.ConeGeometry(0.52, 1.05, 7, 1), 0.06, 3),
  blob: jitter(new THREE.IcosahedronGeometry(1, 0), 0.12, 4),
  blob1: jitter(new THREE.IcosahedronGeometry(1, 1), 0.1, 5),
  rocks: [0, 1, 2].map((i) => jitter(new THREE.DodecahedronGeometry(1, 0), 0.35, 10 + i)),
  box: new THREE.BoxGeometry(1, 1, 1),
  plane: new THREE.PlaneGeometry(1, 1),
  sphere: new THREE.IcosahedronGeometry(1, 1),
  cyl6: new THREE.CylinderGeometry(1, 1, 1, 6),
  cyl12: new THREE.CylinderGeometry(1, 1, 1, 12),
  cone6: new THREE.ConeGeometry(1, 1, 6),
  prism: new THREE.CylinderGeometry(1, 1, 1, 3),
};

// ---------- sky / light ----------
export function Sky({ top, mid, bottom, radius = 180 }: { top: string; mid: string; bottom: string; radius?: number }) {
  const geo = useMemo(() => {
    const g = new THREE.SphereGeometry(radius, 24, 16); const p = g.attributes.position; const cols: number[] = [];
    const ct = new THREE.Color(top), cm = new THREE.Color(mid), cb = new THREE.Color(bottom), c = new THREE.Color();
    for (let i = 0; i < p.count; i++) { const y = p.getY(i) / radius; if (y > 0.05) c.copy(cm).lerp(ct, Math.min(1, (y - 0.05) / 0.55)); else c.copy(cb).lerp(cm, Math.max(0, (y + 0.25) / 0.3)); cols.push(c.r, c.g, c.b); }
    g.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3)); return g;
  }, [top, mid, bottom, radius]);
  return <mesh geometry={geo} renderOrder={-1}><meshBasicMaterial vertexColors side={THREE.BackSide} fog={false} depthWrite={false} /></mesh>;
}

let glowTex: THREE.Texture | null = null;
export function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement("canvas"); c.width = c.height = 128; const x = c.getContext("2d")!;
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(0.25, "rgba(255,255,255,.55)"); g.addColorStop(1, "rgba(255,255,255,0)");
  x.fillStyle = g; x.fillRect(0, 0, 128, 128); glowTex = new THREE.CanvasTexture(c); return glowTex;
}
export function Sun({ position, color = "#FFE3A3", size = 6, glow = 30 }: { position: V3; color?: string; size?: number; glow?: number }) {
  return (
    <group position={position}>
      <mesh geometry={G.sphere} scale={size}><meshBasicMaterial color={color} fog={false} /></mesh>
      <sprite scale={[glow, glow, 1]}><spriteMaterial map={glowTexture()} color={color} transparent opacity={0.8} depthWrite={false} blending={THREE.AdditiveBlending} fog={false} /></sprite>
    </group>
  );
}

// ---------- terrain / water / mountains ----------
export function Terrain({ size = 60, depth, seg = 40, height, color, position = [0, 0, 0], seed = 7 }: { size?: number; depth?: number; seg?: number; height: (x: number, z: number) => number; color: (h: number, x: number, z: number, r: number) => string; position?: V3; seed?: number }) {
  const geo = useMemo(() => {
    const r = rand(seed);
    let g: THREE.BufferGeometry = new THREE.PlaneGeometry(size, depth ?? size, seg, seg); g.rotateX(-Math.PI / 2);
    const p = g.attributes.position; const cell = size / seg;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i) + (r() - 0.5) * cell * 0.6, z = p.getZ(i) + (r() - 0.5) * cell * 0.6; p.setXYZ(i, x, height(x + position[0], z + position[2]), z); }
    g = g.toNonIndexed(); const q = g.attributes.position; const cols: number[] = []; const c = new THREE.Color();
    for (let i = 0; i < q.count; i += 3) {
      const hy = (q.getY(i) + q.getY(i + 1) + q.getY(i + 2)) / 3, hx = (q.getX(i) + q.getX(i + 1) + q.getX(i + 2)) / 3, hz = (q.getZ(i) + q.getZ(i + 1) + q.getZ(i + 2)) / 3;
      c.set(color(hy, hx + position[0], hz + position[2], r())); for (let k = 0; k < 3; k++) cols.push(c.r, c.g, c.b);
    }
    g.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3)); g.computeVertexNormals(); return g;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size, seg, seed]);
  return <mesh geometry={geo} position={position} receiveShadow><meshStandardMaterial vertexColors flatShading roughness={1} /></mesh>;
}

export function Water({ w, d, seg = 36, color, position = [0, 0, 0], amp = 0.07, speed = 1, opacity = 0.92 }: { w: number; d: number; seg?: number; color: string; position?: V3; amp?: number; speed?: number; opacity?: number }) {
  const ref = useRef<THREE.Mesh>(null);
  const geo = useMemo(() => { const g = new THREE.PlaneGeometry(w, d, seg, Math.round(seg * d / w)); g.rotateX(-Math.PI / 2); return g; }, [w, d, seg]);
  const base = useMemo(() => Float32Array.from(geo.attributes.position.array), [geo]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime * speed; const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = base[i * 3], z = base[i * 3 + 2]; p.setY(i, Math.sin(x * 0.55 + t) * amp + Math.cos(z * 0.8 + t * 1.3) * amp + Math.sin((x + z) * 1.7 + t * 2) * amp * 0.35); }
    p.needsUpdate = true;
  });
  return <mesh ref={ref} geometry={geo} position={position} receiveShadow><meshLambertMaterial color={color} flatShading transparent opacity={opacity} emissive={color} emissiveIntensity={0.12} /></mesh>;
}

export function Mountain({ position, r = 6, h = 8, color = "#9C8BA6", snow = "#FFF4F0", seed = 1, snowLine = 0.62, seg = 7 }: { position: V3; r?: number; h?: number; color?: string; snow?: string; seed?: number; snowLine?: number; seg?: number }) {
  const geo = useMemo(() => {
    let g: THREE.BufferGeometry = jitter(new THREE.ConeGeometry(r, h, seg, 4), r * 0.28, seed); g = g.toNonIndexed();
    const p = g.attributes.position; const cols: number[] = []; const c = new THREE.Color(); const cr = new THREE.Color(color), cs = new THREE.Color(snow); const rr = rand(seed + 3);
    for (let i = 0; i < p.count; i += 3) { const y = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3 / h + 0.5; c.copy(y > snowLine + (rr() - 0.5) * 0.12 ? cs : cr).offsetHSL(0, 0, (rr() - 0.5) * 0.06); for (let k = 0; k < 3; k++) cols.push(c.r, c.g, c.b); }
    g.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3)); g.computeVertexNormals(); return g;
  }, [r, h, color, snow, seed, snowLine, seg]);
  return <mesh geometry={geo} position={[position[0], position[1] + h / 2, position[2]]}><meshStandardMaterial vertexColors flatShading roughness={1} /></mesh>;
}

// ---------- vegetation / props ----------
export function Pine({ position, s = 1, color = "#2E6B45", shade = 0, shadow = false }: { position: V3; s?: number; color?: string; shade?: number; shadow?: boolean }) {
  const c1 = useMemo(() => new THREE.Color(color).offsetHSL(0, 0, shade).getStyle(), [color, shade]);
  return (
    <group position={position} scale={s}>
      <mesh geometry={G.trunk} material={M("#6B4A33")} position={[0, 0.35, 0]} castShadow={shadow} />
      <mesh geometry={G.cone1} material={M(c1)} position={[0, 1.2, 0]} castShadow={shadow} />
      <mesh geometry={G.cone2} material={M(c1)} position={[0, 1.95, 0]} rotation={[0, 0.4, 0]} castShadow={shadow} />
      <mesh geometry={G.cone3} material={M(c1)} position={[0, 2.6, 0]} rotation={[0, 0.9, 0]} castShadow={shadow} />
    </group>
  );
}
export function RoundTree({ position, s = 1, color = "#E98A2E", trunk = "#6B4A33", shadow = false, sway = true }: { position: V3; s?: number; color?: string; trunk?: string; shadow?: boolean; sway?: boolean }) {
  const ref = useRef<THREE.Group>(null); const ph = useMemo(() => position[0] * 1.3 + position[2], [position]);
  useFrame(({ clock }) => { if (ref.current && sway) ref.current.rotation.z = Math.sin(clock.elapsedTime * 0.8 + ph) * 0.025; });
  return (
    <group position={position} scale={s}>
      <mesh geometry={G.trunk} material={M(trunk)} position={[0, 0.5, 0]} scale={[1.2, 1.5, 1.2]} castShadow={shadow} />
      <group ref={ref} position={[0, 1.1, 0]}>
        <mesh geometry={G.blob} material={M(color)} position={[0, 0.7, 0]} scale={1.05} castShadow={shadow} />
        <mesh geometry={G.blob} material={M(color)} position={[0.55, 0.45, 0.2]} scale={0.7} rotation={[0.5, 0.3, 0]} castShadow={shadow} />
        <mesh geometry={G.blob} material={M(color)} position={[-0.5, 0.5, -0.1]} scale={0.75} rotation={[0.2, 1, 0]} castShadow={shadow} />
      </group>
    </group>
  );
}
export function Rock({ position, s = 1, color = "#A8A2A8", v = 0, rot = 0, shadow = false }: { position: V3; s?: number | V3; color?: string; v?: number; rot?: number; shadow?: boolean }) {
  return <mesh geometry={G.rocks[v % 3]} material={M(color)} position={position} scale={s as any} rotation={[0, rot, 0]} castShadow={shadow} receiveShadow />;
}

export function Cloud({ position, s = 1, color = "#FFFFFF", speed = 0.3, range = 60, emissive = "#000000" }: { position: V3; s?: number; color?: string; speed?: number; range?: number; emissive?: string }) {
  const ref = useRef<THREE.Group>(null); const x0 = position[0];
  const parts = useMemo(() => { const r = rand(Math.round(x0 * 100 + position[1] * 7)); return Array.from({ length: 5 }, (_, i) => ({ p: [(i - 2) * 0.9 + (r() - 0.5) * 0.4, (r() - 0.3) * 0.5 + (i === 2 ? 0.4 : 0), (r() - 0.5) * 0.6] as V3, s: 0.7 + r() * 0.6 - Math.abs(i - 2) * 0.12 })); }, [x0, position]);
  useFrame((_, dt) => { const g = ref.current; if (!g) return; g.position.x += speed * dt; if (g.position.x > x0 + range / 2) g.position.x = x0 - range / 2; });
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color, emissive, flatShading: true, roughness: 1 }), [color, emissive]);
  return <group ref={ref} position={position} scale={s}>{parts.map((q, i) => <mesh key={i} geometry={G.blob} material={mat} position={q.p} scale={[q.s * 1.1, q.s * 0.75, q.s * 0.9]} />)}</group>;
}

/** Scatter helper: deterministic positions avoiding a keep-out circle. */
export function scatter(n: number, seed: number, fn: (r: () => number) => [number, number] | null) {
  const r = rand(seed); const out: [number, number, number][] = []; let guard = 0;
  while (out.length < n && guard++ < n * 30) { const p = fn(r); if (p) out.push([p[0], p[1], r()]); }
  return out;
}

export function Flowers({ points, colors, size = 0.09, y = 0, flat = 1 }: { points: V3[]; colors: string[]; size?: number; y?: number; flat?: number }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const m = ref.current; if (!m) return; const o = new THREE.Object3D(); const c = new THREE.Color();
    points.forEach((p, i) => { o.position.set(p[0], p[1] + y, p[2]); { const k = size * (0.7 + (i % 5) * 0.12); o.scale.set(k, k * flat, k); } o.rotation.set(flat < 1 ? 0 : i, i * 2, 0); o.updateMatrix(); m.setMatrixAt(i, o.matrix); m.setColorAt(i, c.set(colors[i % colors.length])); });
    m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [points, colors, size, y, flat]);
  return <instancedMesh ref={ref} args={[G.blob, undefined, points.length]}><meshStandardMaterial flatShading roughness={0.8} /></instancedMesh>;
}

export function Tufts({ points, color = "#5FA548", size = 0.25 }: { points: V3[]; color?: string; size?: number }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const m = ref.current; if (!m) return; const o = new THREE.Object3D(); const c = new THREE.Color();
    points.forEach((p, i) => { o.position.set(p[0], p[1] + size * 0.4, p[2]); o.scale.set(size * 0.5, size * (0.8 + (i % 4) * 0.25), size * 0.5); o.rotation.set(0, i, 0); o.updateMatrix(); m.setMatrixAt(i, o.matrix); m.setColorAt(i, c.set(color).offsetHSL(0, 0, ((i % 7) - 3) * 0.02)); });
    m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [points, color, size]);
  return <instancedMesh ref={ref} args={[G.cone6, undefined, points.length]}><meshStandardMaterial flatShading roughness={1} /></instancedMesh>;
}

// ---------- particles ----------
export function Sparkles({ count = 40, area = [10, 4, 10], center = [0, 2, 0], color = "#FFE58A", size = 0.25, speed = 0.4, additive = true }: { count?: number; area?: V3; center?: V3; color?: string; size?: number; speed?: number; additive?: boolean }) {
  const ref = useRef<THREE.Points>(null);
  const { geo, seeds } = useMemo(() => {
    const r = rand(count * 13); const pos = new Float32Array(count * 3); const sd = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) { sd[i * 3] = (r() - 0.5) * area[0]; sd[i * 3 + 1] = (r() - 0.5) * area[1]; sd[i * 3 + 2] = (r() - 0.5) * area[2]; }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); return { geo: g, seeds: sd };
  }, [count, area]);
  const mat = useMemo(() => new THREE.PointsMaterial({ color, size, map: glowTexture(), transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, sizeAttenuation: true }), [color, size, additive]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime * speed; const p = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < count; i++) { p.setXYZ(i, center[0] + seeds[i * 3] + Math.sin(t + i) * 0.4, center[1] + seeds[i * 3 + 1] + Math.sin(t * 1.3 + i * 2) * 0.3, center[2] + seeds[i * 3 + 2] + Math.cos(t + i * 0.7) * 0.4); }
    p.needsUpdate = true; mat.opacity = 0.75 + Math.sin(clock.elapsedTime * 2.2) * 0.2;
  });
  return <points ref={ref} geometry={geo} material={mat} />;
}

export function Leaves({ count = 30, area = [14, 8, 10], center = [0, 4, 0], colors = ["#E98A2E", "#F2B33D", "#C9562C"] }: { count?: number; area?: V3; center?: V3; colors?: string[] }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const st = useMemo(() => { const r = rand(99); return Array.from({ length: count }, () => ({ x: (r() - 0.5) * area[0], y: r() * area[1], z: (r() - 0.5) * area[2], s: 0.4 + r() * 0.6, ph: r() * 6 })); }, [count, area]);
  useEffect(() => { const m = ref.current; if (!m) return; const c = new THREE.Color(); st.forEach((_, i) => m.setColorAt(i, c.set(colors[i % colors.length]))); if (m.instanceColor) m.instanceColor.needsUpdate = true; }, [st, colors]);
  const o = useMemo(() => new THREE.Object3D(), []);
  useFrame(({ clock }, dt) => {
    const m = ref.current; if (!m) return; const t = clock.elapsedTime;
    st.forEach((l, i) => { l.y -= dt * 0.5 * l.s; if (l.y < 0) l.y = area[1]; o.position.set(center[0] + l.x + Math.sin(t * 0.8 + l.ph) * 0.8, center[1] - area[1] / 2 + l.y, center[2] + l.z); o.rotation.set(t * l.s + l.ph, t * 0.7, t * 0.5 * l.s); o.scale.setScalar(0.12); o.updateMatrix(); m.setMatrixAt(i, o.matrix); });
    m.instanceMatrix.needsUpdate = true;
  });
  return <instancedMesh ref={ref} args={[G.prism, undefined, count]}><meshStandardMaterial flatShading side={THREE.DoubleSide} /></instancedMesh>;
}

export function Butterfly({ center, radius = 2, color = "#F28C28", speed = 0.6, phase = 0, h = 1.5 }: { center: V3; radius?: number; color?: string; speed?: number; phase?: number; h?: number }) {
  const ref = useRef<THREE.Group>(null); const l = useRef<THREE.Mesh>(null); const r = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime * speed + phase; const g = ref.current; if (!g) return;
    g.position.set(center[0] + Math.cos(t) * radius, center[1] + h + Math.sin(t * 2.3) * 0.4, center[2] + Math.sin(t * 1.3) * radius * 0.7);
    g.rotation.y = -t + Math.PI / 2; const f = Math.sin(clock.elapsedTime * 16 + phase) * 0.9;
    if (l.current) l.current.rotation.z = f; if (r.current) r.current.rotation.z = -f;
  });
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide, flatShading: true }), [color]);
  return (
    <group ref={ref} scale={0.22}>
      <group ref={l}><mesh geometry={G.prism} material={mat} position={[0.5, 0, 0]} scale={[0.6, 0.02, 0.6]} /></group>
      <group ref={r}><mesh geometry={G.prism} material={mat} position={[-0.5, 0, 0]} scale={[0.6, 0.02, 0.6]} /></group>
      <mesh geometry={G.box} material={M("#2B2B2B")} scale={[0.12, 0.12, 0.7]} />
    </group>
  );
}

/** Little 3D music notes that float up from a speaker while music plays. */
export function Notes({ origin, color = "#FF7A59", playing }: { origin: V3; color?: string; playing: boolean }) {
  const refs = useRef<(THREE.Group | null)[]>([]);
  const mats = useMemo(() => Array.from({ length: 4 }, () => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0 })), [color]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    refs.current.forEach((g, i) => {
      if (!g) return; const k = ((t * 0.35 + i / 4) % 1);
      g.position.set(origin[0] + Math.sin(k * 6 + i) * 0.35 + k * 0.6, origin[1] + k * 1.8, origin[2] + Math.cos(k * 5 + i) * 0.2);
      g.rotation.z = Math.sin(t * 2 + i) * 0.3;
      mats[i].opacity = playing ? Math.sin(k * Math.PI) * 0.95 : Math.max(0, mats[i].opacity - 0.02);
    });
  });
  return <>{mats.map((m, i) => (
    <group key={i} ref={(el) => { refs.current[i] = el; }} scale={0.16}>
      <mesh geometry={G.sphere} material={m} scale={[0.75, 0.55, 0.4]} rotation={[0, 0, 0.4]} />
      <mesh geometry={G.box} material={m} position={[0.6, 1.3, 0]} scale={[0.14, 2.6, 0.14]} />
      {i % 2 === 0 && <mesh geometry={G.box} material={m} position={[0.95, 2.4, 0]} rotation={[0, 0, -0.6]} scale={[0.8, 0.16, 0.14]} />}
    </group>
  ))}</>;
}

// ---------- the artist's canvas, showing the real artwork ----------
export interface ArtSource { key: string; svg?: string | null; url?: string | null; fresh: boolean }
/** Draws the real generated artwork onto a CanvasTexture; a freshly generated piece is revealed brush-stroke by brush-stroke. */
export function useArtTexture(src: ArtSource | null, sketching: boolean) {
  const canvas = useMemo(() => { const c = document.createElement("canvas"); c.width = c.height = 512; return c; }, []);
  const tex = useMemo(() => { const t = new THREE.CanvasTexture(canvas); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }, [canvas]);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const reveal = useRef(1);
  useEffect(() => {
    if (!src) return;
    let url = src.url || ""; let revoke = "";
    if (src.svg) { url = URL.createObjectURL(new Blob([src.svg], { type: "image/svg+xml" })); revoke = url; }
    if (!url) return;
    const im = new Image(); im.crossOrigin = "anonymous";
    im.onload = () => { reveal.current = src.fresh ? 0 : 1; setImg(im); };
    im.src = url;
    return () => { if (revoke) setTimeout(() => URL.revokeObjectURL(revoke), 5000); };
  }, [src?.key]); // eslint-disable-line react-hooks/exhaustive-deps
  const draw = (k: number) => {
    const x = canvas.getContext("2d")!; const W = 512;
    x.fillStyle = "#FFF8EC"; x.fillRect(0, 0, W, W);
    if (!img) return;
    if (sketching) { x.globalAlpha = 0.18; x.filter = "grayscale(1)"; x.drawImage(img, 0, 0, W, W); x.filter = "none"; x.globalAlpha = 1; return; }
    if (k >= 1) { x.drawImage(img, 0, 0, W, W); return; }
    const N = 9, bh = W / N;
    x.save(); x.beginPath();
    for (let i = 0; i < N; i++) { const f = Math.max(0, Math.min(1, k * (N + 2) - i)); if (f <= 0) continue; const w = W * f; if (i % 2) x.rect(W - w, i * bh - 2, w, bh + 4); else x.rect(0, i * bh - 2, w, bh + 4); }
    x.clip(); x.drawImage(img, 0, 0, W, W); x.restore();
  };
  useEffect(() => { draw(reveal.current); tex.needsUpdate = true; }, [img, sketching]); // eslint-disable-line react-hooks/exhaustive-deps
  useFrame((_, dt) => { if (reveal.current < 1 && img && !sketching) { reveal.current = Math.min(1, reveal.current + dt / 2.4); draw(reveal.current); tex.needsUpdate = true; } });
  return tex;
}

export function Easel({ position, rotation = [0, 0, 0], art, sketching, wood = "#8A5A36", s = 1 }: { position: V3; rotation?: V3; art: ArtSource | null; sketching: boolean; wood?: string; s?: number }) {
  const tex = useArtTexture(art, sketching);
  const w = M(wood);
  return (
    <group position={position} rotation={rotation} scale={s}>
      <mesh geometry={G.box} material={w} position={[-0.45, 0.9, 0.15]} rotation={[-0.12, 0, 0.08]} scale={[0.07, 1.9, 0.07]} castShadow />
      <mesh geometry={G.box} material={w} position={[0.45, 0.9, 0.15]} rotation={[-0.12, 0, -0.08]} scale={[0.07, 1.9, 0.07]} castShadow />
      <mesh geometry={G.box} material={w} position={[0, 0.85, -0.35]} rotation={[0.35, 0, 0]} scale={[0.07, 1.8, 0.07]} castShadow />
      <mesh geometry={G.box} material={w} position={[0, 0.72, 0.1]} scale={[1.05, 0.08, 0.16]} />
      <mesh geometry={G.box} material={w} position={[0, 1.9, 0.02]} scale={[0.3, 0.12, 0.12]} />
      <group position={[0, 1.27, 0.12]} rotation={[-0.12, 0, 0]}>
        <mesh geometry={G.box} material={M("#F4EDE0")} scale={[1.02, 1.02, 0.06]} castShadow />
        <mesh position={[0, 0, 0.032]} scale={[0.96, 0.96, 1]}><planeGeometry /><meshBasicMaterial map={tex} toneMapped={false} /></mesh>
      </group>
    </group>
  );
}

/** A small arm that holds a brush and dabs at the canvas while the artist works. */
export function useDab(active: boolean, speed = 3) {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const g = ref.current; if (!g) return; const t = clock.elapsedTime;
    const a = active ? 1 : 0.25;
    g.rotation.x = 1.0 + Math.sin(t * speed) * 0.25 * a;
    g.rotation.z = Math.sin(t * speed * 0.5) * 0.3 * a;
  });
  return ref;
}

export function Brush({ color = "#D9534F", length = 0.55 }: { color?: string; length?: number }) {
  return (
    <group>
      <mesh geometry={G.cyl6} material={M("#C9A26B")} scale={[0.025, length, 0.025]} position={[0, -length / 2, 0]} />
      <mesh geometry={G.cone6} material={M(color)} scale={[0.04, 0.12, 0.04]} position={[0, -length - 0.04, 0]} rotation={[Math.PI, 0, 0]} />
    </group>
  );
}

// ---------- camera rig ----------
export function Rig({ base: wide, target: wideT, amount = [1.2, 0.5], drift = 0.25, narrow }: { base: V3; target: V3; amount?: [number, number]; drift?: number; narrow?: { base: V3; target: V3 } }) {
  const { camera, pointer, size } = useThree();
  const isNarrow = !!narrow && size.width / size.height < 0.95;
  const base = isNarrow ? narrow!.base : wide; const target = isNarrow ? narrow!.target : wideT;
  const v = useMemo(() => new THREE.Vector3(), []); const tg = useMemo(() => new THREE.Vector3(...target), [target]); // eslint-disable-line react-hooks/exhaustive-deps
  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime;
    v.set(base[0] + pointer.x * amount[0] + Math.sin(t * 0.15) * drift, base[1] + pointer.y * amount[1] + Math.sin(t * 0.2) * drift * 0.4, base[2]);
    camera.position.lerp(v, Math.min(1, dt * 2)); camera.lookAt(tg);
  });
  return null;
}

/** Cabin with a lit window and a puffing chimney. */
export function Cabin({ position, rotation = [0, 0, 0], s = 1, wall = "#9A6A43", roof = "#4A5A8C", lit = "#FFC86B", smoke = true, night = false }: { position: V3; rotation?: V3; s?: number; wall?: string; roof?: string; lit?: string; smoke?: boolean; night?: boolean }) {
  const puffs = useRef<(THREE.Mesh | null)[]>([]);
  useFrame(({ clock }) => { const t = clock.elapsedTime; puffs.current.forEach((m, i) => { if (!m) return; const k = (t * 0.25 + i / 4) % 1; m.position.set(0.55 + k * 0.4, 2.6 + k * 1.8, -0.3); m.scale.setScalar(0.15 + k * 0.3); (m.material as THREE.MeshStandardMaterial).opacity = (1 - k) * 0.7; }); });
  const win = useMemo(() => new THREE.MeshStandardMaterial({ color: lit, emissive: lit, emissiveIntensity: night ? 2.2 : 0.9, flatShading: true }), [lit, night]);
  const smokeMats = useMemo(() => Array.from({ length: 4 }, () => new THREE.MeshStandardMaterial({ color: "#EEEAE6", transparent: true, flatShading: true, depthWrite: false })), []);
  return (
    <group position={position} rotation={rotation} scale={s}>
      <mesh geometry={G.box} material={M(wall)} position={[0, 0.75, 0]} scale={[2.2, 1.5, 1.7]} castShadow receiveShadow />
      <mesh geometry={G.prism} material={M(roof)} position={[0, 1.95, 0]} rotation={[0, 0, Math.PI / 2]} scale={[0.95, 2.5, 1.25]} castShadow />
      <mesh geometry={G.box} material={M("#7D7A78")} position={[0.6, 2.2, -0.3]} scale={[0.3, 0.8, 0.3]} castShadow />
      <mesh geometry={G.box} material={win} position={[-0.5, 0.85, 0.86]} scale={[0.45, 0.45, 0.02]} />
      <mesh geometry={G.box} material={win} position={[0.55, 0.85, 0.86]} scale={[0.45, 0.45, 0.02]} />
      <mesh geometry={G.box} material={M("#5A3C27")} position={[0, 0.45, 0.86]} scale={[0.4, 0.9, 0.02]} />
      <mesh geometry={G.box} material={win} position={[1.11, 0.85, 0]} scale={[0.02, 0.45, 0.45]} />
      <mesh geometry={G.box} material={M("#7A5236")} position={[0, 0.06, 1.2]} scale={[2.4, 0.12, 0.8]} receiveShadow />
      {smoke && smokeMats.map((m, i) => <mesh key={i} ref={(el) => { puffs.current[i] = el; }} geometry={G.blob} material={m} />)}
    </group>
  );
}

export function RecordPlayer({ position, rotation = [0, 0, 0], s = 1, playing }: { position: V3; rotation?: V3; s?: number; playing: boolean }) {
  const disc = useRef<THREE.Mesh>(null);
  useFrame((_, dt) => { if (disc.current && playing) disc.current.rotation.y += dt * 3.5; });
  return (
    <group position={position} rotation={rotation} scale={s}>
      <mesh geometry={G.box} material={M("#8B5A3C")} position={[0, 0.18, 0]} scale={[1.1, 0.36, 0.9]} castShadow />
      <mesh geometry={G.box} material={M("#6E4630")} position={[0, 0.37, 0]} scale={[1.04, 0.02, 0.84]} />
      <mesh ref={disc} geometry={G.cyl12} material={M("#1E1E22", { roughness: 0.4 })} position={[-0.1, 0.4, 0]} scale={[0.36, 0.02, 0.36]}>
        <mesh geometry={G.cyl12} material={M("#E04848")} scale={[0.35, 1.2, 0.35]} />
      </mesh>
      <mesh geometry={G.box} material={M("#D9D3C8", { metalness: 0.5 })} position={[0.3, 0.43, 0.05]} rotation={[0, 0.5, 0]} scale={[0.04, 0.04, 0.5]} />
    </group>
  );
}
