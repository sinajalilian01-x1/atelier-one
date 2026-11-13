"use client";
/* eslint-disable react-hooks/immutability -- three.js objects are mutated per frame by design */
// Day → dusk cycle shared by the whole dream island: one controller writes SKY each frame, everyone else reads it.
import * as THREE from "three";
import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { glowTexture, rand } from "../scenes/kit";

const c = (h: string) => new THREE.Color(h);
const DAY = { mid: c("#A8CDEA"), top: c("#5FA3DC"), hor: c("#FFE6C8"), low: c("#F3DDCC"), key: c("#FFE6C4"), keyI: 2.1, rim: c("#FFE0B0"), rimI: 0.9, hemiS: c("#D4E6FF"), hemiG: c("#6E6A3A"), hemiI: 0.85, fog: c("#E6E2DA"), water: c("#FFFFFF"), sun: c("#FFF2D6"), elev: 0.55 };
const DUSK = { mid: c("#E9A46E"), top: c("#173A4C"), hor: c("#FF9A52"), low: c("#B9603C"), key: c("#FFA868"), keyI: 0.95, rim: c("#FF8A3C"), rimI: 2.4, hemiS: c("#FFA878"), hemiG: c("#342416"), hemiI: 0.45, fog: c("#D98258"), water: c("#FFC9A6"), sun: c("#FF8030"), elev: 0.04 };

/** p: 0 = soft daylight, 1 = warm dusk. Colours are live THREE.Color objects. */
export const SKY = {
  p: 0, mid: DAY.mid.clone(), top: DAY.top.clone(), hor: DAY.hor.clone(), low: DAY.low.clone(), fog: DAY.fog.clone(), water: DAY.water.clone(), sun: DAY.sun.clone(), sunDir: new THREE.Vector3(0.45, 0.5, -0.9).normalize(),
};
const PERIOD = 150; // seconds for a full day → dusk → day swing

export function SkyController({ lite }: { lite: boolean }) {
  const { scene, camera } = useThree();
  const key = useRef<THREE.DirectionalLight>(null); const rim = useRef<THREE.DirectionalLight>(null); const hemi = useRef<THREE.HemisphereLight>(null);
  const pin = useMemo(() => { const v = typeof location !== "undefined" ? new URLSearchParams(location.search).get("dusk") : null; return v == null ? null : Math.max(0, Math.min(1, Number(v))); }, []);
  const fog = useMemo(() => new THREE.Fog(DAY.fog.clone(), 30, 80), []);
  useEffect(() => { scene.fog = fog; return () => { scene.fog = null; }; }, [scene, fog]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime + PERIOD * 0.18; // open on a golden afternoon
    const p = pin ?? 0.5 - 0.5 * Math.cos((t / PERIOD) * Math.PI * 2);
    const e = p * p * (3 - 2 * p); SKY.p = e;
    SKY.top.lerpColors(DAY.top, DUSK.top, e); SKY.mid.lerpColors(DAY.mid, DUSK.mid, e); SKY.hor.lerpColors(DAY.hor, DUSK.hor, e); SKY.low.lerpColors(DAY.low, DUSK.low, e);
    SKY.fog.lerpColors(DAY.fog, DUSK.fog, e); SKY.water.lerpColors(DAY.water, DUSK.water, e); SKY.sun.lerpColors(DAY.sun, DUSK.sun, e);
    const el = DAY.elev + (DUSK.elev - DAY.elev) * e; SKY.sunDir.set(0.5 * Math.cos(el), Math.sin(el), -0.86 * Math.cos(el)).normalize();
    if (key.current) { key.current.color.lerpColors(DAY.key, DUSK.key, e); key.current.intensity = DAY.keyI + (DUSK.keyI - DAY.keyI) * e; }
    if (rim.current) { rim.current.color.lerpColors(DAY.rim, DUSK.rim, e); rim.current.intensity = DAY.rimI + (DUSK.rimI - DAY.rimI) * e; rim.current.position.copy(SKY.sunDir).multiplyScalar(30); }
    if (hemi.current) { hemi.current.color.lerpColors(DAY.hemiS, DUSK.hemiS, e); hemi.current.groundColor.lerpColors(DAY.hemiG, DUSK.hemiG, e); hemi.current.intensity = DAY.hemiI + (DUSK.hemiI - DAY.hemiI) * e; }
    // fog follows the camera distance so the close view gets haze and the wide shot stays crisp
    fog.color.copy(SKY.fog); const d = camera.position.length(); fog.near = d * 1.4 + 12; fog.far = d * 3.5 + 70;
  }, -1);
  return (
    <>
      <hemisphereLight ref={hemi} args={["#D4E6FF", "#6E6A3A", 0.85]} />
      <directionalLight ref={key} position={[-8, 13, 9]} intensity={2} castShadow={!lite}
        shadow-mapSize={[2048, 2048]} shadow-bias={-0.0004} shadow-normalBias={0.02} shadow-camera-left={-13} shadow-camera-right={13} shadow-camera-top={13} shadow-camera-bottom={-13} shadow-camera-far={60} />
      <directionalLight ref={rim} position={[12, 14, -25]} intensity={1} />
      <ambientLight intensity={0.1} color="#FFE2C0" />
    </>
  );
}

