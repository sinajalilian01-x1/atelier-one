"use client";
/* eslint-disable react-hooks/immutability -- three.js objects are mutated per frame by design (react-three-fiber useFrame) */
// The artists: a straw-hat painter (lake / island), a fox (autumn) and a robot (meadow).
import * as THREE from "three";
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { G, M, Brush, useDab, type V3 } from "./kit";

function Palette({ position, rotation = [0, 0, 0] }: { position: V3; rotation?: V3 }) {
  return (
    <group position={position} rotation={rotation}>
      <mesh geometry={G.cyl12} material={M("#E9D3AE")} scale={[0.26, 0.02, 0.19]} />
      {["#E8504A", "#3E9BE0", "#F5C343", "#4CB86A", "#FFFFFF"].map((c, i) => (
        <mesh key={c} geometry={G.sphere} material={M(c)} position={[-0.15 + i * 0.07, 0.02, Math.sin(i * 1.9) * 0.08]} scale={[0.03, 0.015, 0.03]} />
      ))}
    </group>
  );
}

/** Seated or standing human painter. Faces -z; the right hand (+x) dabs toward the easel. */
export function Painter({ position, rotation = [0, 0, 0], working, s = 1, pose = "sit", shirt = "#F0E7DA", pants = "#3B3F4A", skin = "#E3AE88", hair = "#3B2A22", hat = "straw", overalls }: {
  position: V3; rotation?: V3; working: boolean; s?: number; pose?: "sit" | "stand"; shirt?: string; pants?: string; skin?: string; hair?: string; hat?: "straw" | "none"; overalls?: string;
}) {
  const arm = useDab(working, 3.2);
  const head = useRef<THREE.Group>(null);
  useFrame(({ clock }) => { if (head.current) head.current.rotation.y = Math.sin(clock.elapsedTime * 0.5) * 0.12 + (working ? 0.15 : 0); });
  const y0 = pose === "sit" ? 0.55 : 0.85;
  const top = overalls || shirt;
  return (
    <group position={position} rotation={rotation} scale={s}>
      {pose === "sit" && (
        <group>
          <mesh geometry={G.cyl6} material={M("#8A5A36")} position={[0, 0.5, 0]} scale={[0.32, 0.08, 0.32]} castShadow />
          {[[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]].map(([x, z], i) => <mesh key={i} geometry={G.box} material={M("#7A4C2C")} position={[x, 0.24, z]} scale={[0.06, 0.5, 0.06]} castShadow />)}
          <mesh geometry={G.box} material={M(pants)} position={[-0.13, 0.62, -0.25]} scale={[0.17, 0.17, 0.55]} castShadow />
          <mesh geometry={G.box} material={M(pants)} position={[0.13, 0.62, -0.25]} scale={[0.17, 0.17, 0.55]} castShadow />
          <mesh geometry={G.box} material={M(pants)} position={[-0.13, 0.32, -0.5]} scale={[0.15, 0.55, 0.15]} castShadow />
          <mesh geometry={G.box} material={M(pants)} position={[0.13, 0.32, -0.5]} scale={[0.15, 0.55, 0.15]} castShadow />
          <mesh geometry={G.box} material={M("#5A3A28")} position={[-0.13, 0.05, -0.56]} scale={[0.16, 0.1, 0.26]} />
          <mesh geometry={G.box} material={M("#5A3A28")} position={[0.13, 0.05, -0.56]} scale={[0.16, 0.1, 0.26]} />
        </group>
      )}
      {pose === "stand" && (
        <group>
          <mesh geometry={G.box} material={M(pants)} position={[-0.11, 0.42, 0]} scale={[0.16, 0.84, 0.17]} castShadow />
          <mesh geometry={G.box} material={M(pants)} position={[0.11, 0.42, 0]} scale={[0.16, 0.84, 0.17]} castShadow />
          <mesh geometry={G.box} material={M("#4A3426")} position={[-0.11, 0.04, -0.05]} scale={[0.17, 0.09, 0.26]} />
          <mesh geometry={G.box} material={M("#4A3426")} position={[0.11, 0.04, -0.05]} scale={[0.17, 0.09, 0.26]} />
        </group>
      )}
      <group position={[0, y0, 0]}>
        <mesh geometry={G.cyl6} material={M(top)} position={[0, 0.38, 0]} scale={[0.3, 0.75, 0.24]} castShadow />
        {overalls && <mesh geometry={G.cyl6} material={M(shirt)} position={[0, 0.66, 0]} scale={[0.31, 0.22, 0.25]} />}
        {/* paint splashes on the smock */}
        {!overalls && ["#E87A7A", "#7AB6E8", "#F2C14E"].map((c, i) => <mesh key={c} geometry={G.sphere} material={M(c)} position={[-0.12 + i * 0.12, 0.25 + i * 0.09, 0.22]} scale={[0.04, 0.04, 0.01]} />)}
        <mesh geometry={G.cyl6} material={M(skin)} position={[0, 0.8, 0]} scale={[0.08, 0.12, 0.08]} />
        <group ref={head} position={[0, 1.02, 0]}>
          <mesh geometry={G.sphere} material={M(skin)} scale={0.22} castShadow />
          <mesh geometry={G.sphere} material={M(hair)} position={[0, 0.03, 0.05]} scale={[0.235, 0.22, 0.22]} />
          <mesh geometry={G.blob} material={M(hair)} position={[0, -0.2, 0.1]} rotation={[0.15, 0.3, 0]} scale={[0.24, 0.3, 0.12]} castShadow />
          {hat === "straw" && (
            <group position={[0, 0.16, 0]} rotation={[0.08, 0, 0.04]}>
              <mesh geometry={G.cyl12} material={M("#E2BE74")} scale={[0.48, 0.03, 0.48]} castShadow />
              <mesh geometry={G.cyl12} material={M("#E8C67E")} position={[0, 0.1, 0]} scale={[0.24, 0.2, 0.24]} castShadow />
              <mesh geometry={G.cyl12} material={M("#4A3426")} position={[0, 0.03, 0]} scale={[0.245, 0.05, 0.245]} />
            </group>
          )}
        </group>
        {/* left arm + palette */}
        <group position={[-0.3, 0.66, 0]} rotation={[0.9, 0, -0.25]}>
          <mesh geometry={G.box} material={M(shirt)} position={[0, -0.25, 0]} scale={[0.12, 0.5, 0.12]} castShadow />
          <Palette position={[0, -0.5, 0]} rotation={[-0.9, 0, 0.3]} />
        </group>
        {/* right arm dabbing */}
        <group ref={arm} position={[0.3, 0.66, 0]}>
          <mesh geometry={G.box} material={M(shirt)} position={[0, -0.27, 0]} scale={[0.12, 0.55, 0.12]} castShadow />
          <mesh geometry={G.sphere} material={M(skin)} position={[0, -0.57, 0]} scale={0.06} />
          <group position={[0, -0.57, 0]} rotation={[0, 0, 0]}><Brush /></group>
        </group>
      </group>
    </group>
  );
}

