import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { sim } from './sim'

/* EL DESTELLO · «Y fue la luz».
 *
 * ══ QUÉ TIENE QUE CONTAR ═════════════════════════════════════════════════
 *
 * No que ahora hay más luz: que ALGO OCURRIÓ, y que ocurrió EN UN SITIO. En
 * el centro está AU-RA, y en la tiniebla está ahí, esperando, apagada. Lo que
 * pasa en «sea la luz» es que AU-RA se enciende — y de ella sale todo lo
 * demás.
 *
 * Un velo blanco sobre la pantalla cuenta «hubo un fogonazo» y nada más: no
 * tiene origen, podría haber venido de cualquier lado. Una onda que SALE DEL
 * CENTRO y se expande hasta pasar por encima de quien mira cuenta la frase
 * entera, y sin una palabra: esto empezó ahí, y desde ahí llegó hasta acá.
 *
 * ══ CÓMO ESTÁ HECHO ══════════════════════════════════════════════════════
 *
 * Tres piezas que hacen una sola cosa:
 *
 *  · EL NÚCLEO. Una bola pequeña en el centro exacto que se enciende antes que
 *    nada. Es el instante en que AU-RA prende.
 *  · LA ONDA. Una esfera que crece desde ese punto hasta pasarse de largo. Se
 *    dibuja por dentro y por fuera (DoubleSide) porque la cámara termina
 *    QUEDANDO ADENTRO: el momento en que la onda te atraviesa es el momento en
 *    que la luz te alcanza.
 *  · EL BAÑO. Cuando la onda pasa por encima de la cámara —y solo entonces— la
 *    vista se llena de blanco un instante. No es el efecto: es lo que se ve
 *    desde dentro de la onda, que es distinto y por eso convence.
 *
 * ══ POR QUÉ EN LA ESCENA ═════════════════════════════════════════════════
 *
 * Dentro del visor la pantalla está partida en dos mitades y una capa HTML se
 * pinta UNA vez encima de las dos, corrida en direcciones opuestas para cada
 * ojo. Este es justo el momento de la película que no se puede perder ahí
 * dentro — y además, una onda que te atraviesa en estéreo es de las cosas que
 * solo se pueden sentir con un visor puesto.
 */

/* Hasta dónde llega la onda. Más que el radio del sistema: tiene que pasarse
   de largo de la cámara esté donde esté, o la luz «se queda corta» y el efecto
   se lee como una burbuja de jabón. */
/* ══ HASTA DÓNDE LLEGA, Y CUÁNDO ══════════════════════════════════════════
 * La onda tiene que pasarse de largo de la cámara esté donde esté, o la luz
 * «se queda corta» y el efecto se lee como una burbuja de jabón.
 *
 * Pero el número importante no es este: es la CURVA. Con una caída fuerte
 * —raíz— la onda salía disparada y cruzaba al espectador en catorce
 * centésimas: el fogonazo terminaba antes de que el ojo lo registrara, y en la
 * foto no se veía nunca inundada la vista. Un efecto que ocurre demasiado
 * rápido no es un efecto rápido: es un efecto que no ocurrió.
 *
 * Con la curva de abajo, la onda tarda cerca de la mitad del destello en
 * llegar hasta uno. Eso es lo que se quiere ver: la luz VINIENDO. */
const ALCANCE = 115

