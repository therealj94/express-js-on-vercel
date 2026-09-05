'use client';
// LA CONVERSACIÓN, EN EL ESPACIO. Sin columna de chat.
//
// Las burbujas de Aura nacen en el núcleo del pecho —una chispa sale de ahí
// en 3D (ver `Chispa`, en el lienzo) y se posa junto a la mejilla izquierda—
// y ahí se quedan, en una columna de vidrio luminoso. Las de la persona
// entran por abajo a la derecha, vidrio oscuro. Tres visibles como mucho; las
// anteriores se encogen y se apagan.
//
// Las burbujas viven en el DOM, no en el lienzo: el texto tiene que envolver,
// medirse y no pisarse, y eso el DOM lo hace solo. El lienzo pone la chispa.
import { useFrame } from '@react-three/fiber';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { useOs, visibles, type Mensaje } from '@/lib/os-store';
import { NUCLEO } from './AuraBeing';

const MEJILLA = new THREE.Vector3(-1.1, 1.55, 0.5);

function Burbuja({ m, edad }: { m: Mensaje; edad: number }) {
  const esAura = m.de === 'aura';
  const opacidad = edad === 0 ? 1 : edad === 1 ? 0.55 : 0.28;
  const escala = 1 - edad * 0.08;
  return (
    <div
      className={`aparece burbuja ${esAura ? 'aura' : 'mia'} rounded-2xl px-4 py-3 text-[14px] leading-relaxed transition-all duration-500 ${esAura ? 'self-start' : 'self-end'}`}
      style={{ opacity: opacidad, transform: `scale(${escala})`, transformOrigin: esAura ? 'left bottom' : 'right bottom', pointerEvents: edad === 0 ? 'auto' : 'none', maxWidth: '100%' }}
    >
      {esAura && <div className="font-mono text-[9.5px] tracking-hud text-cian mb-1">AURA{m.vivo ? ' · …' : ''}</div>}
      <div className="whitespace-pre-wrap text-hielo">{m.texto || (m.vivo ? '…' : '')}</div>
      {esAura && m.herramientas?.length ? (
        <div className="mt-2 flex flex-wrap gap-1">{m.herramientas.map((h, k) => <span key={k} className="font-mono text-[9.5px] tracking-wide text-bruma border border-cian/20 rounded-full px-2 py-0.5">{h}</span>)}</div>
      ) : null}
    </div>
  );
}

/** Las burbujas: Aura junto a la mejilla izquierda; la persona abajo a la derecha. */
export default function ConversationField() {
  const messages = useOs((s) => s.messages);
  const lista = visibles(messages);
  const deAura = lista.filter((m) => m.de === 'aura');
  const mias = lista.filter((m) => m.de === 'yo');
  return (
    <>
      <div className="pointer-events-none fixed z-30 flex flex-col justify-end gap-2 left-[4vw] top-[14vh] bottom-[38vh] w-[min(380px,46vw)] max-[720px]:left-3 max-[720px]:top-auto max-[720px]:bottom-[118px] max-[720px]:w-[82vw]">
        {deAura.map((m, i) => <Burbuja key={m.id} m={m} edad={deAura.length - 1 - i} />)}
      </div>
      <div className="pointer-events-none fixed z-30 flex flex-col items-end justify-end gap-2 right-[4vw] bottom-[120px] w-[min(340px,40vw)] max-[720px]:right-3 max-[720px]:bottom-auto max-[720px]:top-[11vh] max-[720px]:w-[70vw]">
        {mias.map((m, i) => <Burbuja key={m.id} m={m} edad={mias.length - 1 - i} />)}
      </div>
    </>
  );
}

/** La chispa que sale del pecho y sube hacia la mejilla cuando Aura contesta. */
export function Chispa() {
  const messages = useOs((s) => s.messages);
  const [disparo, setDisparo] = useState(0);
  const ultimoAura = useRef<string | null>(null);
  useEffect(() => {
    const u = [...messages].reverse().find((m) => m.de === 'aura');
    if (u && u.id !== ultimoAura.current) { ultimoAura.current = u.id; setDisparo(Date.now()); }
  }, [messages]);
  const ref = useRef<THREE.Mesh>(null);
  const t0 = useRef(-1);
  useEffect(() => { if (disparo) t0.current = performance.now(); }, [disparo]);
  useFrame(() => {
    if (!ref.current) return;
    if (t0.current < 0) { ref.current.visible = false; return; }
    const k = Math.min(1, (performance.now() - t0.current) / 750);
    ref.current.visible = k < 1;
    const a = NUCLEO, b = MEJILLA;
    ref.current.position.set(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * (k * k) + Math.sin(k * Math.PI) * 0.35, a.z + (b.z - a.z) * k);
    ref.current.scale.setScalar(1 - k * 0.6);
  });
  return (
    <mesh ref={ref} visible={false}>
      <sphereGeometry args={[0.03, 12, 12]} />
      <meshBasicMaterial toneMapped={false} color={new THREE.Color(1.2, 2.8, 3.6)} />
    </mesh>
  );
}
