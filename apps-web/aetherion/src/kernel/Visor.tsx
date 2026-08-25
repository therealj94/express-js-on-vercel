import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { rig } from './rig'
import { sim } from './sim'
import { MIRADA, PUNTERO, poseMirada, posePuntero } from './mirada'
import { Mandos } from './Mandos'
import { useUiStore } from '../state/uiStore'

/* MODO VISOR.
 *
 * Ponerse un visor y estar DENTRO de la galaxia. Hay tres clases de visor ahí
 * fuera y las tres se atienden, porque quien tiene uno de cartón no tiene por
 * qué quedarse afuera:
 *
 *  1. VISOR DE VERDAD (Quest, Pico, Vive, un PC con SteamVR…). Hablan WebXR:
 *     el navegador entrega la sesión, las dos cámaras, la posición de la
 *     cabeza —y de las manos si las hay— y nosotros solo dibujamos. Es el
 *     camino bueno y el que da seis grados de libertad.
 *  2. VISOR DE TELÉFONO (Cardboard y sus primos). No hay WebXR: hay un
 *     teléfono metido en una caja. Se parte la pantalla en dos ojos, se lee
 *     el giroscopio para la cabeza y se selecciona MIRANDO, porque no hay
 *     mando ni manera de tocar la pantalla con el aparato en la cara.
 *  3. SIN VISOR. Modo 360 en la pantalla: la cabeza es el giroscopio si lo
 *     hay, y el dedo si no. Sirve para probar y para quien quiera mirar
 *     alrededor sin ponerse nada.
 *
 * LA REGLA QUE NO SE NEGOCIA: dentro del visor NO SE MUEVE DINERO. Se mira,
 * se recorre y se abre una casa; firmar un envío con la cara tapada y sin
 * poder leer bien la letra chica no es una función, es una trampa.
 */

export type ModoVisor = 'xr' | 'carton' | 'trescientos60'

interface Estado {
  activo: boolean
  modo: ModoVisor | null
  cabeza: boolean          // ¿la cabeza mueve la vista de verdad?
  ojos: number             // separación entre ojos, en metros
  mirada: boolean          // seleccionar sosteniendo la mirada
  sinGiro?: boolean        // el vigía no vio llegar ni un evento de cabeza
}

/* ── LA CABEZA POR GIROSCOPIO ───────────────────────────────────────────────
 * La receta clásica: los tres ángulos del aparato (alpha, beta, gamma) más la
 * orientación de la pantalla se convierten en un cuaternión. El −90° del eje X
 * es lo que pone la vista mirando al horizonte y no al suelo; sin eso, quien
 * se pone el visor mira sus propios pies. */
const cero = new THREE.Quaternion()
const ejeZ = new THREE.Vector3(0, 0, 1)
const q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5))
const euler = new THREE.Euler()

function deAngulos(q: THREE.Quaternion, alpha: number, beta: number, gamma: number, orient: number) {
  euler.set(beta, alpha, -gamma, 'YXZ')
  q.setFromEuler(euler)
  q.multiply(q1)
  q.multiply(cero.setFromAxisAngle(ejeZ, -orient))
}