export function Destello() {
  const { camera } = useThree()
  const onda = useRef<THREE.Mesh>(null)
  const nucleo = useRef<THREE.Mesh>(null)
  const bano = useRef<THREE.Mesh>(null)

  const matOnda = useMemo(() => new THREE.MeshBasicMaterial({
    color: '#FFF4DC',
    transparent: true,
    opacity: 0,
    depthWrite: false,
    toneMapped: false,
    blending: THREE.AdditiveBlending,
    // por dentro también: la cámara termina quedando adentro de la onda
    side: THREE.DoubleSide,
  }), [])

  const matNucleo = useMemo(() => new THREE.MeshBasicMaterial({
    color: '#FFFFFF',
    transparent: true,
    opacity: 0,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    blending: THREE.AdditiveBlending,
  }), [])

  const matBano = useMemo(() => new THREE.MeshBasicMaterial({
    color: '#FFF6E2',
    transparent: true,
    opacity: 0,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  }), [])

  useFrame(() => {
    const o = onda.current
    const n = nucleo.current
    const b = bano.current
    if (!o || !n || !b) return

    const d = sim.destello
    if (d <= 0.001) {
      o.visible = n.visible = b.visible = false
      return
    }

    /* `sim.destello` baja de 1 a 0, así que el AVANCE de la onda es su
       complemento: cuanto menos queda del destello, más lejos llegó. */
    const p = 1 - d

    /* ══ EL PUNTO ══════════════════════════════════════════════════════════
       Empieza en NADA. Un chispazo que ya nace con medio metro de ancho no es
       un punto de luz apareciendo en la oscuridad: es una bola que se enciende,
       que es otra cosa y mucho menos impresionante. Arranca en cero, crece muy
       rápido en el primer cuarto —ahí es un punto que se abre— y después se
       lo come la onda.
       La curva es de raíz: al principio sube casi vertical y enseguida frena.
       Es lo que hace la luz de verdad y lo que el ojo espera. */
    n.visible = p < 0.5
    matNucleo.opacity = Math.max(0, 1 - p / 0.5)
    n.scale.setScalar(Math.pow(p, 0.42) * 7.5)

    /* LA ONDA: sale del centro y se expande. Arranca rápido y va frenando
       —una explosión pierde velocidad contra lo que la rodea— y se apaga
       mientras se agranda, porque la misma luz repartida en una superficie
       cada vez mayor tiene que dar menos. */
    /* Sale de un punto —arranca en cero— y se expande frenando apenas: un
       exponente cerca de uno es casi velocidad constante, con la pizca de
       desaceleración que tiene una explosión de verdad contra lo que la
       rodea. Con 0,62 se iba disparada; con 0,85 se la ve viajar. */
    const r = Math.pow(p, 0.85) * ALCANCE
    o.scale.setScalar(r)

    /* ══ Y SE APAGA EN CUANTO TE PASA POR ENCIMA ══════════════════════════
       Una esfera llena vista DESDE AFUERA es una bola de luz creciendo: eso es
       la explosión. Vista desde ADENTRO —y la cámara termina adentro, porque
       la onda la alcanza— es una niebla que cubre el cuadro entero y lava toda
       la escena de gris. Lo mismo que a un lado es el efecto, del otro lo
       arruina.
       Así que la onda vive mientras está VINIENDO. En el momento en que su
       radio pasa la distancia de la cámara, el relevo lo toma el baño de abajo
       —el fogonazo del instante en que la luz te alcanza— y la esfera se
       retira en un suspiro. */
    const dist = camera.position.length()
    const yaPaso = THREE.MathUtils.clamp((r - dist) / (ALCANCE * 0.10), 0, 1)
    matOnda.opacity = Math.max(0, (1 - p) * 0.85) * (1 - yaPaso)
    o.visible = matOnda.opacity > 0.004

    /* EL BAÑO: solo mientras la onda está pasando POR ENCIMA de la cámara.
       Se compara el radio de la onda con la distancia al centro; el instante
       en que se cruzan es el instante en que la luz te alcanza. */
    /* Para que una prueba pueda comprobar lo único que de verdad importa acá y
       que una foto no puede: CUÁNTO TARDA la luz en llegar hasta uno. Con la
       curva mal puesta la onda cruzaba al espectador en catorce centésimas —
       ocurría, pero nadie la veía— y desde fuera eso se ve exactamente igual
       que un fogonazo perfecto. */
    ;(window as any).__AE_ONDA = { r, dist, p, destello: d }

    const cerca = 1 - Math.min(1, Math.abs(r - dist) / (ALCANCE * 0.14))
    b.visible = cerca > 0.01
    if (b.visible) {
      matBano.opacity = Math.min(0.88, cerca * cerca * 0.95)
      b.position.copy(camera.position)
      b.quaternion.copy(camera.quaternion)
      b.translateZ(-0.5)
    }
  })

  return (
    <>
      {/* la onda, centrada en AU-RA */}
      <mesh ref={onda} material={matOnda} visible={false} renderOrder={1400}>
        <sphereGeometry args={[1, 48, 32]} />
      </mesh>
      {/* el chispazo del centro: AU-RA prendiendo */}
      <mesh ref={nucleo} material={matNucleo} visible={false} renderOrder={1450}>
        <sphereGeometry args={[1, 24, 16]} />
      </mesh>
      {/* lo que se ve desde DENTRO de la onda cuando te pasa por encima */}
      <mesh ref={bano} material={matBano} visible={false} renderOrder={1500}>
        <planeGeometry args={[2, 2]} />
      </mesh>
    </>
  )
}
