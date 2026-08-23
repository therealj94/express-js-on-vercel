import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { sim } from '../kernel/sim'
import { atmosphereFragment, atmosphereVertex } from '../shaders/shared'
import { getFlareTexture } from './textures'
import { letreroTextura } from './emblema'

/* AU-RA ES EL SOL.
 *
 * Y un sol es una cosa muy concreta: quema en el centro, se le ve la corona,
 * lanza rayos y le da luz a todo lo demás. La versión anterior era una perla
 * bonita que no alumbraba nada y desde lejos desaparecía — dejaba de haber
 * sol, y con él se perdía el sistema entero.
 *
 * Aquí el sol tiene núcleo que quema, la piel de AU-RA (jade y oro con
 * corriente adentro) que se le ve al acercarse, corona, rayos y su nombre.
 *
 * Y RESPLANDECE CUANDO HABLA. El orbe de la esquina publica su ánimo y su
 * nivel de voz en window (__AE_AURA_ANIMO / __AE_AURA_VOZ) y el sol los lee
 * cada cuadro: cuando AU-RA contesta, el centro de la galaxia se enciende con
 * ella. La misma voz, los dos cuerpos.
 */

/* LA SUPERFICIE DE UN SOL DE VERDAD.
 *
 * Un sol no es una bola de color: es plasma hirviendo. Lo que hace que el ojo
 * lo compre son tres cosas, y aquí están las tres — GRANULACIÓN (las celdas de
 * convección, ese granizo de luz), MANCHAS más frías, y FÁCULAS, los hilos
 * brillantes que las rodean. Todo en la paleta de AU-RA: su jade y su oro. */
function pielAura(): THREE.Texture {
  const W = 1024
  const H = 512
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')!
  let s = 5550
  const r = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 }

  const base = g.createLinearGradient(0, 0, W, H)
  base.addColorStop(0, '#2a7a6c')
  base.addColorStop(0.24, '#6fcbb4')
  base.addColorStop(0.46, '#dff8ec')
  base.addColorStop(0.62, '#fff6d8')
  base.addColorStop(0.8, '#7fd2bb')
  base.addColorStop(1, '#2a7a6c')
  g.fillStyle = base
  g.fillRect(0, 0, W, H)

  // GRANULACIÓN: miles de celdas de plasma, unas más calientes que otras
  for (let i = 0; i < 5200; i++) {
    const x = r() * W
    const y = r() * H
    const rad = 2 + r() * 7
    const cal = r()
    g.globalAlpha = 0.06 + r() * 0.16
    g.fillStyle = cal > 0.62 ? '#fffdf2' : cal > 0.3 ? '#bff0dd' : '#1c6459'
    g.beginPath()
    g.ellipse(x, y, rad, rad * (0.7 + r() * 0.5), r() * 3, 0, Math.PI * 2)
    g.fill()
  }

  // MANCHAS: plasma más frío, con su penumbra alrededor
  for (let i = 0; i < 7; i++) {
    const x = r() * W
    const y = H * (0.22 + r() * 0.56)
    const rad = 14 + r() * 30
    const pen = g.createRadialGradient(x, y, rad * 0.3, x, y, rad * 1.7)
    pen.addColorStop(0, 'rgba(10,52,48,0.72)')
    pen.addColorStop(0.55, 'rgba(24,86,78,0.35)')
    pen.addColorStop(1, 'rgba(24,86,78,0)')
    g.globalAlpha = 1
    g.fillStyle = pen
    g.beginPath(); g.arc(x, y, rad * 1.7, 0, Math.PI * 2); g.fill()
    // FÁCULAS: los hilos encendidos que bordean la mancha
    for (let k = 0; k < 26; k++) {
      const a = r() * Math.PI * 2
      const d = rad * (1.1 + r() * 0.7)
      g.globalAlpha = 0.18 + r() * 0.3
      g.strokeStyle = '#fff8dd'
      g.lineWidth = 0.8 + r() * 1.6
      g.beginPath()
      g.moveTo(x + Math.cos(a) * d, y + Math.sin(a) * d)
      g.lineTo(x + Math.cos(a) * (d + 6 + r() * 12), y + Math.sin(a) * (d + 4 + r() * 9))
      g.stroke()
    }
  }
  g.globalAlpha = 1
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = THREE.RepeatWrapping
  return t
}

/* Los rayos: un abanico de aspas suaves que gira lentísimo. Es lo que hace
   que de lejos siga leyéndose como SOL y no como una bola más. */
