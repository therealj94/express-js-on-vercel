import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { sim } from '../kernel/sim'
import { atmosphereFragment, atmosphereVertex } from '../shaders/shared'
import { getFlareTexture } from './textures'
import { letreroTextura } from './emblema'

/* EL CORAZÓN DE LA GALAXIA ES AU-RA.
 *
 * Antes era un sol genérico: una bola blanca que quemaba el centro de la
 * pantalla y no significaba nada. Ahora el centro del ecosistema es quien de
 * verdad lo atiende: la perla de AU-RA, con su jade y su oro —los mismos
 * colores con los que respira su orbe en la casa—, latiendo despacio. Tiene su
 * nombre debajo, como las casas, y se puede tocar: la wallet deja su puente en
 * window.__AE_AURA y tocarla la llama.
 */

/* La piel de la perla: jade hondo, jade claro y oro girando despacio. Se dibuja
   una vez en un lienzo y se envuelve la esfera con ella. */
function pielAura(): THREE.Texture {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 256
  const g = c.getContext('2d')!
  const base = g.createLinearGradient(0, 0, 512, 256)
  base.addColorStop(0, '#0d2b2b')
  base.addColorStop(0.28, '#2f7d72')
  base.addColorStop(0.5, '#7ed8c4')
  base.addColorStop(0.68, '#ead79c')
  base.addColorStop(0.85, '#3d8d80')
  base.addColorStop(1, '#0d2b2b')
  g.fillStyle = base
  g.fillRect(0, 0, 512, 256)
  // vetas de luz: la perla no es lisa, tiene corriente adentro
  for (let i = 0; i < 22; i++) {
    g.globalAlpha = 0.06 + ((i * 13) % 7) / 60
    g.strokeStyle = i % 4 === 0 ? '#f6e7b8' : '#bff0e2'
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

export function Core() {
  const group = useRef<THREE.Group>(null)
  const light = useRef<THREE.PointLight>(null)
  const flare = useRef<THREE.Sprite>(null)
  const perla = useRef<THREE.Mesh>(null)
  const letrero = useRef<THREE.Sprite>(null)
  const anillo = useRef<THREE.Group>(null)

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
          uColor: { value: new THREE.Color('#8fe6d2') },
          uTime: { value: 0 },
          uDensity: { value: 1.1 },
          uBoost: { value: 0 },
        },
      }),
    []
  )

  const piel = useMemo(() => pielAura(), [])
  const nombre = useMemo(() => letreroTextura('AU-RA', '#EAD79C'), [])
  const coreGeo = useMemo(() => new THREE.SphereGeometry(1.15, 48, 48), [])
  const glowGeo = useMemo(() => new THREE.SphereGeometry(1.9, 48, 48), [])

  /* El nombre y el bulto de la perla se apuntan para que el toque sepa dónde
     está: la capa de gestos pregunta por aquí antes de mirar las casas. */
  useEffect(() => {
    ;(window as any).__AE_NUCLEO = { r: 1.15 }
    return () => { delete (window as any).__AE_NUCLEO }
  }, [])

  useFrame((state, dt) => {
    /* La bienvenida: cuando alguien entra, AURA brilla más un momento y el
       brillo decae solo. Es el saludo del sistema, sin palabras. */
    sim.auraBrillo = Math.max(0, sim.auraBrillo - dt * 0.55)
    const b = sim.beat + sim.auraBrillo * 0.9
    if (light.current) light.current.intensity = 42 * (1 + b * 0.9) * (1 - 0.7 * sim.eclipse)
    if (flare.current) {
      const s = 3.2 * (1 + b * 0.3) * (0.6 + 0.4 * sim.intro)
      flare.current.scale.setScalar(s)
    }
    glowMat.uniforms.uTime.value = sim.now
    glowMat.uniforms.uBoost.value = b * 0.9
    if (group.current) {
      const s = 1 + b * 0.06 + sim.breath * 0.02
      group.current.scale.setScalar(s)
    }
    // la perla gira despacio: la corriente de adentro se ve pasar
    if (perla.current) perla.current.rotation.y += dt * 0.09
    if (anillo.current) anillo.current.rotation.z -= dt * 0.05
    if (letrero.current) {
      const d = state.camera.position.length()
      const s = d * 0.075
      letrero.current.scale.set(s * 2.6, s * 0.65, 1)
      letrero.current.position.set(0, -1.55 - s * 0.34, 0)
      // en el umbral el sistema se mira en silencio: el nombre llega al entrar
      ;(letrero.current.material as THREE.SpriteMaterial).opacity =
        (window as any).__AE_PUERTA ? 0 : 0.92
    }
  })

  return (
    <group ref={group}>
      <mesh ref={perla} geometry={coreGeo}>
        <meshStandardMaterial
          map={piel}
          emissive={new THREE.Color('#7ed8c4')}
          emissiveIntensity={0.85}
          emissiveMap={piel}
          roughness={0.32}
          metalness={0.2}
        />
      </mesh>
      <mesh geometry={glowGeo} material={glowMat} />
      {/* el anillo de escucha: AU-RA está atenta, y se nota */}
      <group ref={anillo} rotation={[1.36, 0, 0]}>
        <mesh>
          <torusGeometry args={[1.72, 0.018, 8, 96]} />
          <meshBasicMaterial
            color="#EAD79C"
            transparent
            opacity={0.55}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      </group>
      <sprite ref={flare} scale={3.2}>
        <spriteMaterial
          map={getFlareTexture()}
          color="#cdf0e2"
          transparent
          opacity={0.7}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </sprite>
      <sprite ref={letrero} renderOrder={4}>
        <spriteMaterial map={nombre} transparent depthTest={false} depthWrite={false} opacity={0.92} />
      </sprite>
      <pointLight ref={light} color="#e8f6ea" intensity={42} distance={110} decay={2} />
    </group>
  )
}
