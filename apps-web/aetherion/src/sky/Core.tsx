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

/* La piel del sol: jade hondo, jade claro y oro, con corriente adentro. */
function pielAura(): THREE.Texture {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 256
  const g = c.getContext('2d')!
  const base = g.createLinearGradient(0, 0, 512, 256)
  base.addColorStop(0, '#1d5c52')
  base.addColorStop(0.26, '#59b8a4')
  base.addColorStop(0.5, '#cdf3e6')
  base.addColorStop(0.68, '#f6e3a8')
  base.addColorStop(0.86, '#6cc0ac')
  base.addColorStop(1, '#1d5c52')
  g.fillStyle = base
  g.fillRect(0, 0, 512, 256)
  for (let i = 0; i < 26; i++) {
    g.globalAlpha = 0.07 + ((i * 13) % 7) / 55
    g.strokeStyle = i % 4 === 0 ? '#fff4d2' : '#dffaf0'
    g.lineWidth = 1 + ((i * 7) % 5)
    g.beginPath()
    for (let x = 0; x <= 512; x += 16) {
      const y = 128 + Math.sin(x / 42 + i * 1.6) * (24 + i * 3) + Math.cos(x / 90 + i) * 12
      x === 0 ? g.moveTo(x, y) : g.lineTo(x, y)
    }
    g.stroke()
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

const R_SOL = 1.45

export function Core() {
  const group = useRef<THREE.Group>(null)
  const light = useRef<THREE.PointLight>(null)
  const flare = useRef<THREE.Sprite>(null)
  const rayos = useRef<THREE.Sprite>(null)
  const corona = useRef<THREE.Mesh>(null)
  const perla = useRef<THREE.Mesh>(null)
  const letrero = useRef<THREE.Sprite>(null)
  const anillo = useRef<THREE.Group>(null)
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
      light.current.intensity = 62 * (1 + b * 0.75) * (1 - 0.7 * sim.eclipse)
      light.current.color.setHex(V > 0.02 ? 0xd8fff0 : 0xfff1cf)
    }
    if (flare.current) {
      const s = 5.2 * (1 + b * 0.34) * (0.6 + 0.4 * sim.intro)
      flare.current.scale.setScalar(s)
      ;(flare.current.material as THREE.SpriteMaterial).opacity = 0.62 + V * 0.3
    }
    if (rayos.current) {
      const mat = rayos.current.material as THREE.SpriteMaterial
      mat.rotation += dt * 0.05
      const s = 9 * (0.86 + b * 0.2) * (0.5 + 0.5 * sim.intro)
      rayos.current.scale.setScalar(s)
      mat.opacity = (0.2 + V * 0.42) * (1 - 0.6 * sim.eclipse)
    }
    glowMat.uniforms.uTime.value = sim.now
    glowMat.uniforms.uBoost.value = b * 0.9
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
        <sphereGeometry args={[R_SOL * 0.72, 32, 32]} />
        <meshBasicMaterial color="#fffaf0" toneMapped={false} transparent opacity={0.82} />
      </mesh>
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

      <sprite ref={rayos} scale={9}>
        <spriteMaterial
          map={aspas}
          color="#fff2cd"
          transparent
          opacity={0.24}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </sprite>
      <sprite ref={flare} scale={5.2}>
        <spriteMaterial
          map={getFlareTexture()}
          color="#ffeec2"
          transparent
          opacity={0.7}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </sprite>
      <sprite ref={letrero} renderOrder={4}>
        <spriteMaterial map={nombre} transparent depthTest={false} depthWrite={false} opacity={0.92} />
      </sprite>
      <pointLight ref={light} color="#fff1cf" intensity={62} distance={140} decay={2} />
    </group>
  )
}
