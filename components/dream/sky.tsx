"use client";
/* eslint-disable react-hooks/immutability -- three.js objects are mutated per frame by design */
// A full day on the island, shared by the whole scene: one controller writes SKY each frame, everyone else reads it.
// dawn → bright day → golden hour → pink sunset → night (pink-to-soft-purple sky, stars, moon) → dawn. ~4 minutes.
import * as THREE from "three";
import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { glowTexture, rand } from "../scenes/kit";

const c = (h: string) => new THREE.Color(h);
interface Key { at: number; top: THREE.Color; mid: THREE.Color; hor: THREE.Color; low: THREE.Color; key: THREE.Color; keyI: number; hemiS: THREE.Color; hemiG: THREE.Color; hemiI: number; fog: THREE.Color; water: THREE.Color; sun: THREE.Color; dusk: number; night: number }
const K = (at: number, top: string, mid: string, hor: string, low: string, key: string, keyI: number, hemiS: string, hemiG: string, hemiI: number, fog: string, water: string, sun: string, dusk: number, night: number): Key =>
  ({ at, top: c(top), mid: c(mid), hor: c(hor), low: c(low), key: c(key), keyI, hemiS: c(hemiS), hemiG: c(hemiG), hemiI, fog: c(fog), water: c(water), sun: c(sun), dusk, night });
// phase 0..1 over one day. The sun rises at 0.04 and sets at 0.66.
const KEYS: Key[] = [
  K(0.00, "#3E4C7A", "#C98BA6", "#FFC2A0", "#E6B4A4", "#FFC6A0", 0.7, "#C9B8D8", "#4A4038", 0.5, "#E8C0B4", "#E8D2D8", "#FFB08A", 0.55, 0.25), // dawn
  K(0.08, "#6FA6DA", "#B9D6EE", "#FFE4CC", "#F2DCCC", "#FFE2C0", 1.7, "#D6E6FA", "#6E6A44", 0.8, "#E9E4DC", "#FFFFFF", "#FFF0D2", 0.15, 0),     // morning
  K(0.20, "#3F8EDA", "#8EC4EE", "#DCEEFA", "#C6DDEE", "#FFF4E2", 2.3, "#DCEBFF", "#748048", 0.95, "#D4E6F2", "#FFFFFF", "#FFFBEA", 0, 0),       // bright day
  K(0.45, "#4A93D8", "#98C8EC", "#EAEEE4", "#D2DEE4", "#FFF0D8", 2.2, "#DCEBFF", "#748048", 0.9, "#DCE4E6", "#FFFFFF", "#FFF6E0", 0, 0),        // afternoon
  K(0.56, "#4F7FB8", "#E8B887", "#FFCC8A", "#F0B890", "#FFC890", 1.7, "#F4D2B4", "#5C5034", 0.7, "#F0D2B0", "#FFE6CC", "#FFB060", 0.45, 0),     // golden hour
  K(0.64, "#4A5A92", "#F08AA0", "#FF9C84", "#E88A8A", "#FF9A8A", 1.0, "#F2A8B8", "#4A3438", 0.55, "#E8A0A4", "#FFC4C8", "#FF7A6A", 0.85, 0.1), // pink sunset
  K(0.71, "#2E2E66", "#9C6AA8", "#E890A8", "#A86A8A", "#C8A0D0", 0.35, "#A890C8", "#2E2638", 0.38, "#7A6290", "#C0A8D8", "#E88AA0", 1, 0.6),    // dusk: pink → soft purple
  K(0.80, "#161A40", "#3E3270", "#7A5C98", "#4A3A6A", "#B8B8F0", 0.32, "#6E6AA8", "#1E1C2C", 0.3, "#3A3460", "#9AA0D8", "#C8C8FF", 1, 1),       // night
  K(0.93, "#1C2048", "#4A3A78", "#8A68A0", "#56426E", "#B8B8F0", 0.3, "#7470AC", "#201E2E", 0.3, "#42386A", "#A0A4DC", "#C8C8FF", 1, 1),        // late night
  K(1.00, "#3E4C7A", "#C98BA6", "#FFC2A0", "#E6B4A4", "#FFC6A0", 0.7, "#C9B8D8", "#4A4038", 0.5, "#E8C0B4", "#E8D2D8", "#FFB08A", 0.55, 0.25),
];
const PERIOD = 240; // seconds per day
const RISE = 0.04, SET = 0.66;

