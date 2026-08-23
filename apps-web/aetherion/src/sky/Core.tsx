import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { sim } from '../kernel/sim'
import { atmosphereFragment, atmosphereVertex } from '../shaders/shared'
import { getFlareTexture } from './textures'

export function Core() {
  const group = useRef<THREE.Group>(null)
  const light = useRef<THREE.PointLight>(null)
  const flare = useRef<THREE.Sprite>(null)

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
          uColor: { value: new THREE.Color('#ffd98a') },
          uTime: { value: 0 },
          uDensity: { value: 1.1 },
          uBoost: { value: 0 },
        },
      }),
    []
  )

  const coreGeo = useMemo(() => new THREE.SphereGeometry(0.85, 48, 48), [])
  const glowGeo = useMemo(() => new THREE.SphereGeometry(1.5, 48, 48), [])

  useFrame(() => {
    const b = sim.beat
    if (light.current) light.current.intensity = 55 * (1 + b * 0.9) * (1 - 0.7 * sim.eclipse)
    if (flare.current) {
      const s = 5.4 * (1 + b * 0.3) * (0.6 + 0.4 * sim.intro)
      flare.current.scale.setScalar(s)
    }
    glowMat.uniforms.uTime.value = sim.now
    glowMat.uniforms.uBoost.value = b * 0.9
    if (group.current) {
      const s = 1 + b * 0.06 + sim.breath * 0.02
      group.current.scale.setScalar(s)
    }
  })

  return (
    <group ref={group}>
      <mesh geometry={coreGeo}>
        <meshBasicMaterial color="#fff3dc" />
      </mesh>
      <mesh geometry={glowGeo} material={glowMat} />
      <sprite ref={flare} scale={5.4}>
        <spriteMaterial
          map={getFlareTexture()}
          color="#ffdf9e"
          transparent
          opacity={0.85}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </sprite>
      <pointLight ref={light} color="#ffe6b0" intensity={55} distance={110} decay={2} />
    </group>
  )
}
