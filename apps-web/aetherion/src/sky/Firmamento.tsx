import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { sim } from '../kernel/sim'
import { getFlareTexture } from './textures'

/* EL FIRMAMENTO.
 *
 * Hasta ahora el fondo era un color con niebla: de frente no se notaba, pero
 * en el visor uno SE DA VUELTA — y detrás no había nada. Un lugar de verdad
 * tiene cielo en todas las direcciones.
 *
 * Esto es una esfera enorme mirada por dentro, con la galaxia pintada a mano
 * en un lienzo al arrancar (nada que descargar, nada que pese en el bundle):
 * la banda de la Vía Láctea cruzando inclinada, con su corazón caliente y sus
 * vetas de polvo oscuro delante; miles de estrellas con temperatura de color
 * de verdad —azules las jóvenes, naranjas las viejas— más densas hacia la
 * banda; un puñado de galaxias hermanas al fondo, de canto y de frente.
 *
 * La MISMA semilla en cada visita: el cielo es un lugar, no un ruido que se
 * rebaraja. Y gira lentísimo entero, como gira el cielo de noche.
 */

function alAzar(semilla: number) {
  let s = semilla >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

/* La temperatura de una estrella, en color: se sortea sobre la distribución
   real —la mayoría frías y rojizas, pocas azules y furiosas— y el ojo lee
   «cielo de verdad» sin saber por qué. */
function colorEstrella(r: () => number): [number, number, number] {
  const t = r()
  if (t > 0.92) return [0.72, 0.82, 1.0]      // azul: joven y caliente
  if (t > 0.72) return [1.0, 1.0, 1.0]        // blanca
  if (t > 0.38) return [1.0, 0.93, 0.78]      // amarilla, como el sol
  return [1.0, 0.78, 0.62]                    // naranja-roja: vieja
}

/* El cielo se pinta UNA vez y lo comparten quien lo necesite: la esfera del
   firmamento lo enseña, y los agujeros negros lo DEFORMAN — para curvar la
   luz de un cielo hay que tener ese cielo a mano. */
let cieloHecho: THREE.CanvasTexture | null = null
export function cieloTextura(): THREE.CanvasTexture {
  if (!cieloHecho) cieloHecho = pintarCielo()
  return cieloHecho
}

function pintarCielo(): THREE.CanvasTexture {
  const W = 2048
  const H = 1024
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')!
  const r = alAzar(77193)

  // ── el vacío no es negro parejo: respira entre azul profundo y violeta ──
  const fondo = g.createLinearGradient(0, 0, 0, H)
  fondo.addColorStop(0, '#05060e')
  fondo.addColorStop(0.5, '#070811')
  fondo.addColorStop(1, '#04050c')
  g.fillStyle = fondo
  g.fillRect(0, 0, W, H)

  /* ── LA BANDA. La Vía Láctea cruza el cielo entero como una senoide (una
     banda inclinada en la esfera se proyecta así en el mapa equirrectangular).
     Se pinta en capas: el resplandor ancho, el corazón caliente, y encima las
     vetas de polvo que la parten — esa oscuridad DELANTE de la luz es lo que
     hace que parezca fotografía y no gradiente. */
  const eleBanda = (x: number) => H * 0.5 + Math.sin((x / W) * Math.PI * 2 + 0.7) * H * 0.16
  g.globalCompositeOperation = 'lighter'
  for (let capa = 0; capa < 3; capa++) {
    const ancho = [H * 0.2, H * 0.11, H * 0.05][capa]
    const tinte = ['rgba(70,84,130,', 'rgba(140,130,150,', 'rgba(255,225,190,'][capa]
    const fuerza = [0.05, 0.055, 0.075][capa]
    for (let i = 0; i < 260; i++) {
      const x = r() * W
      const y = eleBanda(x) + (r() - 0.5) * ancho * 2
      const rad = ancho * (0.35 + r() * 0.8)
      const nube = g.createRadialGradient(x, y, 0, x, y, rad)
      nube.addColorStop(0, tinte + fuerza * (0.6 + r() * 0.8) + ')')
      nube.addColorStop(1, tinte + '0)')
      g.fillStyle = nube
      g.fillRect(x - rad, y - rad, rad * 2, rad * 2)
    }
  }
  // el corazón de la galaxia: un bulbo caliente en un punto de la banda
  const xc = W * 0.31
  const nucleo = g.createRadialGradient(xc, eleBanda(xc), 0, xc, eleBanda(xc), H * 0.22)
  nucleo.addColorStop(0, 'rgba(255,214,160,0.30)')
  nucleo.addColorStop(0.4, 'rgba(200,150,120,0.12)')
  nucleo.addColorStop(1, 'rgba(200,150,120,0)')
  g.fillStyle = nucleo
  g.fillRect(0, 0, W, H)

  // las vetas de polvo: oscuridad delante de la luz
  g.globalCompositeOperation = 'multiply'
  for (let i = 0; i < 90; i++) {
    const x = r() * W
    const y = eleBanda(x) + (r() - 0.5) * H * 0.07
    const w = 30 + r() * 130
    const h = 6 + r() * 22
    const veta = g.createRadialGradient(x, y, 0, x, y, w)
    veta.addColorStop(0, `rgba(8,7,12,${0.35 + r() * 0.3})`)
    veta.addColorStop(1, 'rgba(8,7,12,0)')
    g.fillStyle = veta
    g.save()
    g.translate(x, y)
    g.scale(1, h / w)
    g.translate(-x, -y)
    g.fillRect(x - w, y - w, w * 2, w * 2)
    g.restore()
  }

  /* ── LAS ESTRELLAS. Más densas hacia la banda (ahí vive la galaxia), con
     su color de temperatura y unas pocas lo bastante brillantes para llevar
     cruz de difracción — las que un ojo recuerda. */
  g.globalCompositeOperation = 'lighter'
  for (let i = 0; i < 5200; i++) {
    const x = r() * W
    const cerca = Math.exp(-Math.abs((r() * H) - eleBanda(x)) / (H * 0.18))
    if (r() > 0.35 + cerca * 0.65) continue
    const y = r() * H
    const [cr, cg, cb] = colorEstrella(r)
    const brillo = r() * r()
    const rad = 0.4 + brillo * 1.4
    g.fillStyle = `rgba(${cr * 255 | 0},${cg * 255 | 0},${cb * 255 | 0},${0.35 + brillo * 0.6})`
    g.beginPath()
    g.arc(x, y, rad, 0, Math.PI * 2)
    g.fill()
    if (brillo > 0.93) {
      // la cruz de las brillantes
      g.strokeStyle = `rgba(${cr * 255 | 0},${cg * 255 | 0},${cb * 255 | 0},0.28)`
      g.lineWidth = 0.7
      g.beginPath()
      g.moveTo(x - rad * 5, y); g.lineTo(x + rad * 5, y)
      g.moveTo(x, y - rad * 5); g.lineTo(x, y + rad * 5)
      g.stroke()
    }
  }

  /* ── LAS HERMANAS. Tres galaxias lejanas: una espiral de frente, una de
     canto, una mancha elíptica. Chiquitas a propósito: son la escala del
     universo, no un adorno que pide mirada. */
  const hermana = (x: number, y: number, tam: number, angulo: number, canto: number) => {
    g.save()
    g.translate(x, y)
    g.rotate(angulo)
    g.scale(1, canto)
    for (let i = 0; i < 3; i++) {
      const gl = g.createRadialGradient(0, 0, 0, 0, 0, tam * (1 - i * 0.28))
      gl.addColorStop(0, `rgba(235,220,200,${0.10 + i * 0.08})`)
      gl.addColorStop(1, 'rgba(235,220,200,0)')
      g.fillStyle = gl
      g.fillRect(-tam, -tam, tam * 2, tam * 2)
    }
    g.restore()
  }
  hermana(W * 0.78, H * 0.22, 26, 0.5, 0.42)
  hermana(W * 0.12, H * 0.76, 18, -0.9, 0.14)   // de canto: una aguja
  hermana(W * 0.55, H * 0.85, 13, 0.2, 0.75)

  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.mapping = THREE.EquirectangularReflectionMapping
  return tex
}

/* ── LOS COMETAS. Dos viajeros con cola, en órbitas largas e inclinadas.
   La cola siempre apunta LEJOS del sol — así funcionan los cometas de
   verdad, y el detalle se nota sin saberse. */
function Cometas() {
  const cuerpos = useRef<(THREE.Group | null)[]>([])
  const colas = useRef<(object | null)[]>([])
  const N = 46

  const rutas = useMemo(() => [
    { a: 74, b: 30, inc: 0.42, vel: 0.017, fase: 0.6, tinte: '#bfe0ff' },
    { a: 92, b: 40, inc: -0.3, vel: 0.011, fase: 3.4, tinte: '#ffe3c0' },
  ], [])

  const colaGeo = useMemo(() => rutas.map(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3))
    g.setAttribute('aEdad', new THREE.BufferAttribute(
      new Float32Array(Array.from({ length: N }, (_, i) => i / N)), 1))
    return g
  }), [rutas])

  const colaMat = useMemo(() => rutas.map((rt) => new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uColor: { value: new THREE.Color(rt.tinte) }, uOp: { value: 0 } },
    vertexShader: /* glsl */ `
      attribute float aEdad;
      varying float vA;
      void main(){
        vA = 1.0 - aEdad;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = (26.0 * vA + 4.0) * 14.0 / max(1.0, -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uOp;
      varying float vA;
      void main(){
        vec2 c = gl_PointCoord - 0.5;
        float r2 = dot(c,c);
        if(r2 > 0.25) discard;
        gl_FragColor = vec4(uColor, smoothstep(0.25, 0.0, r2) * vA * vA * uOp);
      }`,
  })), [rutas])

  const p = useMemo(() => new THREE.Vector3(), [])
  const lejosDelSol = useMemo(() => new THREE.Vector3(), [])

  useFrame(() => {
    rutas.forEach((rt, i) => {
      const t = sim.now * rt.vel + rt.fase
      p.set(Math.cos(t) * rt.a, Math.sin(t * 1.7) * 6, Math.sin(t) * rt.b)
      p.applyAxisAngle(new THREE.Vector3(1, 0, 0), rt.inc)
      const cuerpo = cuerpos.current[i]
      if (cuerpo) {
        cuerpo.position.copy(p)
        const brasa = cuerpo.children[0] as THREE.Sprite | undefined
        if (brasa) (brasa.material as THREE.SpriteMaterial).opacity = 0.85 * sim.intro
      }
      const geo = colaGeo[i]
      const attr = geo.getAttribute('position') as THREE.BufferAttribute
      /* la cola: puntos sembrados detrás del cuerpo, en la dirección que se
         aleja del sol (el origen), con algo de deriva */
      lejosDelSol.copy(p).normalize()
      for (let j = 0; j < N; j++) {
        const d = j * 0.9
        attr.setXYZ(j,
          p.x + lejosDelSol.x * d + Math.sin(j * 1.3 + sim.now) * 0.12 * j * 0.06,
          p.y + lejosDelSol.y * d + Math.cos(j * 1.7 + sim.now) * 0.1 * j * 0.06,
          p.z + lejosDelSol.z * d)
      }
      attr.needsUpdate = true
      colaMat[i].uniforms.uOp.value = 0.5 * sim.intro * (1 - sim.vacio)
    })
  })

  return (
    <>
      {rutas.map((rt, i) => (
        <group key={i}>
          <group ref={(el) => { cuerpos.current[i] = el }}>
            <sprite scale={2.2}>
              <spriteMaterial map={getFlareTexture()} color={rt.tinte} transparent
                depthWrite={false} blending={THREE.AdditiveBlending} />
            </sprite>
          </group>
          <points ref={(el) => { colas.current[i] = el }} geometry={colaGeo[i]}
            material={colaMat[i]} frustumCulled={false} />
        </group>
      ))}
    </>
  )
}

