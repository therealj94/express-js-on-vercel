import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { sim } from './sim'

/* EL DESTELLO · «Y fue la luz».
 *
 * ══ POR QUÉ ══════════════════════════════════════════════════════════════
 *
 * El nacimiento de una estrella no es una transición: es un acontecimiento.
 * Subir el brillo del sol durante un segundo cuenta que ahora hay más luz;
 * un FOGONAZO cuenta que algo acaba de ocurrir. Es la diferencia entre
 * encender una lámpara y ver un relámpago, y esta película necesita el
 * relámpago exactamente una vez.
 *
 * ══ POR QUÉ EN LA ESCENA Y NO EN UNA CAPA HTML ══════════════════════════
 *
 * Un velo blanco en HTML sería tres líneas y funcionaría en pantalla. Dentro
 * del visor, no: la pantalla está partida en dos mitades, una por ojo, y el
 * HTML se pinta UNA vez encima de las dos. Al ojo izquierdo le queda corrido y
 * al derecho también, en direcciones opuestas — y este es justo el momento de
 * la película que no se puede perder con el visor puesto.
 *
 * Así que es un objeto: un plano pegado delante de la cámara, dibujado por las
 * dos cámaras como cualquier planeta, que se enciende y se apaga solo.
 *
 * ══ POR QUÉ NO TAPA DEL TODO ═════════════════════════════════════════════
 *
 * El blanco llega a 0,92 y no a 1. Un blanco absoluto borra la pantalla y
 * durante un instante no hay NADA — el ojo lo lee como un corte, como si el
 * video hubiera saltado. Dejando asomar algo por debajo, el fogonazo se lee
 * como luz que inunda la escena, que es lo que es.
 */
export function Destello() {
  const { camera } = useThree()
  const malla = useRef<THREE.Mesh>(null)

  const mat = useMemo(() => new THREE.MeshBasicMaterial({
    color: '#FFF6E2',           // blanco cálido: es un SOL, no un flash de cámara
    transparent: true,
    opacity: 0,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  }), [])

  useFrame(() => {
    const m = malla.current
    if (!m) return
    if (sim.destello <= 0.001) { m.visible = false; return }
    m.visible = true

    /* Delante de los ojos y grande: a medio metro, un plano de dos por dos
       cubre mucho más que el campo de visión, con visor y sin él. Se coloca en
       cada cuadro en vez de colgarse de la cámara — meter la cámara dentro de
       un grupo la saca de su sitio en la escena y rompe todo lo demás. */
    m.position.copy(camera.position)
    m.quaternion.copy(camera.quaternion)
    m.translateZ(-0.5)

    /* La curva: el fogonazo entra de golpe y se va con una caída al cuadrado,
       que es como se apaga la luz de verdad. `sim.destello` ya baja solo. */
    mat.opacity = Math.min(0.92, sim.destello * sim.destello * 1.15)
  })

  return (
    <mesh ref={malla} material={mat} visible={false} renderOrder={1500}>
      <planeGeometry args={[2, 2]} />
    </mesh>
  )
}
