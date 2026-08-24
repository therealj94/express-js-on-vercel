import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { sim } from './sim'
import { poseMirada } from './mirada'

/* EL TEATRO · las palabras DENTRO del visor.
 *
 * ══ POR QUÉ NO SIRVE EL HTML ══════════════════════════════════════════════
 *
 * Con el visor puesto, la pantalla está partida en dos mitades —una por ojo—
 * y cada mitad ve la escena desde un punto ligeramente distinto. Un rótulo
 * HTML se pinta UNA vez, encima de las dos mitades: al ojo izquierdo le queda
 * corrido y al derecho también, en direcciones opuestas. El cerebro no
 * fusiona eso, y el resultado es una mancha doble que además marea. Por eso
 * la historia se veía muda dentro del visor: la capa estaba ahí, pero era
 * inservible, y lo correcto era no pintarla.
 *
 * ══ LO QUE HACE ESTO ══════════════════════════════════════════════════════
 *
 * Las palabras pasan a ser un OBJETO DE LA ESCENA, dibujado por las dos
 * cámaras como cualquier planeta. Y con eso vienen tres decisiones que solo
 * tienen sentido dentro de un visor:
 *
 *  · A DOS METROS Y MEDIO, no pegado a la cara. Es la distancia a la que un
 *    ojo humano descansa; más cerca obliga a bizquear y en un minuto duele.
 *  · UN POCO POR DEBAJO DEL HORIZONTE. Leer con la cabeza levantada cansa el
 *    cuello enseguida; el texto se pone donde uno mira cuando está tranquilo.
 *  · SIGUE LA CABEZA, PERO CON RETRASO. Si el rótulo estuviera clavado a la
 *    cámara, sería una pegatina en las gafas — se mueve exactamente contigo y
 *    el cerebro lo lee como suciedad en el cristal, no como algo que está en
 *    el mundo. Si estuviera fijo en el mundo, se perdería al girar la cabeza.
 *    La solución de todos los visores buenos: va detrás, con calma, y se
 *    reacomoda cuando te quedás mirando a otro lado. Ahí SÍ se siente como un
 *    cartel colgado delante tuyo.
 */

const ANCHO = 2048
const ALTO = 512

/* La letra se pinta en un lienzo y se estira sobre un plano. Un lienzo por
   frase, cacheado: repintar en cada cuadro sería tirar la tarjeta gráfica por
   una frase que no cambia. */
const cache = new Map<string, THREE.CanvasTexture>()

function pintar(texto: string, peso: 'normal' | 'grande' | 'cierre' | 'titulo'): THREE.CanvasTexture {
  const clave = `${peso}:${texto}`
  const hecho = cache.get(clave)
  if (hecho) return hecho

  const c = document.createElement('canvas')
  c.width = ANCHO
  c.height = ALTO
  const g = c.getContext('2d')!

  const lineas = texto.split('\n')
  const tam = peso === 'grande' ? 128 : peso === 'titulo' ? 116 : peso === 'cierre' ? 104 : 92
  const familia = peso === 'cierre' || peso === 'titulo'
    ? `600 ${tam}px Cinzel, "Bodoni Moda", Georgia, serif`
    : `500 ${tam}px Cinzel, "Bodoni Moda", Georgia, serif`
  g.font = familia
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  /* El titulo lleva el mismo aire que en pantalla: mucha separacion entre
     letras es lo que hace que algo se lea como titulo y no como frase. */
  g.letterSpacing = peso === 'cierre' ? '18px' : peso === 'titulo' ? '22px' : '2px'

  const alto = tam * 1.35
  const y0 = ALTO / 2 - ((lineas.length - 1) * alto) / 2

  lineas.forEach((l, i) => {
    const y = y0 + i * alto
    /* DOS PASADAS. Primero un contorno oscuro y ancho, después la letra: en
       un visor el texto cae sobre estrellas, planetas y a veces sobre el sol,
       y sin ese respaldo hay trozos de frase que sencillamente desaparecen. */
    g.lineWidth = tam * 0.14
    g.lineJoin = 'round'
    g.strokeStyle = 'rgba(2,5,14,0.92)'
    g.strokeText(l, ANCHO / 2, y)
    g.shadowColor = peso === 'cierre' || peso === 'titulo'
      ? 'rgba(201,169,97,0.75)' : 'rgba(0,0,0,0.9)'
    g.shadowBlur = 26
    g.fillStyle = peso === 'cierre' || peso === 'titulo' ? '#EAD79C' : '#F7EDD2'
    g.fillText(l, ANCHO / 2, y)
    g.shadowBlur = 0
  })

  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  cache.set(clave, tex)
  return tex
}