/* ── LAS FUGACES. De vez en cuando una raya cruza y muere: dura un suspiro,
   aparece donde quiere, y es la clase de detalle que hace que alguien diga
   «¿viste eso?» dentro del visor. */
function Fugaces() {
  const linea = useRef<THREE.Line>(null)
  const viva = useRef<{ desde: number; a: THREE.Vector3; b: THREE.Vector3; sig: number }>({
    desde: -10, a: new THREE.Vector3(), b: new THREE.Vector3(), sig: 4,
  })
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3))
    return g
  }, [])
  const mat = useMemo(() => new THREE.LineBasicMaterial({
    color: '#eaf2ff', transparent: true, opacity: 0, depthWrite: false,
    blending: THREE.AdditiveBlending,
  }), [])

  useFrame(() => {
    const v = viva.current
    const edad = sim.now - v.desde
    if (edad > 0.7 && sim.now > v.sig) {
      // nace una: dirección y sitio al azar del reloj (determinista no hace falta aquí)
      const a = Math.random() * Math.PI * 2
      const y = 30 + Math.random() * 60
      v.a.set(Math.cos(a) * 150, y, Math.sin(a) * 150)
      v.b.copy(v.a).add(new THREE.Vector3((Math.random() - 0.5) * 60, -25 - Math.random() * 20, (Math.random() - 0.5) * 60))
      v.desde = sim.now
      v.sig = sim.now + 5 + Math.random() * 9
      const attr = geo.getAttribute('position') as THREE.BufferAttribute
      attr.setXYZ(0, v.a.x, v.a.y, v.a.z)
      attr.setXYZ(1, v.b.x, v.b.y, v.b.z)
      attr.needsUpdate = true
    }
    const p = Math.min(1, edad / 0.7)
    mat.opacity = (p < 0.2 ? p / 0.2 : 1 - (p - 0.2) / 0.8) * 0.8 * sim.intro * (1 - sim.vacio)
  })

  const obj = useMemo(() => new THREE.Line(geo, mat), [geo, mat])
  return <primitive object={obj} ref={linea} />
}

export function Firmamento() {
  const tex = useMemo(cieloTextura, [])
  const esfera = useRef<THREE.Mesh>(null)

  useFrame((_, dt) => {
    if (!esfera.current) return
    // el cielo entero gira como gira la noche: apenas, pero gira
    esfera.current.rotation.y += dt * 0.0022
    const m = esfera.current.material as THREE.MeshBasicMaterial
    // en el vacío ni el cielo existe todavía
    m.opacity = (0.55 + 0.45 * sim.intro) * (1 - sim.vacio)
  })

  return (
    <>
      {/* la esfera del cielo: fuera del alcance de la niebla y del encuadre */}
      <mesh ref={esfera} scale={[-1, 1, 1]} renderOrder={-10}>
        <sphereGeometry args={[300, 48, 32]} />
        <meshBasicMaterial map={tex} side={THREE.BackSide} fog={false}
          transparent depthWrite={false} toneMapped={false} />
      </mesh>
      <Cometas />
      <Fugaces />
    </>
  )
}