export function Visor() {
  const { gl, camera, scene, size, advance, setFrameloop } = useThree() as any
  const [estado, setEstado] = useState<Estado>({
    activo: false, modo: null, cabeza: false, ojos: 0.064, mirada: true,
  })
  const est = useRef(estado)
  est.current = estado

  /* La cabeza y el cuerpo son dos cosas distintas: el CUERPO lo mueve el
     timón (girar, acercar) y la CABEZA la mueve quien lleva el visor puesto.
     Se componen: sin esto, mirar a la izquierda pelearía con el giro de la
     galaxia y la escena temblaría. */
  const cabeza = useMemo(() => new THREE.Quaternion(), [])
  const cuerpo = useMemo(() => new THREE.Object3D(), [])
  const izq = useMemo(() => new THREE.PerspectiveCamera(), [])
  const der = useMemo(() => new THREE.PerspectiveCamera(), [])
  const sesionXR = useRef<any>(null)
  const orientRef = useRef(0)
  // adónde mira el dedo cuando no hay cabeza que mande
  const dedo = useRef({ yaw: 0, pitch: 0 })
  /* El tamaño de la ventana se lee por referencia A PROPÓSITO. Si el puente
     con la casa dependiera de él, cada cambio de tamaño —y esconder el menú
     al entrar YA es uno— lo borraría y lo volvería a poner; quien tuviera el
     visor puesto en ese instante se quedaría sin botón de salir. */
  const medida = useRef({ w: size.width, h: size.height })
  medida.current = { w: size.width, h: size.height }
  const setVisor = useUiStore((s) => s.setVisor)

  /* El resto de la escena tiene que enterarse: el post-procesado se aparta y
     lo que dependa de la calidad puede bajar el listón. */
  useEffect(() => { setVisor(estado.activo); sim.visor = estado.activo },
    [estado.activo, setVisor])

  /* EL HORIZONTE SE NIVELA cuando hay una cabeza de verdad moviendo la vista
     —visor WebXR o giroscopio—, y solo entonces. En 360 con el dedo la
     inclinación de la cámara ES lo que se ve, y nivelarla sería quitarle a
     alguien el encuadre que eligió. Ver rig.alVisor(). */
  useEffect(() => {
    rig.alVisor(estado.activo && estado.cabeza)
    return () => { if (!estado.activo) rig.alVisor(false) }
  }, [estado.activo, estado.cabeza])

  /* ── EL GIROSCOPIO ───────────────────────────────────────────────────────
   *
   * Mover la cabeza y que la galaxia se mueva con ella es TODO el modo visor.
   * Cuando eso no engancha, el aparato en la cara enseña una foto fija — y
   * enganchar bien tiene tres partes que ningún navegador pone de acuerdo:
   *
   *  1. QUÉ EVENTO. Android da el rumbo bueno —el que apunta al norte y no
   *     deriva— en `deviceorientationabsolute`; el `deviceorientation` de
   *     toda la vida ahí es RELATIVO al azar del arranque y se va girando
   *     solo. iOS no tiene el absoluto, pero pone el rumbo verdadero en
   *     `webkitCompassHeading`. Así que se escuchan los dos eventos, se
   *     prefiere el absoluto, y en iOS el rumbo se toma de la brújula.
   *  2. QUE LLEGUE. Un permiso denegado, un aparato sin sensor o un navegador
   *     que simplemente no dispara nada se ven exactamente igual: quieto. Por
   *     eso hay un vigía — si en un segundo y medio no llegó ni un evento, se
   *     dice, y la casa puede ofrecer el dedo en vez de la cabeza.
   *  3. QUE HAYA SALIDA. Sin giroscopio se mira arrastrando el dedo. No es lo
   *     mismo, pero es infinitamente mejor que un cielo congelado.
   */
  useEffect(() => {
    if (!estado.activo || estado.modo === 'xr') return
    const gr = Math.PI / 180
    let absoluto = false          // ¿llegó ya el evento bueno?
    let llego = false

    const aplicar = (e: DeviceOrientationEvent, esAbsoluto: boolean) => {
      if (e.alpha == null && e.beta == null && e.gamma == null) return
      /* En cuanto aparece el absoluto, el relativo deja de mandar: los dos
         eventos llegan a la vez en Android y mezclarlos hace temblar. */
      if (absoluto && !esAbsoluto) return
      if (esAbsoluto && !absoluto) absoluto = true

      /* EL RUMBO. iOS pone el norte verdadero en webkitCompassHeading y hay
         que darlo vuelta (la brújula crece hacia el este, alpha hacia el
         oeste). Sin esto, en iPhone la galaxia arranca mirando a cualquier
         lado y no coincide con el mundo. */
      const brujula = (e as any).webkitCompassHeading
      const alpha = typeof brujula === 'number' && !Number.isNaN(brujula)
        ? 360 - brujula
        : (e.alpha || 0)

      deAngulos(cabeza, alpha * gr, (e.beta || 0) * gr, (e.gamma || 0) * gr,
        orientRef.current * gr)
      if (!llego) {
        llego = true
        window.clearTimeout(vigia)
      }
      if (!est.current.cabeza) setEstado((s) => ({ ...s, cabeza: true }))
    }

    const alAbsoluto = (e: DeviceOrientationEvent) => aplicar(e, true)
    const alRelativo = (e: DeviceOrientationEvent) => aplicar(e, (e as any).absolute === true)

    const alGirarPantalla = () => {
      orientRef.current = (screen.orientation?.angle ?? (window as any).orientation ?? 0) as number
    }
    alGirarPantalla()

    /* EL VIGÍA. Si en un segundo y medio no llegó ni un evento, no hay cabeza:
       se avisa a la casa para que lo diga y ofrezca el dedo. Callarse aquí es
       dejar a alguien con el aparato puesto pensando que la app se colgó. */
    const vigia = window.setTimeout(() => {
      if (llego) return
      setEstado((s) => ({ ...s, cabeza: false, sinGiro: true }))
      dispatchEvent(new CustomEvent('ae-visor-sin-giro'))
    }, 1500)

    addEventListener('deviceorientationabsolute', alAbsoluto as EventListener, true)
    addEventListener('deviceorientation', alRelativo, true)
    addEventListener('orientationchange', alGirarPantalla)
    screen.orientation?.addEventListener?.('change', alGirarPantalla)
    return () => {
      window.clearTimeout(vigia)
      removeEventListener('deviceorientationabsolute', alAbsoluto as EventListener, true)
      removeEventListener('deviceorientation', alRelativo, true)
      removeEventListener('orientationchange', alGirarPantalla)
      screen.orientation?.removeEventListener?.('change', alGirarPantalla)
    }
  }, [estado.activo, estado.modo, cabeza])

  /* ── EL DEDO, CUANDO NO HAY CABEZA ───────────────────────────────────────
   * Sin giroscopio (permiso denegado, sin sensor, o un navegador que no
   * dispara), mirar alrededor se hace arrastrando. Se compone sobre lo mismo
   * que compondría la cabeza, así que el resto del motor ni se entera de cuál
   * de los dos está mandando. */
  useEffect(() => {
    if (!estado.activo || estado.modo === 'xr' || estado.cabeza) return
    const el = gl.domElement as HTMLElement
    let x0 = 0, y0 = 0, yaw = dedo.current.yaw, pitch = dedo.current.pitch, agarra = false
    const abajo = (e: PointerEvent) => { agarra = true; x0 = e.clientX; y0 = e.clientY
      yaw = dedo.current.yaw; pitch = dedo.current.pitch }
    const mueve = (e: PointerEvent) => {
      if (!agarra) return
      dedo.current.yaw = yaw - (e.clientX - x0) * 0.0042
      dedo.current.pitch = Math.max(-1.2, Math.min(1.2, pitch - (e.clientY - y0) * 0.0042))
      cabeza.setFromEuler(new THREE.Euler(dedo.current.pitch, dedo.current.yaw, 0, 'YXZ'))
    }
    const arriba = () => { agarra = false }
    el.addEventListener('pointerdown', abajo)
    el.addEventListener('pointermove', mueve)
    el.addEventListener('pointerup', arriba)
    el.addEventListener('pointercancel', arriba)
    return () => {
      el.removeEventListener('pointerdown', abajo)
      el.removeEventListener('pointermove', mueve)
      el.removeEventListener('pointerup', arriba)
      el.removeEventListener('pointercancel', arriba)
    }
  }, [estado.activo, estado.modo, estado.cabeza, cabeza, gl])

  // ── el puente con la casa ────────────────────────────────────────────────
  useEffect(() => {
    const w = window as any
    const mio = {
      /* ¿Qué visor hay delante? Se pregunta ANTES de ofrecer nada: prometer
         un modo que este aparato no puede dar es peor que no ofrecerlo. */
      async detectar() {
        const xr = (navigator as any).xr
        let hayXR = false
        try { hayXR = !!(xr && await xr.isSessionSupported('immersive-vr')) } catch { hayXR = false }
        const hayGiro = typeof DeviceOrientationEvent !== 'undefined'
        const pidePermiso = typeof (DeviceOrientationEvent as any)?.requestPermission === 'function'
        return { xr: hayXR, giroscopio: hayGiro, pidePermiso }
      },

      async entrar(modo: ModoVisor, opciones: { ojos?: number; mirada?: boolean } = {}) {
        if (est.current.activo) return est.current.modo
        const ojos = opciones.ojos ?? 0.064
        const mirada = opciones.mirada ?? true

        if (modo === 'xr') {
          const xr = (navigator as any).xr
          if (!xr) throw new Error('sin-webxr')
          /* Se piden por opcional TODAS las capacidades que suman y ninguna
             que bloquee: si el visor no las tiene, la sesión arranca igual.
             Pedirlas como requeridas dejaría fuera a media flota. */
          const sesion = await xr.requestSession('immersive-vr', {
            optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking', 'layers'],
          })
          sesionXR.current = sesion
          gl.xr.enabled = true
          /* ══ LA RESOLUCIÓN, ANTES DE EMPEZAR ═══════════════════════════════
             Un Quest 3 pide más de dos mil píxeles por ojo, y esta galaxia
             —nebulosa, agujeros negros, mil estrellas— no la sostiene a esa
             resolución. Y en un visor no hay «va un poco lento»: por debajo de
             los 72 cuadros la imagen se sacude y marea de verdad. Un pelo menos
             de resolución no se nota; los tirones sí. */
          try { gl.xr.setFramebufferScaleFactor?.(0.85) } catch { /* nada */ }
          /* ══ EL SUELO, CON RED ═════════════════════════════════════════════
             `local-floor` es lo que pone la escena a la altura de los ojos de
             quien está de pie. Se pidió como OPCIONAL —como todo lo demás, para
             no dejar fuera a media flota—, así que un visor que no lo tenga
             concede la sesión IGUAL y revienta recién al pedir el espacio: o
             sea, entrar fallaba entero por una comodidad. Con `local` se entra
             igual, sentado en el origen.
             Y se pregunta ANTES de entregarle la sesión a three, no después:
             three pide el espacio al FINAL de todo su montaje, y para entonces
             ya colgó sus ocho escuchas y creó la capa de dibujo. Reintentar ahí
             las duplicaría todas. Pedir un espacio dos veces no cuesta nada
             —devuelve uno nuevo cada vez— y esto deja el reintento en la única
             línea donde todavía no hay nada que deshacer. */
          let suelo = 'local-floor'
          try { await sesion.requestReferenceSpace('local-floor') }
          catch { suelo = 'local' }
          gl.xr.setReferenceSpaceType(suelo)
          await gl.xr.setSession(sesion)
          sesion.addEventListener('end', () => { mio.salir() })
          /* El gatillo del mando, el botón del visor y el pellizco de la mano
             llegan todos como `select`. Cualquiera de los tres abre lo que se
             tenga en la mira, que es como se espera que funcione un visor. */
          sesion.addEventListener('select', () => {
            if (performance.now() < veto.hasta) return
            const w = window as any
            /* EL PÓRTICO PRIMERO, Y NO ES UN DETALLE. Mientras hay una puerta
               puesta —INICIAR, o SALIR durante la historia— la mirada está
               blindada y `apuntado` es nulo a propósito, así que esto no hacía
               absolutamente nada: en un Quest se apuntaba al botón, se apretaba
               el gatillo y no pasaba nada. Había que sostener la mirada segundo
               y medio, con un mando en la mano. */
            if (w.__AE_PORTICO_APRETAR?.()) return
            const k = apuntado.key
            if (k) w.__AE_TOCAR?.(k)
          })
          /* Apretar el gatillo y que se abra un mundo, sin más aviso que el
             rayo, es brusco. Un golpecito lo convierte en algo que se siente
             hecho — y en un visor el tacto es lo único que confirma. */
          sesion.addEventListener('selectstart', (ev: any) => {
            const h = ev?.inputSource?.gamepad?.hapticActuators?.[0]
            try { h?.pulse?.(0.35, 30) } catch { /* no todos vibran */ }
          })
          /* DENTRO DE XR MANDA EL RELOJ DEL VISOR. El de la pantalla no
             existe ahí: dibujar con requestAnimationFrame en una sesión
             inmersiva es dibujar en el vacío. */
          setFrameloop?.('never')
          gl.setAnimationLoop((t: number, frame: any) => advance(t, true, undefined, frame))
        }

        /* UN RESPIRO AL ENTRAR. Recién puesto el visor, la vista cae donde
           cayó: si hay un planeta justo delante, la mirada lo abriría antes
           de que a nadie le diera tiempo a mirar alrededor. */
        veto.hasta = performance.now() + 2200
        setEstado({ activo: true, modo, cabeza: modo === 'xr', ojos, mirada })
        return modo
      },

      salir() {
        if (!est.current.activo) return
        /* Se marca cerrado AQUÍ MISMO, antes de tocar nada. Terminar la sesión
           dispara el aviso de fin, que vuelve a entrar por esta puerta: sin la
           marca, todo se desharía dos veces y el motor se cae. */
        est.current = { ...est.current, activo: false }
        /* Y la cabeza deja de mandar: fuera del visor, quien manda es la
           cámara. Dejarlo encendido clavaría las letras y la retícula en la
           última postura que tuvo la cabeza puesta. */
        MIRADA.activa = false
        const s = sesionXR.current
        sesionXR.current = null
        if (s) { try { s.end() } catch { /* ya terminó */ } }
        try {
          gl.xr.enabled = false
          gl.setAnimationLoop(null)
          setFrameloop?.('always')
        } catch { /* nada */ }
        gl.setScissorTest(false)
        gl.setViewport(0, 0, medida.current.w, medida.current.h)
        cabeza.identity()
        setEstado({ activo: false, modo: null, cabeza: false, ojos: 0.064, mirada: true })
        /* LA CASA TIENE QUE ENTERARSE. Quitarse el visor termina la sesión
           desde fuera: si solo saliera el motor, la wallet seguiría creyendo
           que hay un visor puesto —sin menú, sin poder enviar— y no habría
           forma de volver. */
        dispatchEvent(new CustomEvent('ae-visor-fuera'))
      },

      ojos(v: number) { setEstado((s) => ({ ...s, ojos: Math.max(0.02, Math.min(0.12, v)) })) },
      mirada(v: boolean) { setEstado((s) => ({ ...s, mirada: !!v })) },
      estado: () => ({ ...est.current }),
      /* Hacia dónde mira la cabeza, aparte del cuerpo. La casa no lo necesita;
         las pruebas sí, porque es lo único que demuestra que el giroscopio
         llegó a mover algo. */
      cabezaQ: () => cabeza.toArray(),
      /* Para la casa y para las pruebas: recentra el frente. Quien se sienta
         girado necesita decir «esto de aquí es el frente» sin levantarse. */
      recentrar() {
        try { sesionXR.current?.requestReferenceSpace?.('local-floor') } catch { /* nada */ }
        rig.recentrar()
      },
      /* QUÉ ABRIRÍA EL GATILLO AHORA MISMO. Es el valor exacto que usa el
         `select` de la sesión, y es lo único que distingue «apunto a DBNX y se
         abre DBNX» de «apunto a DBNX y se abre lo que tengo de frente» — el
         fallo entero, que desde fuera se ve igual que todo bien. Preguntarlo
         no abre nada, así que se puede comprobar sin que la galaxia se
         desmonte a mitad de la prueba. */
      apuntando: () => apuntado.key,
      /* La casa avisa que ESO no se abre con el visor puesto. Dentro de un
         visor el aviso de la pantalla no se lee: la retícula se pone en rojo
         un momento, que es el único idioma que se entiende ahí dentro. */
      negar() { veto.hasta = performance.now() + 900 },
    }
    w.__AE_VISOR = mio
    return () => { if (w.__AE_VISOR === mio) delete w.__AE_VISOR }
  }, [gl, advance, setFrameloop, cabeza])

  /* ── EL DIBUJO ────────────────────────────────────────────────────────────
   * Con prioridad 1, R3F deja de dibujar solo y el mando es de aquí: en XR
   * dibuja el propio motor (las dos cámaras las pone el visor), y en cartón se
   * dibuja DOS VECES, una por ojo, cada una en su mitad de pantalla. */
  /* La prioridad cambia con el modo A PROPÓSITO: con prioridad cero, R3F (y
     el post-procesado) siguen dibujando como siempre; con uno, el mando es de
     aquí. Registrar siempre prioridad uno dejaría la escena sin dibujar en
     cuanto el post-procesado se desmontara. */
  useFrame(() => {
    const e = est.current
    if (!e.activo) return

    if (e.modo === 'xr') {
      /* El visor manda: three ya compone los dos ojos con su propia cámara, y
         de paso mete la pose del casco DENTRO de la cámara de la escena. Así
         que aquí la cámara ya ES la cabeza y no hay nada que componer —ni que
         publicar: con esto apagado, todo el mundo le pregunta a la cámara, que
         es justo lo correcto. */
      MIRADA.activa = false
      gl.render(scene, camera)
      return
    }

    /* La cabeza se compone sobre el cuerpo: el timón sigue mandando dónde
       está uno, y la cabeza, hacia dónde mira. */
    cuerpo.position.copy(camera.position)
    cuerpo.quaternion.copy(camera.quaternion)
    if (e.cabeza) cuerpo.quaternion.multiply(cabeza)

    /* Y SE PUBLICA, porque no somos los únicos que la necesitan. Las letras de
       la historia, el botón del pórtico y la retícula tienen que aparecer
       delante de la CARA, y hasta ahora se colocaban con la orientación de la
       cámara a secas —la del timón—, que con la cabeza girada no es la misma.
       Ver kernel/mirada.ts: es el fallo por el que «no salían las letras». */
    MIRADA.activa = true
    MIRADA.pos.copy(cuerpo.position)
    MIRADA.quat.copy(cuerpo.quaternion)

    const cam = camera as THREE.PerspectiveCamera
    const media = e.modo === 'carton' ? e.ojos / 2 : 0
    for (const [c, signo] of [[izq, -1], [der, 1]] as Array<[THREE.PerspectiveCamera, number]>) {
      c.near = cam.near
      c.far = cam.far
      c.fov = cam.fov
      c.aspect = e.modo === 'carton' ? cam.aspect / 2 : cam.aspect
      c.updateProjectionMatrix()
      c.position.copy(cuerpo.position)
      c.quaternion.copy(cuerpo.quaternion)
      c.translateX(signo * media)
    }

    const w = size.width * gl.getPixelRatio()
    const h = size.height * gl.getPixelRatio()
    if (e.modo === 'carton') {
      gl.setScissorTest(true)
      gl.setViewport(0, 0, w / 2, h)
      gl.setScissor(0, 0, w / 2, h)
      gl.render(scene, izq)
      gl.setViewport(w / 2, 0, w / 2, h)
      gl.setScissor(w / 2, 0, w / 2, h)
      gl.render(scene, der)
      gl.setScissorTest(false)
      gl.setViewport(0, 0, w, h)
    } else {
      // 360 en pantalla: un solo ojo, pero la cabeza manda igual
      gl.render(scene, der)
    }
  }, estado.activo ? 1 : 0)

  /* La retícula sigue viva aunque la selección por mirada esté apagada: hace
     falta para saber a QUÉ se apunta cuando se aprieta el gatillo. Lo que se
     apaga es el aro que se llena solo, no la puntería. */
  return (
    <>
      <Reticula visible={estado.activo} dwell={estado.mirada} modo={estado.modo} />
      {/* Los mandos, sólo con un visor de verdad: en cartón y en 360 no hay
          ninguno que buscar, y pedirlos sería preguntarle a una sesión que no
          existe. Salen por su propia puerta —el botón B/Y— porque la del
          sistema saca del navegador entero. */}
      <Mandos activo={estado.activo && estado.modo === 'xr'}
              alSalir={() => (window as any).__AE_VISOR?.salir?.()} />
    </>
  )
}

