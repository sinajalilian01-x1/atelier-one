"use client";
// Lazy-loaded 3D host for the Dream Island: same quality tiers as the fox (bloom on capable desktops, lite on phones,
// frame-time watchdog → lite → poster), plus zoom input: wheel over the canvas (only while the page is at the top, and
// it hands the wheel back to the page at either limit), two-finger pinch, and the on-screen buttons in the UI.
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { DreamWorld, type DreamWorldProps } from "./DreamWorld";

function Bloom() {
  const { gl, scene, camera, size } = useThree();
  const composer = useMemo(() => {
    const c = new EffectComposer(gl); c.addPass(new RenderPass(scene, camera));
    c.addPass(new UnrealBloomPass(new THREE.Vector2(256, 256), 0.35, 0.5, 1.6)); c.addPass(new OutputPass()); return c;
  }, [gl, scene, camera]);
  useEffect(() => { composer.setPixelRatio(Math.min(gl.getPixelRatio(), 1.5)); composer.setSize(size.width, size.height); }, [composer, size, gl]);
  useEffect(() => () => composer.dispose(), [composer]);
  useFrame(() => composer.render(), 1);
  return null;
}
function Watchdog({ onResult, frames = 90 }: { onResult: (avg: number) => void; frames?: number }) {
  const acc = useRef({ n: 0, t: 0, done: false });
  useFrame((_, dt) => { const a = acc.current; if (a.done) return; a.n++; if (a.n < 20) return; a.t += dt; if (a.n >= 20 + frames) { a.done = true; onResult(a.t / frames); } });
  return null;
}
function Ready({ onReady }: { onReady?: () => void }) {
  const n = useRef(0);
  useFrame(() => { n.current++; if (n.current === 3) onReady?.(); });
  return null;
}

type Props = Omit<DreamWorldProps, "lite"> & { lite: boolean; onReady?: () => void; onTooSlow?: () => void; onZoom: (z: number) => void };
export default function DreamCanvas({ onReady, onTooSlow, onZoom, lite: liteIn, ...p }: Props) {
  const [slow, setSlow] = useState(false);
  const lite = liteIn || slow;
  const [q] = useState(() => new URLSearchParams(typeof location !== "undefined" ? location.search : ""));
  const bloom = !liteIn && q.get("bloom") !== "0";
  const pinned = q.get("3d") === "1" || q.get("hq") === "1";
  const wrap = useRef<HTMLDivElement>(null);
  const zoomRef = useRef(p.zoom); useEffect(() => { zoomRef.current = p.zoom; }, [p.zoom]);
  const onZoomRef = useRef(onZoom); useEffect(() => { onZoomRef.current = onZoom; }, [onZoom]);
  useEffect(() => {
    const el = wrap.current; if (!el) return;
    const set = (z: number) => { const v = Math.max(0, Math.min(1, z)); zoomRef.current = v; onZoomRef.current(v); };
    const wheel = (e: WheelEvent) => {
      if (window.scrollY > 40 || e.ctrlKey) return; // page already scrolled, or browser zoom: leave it alone
      const d = (e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY); const z = zoomRef.current;
      if ((d > 0 && z >= 1) || (d < 0 && z <= 0)) return; // at a limit: let the page scroll
      e.preventDefault(); set(z + d * 0.0016);
    };
    const pts = new Map<number, { x: number; y: number }>(); let base = 0, z0 = 0;
    const dist = () => { const [a, b] = [...pts.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
    const down = (e: PointerEvent) => { if (e.pointerType !== "touch") return; pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (pts.size === 2) { base = dist(); z0 = zoomRef.current; } };
    const move = (e: PointerEvent) => { if (!pts.has(e.pointerId)) return; pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (pts.size === 2 && base > 0) set(z0 + (base / dist() - 1) * 0.9); };
    const up = (e: PointerEvent) => { pts.delete(e.pointerId); if (pts.size < 2) base = 0; };
    el.addEventListener("wheel", wheel, { passive: false }); el.addEventListener("pointerdown", down); el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up); el.addEventListener("pointercancel", up);
    return () => { el.removeEventListener("wheel", wheel); el.removeEventListener("pointerdown", down); el.removeEventListener("pointermove", move); el.removeEventListener("pointerup", up); el.removeEventListener("pointercancel", up); };
  }, []);
  return (
    <div ref={wrap} style={{ position: "absolute", inset: 0, touchAction: "pan-y" }}>
      <Canvas
        shadows={!lite ? { type: THREE.PCFSoftShadowMap } : false}
        dpr={lite ? [1, 1.25] : [1, 1.75]}
        gl={{ antialias: !bloom || lite, powerPreference: "high-performance", alpha: false, stencil: false }}
        camera={{ fov: 40, position: [-0.5, 4.1, 9.6], near: 0.1, far: 400 }}
        onCreated={({ gl }) => { gl.toneMapping = THREE.ACESFilmicToneMapping; gl.toneMappingExposure = 1.0; }}
        style={{ position: "absolute", inset: 0 }}
      >
        <DreamWorld {...p} lite={lite} />
        {bloom && !lite && <Bloom />}
        {!pinned && !lite && <Watchdog onResult={(a) => { if (a > 1 / 28) setSlow(true); }} />}
        {!pinned && lite && <Watchdog key="lite" frames={60} onResult={(a) => { if (a > 1 / 12) onTooSlow?.(); }} />}
        <Ready onReady={onReady} />
      </Canvas>
    </div>
  );
}
