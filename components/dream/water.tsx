"use client";
/* eslint-disable react-hooks/immutability -- three.js objects are mutated per frame by design */
// Running water for the dream island, all shader-driven (no textures): flowing streams with foam and streaks,
// a rippling spring pond, waterfalls that pour off the rim, and GPU particle spray + mist.
import * as THREE from "three";
import { useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { rand } from "../scenes/kit";
import { POND, POND_R, STREAMS, groundH } from "./island";
import { SKY } from "./sky";

const NOISE = `
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(hash(i), hash(i+vec2(1.0,0.0)), f.x), mix(hash(i+vec2(0.0,1.0)), hash(i+vec2(1.0,1.0)), f.x), f.y); }`;

/** mode 0 = stream, 1 = waterfall, 2 = pond */
function waterMaterial(mode: 0 | 1 | 2) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: mode !== 1, side: THREE.DoubleSide, fog: true,
    uniforms: { ...THREE.UniformsLib.fog, uTime: { value: 0 }, uLight: { value: new THREE.Color(1, 1, 1) }, uSky: { value: new THREE.Color() },
      uDeep: { value: new THREE.Color("#0F4E78") }, uShallow: { value: new THREE.Color("#2E95BE") }, uFoam: { value: new THREE.Color("#F4FBFF") } },
    vertexShader: `attribute vec3 flow; varying vec3 vFlow; varying vec3 vW;
      #include <fog_pars_vertex>
      void main(){ vFlow = flow; vec4 wp = modelMatrix*vec4(position,1.0); vW = wp.xyz; vec4 mvPosition = viewMatrix*wp; gl_Position = projectionMatrix*mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `uniform float uTime; uniform vec3 uLight, uSky, uDeep, uShallow, uFoam; varying vec3 vFlow; varying vec3 vW;
      #include <fog_pars_fragment>
      ${NOISE}
      void main(){
        float u = vFlow.x, v = vFlow.y, f = vFlow.z; vec3 col; float a;
        #if ${mode} == 0
          float edge = abs(u - 0.5) * 2.0;
          float n = vnoise(vec2(u*3.0, v*0.7 - uTime*0.55));
          float s1 = vnoise(vec2(u*9.0 + n*2.5, v*2.0 - uTime*1.35));
          float s2 = vnoise(vec2(u*17.0 - n*2.0, v*4.2 - uTime*2.1));
          float streak = smoothstep(0.7, 0.92, s1)*0.4 + smoothstep(0.78, 0.94, s2)*0.4;
          float foam = smoothstep(0.8, 1.0, edge + (n - 0.5)*0.3 + (s2 - 0.5)*0.12);
          float rip = smoothstep(0.85, 1.0, sin((v*3.2 - uTime*2.4) + n*6.0)) * (1.0 - edge) * 0.25;
          col = mix(uShallow, uDeep, (1.0 - edge*edge) * (0.7 + n*0.3));
          col = mix(col, uSky, 0.08 + n*0.08);
          col = mix(col, uFoam, clamp(streak*0.5 + foam*0.8 + rip, 0.0, 1.0));
          a = mix(0.9, 1.0, foam) * smoothstep(1.02, 0.92, edge);
        #elif ${mode} == 1
          float edge = abs(u - 0.5) * 2.0;
          float n = vnoise(vec2(u*5.0, v*0.45 - uTime*2.4));
          float s = vnoise(vec2(u*15.0 + n*3.0, v*1.1 - uTime*5.2));
          float s2 = vnoise(vec2(u*31.0 - n*2.0, v*2.6 - uTime*7.5));
          float white = smoothstep(0.35, 0.85, s)*0.75 + smoothstep(0.6, 0.95, s2)*0.5 + smoothstep(0.0, 0.5, f)*0.35 + (1.0 - smoothstep(0.0, 0.06, f))*0.6;
          col = mix(mix(uShallow, uSky, 0.25), uFoam, clamp(white, 0.0, 1.0));
          a = (1.0 - smoothstep(0.55, 1.0, f)) * smoothstep(1.0, 0.55, edge + (n - 0.5)*0.5) * (0.62 + 0.38*s);
        #else
          float r = length(vec2(u, v)); float n = vnoise(vec2(u, v)*2.2 + uTime*0.15);
          float ring = smoothstep(0.82, 1.0, sin(r*9.0 - uTime*2.0 + n*2.0)) * smoothstep(1.0, 0.1, r) * 0.55;
          float lip = smoothstep(0.82, 1.0, r + (n - 0.5)*0.15);
          col = mix(uShallow, uDeep, smoothstep(1.0, 0.0, r)*0.8);
          col = mix(col, uSky, 0.22 + n*0.1);
          col = mix(col, uFoam, clamp(ring + lip*0.8, 0.0, 1.0));
          a = 0.94 * smoothstep(1.02, 0.94, r);
        #endif
        gl_FragColor = vec4(col * uLight, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
}

/** Water surface height: follows the stream bed so it runs downhill to the lip. */
const wy = (x: number, z: number) => groundH(x, z) + 0.15;

function buildStream(pts: [number, number][], w: (i: number) => number, step: number) {
  const pos: number[] = [], flow: number[] = [], idx: number[] = []; let dist = 0; const K = 6; const sel: number[] = [];
  for (let i = 0; i < pts.length; i += step) sel.push(i); if (sel[sel.length - 1] !== pts.length - 1) sel.push(pts.length - 1);
  sel.forEach((i, s) => {
    const [x, z] = pts[i]; const n = pts[Math.min(pts.length - 1, i + 1)], pv = pts[Math.max(0, i - 1)];
    const dx = n[0] - pv[0], dz = n[1] - pv[1], L = Math.hypot(dx, dz) || 1; const nx = -dz / L, nz = dx / L; const ww = w(i) + 0.12;
    if (s > 0) { const q = pts[sel[s - 1]]; dist += Math.hypot(x - q[0], z - q[1]); }
    const y = wy(x, z);
    for (let k = 0; k <= K; k++) { const t = k / K - 0.5; pos.push(x + nx * ww * 2 * t, y, z + nz * ww * 2 * t); flow.push(k / K, dist, 0); }
    if (s < sel.length - 1) for (let k = 0; k < K; k++) { const a = s * (K + 1) + k, b = a + K + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
  });
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("flow", new THREE.Float32BufferAttribute(flow, 3)); g.setIndex(idx);
  return { g, dist };
}

/** Lip geometry for each stream: where it leaves the island, which way it flows, and how wide it is. */
export function lips() {
  return STREAMS.map((s) => {
    const n = s.pts.length; const [x, z] = s.pts[n - 1]; const [px, pz] = s.pts[n - 4];
    const dir = new THREE.Vector3(x - px, 0, z - pz).normalize(); const side = new THREE.Vector3(-dir.z, 0, dir.x);
    return { p: new THREE.Vector3(x, wy(x, z), z), dir, side, w: s.w(n - 1) + 0.12 };
  });
}
const G = 9.8, T_END = 1.62, V0 = 1.5;
/** Point on a waterfall curtain: t in 0..1 down the fall, s in -1..1 across it. */
export function fallPoint(l: ReturnType<typeof lips>[number], t: number, s: number, out = new THREE.Vector3()) {
  const tau = t * T_END; const w = l.w * (1 + t * 0.7);
  return out.copy(l.p).addScaledVector(l.dir, V0 * tau + 0.05).addScaledVector(l.side, s * w).setY(l.p.y - 0.5 * G * tau * tau);
}
function buildFall(l: ReturnType<typeof lips>[number], vStart: number) {
  const M = 44, K = 6; const pos: number[] = [], flow: number[] = [], idx: number[] = []; const v = new THREE.Vector3(); let dist = vStart, prev: THREE.Vector3 | null = null;
  for (let r = 0; r <= M; r++) {
    const t = Math.pow(r / M, 1.25); fallPoint(l, t, 0, v); if (prev) dist += v.distanceTo(prev); prev = v.clone();
    for (let k = 0; k <= K; k++) { fallPoint(l, t, k / K * 2 - 1, v); pos.push(v.x, v.y, v.z); flow.push(k / K, dist, t); }
    if (r < M) for (let k = 0; k < K; k++) { const a = r * (K + 1) + k, b = a + K + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("flow", new THREE.Float32BufferAttribute(flow, 3)); g.setIndex(idx);
  return g;
}

export function Water({ lite }: { lite: boolean }) {
  const { streams, falls, pond, mats } = useMemo(() => {
    const mats = [waterMaterial(0), waterMaterial(1), waterMaterial(2)];
    const L = lips();
    const st = STREAMS.map((s) => buildStream(s.pts, s.w, lite ? 3 : 2));
    const falls = L.map((l, i) => buildFall(l, st[i].dist));
    // pond disc with polar "flow" coords (u, v = position / radius)
    const pr = POND_R + 0.3; const pg = new THREE.CircleGeometry(pr, 40); pg.rotateX(-Math.PI / 2);
    const p = pg.attributes.position; const fl: number[] = []; for (let i = 0; i < p.count; i++) fl.push(p.getX(i) / pr, p.getZ(i) / pr, 0);
    pg.setAttribute("flow", new THREE.Float32BufferAttribute(fl, 3)); pg.translate(POND[0], wy(POND[0], POND[1]) + 0.005, POND[1]);
    return { streams: st.map((s) => s.g), falls, pond: pg, mats };
  }, [lite]);
  useFrame(({ clock }) => {
    for (const m of mats) { m.uniforms.uTime.value = clock.elapsedTime; m.uniforms.uLight.value.copy(SKY.water); m.uniforms.uSky.value.copy(SKY.hor); }
  });
  return (
    <>
      {streams.map((g, i) => <mesh key={"s" + i} geometry={g} material={mats[0]} renderOrder={1} />)}
      <mesh geometry={pond} material={mats[2]} renderOrder={1} />
      {falls.map((g, i) => <mesh key={"f" + i} geometry={g} material={mats[1]} renderOrder={2} frustumCulled={false} />)}
      <Spray lite={lite} />
    </>
  );
}

/** Particle spray at each lip, a veil of drifting mist down each curtain, and big soft plumes where the falls meet the clouds. */
function Spray({ lite }: { lite: boolean }) {
  const { geo, mat } = useMemo(() => {
    const r = rand(71); const L = lips(); const start: number[] = [], vel: number[] = [], misc: number[] = []; const v = new THREE.Vector3();
    const add = (p: THREE.Vector3, vv: THREE.Vector3, life: number, size: number, alpha: number, grav: number) => { start.push(p.x, p.y, p.z); vel.push(vv.x, vv.y, vv.z); misc.push(r() * life, life, size, Math.round(alpha * 100) * 2 + grav); };
    L.forEach((l, li) => {
      const k = li === 0 ? 1 : 0.6;
      for (let i = 0; i < (lite ? 40 : 90) * k; i++) { // lip spray: small droplets thrown out and falling
        fallPoint(l, 0.02, r() * 2 - 1, v); const vv = l.dir.clone().multiplyScalar(0.6 + r() * 1.2).addScaledVector(l.side, (r() - 0.5) * 0.6).setY(0.4 + r() * 1.1);
        add(v.clone(), vv, 0.9 + r() * 0.7, 0.05 + r() * 0.06, 0.85, 1);
      }
      for (let i = 0; i < (lite ? 26 : 60) * k; i++) { // veil: soft puffs peeling off the curtain
        fallPoint(l, 0.08 + r() * 0.75, (r() * 2 - 1) * 0.9, v); const vv = l.dir.clone().multiplyScalar(0.25 + r() * 0.5).addScaledVector(l.side, (r() - 0.5) * 0.5).setY(-0.6 - r() * 0.8);
        add(v.clone(), vv, 2.2 + r() * 1.6, 0.5 + r() * 0.7, 0.2, 0);
      }
      for (let i = 0; i < (lite ? 16 : 34) * k; i++) { // plume at the bottom, rising into the cloud sea
        fallPoint(l, 0.82 + r() * 0.18, (r() * 2 - 1) * 1.4, v); v.y += r() * 0.8; const vv = l.dir.clone().multiplyScalar(0.2 + r() * 0.5).addScaledVector(l.side, (r() - 0.5) * 0.8).setY(0.25 + r() * 0.5);
        add(v.clone(), vv, 4 + r() * 3, 1.8 + r() * 1.8, 0.32, 0);
      }
    });
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(start, 3)); g.setAttribute("vel", new THREE.Float32BufferAttribute(vel, 3)); g.setAttribute("misc", new THREE.Float32BufferAttribute(misc, 4));
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, uniforms: { uTime: { value: 0 }, uScale: { value: 1 }, uTint: { value: new THREE.Color(1, 1, 1) } },
      vertexShader: `attribute vec3 vel; attribute vec4 misc; uniform float uTime, uScale; varying float vA;
        void main(){ float life = misc.y; float age = mod(uTime + misc.x, life); float k = age / life; float grav = mod(misc.w + 0.1, 2.0) > 0.5 ? 1.0 : 0.0; float alpha = floor(misc.w * 0.5 + 0.01) / 100.0;
          vec3 p = position + vel * age + vec3(0.0, -4.9, 0.0) * age * age * grav;
          vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
          float sz = misc.z * (grav > 0.5 ? 1.0 : (0.6 + k * 0.9));
          vA = alpha * smoothstep(0.0, 0.12, k) * (1.0 - smoothstep(0.55, 1.0, k));
          gl_PointSize = uScale * sz * 300.0 / -mv.z; }`,
      fragmentShader: `uniform vec3 uTint; varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d); gl_FragColor = vec4(uTint, a * a * vA);
        #include <colorspace_fragment>
      }`,
    });
    return { geo: g, mat: m };
  }, [lite]);
  const { gl } = useThree();
  useFrame(({ clock }) => { mat.uniforms.uTime.value = clock.elapsedTime; mat.uniforms.uScale.value = gl.getPixelRatio(); mat.uniforms.uTint.value.set("#FFFFFF").lerp(SKY.hor, 0.3).multiply(SKY.water); });
  return <points geometry={geo} material={mat} frustumCulled={false} renderOrder={3} />;
}
