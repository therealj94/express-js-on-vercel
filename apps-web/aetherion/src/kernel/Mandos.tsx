import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { PUNTERO } from './mirada'
import { rig } from './rig'
import { sim } from './sim'

/* LOS MANDOS DEL VISOR.
 *
 * ══ POR QUÉ ESTO TENÍA QUE EXISTIR ════════════════════════════════════════
 *
 * En un Quest nadie apunta con la cabeza. Se saca el mando, se estira el
 * brazo y se señala — o se levanta la mano y se pellizca, que el visor manda
 * por el mismo camino. La galaxia sólo escuchaba la MIRADA: sostener la vista
 * un segundo y medio sobre un planeta para abrirlo. Eso está bien en un visor
 * de cartón, donde no hay otra cosa; con un mando en la mano es sencillamente
 * el aparato ignorándote.
 *
 * Y había algo peor que ignorar. El gatillo SÍ estaba escuchado, pero abría
 * «lo que la cabeza tuviera en el centro». O sea que quien señalaba DBNX con
 * el mando y apretaba, entraba en el planeta que le quedara de frente. Un
 * botón que hace otra cosa es peor que un botón muerto.
 *
 * ══ QUÉ HACE ══════════════════════════════════════════════════════════════
 *
 *   · Publica en PUNTERO hacia dónde apunta el mando que se está usando, para
 *     que la puntería, la retícula y el pórtico pregunten en un solo sitio.
 *   · Dibuja el rayo. Sin verlo no se puede apuntar: es la mitad del gesto.
 *   · El joystick recorre la galaxia — girar y acercar. Dentro de un visor no
 *     hay rueda, ni dedo, ni teclas: sin esto sólo se puede mirar.
 *   · A/X recentra el frente. B/Y sale del visor, que es la única salida que
 *     no obliga a irse también del navegador.
 *
 * ══ CUÁL DE LOS DOS MANDA ═════════════════════════════════════════════════
 *
 * Los dos mandos están siempre conectados, también el que quedó sobre la
 * mesa. Manda el que se movió último: sin esa regla la puntería salta de uno
 * a otro y no obedece a nadie. Si ninguno se mueve por un rato largo —se
 * dejaron los mandos, se está sólo con las manos— el puntero se apaga y la
 * cabeza vuelve a ser el puntero, que es lo que hace falta para que el modo
 * cartón y el Quest compartan el mismo código.
 */

/* Cuánto tiene que quedarse quieto un mando para que deje de mandar. Largo a
   propósito: apuntar a algo y sostenerlo es un gesto normal, y apagar el rayo
   en mitad de una selección sería quitarle la mano a alguien. */
const OLVIDO = 2500
/* Cuánto tiene que moverse para que se le haga caso. Un mando en reposo
   tiembla; sin este mínimo, el de la mesa le robaría el turno al de la mano. */
const MOVIO = 0.004

export const MANDOS = {
  /* Cuántos se están viendo. Sólo para el diagnóstico: dentro de un visor
     nada de esto se puede comprobar con una captura. */
  cuantos: 0,
}

