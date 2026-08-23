import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { sim } from '../kernel/sim'
import { RADIO_ANILLO } from '../kernel/rig'

/* LOS MUNDOS LEJANOS.
 *
 * Más allá de las casas hay más mundos, y eso cambia cómo se siente el sitio:
 * el ecosistema deja de ser ocho pelotas en el vacío y pasa a estar EN una
 * galaxia. No son apps, no se tocan y no llevan nombre —a propósito—: son
 * paisaje, y también sitio para lo que venga.
 *
 * Se dibujan lejos, chicos y sin luz propia fuerte, y NO entran en el encuadre
 * (el timón solo mide las casas), así que nunca empujan la cámara hacia atrás.
 */

interface Mundito {
  pos: THREE.Vector3
  r: number
  color: string
  giro: number
  aro: boolean
}

/* Azar con semilla: la misma galaxia en todas las pantallas y en cada visita.
   Un cielo que se rebaraja cada vez que abrís no es un lugar, es un ruido. */
function alAzar(semilla: number) {
  let s = semilla >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

const TINTES = ['#6f8fb8', '#8f7fb0', '#5f9d94', '#b08f6f', '#7a86a8', '#9d7f8f', '#68a0a8']

function sembrar(): Mundito[] {
  const r = alAzar(94117)
  const out: Mundito[] = []
  for (let i = 0; i < 26; i++) {
    const a = r() * Math.PI * 2
    const radio = RADIO_ANILLO * (1.55 + r() * 2.6)
    const alto = (r() - 0.5) * RADIO_ANILLO * 1.5
    out.push({
      pos: new THREE.Vector3(Math.cos(a) * radio, alto, Math.sin(a) * radio),
      r: 0.35 + r() * 1.15,
      color: TINTES[Math.floor(r() * TINTES.length)],
      giro: 0.05 + r() * 0.14,
      aro: r() > 0.72,
    })
  }
  return out
}

export function Lejanos() {
  const mundos = useMemo(sembrar, [])
  const grupo = useRef<THREE.Group>(null)

  useFrame((_, dt) => {
    /* Todo el conjunto gira lentísimo alrededor del centro: da la sensación de
       galaxia viva sin pedirle un solo cálculo por mundo. */
    if (!grupo.current) return
    grupo.current.rotation.y += dt * 0.006
    /* En el umbral la cámara está LEJOS y estos mundos quedaban en primer
       plano, gigantes: en la puerta se recogen a la mitad — niebla de fondo,
       no protagonistas — y al entrar recuperan su tamaño con suavidad. */
    const objetivo = (window as any).__AE_PUERTA ? 0.5 : 1
    const s = grupo.current.scale.x + (objetivo - grupo.current.scale.x) * Math.min(1, dt * 2.5)
    grupo.current.scale.setScalar(s)
  })

  return (
    <group ref={grupo}>
      {mundos.map((m, i) => (
        <group key={i} position={m.pos} rotation={[0, i * 0.7, m.aro ? 0.4 : 0]}>
          <mesh>
            <sphereGeometry args={[m.r, 20, 20]} />
            <meshStandardMaterial
              color={m.color}
              roughness={0.9}
              metalness={0.05}
              emissive={new THREE.Color(m.color)}
              emissiveIntensity={0.12}
            />
          </mesh>
          {m.aro && (
            <mesh rotation={[1.3, 0, 0.3]}>
              <ringGeometry args={[m.r * 1.5, m.r * 2.1, 40]} />
              <meshBasicMaterial
                color={m.color}
                transparent
                opacity={0.18}
                side={THREE.DoubleSide}
                depthWrite={false}
              />
            </mesh>
          )}
        </group>
      ))}
    </group>
  )
}
