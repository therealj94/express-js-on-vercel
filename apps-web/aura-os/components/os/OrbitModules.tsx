'use client';
// LOS MÓDULOS EN ÓRBITA: las casas de Orden Global alrededor del ser, con sus
// datos vivos. Orbes, no tarjetas. El anillo medio da una vuelta en 40 s; el
// exterior en 70 s y al revés. Pasar por encima ilumina y muestra el rótulo;
// tocar despliega una lámina fina con lo que hay adentro y atenúa el resto.
import { Html } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { modulosPara, RADIO, VUELTA_S, type Modulo } from '@/lib/modules';
import { useOs } from '@/lib/os-store';

// Solo cian, azul eléctrico y blanco-azul: la paleta está cerrada. El estado
// se dice con LUZ, no con otro color: lo vivo brilla, lo caído se apaga.
const COLOR = { ok: '#5DD6FF', mal: '#3E5F86', aviso: '#9FD8FF', oro: '#DCEBFF', neutro: '#5DD6FF' } as const;

function Orbe({ m }: { m: Modulo }) {
  const activo = useOs((s) => s.activeModule);
  const vivo = useOs((s) => s.vivo); const pendientes = useOs((s) => s.pendientes);
  const focusModule = useOs((s) => s.focusModule); const clearFocus = useOs((s) => s.clearFocus);
  const bootComplete = useOs((s) => s.bootComplete);
  const [hover, setHover] = useState(false);
  const grupo = useRef<THREE.Group>(null); const esfera = useRef<THREE.Mesh>(null); const halo = useRef<THREE.Sprite>(null);
  const chispas = useRef<THREE.Points>(null);
  const lectura = useMemo(() => m.leer(vivo, pendientes), [m, vivo, pendientes]);
  const color = COLOR[lectura.estado];
  const esActivo = activo === m.id; const hayOtro = activo && !esActivo;
  const r = RADIO[m.ring];
  const haloTex = useMemo(() => {
    const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d')!;
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,.9)'); g.addColorStop(0.3, color + 'aa'); g.addColorStop(1, color + '00');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
  }, [color]);
  const chispaGeo = useMemo(() => {
    if (!m.chispas) return null;
    const pos = new Float32Array(24 * 3); for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2; pos.set([Math.cos(a) * 0.16, Math.sin(a * 2) * 0.05, Math.sin(a) * 0.16], i * 3); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); return g;
  }, [m.chispas]);

  useFrame((st, dt) => {
    const t = st.clock.elapsedTime;
    if (!grupo.current) return;
    // la órbita: el anillo exterior va al revés; el oro pesa y se bambolea lento
    const dir = m.ring === 'outer' ? -1 : 1;
    const a = m.angulo + dir * (t / VUELTA_S[m.ring]) * Math.PI * 2;
    const bob = m.pesado ? Math.sin(t * 0.35) * 0.05 : Math.sin(t * 0.7 + m.angulo) * 0.04;
    grupo.current.position.set(Math.cos(a) * r, 0.9 + m.alto + bob, Math.sin(a) * r * 0.62);
    // aparece desde el fondo al terminar el boot
    const objetivo = bootComplete ? (hayOtro ? 0.3 : 1) : 0;
    const e = THREE.MathUtils.damp(grupo.current.scale.x, objetivo, 3, dt);
    grupo.current.scale.setScalar(Math.max(0.0001, e));
    if (esfera.current) { const k = hover || esActivo ? 1.6 : 1; (esfera.current.material as THREE.MeshBasicMaterial).color.set(color).multiplyScalar(k * (lectura.estado === 'mal' ? 0.9 : 1.8)); }
    if (halo.current) { const k = (hover || esActivo ? 1.6 : 1) * (1 + 0.08 * Math.sin(t * 2 + m.angulo)); halo.current.scale.set(0.34 * k, 0.34 * k, 1); }
    if (chispas.current) { chispas.current.rotation.y = t * 1.4; (chispas.current.material as THREE.PointsMaterial).opacity = 0.5 + 0.4 * Math.sin(t * 5 + m.angulo); }
  });

  const alTocar = () => (esActivo ? clearFocus() : focusModule(m.id));

  return (
    <group ref={grupo} scale={0.0001}>
      <mesh ref={esfera} onPointerOver={() => setHover(true)} onPointerOut={() => setHover(false)} onClick={alTocar}>
        <sphereGeometry args={[m.pesado ? 0.06 : 0.048, 20, 20]} />
        <meshBasicMaterial toneMapped={false} color={color} />
      </mesh>
      <sprite ref={halo} scale={[0.34, 0.34, 1]}>
        <spriteMaterial map={haloTex} transparent opacity={0.8} blending={THREE.AdditiveBlending} depthWrite={false} />
      </sprite>
      {chispaGeo && (
        <points ref={chispas} geometry={chispaGeo}>
          <pointsMaterial size={0.02} color="#EAF2FF" transparent opacity={0.6} depthWrite={false} blending={THREE.AdditiveBlending} />
        </points>
      )}
      {/* el rótulo: siempre el nombre y el valor; al pasar o al tocar, más */}
      <Html position={[0, 0.16, 0]} center distanceFactor={6} zIndexRange={[20, 10]} style={{ pointerEvents: 'none' }}>
        <div className={`select-none text-center transition-all duration-300 ${hayOtro ? 'opacity-30' : 'opacity-100'}`} style={{ transform: 'translateY(-100%)' }}>
          <div className="font-mono text-[9px] tracking-hud text-bruma/80 whitespace-nowrap">{m.nombre}</div>
          <div className={`font-mono text-[11px] whitespace-nowrap ${lectura.estado === 'mal' ? 'text-bruma/60' : 'text-hielo'}`}>{lectura.valor}</div>
          {(hover || esActivo) && lectura.sub && <div className="font-sans text-[11px] text-bruma whitespace-nowrap">{lectura.sub}</div>}
        </div>
      </Html>
      {/* la lámina: fina, holográfica, con lo que hay adentro */}
      {esActivo && lectura.filas && (
        <Html position={[0.3, -0.05, 0]} distanceFactor={6} zIndexRange={[30, 20]}>
          <div className="aparece burbuja aura rounded-2xl px-4 py-3 min-w-[220px] max-w-[300px]" style={{ borderColor: color + '55' }}>
            <div className="font-mono text-[10px] tracking-hud text-bruma mb-2">{m.nombre}</div>
            <div className="space-y-1.5">
              {lectura.filas.map(([k, v], i) => (
                <div key={i} className="flex justify-between gap-4 text-[12px]"><span className="text-bruma">{k}</span><span className="font-mono text-hielo text-right">{v}</span></div>
              ))}
            </div>
            <button onClick={clearFocus} className="mt-3 text-[11px] text-cian tracking-wide">cerrar</button>
          </div>
        </Html>
      )}
    </group>
  );
}

export default function OrbitModules() {
  const movil = useThree((s) => s.size.width < 720);
  const modulos = useMemo(() => modulosPara(movil), [movil]);
  return (
    <group>
      {/* los anillos, apenas insinuados */}
      {(movil ? ['mid'] : ['mid', 'outer']).map((ring) => (
        <mesh key={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.9, 0]} scale={[1, 0.62, 1]}>
          <ringGeometry args={[RADIO[ring as 'mid' | 'outer'] - 0.004, RADIO[ring as 'mid' | 'outer'] + 0.004, 128]} />
          <meshBasicMaterial color="#5DD6FF" transparent opacity={0.07} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
      ))}
      {modulos.map((m) => <Orbe key={m.id} m={m} />)}
    </group>
  );
}