/** Low-poly fox sitting on a stump, scarf on. Faces -z. */
export function Fox({ position, rotation = [0, 0, 0], working, s = 1 }: { position: V3; rotation?: V3; working: boolean; s?: number }) {
  const arm = useDab(working, 3);
  const tail = useRef<THREE.Group>(null); const head = useRef<THREE.Group>(null);
  useFrame(({ clock }) => { const t = clock.elapsedTime; if (tail.current) tail.current.rotation.y = Math.sin(t * 1.4) * 0.25; if (head.current) { head.current.rotation.y = Math.sin(t * 0.6) * 0.15; head.current.rotation.z = Math.sin(t * 0.9) * 0.05; } });
  const or = "#E8782A", wh = "#F5EFE6", dk = "#2B201C";
  return (
    <group position={position} rotation={rotation} scale={s}>
      <mesh geometry={G.cyl6} material={M("#7A5034")} position={[0, 0.3, 0]} scale={[0.45, 0.6, 0.45]} castShadow />
      <mesh geometry={G.cyl6} material={M("#C9A57A")} position={[0, 0.605, 0]} scale={[0.42, 0.01, 0.42]} />
      <group position={[0, 0.62, 0]}>
        <mesh geometry={G.blob1} material={M(or)} position={[0, 0.45, 0.02]} scale={[0.36, 0.5, 0.32]} castShadow />
        <mesh geometry={G.blob1} material={M(wh)} position={[0, 0.42, -0.2]} scale={[0.2, 0.36, 0.14]} />
        {/* hind legs + feet */}
        <mesh geometry={G.blob} material={M(or)} position={[-0.2, 0.12, -0.12]} scale={[0.14, 0.14, 0.26]} />
        <mesh geometry={G.blob} material={M(or)} position={[0.2, 0.12, -0.12]} scale={[0.14, 0.14, 0.26]} />
        <mesh geometry={G.blob} material={M(dk)} position={[-0.2, 0.05, -0.36]} scale={[0.08, 0.06, 0.1]} />
        <mesh geometry={G.blob} material={M(dk)} position={[0.2, 0.05, -0.36]} scale={[0.08, 0.06, 0.1]} />
        {/* scarf */}
        <mesh material={M("#B5452B")} position={[0, 0.85, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow><torusGeometry args={[0.2, 0.08, 4, 8]} /></mesh>
        <mesh geometry={G.box} material={M("#B5452B")} position={[-0.12, 0.62, -0.2]} rotation={[0.2, 0, 0.15]} scale={[0.1, 0.35, 0.05]} />
        <group ref={head} position={[0, 1.12, -0.04]}>
          <mesh geometry={G.blob} material={M(or)} scale={[0.27, 0.24, 0.26]} castShadow />
          <mesh geometry={G.blob} material={M(wh)} position={[0, -0.07, -0.12]} scale={[0.2, 0.12, 0.17]} />
          <mesh geometry={G.cone6} material={M(or)} position={[0, -0.02, -0.32]} rotation={[-Math.PI / 2, 0, 0]} scale={[0.12, 0.3, 0.1]} />
          <mesh geometry={G.sphere} material={M(dk)} position={[0, 0, -0.47]} scale={0.035} />
          <mesh geometry={G.sphere} material={M(dk)} position={[-0.11, 0.06, -0.21]} scale={0.03} />
          <mesh geometry={G.sphere} material={M(dk)} position={[0.11, 0.06, -0.21]} scale={0.03} />
          {[-1, 1].map((k) => (
            <group key={k} position={[k * 0.14, 0.24, 0.02]} rotation={[0, 0, -k * 0.2]}>
              <mesh geometry={G.cone6} material={M(or)} scale={[0.09, 0.24, 0.05]} />
              <mesh geometry={G.cone6} material={M(dk)} position={[0, 0.08, -0.01]} scale={[0.04, 0.09, 0.03]} />
            </group>
          ))}
        </group>
        {/* paw with brush */}
        <group ref={arm} position={[0.24, 0.62, -0.12]}>
          <mesh geometry={G.box} material={M(or)} position={[0, -0.18, 0]} scale={[0.1, 0.38, 0.1]} />
          <mesh geometry={G.sphere} material={M(dk)} position={[0, -0.38, 0]} scale={0.055} />
          <group position={[0, -0.38, 0]}><Brush color="#E0582E" length={0.45} /></group>
        </group>
        <group position={[-0.25, 0.56, -0.14]} rotation={[0.8, 0, -0.3]}>
          <mesh geometry={G.box} material={M(or)} position={[0, -0.16, 0]} scale={[0.1, 0.34, 0.1]} />
          <mesh geometry={G.cyl12} material={M("#E9D3AE")} position={[-0.05, -0.36, -0.05]} rotation={[-0.8, 0, 0.3]} scale={[0.2, 0.02, 0.15]} />
        </group>
        <group ref={tail} position={[0.05, 0.12, 0.35]}>
          <mesh geometry={G.cone6} material={M(or)} position={[0.25, 0.05, 0.25]} rotation={[Math.PI / 2 - 0.3, 0, -0.9]} scale={[0.2, 0.7, 0.18]} castShadow />
          <mesh geometry={G.cone6} material={M(wh)} position={[0.56, 0.12, 0.52]} rotation={[Math.PI / 2 - 0.3, 0, -0.9]} scale={[0.12, 0.25, 0.1]} />
        </group>
      </group>
    </group>
  );
}

/** Cute white-and-orange robot painter in a beret. Faces -z. */
export function Robot({ position, rotation = [0, 0, 0], working, s = 1 }: { position: V3; rotation?: V3; working: boolean; s?: number }) {
  const arm = useDab(working, 3.4);
  const head = useRef<THREE.Group>(null);
  const eye = useMemo(() => new THREE.MeshStandardMaterial({ color: "#FF9A3C", emissive: "#FF7A1A", emissiveIntensity: 1.6 }), []);
  useFrame(({ clock }) => { const t = clock.elapsedTime; if (head.current) { head.current.rotation.z = Math.sin(t * 1.1) * 0.06; head.current.position.y = 1.18 + Math.sin(t * 2) * 0.012; } const blink = (t % 4) < 0.12; eye.emissiveIntensity = blink ? 0.2 : 1.6; });
  const wh = M("#F4F1EC", { roughness: 0.5 }), og = M("#F07A22", { roughness: 0.5 });
  return (
    <group position={position} rotation={rotation} scale={s}>
      <mesh geometry={G.cyl6} material={M("#8A5A36")} position={[0, 0.42, 0]} scale={[0.32, 0.07, 0.32]} castShadow />
      {[[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]].map(([x, z], i) => <mesh key={i} geometry={G.box} material={M("#7A4C2C")} position={[x, 0.2, z]} scale={[0.06, 0.42, 0.06]} />)}
      <group position={[0, 0.46, 0]}>
        <mesh geometry={G.blob1} material={wh} position={[0, 0.32, 0]} scale={[0.32, 0.36, 0.28]} castShadow />
        <mesh geometry={G.box} material={og} position={[0, 0.36, -0.27]} rotation={[0, 0, Math.PI / 4]} scale={[0.09, 0.09, 0.02]} />
        {[-1, 1].map((k) => (
          <group key={k}>
            <mesh geometry={G.box} material={wh} position={[k * 0.13, 0.08, -0.25]} scale={[0.16, 0.14, 0.42]} castShadow />
            <mesh geometry={G.blob} material={og} position={[k * 0.13, -0.15, -0.46]} scale={[0.11, 0.1, 0.14]} />
            <mesh geometry={G.box} material={wh} position={[k * 0.13, -0.05, -0.45]} scale={[0.13, 0.25, 0.13]} />
          </group>
        ))}
        <group ref={head} position={[0, 1.18 - 0.46, 0]} rotation={[0, -1.0, 0]}>
          <mesh geometry={G.blob1} material={wh} scale={[0.4, 0.33, 0.34]} castShadow />
          <mesh geometry={G.blob1} material={M("#1E2024", { roughness: 0.25 })} position={[0, -0.01, -0.21]} scale={[0.32, 0.24, 0.18]} />
          <mesh geometry={G.box} material={eye} position={[-0.1, 0.02, -0.365]} scale={[0.07, 0.09, 0.01]} />
          <mesh geometry={G.box} material={eye} position={[0.1, 0.02, -0.365]} scale={[0.07, 0.09, 0.01]} />
          <mesh geometry={G.box} material={eye} position={[0, -0.08, -0.365]} rotation={[0, 0, 0]} scale={[0.08, 0.018, 0.01]} />
          <mesh geometry={G.cyl12} material={og} position={[-0.41, 0, 0]} rotation={[0, 0, Math.PI / 2]} scale={[0.1, 0.06, 0.1]} />
          <mesh geometry={G.cyl12} material={og} position={[0.41, 0, 0]} rotation={[0, 0, Math.PI / 2]} scale={[0.1, 0.06, 0.1]} />
          <group position={[0.04, 0.3, 0.03]} rotation={[0.12, 0, -0.18]}>
            <mesh geometry={G.cyl12} material={M("#F3EBDC")} scale={[0.36, 0.08, 0.34]} castShadow />
            <mesh geometry={G.sphere} material={M("#F3EBDC")} position={[0, 0.06, 0]} scale={[0.3, 0.08, 0.28]} />
            <mesh geometry={G.cyl6} material={M("#E2D6C2")} position={[0, 0.14, 0]} scale={[0.025, 0.08, 0.025]} />
          </group>
        </group>
        <group ref={arm} position={[0.34, 0.45, -0.05]}>
          <mesh geometry={G.cyl6} material={wh} position={[0, -0.2, 0]} scale={[0.07, 0.4, 0.07]} />
          <mesh geometry={G.blob} material={og} position={[0, -0.42, 0]} scale={0.08} />
          <group position={[0, -0.42, 0]}><Brush color="#F07A22" /></group>
        </group>
        <group position={[-0.34, 0.45, -0.05]} rotation={[0.7, 0, -0.35]}>
          <mesh geometry={G.cyl6} material={wh} position={[0, -0.2, 0]} scale={[0.07, 0.4, 0.07]} />
          <mesh geometry={G.blob} material={og} position={[0, -0.42, 0]} scale={0.08} />
        </group>
      </group>
    </group>
  );
}
