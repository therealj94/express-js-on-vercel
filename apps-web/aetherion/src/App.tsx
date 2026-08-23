import { Canvas } from '@react-three/fiber'
import { AgXToneMapping } from 'three'
import { Kernel, QualityWatcher } from './kernel/Kernel'
import { Sky } from './sky/Sky'
import { Pulses } from './pulses/Pulses'
import { TransitRunner } from './transit/TransitRunner'
import { GestureLayer } from './gesture/useGestures'
import { Hud } from './hud/Hud'
import { Overlays } from './hud/Overlays'
import { sim } from './kernel/sim'
import { useUiStore } from './state/uiStore'

export default function App() {
  const initialTier: 0 | 1 | 2 =
    typeof window !== 'undefined' &&
    (window.matchMedia('(pointer: coarse)').matches || (navigator.hardwareConcurrency ?? 8) <= 6)
      ? 1
      : 2
  if (useUiStore.getState().tier === 1 && initialTier !== 1) useUiStore.setState({ tier: initialTier })
  if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
    sim.reducedMotion = true

  return (
    <div className="ae-root">
      <Canvas
        gl={{
          antialias: false,
          alpha: false,
          powerPreference: 'high-performance',
          stencil: false,
        }}
        dpr={[1, 2]}
        camera={{ fov: 62, near: 0.1, far: 400, position: [0, 24, 56] }}
        onCreated={({ gl, camera }) => {
          gl.toneMapping = AgXToneMapping
          gl.toneMappingExposure = 1.05
          ;(window as any).__aeCamera = camera
        }}
      >
        <Kernel />
        <QualityWatcher />
        <color attach="background" args={['#030308']} />
        <fogExp2 attach="fog" args={['#05060d', 0.0075]} />
        <Sky />
        <Pulses />
        <TransitRunner />
        <GestureLayer />
      </Canvas>
      <Hud />
      <Overlays />
    </div>
  )
}

export const AETHERION_VERSION = '0.1.0 · Semilla del Sistema Vivo'
export type { Marea } from './kernel/sim'
