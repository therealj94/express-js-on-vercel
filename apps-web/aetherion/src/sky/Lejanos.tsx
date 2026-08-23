import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { sim } from '../kernel/sim'
import { RADIO_ANILLO } from '../kernel/rig'
import { getFlareTexture } from './textures'

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
  sol: boolean          // los soles lejanos: los que dan la escala de galaxia
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
  for (let i = 0; i < 54; i++) {
    const a = r() * Math.PI * 2
    /* Nunca dentro del barrio de las casas: un mundo de paisaje metido en
       primer plano tapa la escena y encima parece una app que no se puede
       tocar. Empiezan bien afuera del anillo. */
    const radio = RADIO_ANILLO * (2.3 + r() * 4.6)
    const alto = (r() - 0.5) * RADIO_ANILLO * 2.2
    /* Uno de cada seis es un SOL: pequeño, encendido y con su halo. Son los
       que convierten «unas bolas lejos» en una galaxia — el ojo lee soles y
       entiende que hay más sistemas ahí afuera. */
    const sol = r() > 0.84
    out.push({
      pos: new THREE.Vector3(Math.cos(a) * radio, alto, Math.sin(a) * radio),
      r: sol ? 0.5 + r() * 0.7 : 0.3 + r() * 1.5,
      color: sol ? ['#ffe9b8', '#cfe6ff', '#ffd2b0'][Math.floor(r() * 3)]
                 : TINTES[Math.floor(r() * TINTES.length)],
      giro: 0.05 + r() * 0.14,
      aro: !sol && r() > 0.72,
      sol,
    })
  }
  return out
}

/* LAS CONSTELACIONES. Hilos finísimos entre mundos vecinos: no significan
   nada —y por eso no llevan nombre ni número—, son lo que el ojo humano lleva
   milenios haciendo con las estrellas. Aparecen al ALEJARSE, que es cuando
   hay cielo suficiente para verlas; de cerca estorbarían. */
function tejer(mundos: Mundito[]): Float32Array {
  const puntos: number[] = []
  for (let i = 0; i < mundos.length; i++) {
    let mejor = -1
    let dm = Infinity
    for (let j = 0; j < mundos.length; j++) {
      if (i === j) continue
      const d = mundos[i].pos.distanceToSquared(mundos[j].pos)
      if (d < dm) { dm = d; mejor = j }
    }
    if (mejor >= 0 && dm < 900) {
      puntos.push(mundos[i].pos.x, mundos[i].pos.y, mundos[i].pos.z)
      puntos.push(mundos[mejor].pos.x, mundos[mejor].pos.y, mundos[mejor].pos.z)
    }
  }
  return new Float32Array(puntos)
}

export function Lejanos() {
  const mundos = useMemo(sembrar, [])
  const hilos = useMemo(() => tejer(mundos), [mundos])
  const lineas = useRef<THREE.LineSegments>(null)
  const grupo = useRef<THREE.Group>(null)

  useFrame((estado, dt) => {
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

    /* Las constelaciones se encienden con la distancia: de cerca no existen,
       de lejos son el dibujo del cielo. */
    if (lineas.current) {
      const d = estado.camera.position.length()
      const m = lineas.current.material as THREE.LineBasicMaterial
      const q = THREE.MathUtils.clamp((d - RADIO_ANILLO * 2.4) / (RADIO_ANILLO * 3), 0, 1)
      m.opacity = 0.15 * q
      lineas.current.visible = q > 0.02
    }
  })

  return (
    <group ref={grupo}>
      <lineSegments ref={lineas} visible={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[hilos, 3]} />
        </bufferGeometry>
        <lineBasicMaterial color="#9fd8ff" transparent opacity={0} depthWrite={false} />
      </lineSegments>
      {mundos.map((m, i) => (
        <group key={i} position={m.pos} rotation={[0, i * 0.7, m.aro ? 0.4 : 0]}>
          <mesh>
            <sphereGeometry args={[m.r, 20, 20]} />
            {m.sol ? (
              <meshBasicMaterial color={m.color} toneMapped={false} />
            ) : (
              <meshStandardMaterial
                color={m.color}
                roughness={0.9}
                metalness={0.05}
                emissive={new THREE.Color(m.color)}
                emissiveIntensity={0.12}
              />
            )}
          </mesh>
          {/* El halo de un sol lejano es un DETALLE, no un protagonista: con el
              tamaño de antes, uno que pasara cerca deslumbraba más que AU-RA y
              parecía un fallo. */}
          {m.sol && (
            <sprite scale={m.r * 4.5}>
              <spriteMaterial
                map={getFlareTexture()}
                color={m.color}
                transparent
                opacity={0.26}
                depthWrite={false}
                blending={THREE.AdditiveBlending}
                toneMapped={false}
              />
            </sprite>
          )}
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