/** Live sky state. p = warm/dusk amount (0..1), night = 0..1, phase = 0..1 time of day. */
export const SKY = {
  p: 0, night: 0, phase: 0.3, day: 1,
  mid: KEYS[2].mid.clone(), top: KEYS[2].top.clone(), hor: KEYS[2].hor.clone(), low: KEYS[2].low.clone(), fog: KEYS[2].fog.clone(), water: KEYS[2].water.clone(), sun: KEYS[2].sun.clone(),
  sunDir: new THREE.Vector3(0.45, 0.6, -0.6).normalize(), moonDir: new THREE.Vector3(-0.4, 0.6, -0.7).normalize(),
  /** Jump (fast-forward smoothly) to a time of day. */
  want: null as number | null,
};
export const jumpTo = (phase: number) => { SKY.want = phase; };
export const DAY_PHASE = 0.3, NIGHT_PHASE = 0.82;

function sample(phase: number, out: Key) {
  let i = 0; while (i < KEYS.length - 2 && KEYS[i + 1].at <= phase) i++;
  const a = KEYS[i], b = KEYS[i + 1]; let k = (phase - a.at) / (b.at - a.at); k = k * k * (3 - 2 * k);
  for (const f of ["top", "mid", "hor", "low", "key", "hemiS", "hemiG", "fog", "water", "sun"] as const) out[f].lerpColors(a[f], b[f], k);
  out.keyI = a.keyI + (b.keyI - a.keyI) * k; out.hemiI = a.hemiI + (b.hemiI - a.hemiI) * k; out.dusk = a.dusk + (b.dusk - a.dusk) * k; out.night = a.night + (b.night - a.night) * k;
}

