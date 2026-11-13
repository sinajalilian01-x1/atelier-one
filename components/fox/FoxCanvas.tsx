"use client";
// Lazy-loaded 3D host for the Autumn Fox scene: three.js + react-three-fiber, ACES tone mapping,
// cheap half-res bloom on capable desktops only, adaptive DPR, and a frame-time watchdog that drops to "lite".
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { FoxWorld, type FoxWorldProps } from "./FoxWorld";

function Bloom() {
  const { gl, scene, camera, size } = useThree();
  const composer = useMemo(() => {
    const c = new EffectComposer(gl);
    c.addPass(new RenderPass(scene, camera));
    c.addPass(new UnrealBloomPass(new THREE.Vector2(256, 256), 0.32, 0.5, 0.9));
    c.addPass(new OutputPass());
    return c;
  }, [gl, scene, camera]);
  useEffect(() => { composer.setPixelRatio(Math.min(gl.getPixelRatio(), 1.5)); composer.setSize(size.width, size.height); }, [composer, size, gl]);
  useEffect(() => () => composer.dispose(), [composer]);
  useFrame(() => composer.render(), 1);
  return null;
}

/** Watches frame time after warm-up; reports the average frame time once so the host can step quality down. */
function Watchdog({ onResult, frames = 90 }: { onResult: (avg: number) => void; frames?: number }) {
  const acc = useRef({ n: 0, t: 0, done: false });
  useFrame((_, dt) => {
    const a = acc.current; if (a.done) return; a.n++; if (a.n < 20) return; a.t += dt;
    if (a.n >= 20 + frames) { a.done = true; onResult(a.t / frames); }
  });
  return null;
}
function Ready({ onReady }: { onReady?: () => void }) {
  const n = useRef(0);
  useFrame(() => { n.current++; if (n.current === 3) onReady?.(); });
  return null;
}

export default function FoxCanvas({ onReady, onTooSlow, lite: liteIn, ...p }: Omit<FoxWorldProps, "lite"> & { lite: boolean; onReady?: () => void; onTooSlow?: () => void }) {
  const [slow, setSlow] = useState(false);
  const lite = liteIn || slow;
  const [q] = useState(() => new URLSearchParams(typeof location !== "undefined" ? location.search : ""));
  const bloom = !liteIn && q.get("bloom") !== "0";
  const pinned = q.get("3d") === "1" || q.get("hq") === "1"; // screenshots / debugging: never auto-degrade
  return (
    <Canvas
      shadows={!lite ? { type: THREE.PCFSoftShadowMap } : false}
      dpr={lite ? [1, 1.25] : [1, 1.75]}
      gl={{ antialias: !bloom || lite, powerPreference: "high-performance", alpha: false, stencil: false }}
      camera={{ fov: 40, position: [-0.5, 4.1, 9.6], near: 0.1, far: 300 }}
      onCreated={({ gl }) => { gl.toneMapping = THREE.ACESFilmicToneMapping; gl.toneMappingExposure = 1.0; }}
      style={{ position: "absolute", inset: 0 }}
    >
      <FoxWorld {...p} lite={lite} />
      {bloom && !lite && <Bloom />}
      {/* full → lite below ~28 fps; lite → static poster below ~12 fps (very old or software-rendered GPUs) */}
      {!pinned && !lite && <Watchdog onResult={(a) => { if (a > 1 / 28) setSlow(true); }} />}
      {!pinned && lite && <Watchdog key="lite" frames={60} onResult={(a) => { if (a > 1 / 12) onTooSlow?.(); }} />}
      <Ready onReady={onReady} />
    </Canvas>
  );
}