function Rayo({ mano }: { mano: 'left' | 'right' }) {
  const { gl } = useThree() as any
  /* Los objetos del mando los cría three: uno por índice, y se quedan vivos
     entre sesiones. Se meten en la escena para que su matriz se recalcule con
     el resto — fuera de ella, three los actualiza pero nadie los compone, y
     quedan apuntando a donde estaban al empezar. */
  const i = mano === 'left' ? 0 : 1
  const ctrl = useMemo(() => gl.xr.getController(i), [gl, i])
  const antes = useMemo(() => new THREE.Vector3(), [])
  const pos = useMemo(() => new THREE.Vector3(), [])
  const dir = useMemo(() => new THREE.Vector3(), [])
  const visto = useRef(false)

  /* El rayo y su punta se arman a mano y no en JSX: `<line>` en R3F choca con
     el `line` de SVG que React ya conoce, y el apaño para que compile es peor
     que estas seis líneas. */
  const linea = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, -1], 3))
    const m = new THREE.LineBasicMaterial({
      color: 0xEAD79C, transparent: true, opacity: 0.3, depthTest: false, toneMapped: false,
    })
    const l = new THREE.Line(g, m)
    l.renderOrder = 1400
    l.frustumCulled = false
    return l
  }, [])
  const punta = useMemo(() => {
    const p = new THREE.Mesh(
      new THREE.SphereGeometry(0.055, 12, 12),
      new THREE.MeshBasicMaterial({
        color: 0xF7EDD2, transparent: true, opacity: 0.35, depthTest: false, toneMapped: false,
      }),
    )
    p.renderOrder = 1401
    p.frustumCulled = false
    return p
  }, [])
  useEffect(() => () => {
    linea.geometry.dispose(); (linea.material as THREE.Material).dispose()
    punta.geometry.dispose(); (punta.material as THREE.Material).dispose()
  }, [linea, punta])

  useFrame(() => {
    const c = ctrl as THREE.Object3D
    /* `visible` lo pone three: falso mientras el visor no vea ese mando. Un
       mando guardado en el bolsillo no tiene por qué apuntar a nada. */
    const vivo = !!c && c.visible
    if (visto.current !== vivo) {
      visto.current = vivo
      MANDOS.cuantos += vivo ? 1 : -1
      if (MANDOS.cuantos < 0) MANDOS.cuantos = 0
      /* Si el que se guardó era el que mandaba, el puntero se suelta AHORA y
         no cuando venza el olvido: un rayo fantasma señalando donde estaba la
         mano hace dos segundos abre el planeta equivocado. */
      if (!vivo && PUNTERO.mano === mano) { PUNTERO.activo = false; PUNTERO.mano = '' }
    }
    linea.visible = vivo
    punta.visible = vivo
    if (!vivo) return

    c.getWorldPosition(pos)
    c.getWorldDirection(dir)
    /* getWorldDirection da el +Z del objeto y el rayo del mando sale por el
       −Z: sin darlo vuelta se apunta hacia atrás, hacia uno mismo. */
    dir.negate()

    const ahora = sim.now * 1000
    const movio = antes.lengthSq() > 0 && pos.distanceTo(antes) > MOVIO
    antes.copy(pos)

    /* El turno se gana moviéndose, y se conserva mientras no lo gane el otro.
       Sin la segunda mitad, apuntar quieto a un planeta soltaba el rayo justo
       cuando la selección estaba por completarse. */
    if (movio) { PUNTERO.mano = mano; PUNTERO.desde = ahora }
    if (PUNTERO.mano !== mano) return

    PUNTERO.activo = true
    PUNTERO.origen.copy(pos)
    PUNTERO.dir.copy(dir)

    /* Y el largo del rayo dibujado dice hasta dónde llega: corto contra el
       vacío, estirado hasta lo que se esté señalando. Es la diferencia entre
       «estoy apuntando» y «estoy apuntando A ESTO». */
    const casa = (window as any).__AE_MIRAR?.(0, 0) || null
    const largo = casa ? 26 : 9
    linea.scale.z = largo
    punta.position.set(0, 0, -largo)
    punta.scale.setScalar(casa ? 1 : 0.45)
    ;(punta.material as THREE.MeshBasicMaterial).opacity = casa ? 0.95 : 0.35
    ;(linea.material as THREE.LineBasicMaterial).opacity = casa ? 0.75 : 0.3
  })

  return (
    <primitive object={ctrl}>
      <primitive object={linea} />
      <primitive object={punta} />
    </primitive>
  )
}