export function SkyController({ lite }: { lite: boolean }) {
  const { scene, camera } = useThree();
  const key = useRef<THREE.DirectionalLight>(null); const hemi = useRef<THREE.HemisphereLight>(null); const amb = useRef<THREE.AmbientLight>(null);
  const pin = useMemo(() => {
    if (typeof location === "undefined") return null; const q = new URLSearchParams(location.search);
    if (q.get("time") != null) return ((Number(q.get("time")) % 1) + 1) % 1;
    if (q.get("night") === "1") return NIGHT_PHASE;
    if (q.get("dusk") != null) return 0.56 + Math.max(0, Math.min(1, Number(q.get("dusk")))) * 0.1;
    return null;
  }, []);
  const fog = useMemo(() => new THREE.Fog(KEYS[2].fog.clone(), 40, 110), []);
  const cur = useMemo(() => ({ ...KEYS[2], top: c("#000"), mid: c("#000"), hor: c("#000"), low: c("#000"), key: c("#000"), hemiS: c("#000"), hemiG: c("#000"), fog: c("#000"), water: c("#000"), sun: c("#000") }), []);
  const ph = useRef(pin ?? DAY_PHASE);
  useEffect(() => { scene.fog = fog; return () => { scene.fog = null; }; }, [scene, fog]);
  // the page's sun/moon toggle talks to the scene through a window event, so the UI bundle never imports three.js
  useEffect(() => { const on = (e: Event) => jumpTo((e as CustomEvent<string>).detail === "night" ? NIGHT_PHASE : DAY_PHASE); window.addEventListener("ao-time", on); return () => window.removeEventListener("ao-time", on); }, []);
  useFrame((_, dt) => {
    const d = Math.min(dt, 0.1);
    if (SKY.want != null) {
      // fast-forward (always forward in time, like a time-lapse) until we reach the wanted phase
      let gap = SKY.want - ph.current; if (gap < 0) gap += 1;
      const step = Math.max(0.02, Math.min(0.35, gap * 1.2)) * d;
      if (gap <= step || gap < 0.002) { ph.current = SKY.want; SKY.want = null; } else ph.current = (ph.current + step) % 1;
    } else if (pin == null) ph.current = (ph.current + d / PERIOD) % 1;
    const phase = ph.current; SKY.phase = phase;
    sample(phase, cur);
    SKY.p = cur.dusk; SKY.night = cur.night;
    SKY.top.copy(cur.top); SKY.mid.copy(cur.mid); SKY.hor.copy(cur.hor); SKY.low.copy(cur.low); SKY.fog.copy(cur.fog); SKY.water.copy(cur.water); SKY.sun.copy(cur.sun);
    // sun arc from sunrise (east, +x) over the south-back to sunset (west), moon on the opposite arc
    const sa = ((phase - RISE) / (SET - RISE)) * Math.PI; const ma = (((phase - SET + 1) % 1) / (1 - (SET - RISE))) * Math.PI;
    SKY.sunDir.set(Math.cos(sa) * 0.85, Math.sin(sa) * 0.8 + 0.03, -0.55).normalize();
    SKY.moonDir.set(Math.cos(ma) * 0.8, Math.sin(ma) * 0.7 + 0.08, -0.6).normalize();
    SKY.day = Math.max(0, Math.min(1, SKY.sunDir.y * 6));
    if (key.current) {
      key.current.color.copy(cur.key); key.current.intensity = cur.keyI;
      // the key light comes from the sun by day and from the moon by night
      const dir = SKY.day > 0.05 ? SKY.sunDir : SKY.moonDir; key.current.position.copy(dir).multiplyScalar(40); key.current.position.y = Math.max(key.current.position.y, 6);
    }
    if (hemi.current) { hemi.current.color.copy(cur.hemiS); hemi.current.groundColor.copy(cur.hemiG); hemi.current.intensity = cur.hemiI; }
    if (amb.current) amb.current.intensity = 0.08 + SKY.night * 0.12;
    fog.color.copy(SKY.fog); const dd = camera.position.length(); fog.near = dd * 1.5 + 14; fog.far = dd * 3.6 + 90;
  }, -1);
  return (
    <>
      <hemisphereLight ref={hemi} args={["#DCEBFF", "#748048", 0.9]} />
      <directionalLight ref={key} position={[-10, 18, 12]} intensity={2} castShadow={!lite}
        shadow-mapSize={[2048, 2048]} shadow-bias={-0.0003} shadow-normalBias={0.03} shadow-radius={4}
        shadow-camera-left={-20} shadow-camera-right={20} shadow-camera-top={20} shadow-camera-bottom={-20} shadow-camera-far={90} />
      <ambientLight ref={amb} intensity={0.08} color="#E8E0FF" />
    </>
  );
}

