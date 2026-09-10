import { useFrame, useThree } from '@react-three/fiber'
import type * as THREE from 'three'
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing'
import { transit } from './transit'
import { rig } from '../kernel/rig'
import { MembranePass } from '../shaders/MembraneEffect'
import { useUiStore } from '../state/uiStore'

export function TransitRunner() {
  const camera = useThree((s) => s.camera)
  const tier = useUiStore((s) => s.tier)
  const visor = useUiStore((s) => s.visor)

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
    } else {
      /* EL TIMÓN. Sin esto la cámara se queda clavada donde nació: girar,
         acercar y alejar escriben en el rig y no llegaban a ninguna parte.
         Aquí es donde el cielo obedece a la mano. */
      rig.update(camera, dt)
    }
  })

  /* CON EL VISOR PUESTO NO HAY POST-PROCESADO. Por dos razones y las dos
     mandan: el visor dibuja DOS ojos por cuadro y hay que sostener noventa
     cuadros por segundo o marea de verdad; y además el compositor se pelearía
     por el mando del dibujo con el modo visor, que ya lo tomó. */
  if (visor) return <primitive object={transit.burst.points} />

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
          {/* EL UMBRAL DEL RESPLANDOR, ALTO A PROPÓSITO. Con 0.22 florecía
              casi todo: cualquier mundo pálido que pasara cerca de la cámara
              se convertía en una bola blanca sin forma, y en un plano de la
              película eso arruina el encuadre. Subido a 0.55, solo florece lo
              que de verdad ARDE —el sol, el anillo de fotones de un agujero
              negro, una veta de lava—, y los planetas conservan su piel. */}
          <Bloom
            intensity={0.95}
            luminanceThreshold={0.55}
            luminanceSmoothing={0.28}
            mipmapBlur
            radius={0.7}
          />
          <MembranePass />
          <Vignette offset={0.26} darkness={0.62} />
        </EffectComposer>
      )}
    </>
  )
}
