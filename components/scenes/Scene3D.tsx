"use client";
// Lazy-loaded 3D host (three.js + react-three-fiber). Loaded only on /s/* and only in the browser.
import { Canvas } from "@react-three/fiber";
import * as THREE from "three";
import { IslandWorld, FoxWorld, LakeWorld, RobotWorld, type WorldProps } from "./worlds";

import type { SceneKey } from "./skins";
const WORLDS = { lake: LakeWorld, island: IslandWorld, fox: FoxWorld, robot: RobotWorld };
const CAM: Record<SceneKey, { fov: number; pos: [number, number, number] }> = {
  lake: { fov: 50, pos: [-4.4, 3.5, 9] }, island: { fov: 38, pos: [11, 7.5, 14] }, fox: { fov: 48, pos: [0.4, 2.6, 8.2] }, robot: { fov: 48, pos: [-0.6, 1.9, 6.4] },
};

export default function Scene3D({ scene, onReady, ...p }: WorldProps & { scene: SceneKey; onReady?: () => void }) {
  const World = WORLDS[scene];
  return (
    <Canvas
      shadows={!p.lite}
      dpr={p.lite ? [1, 1.5] : [1, 2]}
      gl={{ antialias: !p.lite, powerPreference: "high-performance", alpha: false }}
      camera={{ fov: CAM[scene].fov, position: CAM[scene].pos, near: 0.1, far: 400 }}
      onCreated={({ gl }) => { gl.toneMapping = THREE.ACESFilmicToneMapping; gl.toneMappingExposure = 1.05; gl.shadowMap.type = THREE.PCFShadowMap; onReady?.(); }}
      style={{ position: "absolute", inset: 0 }}
    >
      <World {...p} />
    </Canvas>
  );
}