/* ── LA RETÍCULA ────────────────────────────────────────────────────────────
 * Dentro de un visor no hay puntero: el puntero es el CENTRO DE LA VISTA. La
 * retícula va pegada a la cámara —así aparece en los dos ojos y a la misma
 * distancia— y su aro se llena mientras se sostiene la mirada sobre una casa.
 * Sin ella, mirar fijo un planeta y que se abra «solo» da miedo. */
/* Lo que la retícula tiene ahora mismo en el centro. El gatillo del mando —y
   el pellizco de la mano, que WebXR manda por el mismo camino— abren ESTO, sin
   esperar a que se llene el aro. Con un visor de verdad en la cabeza, esperar
   segundo y medio para cada cosa cansa. */
const apuntado: { key: string | null } = { key: null }
const veto = { hasta: 0 }

function Reticula({ visible, dwell, modo }:
                  { visible: boolean; dwell: boolean; modo: ModoVisor | null }) {
  const { camera } = useThree()
  const grupo = useRef<THREE.Group>(null)
  const aro = useRef<THREE.Mesh>(null)
  const mirando = useRef<{ key: string; desde: number } | null>(null)
  const DWELL = 1400   // más largo que en pantalla: la cabeza tiembla
  const gPos = useMemo(() => new THREE.Vector3(), [])
  const gQuat = useMemo(() => new THREE.Quaternion(), [])

  useFrame(() => {
    const g = grupo.current
    if (!g || !visible) { if (g) g.visible = false; return }
    g.visible = true
    /* Un metro y medio delante de los ojos: más cerca marea, más lejos se
       pierde entre los planetas. Se COLOCA delante de la cámara en cada
       cuadro en vez de colgarse de ella: meter la cámara dentro de un grupo
       la saca de su sitio en la escena y rompe todo lo demás. */
    /* Y delante de LA CABEZA, no de la cámara. Son dos cosas distintas en
       cuanto hay giroscopio, y con la de la cámara la retícula se quedaba
       apuntando adonde miraba el timón mientras la persona miraba a otro
       lado — o sea, señalando un planeta y abriendo otro. */
    poseMirada(camera, gPos, gQuat)
    g.position.copy(gPos)
    g.quaternion.copy(gQuat)
    g.translateZ(-1.5)

    const w = window as any
    const ahora = performance.now()
    const aroM = aro.current?.material as THREE.MeshBasicMaterial | undefined
    if (ahora < veto.hasta) {
      // rechazo (o respiro de entrada): aro rojo y la mirada no cuenta
      mirando.current = null
      apuntado.key = null
      if (aroM) { aroM.color.set('#E4574B'); aroM.opacity = 0.95 }
      aro.current?.scale.setScalar(1.3)
      return
    }
    if (aroM) aroM.color.set('#EAD79C')
    /* BLINDAJE. Con el pórtico puesto —o mientras la historia se cuenta— la
       mirada NO abre casas: solo el botón del pórtico responde. Es lo que
       impide que alguien acomodándose el visor caiga dentro de una app sin
       haberlo pedido. */
    if (w.__AE_BLINDADO) {
      mirando.current = null
      apuntado.key = null
      if (aroM) aroM.opacity = 0.14
      w.__AE_RESALTAR?.(null)
      return
    }
    /* ══ CON UN MANDO EN LA MANO, LA RETÍCULA SE RETIRA ════════════════════
       El rayo del mando ya lleva su punta iluminada, y ESA es la retícula: va
       donde se apunta. Dejar además el aro clavado en el centro de la vista
       pone dos punteros señalando cosas distintas — y peor: el aro se llenaría
       solo por descansar la vista sobre un planeta, abriendo mundos que nadie
       pidió mientras la persona apunta a otra cosa. Con mando manda el gatillo.
       La puntería sigue calculándose igual, porque de ella sale lo que el
       gatillo va a abrir. Ver Mandos.tsx.
       Va DESPUÉS del respiro y del blindaje a propósito: ni el mando ni la
       mirada abren nada mientras la puerta está puesta. */
    const casa = w.__AE_MIRAR?.(innerWidth / 2, innerHeight / 2) || null
    if (PUNTERO.activo) {
      g.visible = false
      mirando.current = null
      apuntado.key = casa?.key || null
      w.__AE_RESALTAR?.(apuntado.key)
      return
    }
    if (!casa) {
      mirando.current = null
      apuntado.key = null
      if (aro.current) (aro.current.material as THREE.MeshBasicMaterial).opacity = 0.28
      w.__AE_RESALTAR?.(null)
      return
    }
    apuntado.key = casa.key
    if (!dwell) {
      // sin selección por mirada, el aro solo señala: no se llena ni abre nada
      if (aroM) aroM.opacity = 0.55
      aro.current?.scale.setScalar(1.12)
      return
    }
    const yaMiraba = mirando.current
    if (!yaMiraba || yaMiraba.key !== casa.key) {
      mirando.current = { key: casa.key, desde: ahora }
      w.__AE_RESALTAR?.(casa.key)
      return
    }
    const p = Math.min(1, (ahora - yaMiraba.desde) / DWELL)
    if (aro.current) {
      const m = aro.current.material as THREE.MeshBasicMaterial
      m.opacity = 0.3 + p * 0.7
      aro.current.scale.setScalar(1 + p * 0.5)
    }
    if (p >= 1) {
      mirando.current = null
      w.__AE_TOCAR?.(casa.key)
    }
  })

  return (
    <group ref={grupo} visible={false} renderOrder={999}>
      <mesh ref={aro}>
        <ringGeometry args={[0.016, 0.022, 32]} />
        <meshBasicMaterial color="#EAD79C" transparent opacity={0.3} depthTest={false} toneMapped={false} />
      </mesh>
      <mesh>
        <circleGeometry args={[0.004, 16]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.8} depthTest={false} toneMapped={false} />
      </mesh>
    </group>
  )
}