export interface Frase {
  texto: string
  peso: 'normal' | 'grande' | 'cierre' | 'titulo'
  /* Un sello de tiempo: dos frases iguales seguidas tienen que volver a
     entrar, y sin esto la segunda no se notaría. */
  turno: number
}

export function Teatro() {
  const { camera } = useThree()
  const [frase, setFrase] = useState<Frase | null>(null)
  const grupo = useRef<THREE.Group>(null)
  const malla = useRef<THREE.Mesh>(null)
  const desde = useRef(0)

  /* El puente con la casa: la wallet dicta las frases por aquí, igual que
     dicta los rótulos HTML cuando hay pantalla. */
  useEffect(() => {
    const w = window as any
    let turno = 0
    w.__AE_DECIR = (texto: string | null,
                    peso: 'normal' | 'grande' | 'cierre' | 'titulo' = 'normal') => {
      turno += 1
      if (!texto) { setFrase(null); return }
      setFrase({ texto, peso, turno })
      desde.current = performance.now()
    }
    return () => { if (w.__AE_DECIR) delete w.__AE_DECIR }
  }, [])

  const mat = useMemo(() => new THREE.MeshBasicMaterial({
    transparent: true,
    depthTest: false,      // el texto se lee SIEMPRE, aunque haya un planeta delante
    depthWrite: false,
    toneMapped: false,
    opacity: 0,
  }), [])

  /* Adónde debería estar el cartel: delante de la cabeza, un poco abajo. Se
     recalcula cada cuadro y el grupo lo persigue con retraso. */
  const meta = useMemo(() => new THREE.Vector3(), [])
  const frenteCam = useMemo(() => new THREE.Vector3(), [])
  const plano = useMemo(() => new THREE.Vector3(), [])
  const qMeta = useMemo(() => new THREE.Quaternion(), [])
  const ojoPos = useMemo(() => new THREE.Vector3(), [])
  const ojoQuat = useMemo(() => new THREE.Quaternion(), [])
  /* Reutilizada, no creada en cada cuadro: dentro de un visor esto se dibuja
     dos veces por fotograma, y la basura que genera un objeto nuevo por cuadro
     sale en forma de tirón. Un tirón en la cara marea; en la pantalla, no. */
  const mLook = useMemo(() => new THREE.Matrix4(), [])
  const dirMeta = useMemo(() => new THREE.Vector3(), [])
  const dirSuave = useMemo(() => new THREE.Vector3(), [])
  const arriba = useMemo(() => new THREE.Vector3(0, 1, 0), [])
  const listo = useRef(false)

  useFrame((_, dt) => {
    const g = grupo.current
    const m = malla.current
    if (!g || !m) return

    if (!frase) {
      mat.opacity = Math.max(0, mat.opacity - dt * 2.2)
      g.visible = mat.opacity > 0.01
      return
    }
    g.visible = true

    if (mat.map !== pintar(frase.texto, frase.peso)) {
      mat.map = pintar(frase.texto, frase.peso)
      mat.needsUpdate = true
    }

    /* LA ENTRADA. Sube y aparece en algo más de un segundo — dentro de un
       visor, un texto que aparece de golpe sobresalta. */
    const t = (performance.now() - desde.current) / 1000
    const p = Math.min(1, t / 1.25)
    const e = 1 - Math.pow(1 - p, 3)
    mat.opacity = e

    /* DÓNDE TENDRÍA QUE ESTAR: dos metros y medio al frente y un poco por
       debajo de la línea de los ojos.
       ══ POR QUÉ EN EL MARCO DE LA CABEZA Y NO EN EL DEL MUNDO ══════════════
       Antes esto se aplanaba contra la vertical del mundo, dando por hecho que
       quien mira está mirando al horizonte. No lo está: el timón mira la
       galaxia DESDE ARRIBA, unos cuarenta grados picado, y con el visor puesto
       esa inclinación se compone con la de la cabeza. O sea que el frente de la
       persona apunta bastante más abajo que el horizonte — y el cartel, colgado
       en el horizonte, le quedaba cuarenta grados por encima de la vista. Era
       el «no salían las letras»: colgadas del techo.
       Puesto en el marco de la cabeza, «al frente y un poco abajo» significa lo
       que dice, con el timón picado o llano. Lo que evitaba que el cartel se
       zarandee al mover la cabeza no era el aplanado sino el retraso de más
       abajo, que sigue igual. */
    /* DE LA CABEZA, NO DE LA CÁMARA. Con el visor puesto son dos direcciones
       distintas —el timón por un lado, el giroscopio por otro— y usando la de
       la cámara el cartel se quedaba clavado donde apuntaba el timón mientras
       la persona miraba a otro lado. Ese era el «no salían las letras»: salían,
       pero fuera de la vista. Ver kernel/mirada.ts. */
    poseMirada(camera, ojoPos, ojoQuat)
    frenteCam.set(0, 0, -1).applyQuaternion(ojoQuat)
    plano.set(0, -1, 0).applyQuaternion(ojoQuat)   // «abajo», el de la cabeza
    /* 0.52 a 2.5 = doce grados por debajo de los ojos. Ese número está atado al
       del pórtico (Portico.tsx): el botón tiene que quedar FUERA del cono de la
       mirada cuando alguien está leyendo esto, o leer la historia la saltaría.
       Si un día se mueve uno, hay que mover el otro. */
    meta.copy(ojoPos).addScaledVector(frenteCam, 2.5).addScaledVector(plano, 0.52)

    /* EL RETRASO ES DEL GIRO, NO DEL VIAJE.
     *
     * Retrasar la POSICIÓN en el mundo parecía lo mismo y no lo es. Girar la
     * cabeza mueve el cartel un metro y lo alcanza enseguida; pero la película
     * vuela la cámara de un planeta a otro, veinte metros de un tirón, y ahí el
     * cartel se quedaba atrás de verdad — a cinco metros y sesenta grados de la
     * vista, cruzando la pantalla cada vez que la cámara se movía.
     *
     * Lo que tiene que ir con calma es HACIA DÓNDE cuelga respecto de la cara.
     * Así que se suaviza la dirección y la distancia se respeta siempre: al
     * girar la cabeza el cartel sigue viniendo detrás con su punto de inercia,
     * y al viajar va clavado delante, como si estuviera colgado del casco. */
    dirMeta.copy(meta).sub(ojoPos)
    const largo = dirMeta.length() || 2.5
    dirMeta.divideScalar(largo)
    if (!listo.current) { dirSuave.copy(dirMeta); listo.current = true }
    else dirSuave.lerp(dirMeta, 1 - Math.exp(-2.6 * dt)).normalize()
    g.position.copy(ojoPos).addScaledVector(dirSuave, largo)
    // y encara siempre a la cabeza, de plano, sin ladearse
    qMeta.setFromRotationMatrix(mLook.lookAt(g.position, ojoPos, arriba))
    g.quaternion.slerp(qMeta, 1 - Math.exp(-5 * dt))

    const s = frase.peso === 'grande' ? 1.18 : frase.peso === 'titulo' ? 1.14 : 1
    m.scale.set(2.4 * s, 0.6 * s, 1)
  })

  useEffect(() => { listo.current = false }, [])

  /* Para que una prueba pueda comprobar lo que una foto no distingue: si las
     palabras están DELANTE de la persona, y a qué distancia. Dentro de un
     visor eso es la diferencia entre leerlas y no verlas. */
  useEffect(() => {
    const w = window as any
    w.__AE_TEATRO = () => {
      const g = grupo.current
      if (!g || !frase) return { texto: '', delante: false }
      const oPos = new THREE.Vector3()
      const oQuat = new THREE.Quaternion()
      poseMirada(camera, oPos, oQuat)
      const haciaTexto = g.position.clone().sub(oPos)
      const dist = haciaTexto.length()
      const frenteC = new THREE.Vector3(0, 0, -1).applyQuaternion(oQuat)
      const cos = haciaTexto.normalize().dot(frenteC)
      const grados = Math.round((Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI)
      return {
        texto: frase.texto,
        dist: Math.round(dist * 10) / 10,
        grados,
        /* «Delante» de verdad: a distancia de lectura y dentro del cono
           cómodo de la vista, no simplemente existiendo en la escena. */
        delante: dist > 1.2 && dist < 4.5 && grados < 32,
      }
    }
    return () => { if (w.__AE_TEATRO) delete w.__AE_TEATRO }
  }, [frase, camera])

  /* Solo existe dentro del visor: en pantalla los rótulos son de la casa, en
     HTML, que ahí se ven mejor y se leen con el idioma del sistema. */
  if (sim.pelicula !== 2 && !frase) return null

  return (
    <group ref={grupo} renderOrder={1200}>
      <mesh ref={malla} material={mat}>
        <planeGeometry args={[1, 1]} />
      </mesh>
    </group>
  )
}