function rayosTextura(): THREE.Texture {
  const L = 512
  const c = document.createElement('canvas')
  c.width = L
  c.height = L
  const g = c.getContext('2d')!
  g.translate(L / 2, L / 2)
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2
    const largo = L * (0.3 + ((i * 37) % 17) / 90)
    const ancho = 0.012 + ((i * 11) % 7) / 420
    const grad = g.createLinearGradient(0, 0, Math.cos(a) * largo, Math.sin(a) * largo)
    grad.addColorStop(0, 'rgba(255,246,214,0.5)')
    grad.addColorStop(1, 'rgba(255,246,214,0)')
    g.fillStyle = grad
    g.beginPath()
    g.moveTo(0, 0)
    g.lineTo(Math.cos(a - ancho) * largo, Math.sin(a - ancho) * largo)
    g.lineTo(Math.cos(a + ancho) * largo, Math.sin(a + ancho) * largo)
    g.closePath()
    g.fill()
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

/* EL DISCO INCANDESCENTE. Un sol se distingue de un planeta en una cosa: el
   disco QUEMA, no está iluminado. Este es el degradado que va pegado a la
   esfera —blanco al centro, oro al filo y nada más allá— y es lo que hace que
   el ojo lea sol aunque la textura de abajo tenga color propio. */
function discoTextura(): THREE.Texture {
  const L = 512
  const c = document.createElement('canvas')
  c.width = L
  c.height = L
  const g = c.getContext('2d')!
  const gr = g.createRadialGradient(L / 2, L / 2, 0, L / 2, L / 2, L / 2)
  gr.addColorStop(0, 'rgba(255,255,255,0.98)')
  gr.addColorStop(0.2, 'rgba(255,252,236,0.92)')
  gr.addColorStop(0.33, 'rgba(255,240,196,0.66)')
  gr.addColorStop(0.42, 'rgba(255,225,158,0.28)')
  gr.addColorStop(0.52, 'rgba(255,215,140,0.06)')
  gr.addColorStop(1, 'rgba(255,215,140,0)')
  g.fillStyle = gr
  g.fillRect(0, 0, L, L)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

const R_SOL = 1.75

export function Core() {
  const group = useRef<THREE.Group>(null)
  const light = useRef<THREE.PointLight>(null)
  const flare = useRef<THREE.Sprite>(null)
  const rayos = useRef<THREE.Sprite>(null)
  const corona = useRef<THREE.Mesh>(null)
  const perla = useRef<THREE.Mesh>(null)
  const letrero = useRef<THREE.Sprite>(null)
  const anillo = useRef<THREE.Group>(null)
  const brasa = useRef<THREE.Sprite>(null)
  const vozSuave = useRef(0)

  const glowMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: atmosphereVertex(),
        fragmentShader: atmosphereFragment(),
        transparent: true,
        depthWrite: false,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
        uniforms: {
          uColor: { value: new THREE.Color('#ffe9b8') },
          uTime: { value: 0 },
          uDensity: { value: 1.25 },
          uBoost: { value: 0 },
        },
      }),
    []
  )

  const piel = useMemo(() => pielAura(), [])
  const disco = useMemo(() => discoTextura(), [])
  const aspas = useMemo(() => rayosTextura(), [])
  const nombre = useMemo(() => letreroTextura('AU-RA', '#EAD79C'), [])

  useEffect(() => {
    ;(window as any).__AE_NUCLEO = { r: R_SOL }
    return () => { delete (window as any).__AE_NUCLEO }
  }, [])

  useFrame((state, dt) => {
    /* LA VOZ. El nivel llega del mismo analizador que mueve el orbe de la
       esquina; se suaviza para que el sol respire con la frase y no tiemble
       con cada sílaba. */
    const w = window as any
    const hablando = w.__AE_AURA_ANIMO === 'hablando'
    const voz = hablando ? Math.max(0.25, +w.__AE_AURA_VOZ || 0) : 0
    vozSuave.current += (voz - vozSuave.current) * Math.min(1, dt * 6)
    const V = vozSuave.current

    // la bienvenida de la entrada decae sola
    sim.auraBrillo = Math.max(0, sim.auraBrillo - dt * 0.55)
    const b = sim.beat + sim.auraBrillo * 0.9 + V * 1.1

    if (light.current) {
      light.current.intensity = 86 * (1 + b * 0.75) * (1 - 0.7 * sim.eclipse)
      light.current.color.setHex(V > 0.02 ? 0xd8fff0 : 0xfff1cf)
    }
    if (flare.current) {
      const s = 6.6 * (1 + Math.min(0.5, b) * 0.3) * (0.6 + 0.4 * sim.intro)
      flare.current.scale.setScalar(s)
      ;(flare.current.material as THREE.SpriteMaterial).opacity = 0.58 + V * 0.22
    }
    if (rayos.current) {
      const mat = rayos.current.material as THREE.SpriteMaterial
      mat.rotation += dt * 0.05
      const s = 12 * (0.86 + Math.min(0.6, b) * 0.18) * (0.5 + 0.5 * sim.intro)
      rayos.current.scale.setScalar(s)
      mat.opacity = (0.2 + V * 0.42) * (1 - 0.6 * sim.eclipse)
    }
    glowMat.uniforms.uTime.value = sim.now
    glowMat.uniforms.uBoost.value = b * 0.9
    if (brasa.current) {
      brasa.current.scale.setScalar(R_SOL * (2.9 + b * 0.16))
      ;(brasa.current.material as THREE.SpriteMaterial).opacity = 0.92
    }
    if (corona.current) corona.current.scale.setScalar(1 + V * 0.16)
    if (group.current) group.current.scale.setScalar(1 + b * 0.05 + sim.breath * 0.02)
    if (perla.current) {
      perla.current.rotation.y += dt * (0.09 + V * 0.22)
      const m = perla.current.material as THREE.MeshStandardMaterial
      m.emissiveIntensity = 1.5 + V * 2.4
    }
    if (anillo.current) anillo.current.rotation.z -= dt * (0.05 + V * 0.2)

    if (letrero.current) {
      const d = state.camera.position.length()
      const s = d * 0.075
      letrero.current.scale.set(s * 2.6, s * 0.65, 1)
      letrero.current.position.set(0, -R_SOL - 0.5 - s * 0.34, 0)
      // en el umbral el sistema se mira en silencio: el nombre llega al entrar
      ;(letrero.current.material as THREE.SpriteMaterial).opacity =
        (window as any).__AE_PUERTA ? 0 : 0.92
    }
  })

  return (
    <group ref={group}>
      {/* el cuerpo del sol: la piel de AU-RA, siempre encendida */}
      <mesh ref={perla}>
        <sphereGeometry args={[R_SOL, 48, 48]} />
        <meshStandardMaterial
          map={piel}
          emissive={new THREE.Color('#a8f0dc')}
          emissiveIntensity={1.5}
          emissiveMap={piel}
          roughness={0.3}
          metalness={0.15}
          toneMapped={false}
        />
      </mesh>
      {/* el corazón que quema: sobre-expuesto a propósito, es un sol */}
      <mesh>
        <sphereGeometry args={[R_SOL * 0.66, 32, 32]} />
        <meshBasicMaterial color="#ffffff" toneMapped={false} transparent opacity={0.9} />
      </mesh>
      {/* la cromosfera: el filo hirviendo que se ve pegado al disco */}
      <mesh>
        <sphereGeometry args={[R_SOL * 1.055, 48, 48]} />
        <meshBasicMaterial
          color="#ffe6ac"
          transparent
          opacity={0.3}
          side={THREE.BackSide}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>
      {/* la brasa: el disco que quema, pegado a la esfera */}
      <sprite ref={brasa} scale={R_SOL * 2.9} renderOrder={2}>
        <spriteMaterial
          map={disco}
          transparent
          opacity={0.92}
          depthWrite={false}
          /* SIN prueba de profundidad: el disco está en el MISMO punto que la
             esfera, así que la mitad de adelante del cuerpo lo tapaba y el sol
             se veía como un planeta con un resplandor al lado. Un sol quema
             POR ENCIMA de su propio cuerpo. */
          depthTest={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </sprite>
      <mesh ref={corona} material={glowMat}>
        <sphereGeometry args={[R_SOL * 2.1, 48, 48]} />
      </mesh>

      {/* el anillo de escucha: AU-RA está atenta, y se nota */}
      <group ref={anillo} rotation={[1.36, 0, 0]}>
        <mesh>
          <torusGeometry args={[R_SOL * 1.55, 0.02, 8, 96]} />
          <meshBasicMaterial
            color="#EAD79C"
            transparent
            opacity={0.55}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </mesh>
      </group>

      <sprite ref={rayos} scale={13}>
        <spriteMaterial
          map={aspas}
          color="#fff2cd"
          transparent
          opacity={0.3}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </sprite>
      <sprite ref={flare} scale={7.4} renderOrder={1}>
        <spriteMaterial
          map={getFlareTexture()}
          color="#ffeec2"
          transparent
          opacity={0.7}
          depthWrite={false}
          depthTest={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </sprite>
      <sprite ref={letrero} renderOrder={4}>
        <spriteMaterial map={nombre} transparent depthTest={false} depthWrite={false} opacity={0.92} />
      </sprite>
      <pointLight ref={light} color="#fff1cf" intensity={86} distance={180} decay={2} />
    </group>
  )
}
