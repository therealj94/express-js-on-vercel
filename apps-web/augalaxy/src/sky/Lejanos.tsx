import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { sim } from '../kernel/sim'
import { RADIO_ANILLO } from '../kernel/rig'
import { getFlareTexture, getRingTexture } from './textures'
import { pielMundo, type FamiliaMundo } from './emblema'

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
  fam: FamiliaMundo     // de qué familia es su piel
  eje: number           // la torcedura de su eje: ninguno gira derecho
  aire: boolean         // ¿tiene atmósfera? entonces tiene filo de luz
  luna: number          // 0 = sin luna
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

/* Cada familia tiñe distinto: un mundo helado no puede salir marrón y uno
   volcánico no puede salir celeste. El color se sortea DENTRO de su familia,
   y así cincuenta y cuatro mundos distintos siguen pareciendo del mismo
   universo. */
const FAMILIAS: Array<{ fam: FamiliaMundo; tintes: string[]; aire: boolean }> = [
  { fam: 'rocoso', tintes: ['#8a8378', '#9c8f7e', '#77726b', '#a08b74'], aire: false },
  { fam: 'helado', tintes: ['#bcd6e8', '#a8c4dc', '#cfe2ee', '#93b6cf'], aire: true },
  { fam: 'desierto', tintes: ['#c9a678', '#b8925f', '#d4b98a', '#a8804f'], aire: true },
  { fam: 'volcanico', tintes: ['#a2604a', '#8c4c3a', '#b06b4e', '#7a3f30'], aire: false },
  { fam: 'oceano', tintes: ['#5f8fbe', '#4d7ea8', '#6ea2c8', '#3f6f96'], aire: true },
  { fam: 'gaseoso', tintes: ['#c2a880', '#a8927a', '#d0b48e', '#9c8f9e'], aire: true },
]

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
    const f = FAMILIAS[Math.floor(r() * FAMILIAS.length)]
    out.push({
      pos: new THREE.Vector3(Math.cos(a) * radio, alto, Math.sin(a) * radio),
      r: sol ? 0.5 + r() * 0.7 : 0.3 + r() * 1.5,
      color: sol ? ['#ffe9b8', '#cfe6ff', '#ffd2b0'][Math.floor(r() * 3)]
                 : f.tintes[Math.floor(r() * f.tintes.length)],
      giro: 0.05 + r() * 0.14,
      aro: !sol && r() > 0.72,
      sol,
      fam: f.fam,
      /* La torcedura: entre nada y medio radián, cada uno la suya. Es el
         detalle más barato que existe para que una fila de esferas deje de
         parecer una fila de esferas. */
      eje: (r() - 0.5) * 1.0,
      aire: !sol && f.aire && r() > 0.35,
      luna: !sol && r() > 0.78 ? 0.16 + r() * 0.14 : 0,
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
    /* En el vacío del Génesis los mundos del paisaje se encogen hasta
       desaparecer: la nada tiene que ser nada, no «unas bolas apagadas». */
    const objetivo = sim.vacio > 0.01 ? 0.001
      : (window as any).__AE_PUERTA ? 0.5 : 1
    const s = grupo.current.scale.x + (objetivo - grupo.current.scale.x) * Math.min(1, dt * 2.5)
    grupo.current.scale.setScalar(s)

    /* Las constelaciones se encienden con la distancia: de cerca no existen,
       de lejos son el dibujo del cielo. */
    if (lineas.current) {
      const d = estado.camera.position.length()
      const m = lineas.current.material as THREE.LineBasicMaterial
      const q = THREE.MathUtils.clamp((d - RADIO_ANILLO * 2.4) / (RADIO_ANILLO * 3), 0, 1)
      m.opacity = 0.15 * q * (1 - sim.vacio)
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
        <group key={i} position={m.pos} rotation={[0, i * 0.7, m.eje]}>
          <mesh>
            <sphereGeometry args={[m.r, 32, 32]} />
            {m.sol ? (
              <meshBasicMaterial color={m.color} toneMapped={false} />
            ) : (
              /* Sin luz propia: los mundos de paisaje también los modela el
                 sol, y por eso tienen su cara de día y su terminador. Antes
                 se auto-iluminaban y parecían pegatinas de papel.

                 Y desde ahora con PIEL: la de su familia, en gris, teñida por
                 su color, y la MISMA imagen sirviendo de mapa de relieve —
                 donde la piel es clara el terreno sobresale, y con el sol
                 rasante eso da cráteres, dunas, grietas y bandas. Es la
                 diferencia entre una pelota de color y un mundo. */
              <meshStandardMaterial
                color={m.color}
                map={pielMundo(m.fam)}
                bumpMap={pielMundo(m.fam)}
                bumpScale={m.fam === 'gaseoso' || m.fam === 'oceano' ? 0.006 : 0.02}
                roughness={m.fam === 'oceano' ? 0.6 : m.fam === 'helado' ? 0.7 : 0.95}
                metalness={m.fam === 'oceano' ? 0.1 : 0.02}
                /* Un suelo mínimo de luz propia con su PROPIA piel: a esta
                   distancia el relieve no se ve, pero la mancha sí, y sin
                   ella el mundo se lee como un agujero recortado en el
                   cielo. No es brillo — es que la superficie exista. */
                emissive={new THREE.Color(m.color)}
                emissiveMap={pielMundo(m.fam)}
                emissiveIntensity={0.09}
              />
            )}
          </mesh>
          {/* EL FILO DE LA ATMÓSFERA. Una cáscara apenas mayor, vista por
              dentro y sumando luz: de frente no se ve y en el borde enciende
              esa línea fina que tiene cualquier planeta con aire. */}
          {m.aire && (
            <mesh scale={1.045}>
              <sphereGeometry args={[m.r, 24, 24]} />
              <meshBasicMaterial color={m.color} transparent opacity={0.26}
                side={THREE.BackSide} depthWrite={false} blending={THREE.AdditiveBlending} />
            </mesh>
          )}
          {m.luna > 0 && (
            <mesh position={[m.r * 2.4, m.r * 0.4, 0]}>
              <sphereGeometry args={[m.r * m.luna, 16, 16]} />
              <meshStandardMaterial color="#9a958c" map={pielMundo('rocoso')}
                bumpMap={pielMundo('rocoso')} bumpScale={0.014} roughness={0.98} />
            </mesh>
          )}
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
              <ringGeometry args={[m.r * 1.5, m.r * 2.3, 64]} />
              {/* El anillo lleva la textura de bandas: un aro liso de color se
                  ve como un aro de plástico, y los anillos de verdad son
                  polvo en carriles con huecos entre ellos. */}
              <meshBasicMaterial
                map={getRingTexture()}
                color={m.color}
                transparent
                opacity={0.4}
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