export function SkyDome() {
  const mat = useMemo(() => new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uMid: { value: new THREE.Color() }, uTop: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uLow: { value: new THREE.Color() }, uSun: { value: new THREE.Color() }, uSunDir: { value: new THREE.Vector3() }, uP: { value: 0 }, uDay: { value: 1 } },
    vertexShader: `varying vec3 vD; void main(){ vD = normalize(position); vec4 p = projectionMatrix*modelViewMatrix*vec4(position,1.0); gl_Position = p.xyww; }`,
    fragmentShader: `uniform vec3 uMid,uTop,uHor,uLow,uSun,uSunDir; uniform float uP, uDay; varying vec3 vD;
      void main(){ float y = vD.y;
        vec3 col = y > 0.0 ? (y < 0.2 ? mix(uHor, uMid, smoothstep(0.0, 0.2, y)) : mix(uMid, uTop, smoothstep(0.2, 0.75, y))) : mix(uHor, uLow, smoothstep(0.0, -0.35, y));
        float s = max(dot(normalize(vD), normalize(uSunDir)), 0.0);
        col += uSun * (pow(s, 1200.0) * 2.5 + pow(s, 32.0) * 0.35 + pow(s, 5.0) * 0.12 * (0.3 + uP)) * uDay;
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }), []);
  useFrame(() => { const u = mat.uniforms; u.uMid.value.copy(SKY.mid); u.uTop.value.copy(SKY.top); u.uHor.value.copy(SKY.hor); u.uLow.value.copy(SKY.low); u.uSun.value.copy(SKY.sun); u.uSunDir.value.copy(SKY.sunDir); u.uP.value = SKY.p; u.uDay.value = SKY.day; });
  return <mesh material={mat} renderOrder={-10} frustumCulled={false}><sphereGeometry args={[200, 32, 20]} /></mesh>;
}

/** Stars that come out at night (with a slow, gentle twinkle). */
export function Stars({ count = 220 }: { count?: number }) {
  const { geo, mat } = useMemo(() => {
    const r = rand(91); const pos: number[] = [], sz: number[] = [];
    for (let i = 0; i < count; i++) { const a = r() * Math.PI * 2, y = 0.12 + r() * 0.88; const k = Math.sqrt(1 - y * y); pos.push(Math.cos(a) * k * 180, y * 180, Math.sin(a) * k * 180); sz.push(r()); }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("sz", new THREE.Float32BufferAttribute(sz, 1));
    const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending, uniforms: { uA: { value: 0 }, uT: { value: 0 } },
      vertexShader: `attribute float sz; uniform float uT; varying float vA; void main(){ vec4 mv = modelViewMatrix*vec4(position,1.0); gl_Position = projectionMatrix*mv; vA = 0.6 + 0.4*sin(uT*0.8 + sz*40.0); gl_PointSize = 1.5 + sz*2.2; }`,
      fragmentShader: `uniform float uA; varying float vA; void main(){ float d = length(gl_PointCoord-0.5); float a = smoothstep(0.5, 0.0, d); gl_FragColor = vec4(vec3(1.0,0.96,0.92), a*uA*vA); }` });
    return { geo: g, mat: m };
  }, [count]);
  useFrame(({ clock }) => { mat.uniforms.uA.value = Math.max(0, (SKY.night - 0.3) / 0.7); mat.uniforms.uT.value = clock.elapsedTime; });
  return <points geometry={geo} material={mat} frustumCulled={false} renderOrder={-9} />;
}

/** Sun disc + glow, and the moon at night. */
export function SunGlow() {
  const sun = useRef<THREE.Sprite>(null); const halo = useRef<THREE.Sprite>(null); const moon = useRef<THREE.Mesh>(null); const mhalo = useRef<THREE.Sprite>(null);
  const m1 = useMemo(() => new THREE.SpriteMaterial({ map: glowTexture(), transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending, opacity: 0.5 }), []);
  const m2 = useMemo(() => new THREE.SpriteMaterial({ map: glowTexture(), transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending, opacity: 0.3 }), []);
  const m3 = useMemo(() => new THREE.SpriteMaterial({ map: glowTexture(), transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending, opacity: 0, color: "#E8DEFF" }), []);
  const mm = useMemo(() => new THREE.MeshBasicMaterial({ color: "#FFF6EC", transparent: true, opacity: 0, fog: false, depthWrite: false }), []);
  useFrame(({ camera }) => {
    if (sun.current) { sun.current.position.copy(SKY.sunDir).multiplyScalar(150).add(camera.position); m1.color.copy(SKY.sun); m1.opacity = 0.5 * SKY.day; }
    if (halo.current) { halo.current.position.copy(SKY.sunDir).multiplyScalar(150).add(camera.position); m2.color.copy(SKY.sun); m2.opacity = (0.2 + SKY.p * 0.3) * SKY.day; }
    const mo = Math.max(0, (SKY.night - 0.2) / 0.8);
    if (moon.current) { moon.current.position.copy(SKY.moonDir).multiplyScalar(160).add(camera.position); moon.current.lookAt(camera.position); mm.opacity = mo; }
    if (mhalo.current) { mhalo.current.position.copy(SKY.moonDir).multiplyScalar(159).add(camera.position); m3.opacity = mo * 0.35; }
  });
  return (
    <>
      <sprite ref={sun} material={m1} scale={[26, 26, 1]} renderOrder={-9} />
      <sprite ref={halo} material={m2} scale={[140, 64, 1]} renderOrder={-9} />
      <sprite ref={mhalo} material={m3} scale={[40, 40, 1]} renderOrder={-9} />
      <mesh ref={moon} material={mm} renderOrder={-8}><circleGeometry args={[4.2, 40]} /></mesh>
    </>
  );
}