export function SkyDome() {
  const mat = useMemo(() => new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uMid: { value: new THREE.Color() }, uTop: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uLow: { value: new THREE.Color() }, uSun: { value: new THREE.Color() }, uSunDir: { value: new THREE.Vector3() }, uP: { value: 0 } },
    vertexShader: `varying vec3 vD; void main(){ vD = normalize(position); vec4 p = projectionMatrix*modelViewMatrix*vec4(position,1.0); gl_Position = p.xyww; }`,
    fragmentShader: `uniform vec3 uMid,uTop,uHor,uLow,uSun,uSunDir; uniform float uP; varying vec3 vD;
      void main(){ float y = vD.y;
        vec3 col = y > 0.0 ? (y < 0.18 ? mix(uHor, uMid, smoothstep(0.0, 0.18, y)) : mix(uMid, uTop, pow(smoothstep(0.18, 0.7, y), 0.8))) : mix(uHor, uLow, smoothstep(0.0, -0.35, y));
        float s = max(dot(normalize(vD), normalize(uSunDir)), 0.0);
        col += uSun * (pow(s, 900.0) * 3.0 + pow(s, 24.0) * 0.45 + pow(s, 4.0) * 0.12 * (0.4 + uP));
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }), []);
  useFrame(() => { const u = mat.uniforms; u.uMid.value.copy(SKY.mid); u.uTop.value.copy(SKY.top); u.uHor.value.copy(SKY.hor); u.uLow.value.copy(SKY.low); u.uSun.value.copy(SKY.sun); u.uSunDir.value.copy(SKY.sunDir); u.uP.value = SKY.p; });
  return <mesh material={mat} renderOrder={-10} frustumCulled={false}><sphereGeometry args={[200, 32, 20]} /></mesh>;
}

/** A few stars that fade in as dusk deepens. */
export function Stars({ count = 160 }: { count?: number }) {
  const { geo, mat } = useMemo(() => {
    const r = rand(91); const pos: number[] = [];
    for (let i = 0; i < count; i++) { const a = r() * Math.PI * 2, y = 0.25 + r() * 0.75; const k = Math.sqrt(1 - y * y); pos.push(Math.cos(a) * k * 180, y * 180, Math.sin(a) * k * 180); }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    return { geo: g, mat: new THREE.PointsMaterial({ size: 1.4, map: glowTexture(), color: "#FFF1DA", transparent: true, opacity: 0, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }) };
  }, [count]);
  useFrame(({ clock }) => { mat.opacity = Math.max(0, (SKY.p - 0.55) / 0.45) * (0.75 + Math.sin(clock.elapsedTime * 1.3) * 0.1); });
  return <points geometry={geo} material={mat} frustumCulled={false} />;
}

/** The visible sun disc + glow, sinking towards the horizon behind the cabin. */
export function SunGlow() {
  const ref = useRef<THREE.Sprite>(null); const ref2 = useRef<THREE.Sprite>(null);
  const m1 = useMemo(() => new THREE.SpriteMaterial({ map: glowTexture(), transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending, opacity: 0.55 }), []);
  const m2 = useMemo(() => new THREE.SpriteMaterial({ map: glowTexture(), transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending, opacity: 0.35 }), []);
  useFrame(({ camera }) => {
    if (ref.current) { ref.current.position.copy(SKY.sunDir).multiplyScalar(150).add(camera.position); m1.color.copy(SKY.sun); }
    if (ref2.current) { ref2.current.position.copy(SKY.sunDir).multiplyScalar(150).add(camera.position); m2.color.copy(SKY.sun); m2.opacity = 0.25 + SKY.p * 0.35; }
  });
  return <><sprite ref={ref} material={m1} scale={[30, 30, 1]} renderOrder={-9} /><sprite ref={ref2} material={m2} scale={[150, 70, 1]} renderOrder={-9} /></>;
}
