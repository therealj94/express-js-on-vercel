import { useFrame, useThree } from '@react-three/fiber'
import type * as THREE from 'three'
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing'
import { transit } from './transit'
import { MembranePass } from '../shaders/MembraneEffect'
import { useUiStore } from '../state/uiStore'

export function TransitRunner() {
  const camera = useThree((s) => s.camera)
  const tier = useUiStore((s) => s.tier)

  useFrame((_, dt) => {
    const st = useUiStore.getState()
    if (transit.exitRequested) {
      transit.exitRequested = false
      if (!transit.active && st.activeId) transit.beginExitFrom(camera as unknown as THREE.PerspectiveCamera)
    }
    if (transit.active) {
      transit.update(performance.now(), camera as unknown as THREE.PerspectiveCamera, dt)
    } else if (st.activeId) {
      transit.insideOrbit(camera as unknown as THREE.PerspectiveCamera, dt)
    }
  })

  return (
    <>
      <primitive object={transit.burst.points} />
      {tier === 0 ? (
        <EffectComposer multisampling={0}>
          <MembranePass />
          <Vignette offset={0.26} darkness={0.62} />
        </EffectComposer>
      ) : (
        <EffectComposer multisampling={0}>
          <Bloom
            intensity={1.15}
            luminanceThreshold={0.22}
            luminanceSmoothing={0.32}
            mipmapBlur
            radius={0.75}
          />
          <MembranePass />
          <Vignette offset={0.26} darkness={0.62} />
        </EffectComposer>
      )}
    </>
  )
}
