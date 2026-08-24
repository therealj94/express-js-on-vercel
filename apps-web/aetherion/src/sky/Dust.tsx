import { useMemo } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { sim } from '../kernel/sim'
import { dustFragment, dustVertex } from '../shaders/shared'

interface DustLayerProps {
  count: number
  spread: number
  yFlat: number
  size: number
  opacity: number
  dim?: number
}

export function DustLayer({ count, spread, yFlat, size, opacity, dim = 1 }: DustLayerProps) {
  const dpr = useThree((s) => s.viewport.dpr)

  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    const pos = new Float32Array(count * 3)
    const seed = new Float32Array(count)
    const sizes = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      const r = Math.sqrt(Math.random()) * spread
      const a = Math.random() * Math.PI * 2
      pos[i * 3] = Math.cos(a) * r
      pos[i * 3 + 1] = (Math.random() + Math.random() - 1) * yFlat
      pos[i * 3 + 2] = Math.sin(a) * r
      seed[i] = Math.random()
      sizes[i] = size * (0.4 + Math.random() * 0.9) * dim
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1))
    g.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1))
    return g
  }, [count, spread, yFlat, size, dim])

  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: dustVertex(),
        fragmentShader: dustFragment(),
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
          uTime: { value: 0 },
          uPixelRatio: { value: 1 },
          uColor: { value: new THREE.Color('#9fe8ff') },
          uOpacity: { value: opacity },
        },
      }),
    []
  )

  useFrame(() => {
    mat.uniforms.uTime.value = sim.now
    mat.uniforms.uPixelRatio.value = dpr
    mat.uniforms.uColor.value.copy(sim.dustColor)
    const ecl = 1 - 0.55 * sim.eclipse
    /* La tiniebla se lleva también el polvo: era el resplandor azul del
       centro lo que más delataba que había un sistema ya encendido. */
    mat.uniforms.uOpacity.value = opacity * sim.intro * ecl * (1 - 0.9 * sim.noche)
  })

  return (
    <points geometry={geo} material={mat} frustumCulled={false} />
  )
}
