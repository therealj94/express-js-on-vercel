'use client';
// EL POLVO Y LOS RAYOS. Polvo tenue en el vacío para que el espacio tenga
// profundidad, y tres rayos azules desde arriba, volumétricos por engaño: son
// planos altos con degradado aditivo que se cruzan, nada más.
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useOs } from '@/lib/os-store';

export default function ParticleField() {
  const lod = useOs((s) => s.lod);
  const n = lod > 1 ? 500 : 1500;
  const geo = useMemo(() => {
    const pos = new Float32Array(n * 3);
    let s = 424242; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    for (let i = 0; i < n; i++) { const r = 2.5 + rnd() * 5, a = rnd() * Math.PI * 2, y = (rnd() - 0.5) * 7; pos.set([Math.cos(a) * r, y, Math.sin(a) * r - 1], i * 3); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); return g;
  }, [n]);
  const puntos = useRef<THREE.Points>(null);
  const rayos = useRef<THREE.Group>(null);
  const rayoTex = useMemo(() => {
    const c = document.createElement('canvas'); c.width = 64; c.height = 256; const x = c.getContext('2d')!;
    const g = x.createLinearGradient(0, 0, 0, 256); g.addColorStop(0, 'rgba(93,214,255,.55)'); g.addColorStop(0.6, 'rgba(27,107,255,.12)'); g.addColorStop(1, 'rgba(27,107,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 256);
    const h = x.createLinearGradient(0, 0, 64, 0); h.addColorStop(0, 'rgba(0,0,0,1)'); h.addColorStop(0.5, 'rgba(0,0,0,0)'); h.addColorStop(1, 'rgba(0,0,0,1)');
    x.globalCompositeOperation = 'destination-out'; x.fillStyle = h; x.fillRect(0, 0, 64, 256);
    return new THREE.CanvasTexture(c);
  }, []);

  useFrame((st) => {
    const t = st.clock.elapsedTime;
    if (puntos.current) puntos.current.rotation.y = t * 0.012;
    if (rayos.current) rayos.current.children.forEach((r, i) => { r.rotation.y = Math.sin(t * 0.05 + i) * 0.15; (r as THREE.Mesh).material && (((r as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 0.25 + 0.1 * Math.sin(t * 0.4 + i * 2)); });
  });

  return (
    <group>
      <points ref={puntos} geometry={geo}>
        <pointsMaterial size={0.02} color={new THREE.Color(0.55, 0.8, 1)} transparent opacity={0.35} sizeAttenuation depthWrite={false} blending={THREE.AdditiveBlending} />
      </points>
      <group ref={rayos}>
        {[-0.9, 0.2, 1.1].map((x, i) => (
          <mesh key={i} position={[x, 3.2, -0.8 - i * 0.4]} rotation={[0, 0, (i - 1) * 0.12]}>
            <planeGeometry args={[0.9 + i * 0.3, 6]} />
            <meshBasicMaterial map={rayoTex} transparent opacity={0.3} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} />
          </mesh>
        ))}
      </group>
    </group>
  );
}
