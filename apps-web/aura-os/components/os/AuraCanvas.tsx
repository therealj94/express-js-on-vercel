'use client';
// EL LIENZO: la escena entera, la cámara que respira, la post y el vigilante.
//
// Cámara de 35 mm, un poco baja, encuadrando cabeza y torso. Órbita lenta de
// ocho grados, un dolly de cuatro centímetros al ritmo de la respiración,
// todo con resortes. Al enfocar un módulo, doce grados hacia su orbe; en una
// conversación larga, un empuje hacia la cara. Nunca un corte.
//
// La post: extraer lo emisivo → bloom con mipmaps (dual-kawase a media y
// cuarto) → viñeta. Solo brillan los ojos, el núcleo y las cintas: son lo
// único que supera el umbral, porque son lo único que se pinta por encima de 1.
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { MODULOS, RADIO, VUELTA_S } from '@/lib/modules';
import { useOs } from '@/lib/os-store';
import { crearRenderer, esMovil, hayWebGL, Vigilante } from '@/lib/renderer';
import AuraBeing, { NUCLEO } from './AuraBeing';
import CodeRain from './CodeRain';
import { Chispa } from './ConversationField';
import EnergyRibbons from './EnergyRibbons';
import OrbitModules from './OrbitModules';
import ParticleField from './ParticleField';

function CameraRig() {
  const { camera } = useThree();
  const movil = useThree((s) => s.size.width < 720);
  const objetivo = useMemo(() => new THREE.Vector3(0, 1.0, 0), []);
  const pos = useMemo(() => new THREE.Vector3(0, 0.78, 4.7), []);
  const vig = useMemo(() => new Vigilante((n) => useOs.getState().setLod(n)), []);
  useFrame((st, dt) => {
    vig.cuadro(dt);
    const { mode, activeModule, messages } = useOs.getState();
    const t = st.clock.elapsedTime;
    // la órbita lenta y la respiración
    let ang = THREE.MathUtils.degToRad(8) * Math.sin(t / 14);
    // en el teléfono la cámara se aleja: la cara entera y tres orbes
    let dist = (movil ? 6.2 : 4.7) + 0.04 * Math.sin((t / 4.2) * Math.PI * 2);
    let alto = movil ? 1.15 : 0.78;
    if (activeModule) {
      const m = MODULOS.find((x) => x.id === activeModule)!;
      const dir = m.ring === 'outer' ? -1 : 1;
      const a = m.angulo + dir * (t / VUELTA_S[m.ring]) * Math.PI * 2;
      // doce grados hacia el orbe, y un poco más cerca
      ang += Math.atan2(Math.sin(a) * RADIO[m.ring] * 0.62, Math.cos(a) * RADIO[m.ring]) * 0.12;
      dist -= 0.3;
    }
    // conversación de fondo: la cámara se acerca a la cara
    const larga = mode === 'speak' && (messages.at(-1)?.texto.length || 0) > 240;
    if (larga) { dist -= 0.7; alto += 0.35; }
    const dx = Math.sin(ang) * dist, dz = Math.cos(ang) * dist;
    pos.x = THREE.MathUtils.damp(pos.x, dx, 1.2, dt); pos.z = THREE.MathUtils.damp(pos.z, dz, 1.2, dt); pos.y = THREE.MathUtils.damp(pos.y, alto, 1.2, dt);
    objetivo.y = THREE.MathUtils.damp(objetivo.y, larga ? 1.35 : movil ? 1.25 : 1.0, 1.2, dt);
    camera.position.copy(pos); camera.lookAt(objetivo);
  });
  return null;
}

