import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { PUNTERO, poseMirada } from './mirada'

/* EL PÓRTICO · lo primero que se ve con el visor puesto.
 *
 * ══ POR QUÉ EXISTE ════════════════════════════════════════════════════════
 *
 * Ponerse un visor es un momento torpe: uno se lo calza, se acomoda la
 * correa, mira alrededor a ver qué hay. Si en ese rato la mirada ya está
 * armada, cualquier planeta que quede en el centro se abre solo — y la
 * persona termina dentro de una app sin haber decidido nada, sin saber cómo
 * llegó ni cómo volver. Ese es exactamente el accidente que hay que impedir.
 *
 * Así que la primera pantalla del visor no es la galaxia: es UNA PUERTA.
 * Un botón grande, delante de los ojos, que se toca mirándolo. Hasta que no
 * se toque, la mirada no abre nada más. Y mientras la historia se cuenta,
 * tampoco: solo el botón de salir.
 *
 * ══ POR QUÉ UN ARO QUE SE LLENA ═══════════════════════════════════════════
 *
 * Dentro de un visor no hay clic. Tocar con la mirada es sostener la vista
 * sobre algo, y eso solo funciona si la persona VE que está pasando: el aro
 * que se llena le dice «seguí mirando y esto se va a apretar», y apartar la
 * vista lo vacía. Sin esa señal, quedarse mirando y que de pronto ocurra algo
 * da miedo — y quedarse mirando y que no ocurra nada, desconcierta.
 */

export type ModoPortico = 'inicio' | 'salir' | null

const DWELL = 1500      // más largo que en pantalla: la cabeza tiembla
const GRACIA = 1200     // lo que tarda alguien en acomodarse el aparato

function pintarBoton(texto: string, sub: string): THREE.CanvasTexture {
  const W = 1024
  const H = 320
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')!

  // la píldora: cristal oscuro con su filo de oro
  const r = 64
  g.beginPath()
  g.moveTo(r, 18)
  g.lineTo(W - r, 18)
  g.quadraticCurveTo(W - 18, 18, W - 18, 18 + r)
  g.lineTo(W - 18, H - 18 - r)
  g.quadraticCurveTo(W - 18, H - 18, W - r, H - 18)
  g.lineTo(r, H - 18)
  g.quadraticCurveTo(18, H - 18, 18, H - 18 - r)
  g.lineTo(18, 18 + r)
  g.quadraticCurveTo(18, 18, r, 18)
  g.closePath()
  const fondo = g.createLinearGradient(0, 0, 0, H)
  fondo.addColorStop(0, 'rgba(8,16,34,0.92)')
  fondo.addColorStop(1, 'rgba(4,9,20,0.95)')
  g.fillStyle = fondo
  g.fill()
  g.strokeStyle = 'rgba(201,169,97,0.85)'
  g.lineWidth = 3
  g.stroke()

  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.font = '600 92px Cinzel, "Bodoni Moda", Georgia, serif'
  g.letterSpacing = '10px'
  g.fillStyle = '#F7EDD2'
  g.fillText(texto.toUpperCase(), W / 2, sub ? H / 2 - 26 : H / 2)
  if (sub) {
    g.font = '400 40px system-ui, sans-serif'
    g.letterSpacing = '1px'
    g.fillStyle = 'rgba(214,222,236,0.72)'
    g.fillText(sub, W / 2, H / 2 + 62)
  }
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return tex
}