export function Mandos({ activo, alSalir }: { activo: boolean; alSalir: () => void }) {
  const { gl } = useThree() as any
  const apretado = useRef<Record<string, boolean>>({})

  /* Al salir del visor no queda nada apuntando: si el puntero se quedara
     encendido, la puntería de la pantalla seguiría preguntándole a un mando
     que ya no existe y no encontraría nunca nada. */
  useEffect(() => {
    if (activo) return
    PUNTERO.activo = false
    PUNTERO.mano = ''
    MANDOS.cuantos = 0
  }, [activo])

  /* ── UN MANDO DE MENTIRA, PARA PODER COMPROBAR ESTO ──────────────────────
   *
   * Nada de lo de aquí arriba se puede ver sin un Quest en la cara: hace falta
   * una sesión inmersiva de verdad para que exista un mando, y sin mando no hay
   * forma de comprobar lo único que de verdad importa — que apuntando a un
   * mundo con el rayo se abre ESE y no el que quedaba de frente. Ese fallo se
   * ve idéntico a todo bien desde fuera.
   *
   * Así que se puede poner un mando a mano. Es la misma puerta que
   * `__AE_DIAG_PICK` y `__AE_DIAG_MIRA`, de la misma familia y por la misma
   * razón. Escribe en PUNTERO y nada más: todo lo que viene después —la
   * puntería, la retícula que se retira, el pórtico apuntado— es el código de
   * verdad, sin ningún atajo. Sin argumentos, suelta el mando. */
  useEffect(() => {
    const w = window as any
    w.__AE_DIAG_APUNTAR = (origen?: number[], dir?: number[]) => {
      if (!origen || !dir) {
        PUNTERO.activo = false
        PUNTERO.mano = ''
        return false
      }
      PUNTERO.activo = true
      PUNTERO.mano = 'right'
      PUNTERO.desde = sim.now * 1000
      PUNTERO.origen.fromArray(origen)
      PUNTERO.dir.fromArray(dir).normalize()
      return true
    }
    return () => { delete w.__AE_DIAG_APUNTAR }
  }, [])

  useFrame((_, dt) => {
    if (!activo) return
    const ahora = sim.now * 1000
    /* Nadie movió un mando en un buen rato: la cabeza vuelve a ser el puntero.
       Es lo que pasa cuando alguien deja los mandos y sigue con las manos —el
       pellizco llega igual, pero ya no hay rayo que seguir. */
    if (PUNTERO.activo && ahora - PUNTERO.desde > OLVIDO && MANDOS.cuantos === 0) {
      PUNTERO.activo = false
      PUNTERO.mano = ''
    }

    const ses = gl.xr.getSession?.()
    if (!ses?.inputSources) return
    for (const src of ses.inputSources) {
      const gp = src.gamepad
      if (!gp) continue

      /* EL JOYSTICK RECORRE LA GALAXIA. Dentro de un visor no hay rueda, ni
         dedo que llegue a la pantalla, ni teclas: sin esto se puede mirar
         alrededor y nada más. El eje 2/3 es el joystick del Quest; el 0/1 es
         el trackpad de los visores que lo tienen, y se suma por si acaso. */
      const ejeX = (gp.axes[2] ?? 0) || (gp.axes[0] ?? 0)
      const ejeY = (gp.axes[3] ?? 0) || (gp.axes[1] ?? 0)
      /* Zona muerta ancha: un joystick en reposo nunca marca cero clavado, y
         sin esto la galaxia deriva sola mientras nadie toca nada.
         Y todo por SEGUNDO, no por cuadro: un Quest 3 dibuja al doble que un
         Quest 2, y por cuadro la misma galaxia giraría al doble de rápido en
         uno que en otro. */
      const paso = Math.min(dt, 0.05)
      if (Math.abs(ejeX) > 0.18) rig.orbit(ejeX * 420 * paso, 0)
      if (Math.abs(ejeY) > 0.18) rig.zoomBy(Math.exp(ejeY * 0.9 * paso))

      /* Los botones de la cara. En el Quest el 4 es A/X y el 5 es B/Y. Se
         cuenta el FLANCO —de suelto a apretado— y no el estado: leyendo el
         estado, un botón sostenido medio segundo dispararía treinta veces. */
      const flanco = (n: number) => {
        const p = !!gp.buttons?.[n]?.pressed
        const k = `${src.handedness || '?'}:${n}`
        const era = apretado.current[k]
        apretado.current[k] = p
        return p && !era
      }
      // A/X: «esto de aquí es el frente», para quien se sentó girado
      if (flanco(4)) rig.recentrar()
      /* B/Y: salir del visor. Es la única salida que devuelve a la galaxia en
         la pantalla; el botón del sistema saca del navegador entero y deja a
         quien lo aprieta buscando por dónde volver. */
      if (flanco(5)) alSalir()
    }
  })

  if (!activo) return null
  return (
    <>
      <Rayo mano="left" />
      <Rayo mano="right" />
    </>
  )
}