/** El toque largo sobre el pecho abre el menú: sin engranaje a la vista. */
function NucleoToque() {
  const timer = useRef<number | null>(null);
  return (
    <mesh position={NUCLEO} onPointerDown={() => { timer.current = window.setTimeout(() => window.dispatchEvent(new Event('aura:menu')), 650); }}
      onPointerUp={() => { if (timer.current) clearTimeout(timer.current); }} onPointerLeave={() => { if (timer.current) clearTimeout(timer.current); }}>
      <sphereGeometry args={[0.22, 12, 12]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
  );
}

function Escena({ sinPost }: { sinPost: boolean }) {
  const lod = useOs((s) => s.lod);
  const movil = useThree((s) => s.size.width < 720);
  return (
    <>
      <CameraRig />
      <ParticleField />
      <CodeRain />
      <AuraBeing />
      <EnergyRibbons />
      <OrbitModules />
      <Chispa />
      <NucleoToque />
      {!sinPost && lod < 2 && (
        <EffectComposer multisampling={0} resolutionScale={movil ? 0.5 : 0.75}>
          <Bloom mipmapBlur luminanceThreshold={0.85} luminanceSmoothing={0.25} intensity={movil ? 0.8 : 1.05} radius={0.55} />
          <Vignette offset={0.22} darkness={0.72} />
        </EffectComposer>
      )}
    </>
  );
}

/** Sin WebGL: el mismo ser, en 2D. Nunca una pantalla en blanco. */
function Ser2D() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!; const x = c.getContext('2d')!;
    let s = 99; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    const dentro = (px: number, py: number) => ((px / 0.3) ** 2 + ((py + 0.62) / 0.36) ** 2) <= 1 || (Math.abs(px) <= 0.13 && py >= -0.32 && py <= -0.06) || (py >= -0.1 && py <= 0.98 && ((px / 0.98) ** 2 + ((py - 0.5) / 0.64) ** 2) <= 1);
    const pts: { x: number; y: number; f: number }[] = [];
    while (pts.length < 1400) { const px = rnd() * 2 - 1, py = rnd() * 2 - 1; if (dentro(px, py)) pts.push({ x: px, y: py, f: rnd() * 6.28 }); }
    let raf = 0;
    const cuadro = (ms: number) => {
      const t = ms / 1000, W = c.width = c.clientWidth * 2, H = c.height = c.clientHeight * 2, cx = W / 2, cy = H * 0.5, r = Math.min(W, H) * 0.34;
      const v = useOs.getState().voiceLevel;
      x.clearRect(0, 0, W, H); x.globalCompositeOperation = 'lighter';
      for (const p of pts) { x.fillStyle = `rgba(93,214,255,${0.35 + 0.3 * Math.sin(t + p.f)})`; x.beginPath(); x.arc(cx + (p.x + Math.sin(t * 0.7 + p.f) * 0.012) * r, cy + (p.y + Math.cos(t * 0.5 + p.f) * 0.012) * r, 2.2, 0, 6.28); x.fill(); }
      for (const sx of [-1, 1]) { const g = x.createRadialGradient(cx + sx * 0.105 * r, cy - 0.64 * r, 0, cx + sx * 0.105 * r, cy - 0.64 * r, r * 0.07); g.addColorStop(0, 'rgba(234,242,255,.9)'); g.addColorStop(1, 'rgba(93,214,255,0)'); x.fillStyle = g; x.beginPath(); x.arc(cx + sx * 0.105 * r, cy - 0.64 * r, r * 0.07, 0, 6.28); x.fill(); }
      const n = x.createRadialGradient(cx, cy + 0.28 * r, 0, cx, cy + 0.28 * r, r * (0.2 + v * 0.2)); n.addColorStop(0, 'rgba(234,242,255,.8)'); n.addColorStop(1, 'rgba(93,214,255,0)'); x.fillStyle = n; x.beginPath(); x.arc(cx, cy + 0.28 * r, r * 0.5, 0, 6.28); x.fill();
      raf = requestAnimationFrame(cuadro);
    };
    raf = requestAnimationFrame(cuadro);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={ref} className="fixed inset-0 w-full h-full" aria-label="Aura" />;
}

export default function AuraCanvas() {
  const [sinWebGL, setSinWebGL] = useState<boolean | null>(null);
  const [sinPost, setSinPost] = useState(false);
  const movil = esMovil();
  useEffect(() => { const ok = hayWebGL(); setSinWebGL(!ok); useOs.getState().setSinWebGL(!ok); if (!ok) setTimeout(() => useOs.getState().setBootComplete(), 800); }, []);
  if (sinWebGL === null) return null;
  if (sinWebGL) return <Ser2D />;
  return (
    <div className="fixed inset-0">
      <Canvas
        dpr={movil ? 1 : [1, 1.5]}
        camera={{ fov: 38, near: 0.1, far: 60, position: [0, 0.78, 4.7] }}
        gl={async ({ canvas }) => { const r = await crearRenderer({ canvas: canvas as HTMLCanvasElement, movil }); setSinPost(r.sinPost); if (r.webgpu) useOs.getState().avisar('WebGPU activo: sin bloom (la post es WebGL).'); return r.gl; }}
        frameloop="always"
        onCreated={({ scene }) => { scene.background = new THREE.Color('#02060f'); scene.fog = new THREE.FogExp2('#02060f', 0.055); }}
      >
        <Suspense fallback={null}>
          <Escena sinPost={sinPost} />
        </Suspense>
      </Canvas>
    </div>
  );
}