export function Portico() {
  const { camera } = useThree()
  /* La cámara por referencia: el puente de arriba se monta UNA vez y tiene que
     ver la de ahora, no la que había en el primer dibujado. */
  const camaraRef = useRef(camera)
  camaraRef.current = camera
  const [modo, setModo] = useState<ModoPortico>(null)
  const [textos, setTextos] = useState({ boton: 'INICIAR', sub: 'Sostené la mirada' })
  const grupo = useRef<THREE.Group>(null)
  const aro = useRef<THREE.Mesh>(null)
  const mirando = useRef(0)
  const hecho = useRef(false)
  const desde = useRef(0)
  // el modo, por referencia: el puente se monta una vez y tiene que ver el de ahora
  const modoRef = useRef<ModoPortico>(null)

  /* La casa manda: qué botón hay y qué dice. Nulo = no hay pórtico y la
     galaxia se toca como siempre. */
  useEffect(() => {
    const w = window as any
    w.__AE_PORTICO = (m: ModoPortico, boton?: string, sub?: string) => {
      setModo(m)
      if (boton) setTextos({ boton, sub: sub || '' })
      mirando.current = 0
      hecho.current = false
      /* UN RESPIRO AL APARECER. Ponerse el visor es un momento torpe —la
         correa, el enfoque, mirar alrededor—, y un botón que ya está contando
         desde el primer cuadro se aprieta en medio de todo eso. Durante este
         rato el botón se ve, pero no cuenta. */
      desde.current = performance.now()
    }
    w.__AE_PORTICO_MODO = () => modoRef.current
    /* ══ EL GATILLO TAMBIÉN APRIETA ═════════════════════════════════════════
     *
     * Con un mando en la mano, esperar segundo y medio mirando fijo un botón
     * no es una interacción: es el aparato ignorándote. En un Quest se apunta
     * y se aprieta, y eso tiene que abrir la puerta igual que sostener la
     * mirada la abre en un visor de cartón.
     *
     * NO SE PIDE PUNTERÍA, y es a propósito. Mientras hay pórtico la mirada
     * está blindada: esta puerta es literalmente lo ÚNICO que responde en toda
     * la escena, así que un gatillo apretado no puede querer decir otra cosa.
     * Exigir además que el rayo cayera dentro del rectángulo convertiría el
     * botón en una prueba de puntería sin ningún beneficio.
     *
     * El respiro sí se respeta: recién puesto el visor, alguien acomodándose
     * la correa aprieta cosas sin querer, y ese es justo el accidente que todo
     * este pórtico existe para impedir.
     *
     * Devuelve si apretó, para que quien llama sepa si tiene que seguir
     * buscando a quién darle el gatillo. */
    w.__AE_PORTICO_APRETAR = () => {
      if (!modoRef.current || hecho.current) return false
      if (performance.now() - desde.current < GRACIA) return false
      hecho.current = true
      mirando.current = 0
      try {
        dispatchEvent(new CustomEvent('ae-portico', { detail: { modo: modoRef.current } }))
      } catch { /* nada */ }
      return true
    }
    /* DÓNDE ESTÁ EL BOTÓN, para que una prueba pueda comprobar lo que una foto
       no distingue: que siga delante de la cara cuando la cabeza se gira. Si se
       queda atrás no hay manera de empezar la historia ni de salir del visor, y
       desde fuera eso se ve exactamente igual que todo bien. */
    w.__AE_PORTICO_SITIO = () => {
      const g = grupo.current
      if (!g || !modoRef.current) return null
      poseMirada(camaraRef.current, sPos, sQuat)
      sHacia.copy(g.position).sub(sPos)
      const dist = sHacia.length()
      sFrente.set(0, 0, -1).applyQuaternion(sQuat)
      const cos = sHacia.normalize().dot(sFrente)
      const grados = Math.round((Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI)
      return {
        modo: modoRef.current,
        dist: Math.round(dist * 10) / 10,
        grados,
        // «delante» de verdad: al alcance y dentro del cono cómodo de la vista
        delante: dist > 0.8 && dist < 3.5 && grados < 30,
      }
    }
    return () => {
      if (w.__AE_PORTICO) delete w.__AE_PORTICO
      if (w.__AE_PORTICO_MODO) delete w.__AE_PORTICO_MODO
      if (w.__AE_PORTICO_SITIO) delete w.__AE_PORTICO_SITIO
      if (w.__AE_PORTICO_APRETAR) delete w.__AE_PORTICO_APRETAR
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  modoRef.current = modo
  const tex = useMemo(() => pintarBoton(textos.boton, textos.sub), [textos])
  const mat = useMemo(() => new THREE.MeshBasicMaterial({
    transparent: true, depthTest: false, depthWrite: false, toneMapped: false, opacity: 0,
  }), [])
  useEffect(() => { mat.map = tex; mat.needsUpdate = true }, [tex, mat])

  const meta = useMemo(() => new THREE.Vector3(), [])
  const frente = useMemo(() => new THREE.Vector3(), [])
  const plano = useMemo(() => new THREE.Vector3(), [])
  const arriba = useMemo(() => new THREE.Vector3(0, 1, 0), [])
  const ojoPos = useMemo(() => new THREE.Vector3(), [])
  const ojoQuat = useMemo(() => new THREE.Quaternion(), [])
  const haciaBoton = useMemo(() => new THREE.Vector3(), [])
  const dirMeta = useMemo(() => new THREE.Vector3(), [])
  const dirSuave = useMemo(() => new THREE.Vector3(), [])
  // los del puente de diagnóstico, aparte de los del dibujo
  const sPos = useMemo(() => new THREE.Vector3(), [])
  const sQuat = useMemo(() => new THREE.Quaternion(), [])
  const sHacia = useMemo(() => new THREE.Vector3(), [])
  const sFrente = useMemo(() => new THREE.Vector3(), [])
  const listo = useRef(false)

  useFrame((_, dt) => {
    const g = grupo.current
    if (!g) return
    if (!modo) {
      mat.opacity = Math.max(0, mat.opacity - dt * 3)
      if (aro.current) (aro.current.material as THREE.MeshBasicMaterial).opacity = 0
      g.visible = mat.opacity > 0.01
      listo.current = false
      return
    }
    g.visible = true
    mat.opacity = Math.min(1, mat.opacity + dt * 2.2)

    /* EL BOTÓN VA MÁS CERCA QUE EL TEXTO —dos metros—: es una cosa para tocar,
       no para leer, y tiene que sentirse al alcance.
       ══ Y UN POCO MÁS ABAJO, A PROPÓSITO ═══════════════════════════════════
       Puesto justo en el centro de la vista era IMPOSIBLE no mirarlo: como
       persigue a la cabeza, se queda clavado en el medio mires donde mires, y
       se apretaba solo segundo y medio después de ponerse el visor, sin que
       nadie hubiera decidido nada. Un botón que se aprieta solo no es un botón.
       Bajarlo de la línea de los ojos lo cambia todo: al frente NO se toca, y
       BAJAR LA VISTA hacia él —un gesto chico, natural, y el mismo que se hace
       para mirar un menú— sí. Mirarlo vuelve a ser una decisión, que es lo
       único que hace que apretarlo signifique algo.
       ══ Y CUÁNTO SE BAJA LO DECIDEN LAS LETRAS ═════════════════════════════
       Veinticuatro grados, y el número no es de gusto. Mientras la historia se
       cuenta, el cartel del teatro cuelga a doce grados y el botón que hay
       puesto es el de SALIR. El aro se llena con la mirada dentro de un cono de
       diez grados, así que un botón a dieciocho quedaba a seis del cartel:
       DENTRO del cono. O sea que quedarse leyendo la historia apretaba «salir»
       y la saltaba — el mismo accidente que se está tratando de impedir, con
       el disfraz cambiado. A veinticuatro grados quedan doce de separación y
       leer es leer. */
    /* DE LA CABEZA, NO DE LA CÁMARA: si el botón se coloca con la orientación
       del timón, en cuanto alguien gira la cabeza deja de estar delante y no
       hay manera de tocarlo. Ver kernel/mirada.ts. */
    /* Al frente y un poco abajo, EN EL MARCO DE LA CABEZA. Aplanado contra la
       vertical del mundo, el botón se colgaba del horizonte — y como el timón
       mira la galaxia picado cuarenta grados, quedaba muy por encima de la
       vista y no había manera de tocarlo. Ver kernel/mirada.ts y Teatro.tsx. */
    poseMirada(camera, ojoPos, ojoQuat)
    frente.set(0, 0, -1).applyQuaternion(ojoQuat)
    plano.set(0, -1, 0).applyQuaternion(ojoQuat)
    meta.copy(ojoPos).addScaledVector(frente, 2.0).addScaledVector(plano, 0.89)

    /* Igual que el teatro: se suaviza la DIRECCIÓN, no la posición. Retrasando
       la posición, cualquier viaje de la cámara dejaba el botón metros atrás y
       fuera de alcance. Ver Teatro.tsx. */
    dirMeta.copy(meta).sub(ojoPos)
    const largo = dirMeta.length() || 2.0
    dirMeta.divideScalar(largo)
    if (!listo.current) { dirSuave.copy(dirMeta); listo.current = true }
    else dirSuave.lerp(dirMeta, 1 - Math.exp(-3.2 * dt)).normalize()
    g.position.copy(ojoPos).addScaledVector(dirSuave, largo)
    g.lookAt(ojoPos)

    /* ¿LA MIRADA ESTÁ ENCIMA? El botón vive delante de la cara, así que la
       pregunta es simplemente si el centro de la vista cae dentro de su
       rectángulo — sin trazar rayos contra nada. */
    /* ¿La mirada cae dentro? Se compara el frente de LA CABEZA contra la
       dirección al botón. Ojo: contra `g.position` —donde el botón está de
       verdad, persiguiendo con retraso— y no contra `meta`, que es adonde va;
       comparando contra la meta el aro se llenaba aunque el botón todavía
       estuviera llegando. */
    /* Y si hay un mando en la mano, la pregunta es por el RAYO y no por la
       cabeza: apuntar al botón tiene que llenar el aro, o el rayo señalaría
       una puerta que no reacciona. El origen también cambia —la mano no está
       donde los ojos—, así que se mide desde donde sale el rayo de verdad. */
    if (PUNTERO.activo) {
      frente.copy(PUNTERO.dir).normalize()
      haciaBoton.copy(g.position).sub(PUNTERO.origen).normalize()
    } else {
      frente.set(0, 0, -1).applyQuaternion(ojoQuat)
      haciaBoton.copy(g.position).sub(ojoPos).normalize()
    }
    const cos = frente.dot(haciaBoton)
    const dentro = cos > 0.985 && !hecho.current
      && performance.now() - desde.current > GRACIA

    if (dentro) {
      mirando.current += dt * 1000
      const p = Math.min(1, mirando.current / DWELL)
      if (aro.current) {
        const m = aro.current.material as THREE.MeshBasicMaterial
        m.opacity = 0.35 + p * 0.65
        aro.current.scale.setScalar(0.9 + p * 0.35)
      }
      if (p >= 1) {
        hecho.current = true
        mirando.current = 0
        try { dispatchEvent(new CustomEvent('ae-portico', { detail: { modo } })) } catch { /* nada */ }
      }
    } else {
      mirando.current = Math.max(0, mirando.current - dt * 1600)
      if (aro.current) {
        const m = aro.current.material as THREE.MeshBasicMaterial
        m.opacity = 0.3 * (mirando.current / DWELL)
        aro.current.scale.setScalar(0.9)
      }
    }
  })

  return (
    <group ref={grupo} visible={false} renderOrder={1300}>
      <mesh material={mat}>
        <planeGeometry args={[1.5, 0.47]} />
      </mesh>
      {/* el aro que se llena: la única forma de que tocar con la mirada no dé
          miedo es que se vea venir */}
      <mesh ref={aro} position={[0, 0, 0.002]}>
        <ringGeometry args={[0.79, 0.83, 48]} />
        <meshBasicMaterial color="#EAD79C" transparent opacity={0}
          depthTest={false} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  )
}
