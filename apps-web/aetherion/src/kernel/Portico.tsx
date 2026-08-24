import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'

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
  const [modo, setModo] = useState<ModoPortico>(null)
  const [textos, setTextos] = useState({ boton: 'INICIAR', sub: 'Sostené la mirada' })
  const grupo = useRef<THREE.Group>(null)
  const aro = useRef<THREE.Mesh>(null)
  const mirando = useRef(0)
  const hecho = useRef(false)
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
    }
    w.__AE_PORTICO_MODO = () => modoRef.current
    return () => {
      if (w.__AE_PORTICO) delete w.__AE_PORTICO
      if (w.__AE_PORTICO_MODO) delete w.__AE_PORTICO_MODO
    }
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

    /* EL BOTÓN VA MÁS CERCA QUE EL TEXTO —dos metros— y a la altura de los
       ojos: es una cosa para tocar, no para leer, y tiene que sentirse al
       alcance. */
    frente.set(0, 0, -1).applyQuaternion(camera.quaternion)
    plano.set(frente.x, 0, frente.z)
    if (plano.lengthSq() < 1e-4) plano.set(0, 0, -1)
    plano.normalize()
    meta.copy(camera.position).addScaledVector(plano, 2.0)
    meta.y -= 0.18

    if (!listo.current) { g.position.copy(meta); listo.current = true }
    else g.position.lerp(meta, 1 - Math.exp(-3.2 * dt))
    g.lookAt(camera.position)

    /* ¿LA MIRADA ESTÁ ENCIMA? El botón vive delante de la cara, así que la
       pregunta es simplemente si el centro de la vista cae dentro de su
       rectángulo — sin trazar rayos contra nada. */
    const haciaBoton = plano
    frente.set(0, 0, -1).applyQuaternion(camera.quaternion)
    const cos = frente.dot(
      meta.clone().sub(camera.position).normalize())
    const dentro = cos > 0.985 && !hecho.current
    void haciaBoton

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
