import { Canvas } from '@react-three/fiber'
import { AgXToneMapping } from 'three'
import { Kernel, QualityWatcher } from './kernel/Kernel'
import { Encuadre } from './kernel/Encuadre'
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
        camera={{ fov: 62, near: 0.1, far: 400, position: [0, 26, 40] }}
        onCreated={({ gl, camera }) => {
          gl.toneMapping = AgXToneMapping
          gl.toneMappingExposure = 1.05
          ;(window as any).__aeCamera = camera
        }}
      >
        <Kernel />
        <QualityWatcher />
        <Encuadre />
        {/* LA LUZ HACE EL VOLUMEN. Con relleno parejo y fuerte, cada planeta
            quedaba iluminado por igual de lado a lado: sin terminador, sin
            sombra, sin bulto — pegatinas redondas. Ahora el relleno es apenas
            el rebote del cielo (la cara de noche se insinúa, no desaparece) y
            el que modela es el sol de AU-RA, desde el centro. */}
        <ambientLight intensity={0.16} color="#5b6f9e" />
        {/* la luz de contra: el filo frío de la galaxia que despega cada
            mundo del fondo negro, como en cualquier foto bien hecha */}
        <directionalLight position={[-14, 9, -12]} intensity={0.5} color="#7fa8d8" />
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
