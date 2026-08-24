import { Canvas } from '@react-three/fiber'
import { AgXToneMapping } from 'three'
import { Kernel, QualityWatcher } from './kernel/Kernel'
import { Encuadre } from './kernel/Encuadre'
import { Visor } from './kernel/Visor'
import { Sky } from './sky/Sky'
import { Pulses } from './pulses/Pulses'
import { TransitRunner } from './transit/TransitRunner'
import { GestureLayer } from './gesture/useGestures'
import { Hud } from './hud/Hud'
import { Overlays } from './hud/Overlays'
import { Espacial } from './audio/Espacial'
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
          /* El motor, a mano para el modo visor y para las pruebas: contar
             cuántas veces se dibuja un cuadro es la única forma honesta de
             comprobar que de verdad se están pintando DOS ojos. */
          ;(window as any).__aeGL = gl
        }}
      >
        <Kernel />
        <QualityWatcher />
        <Encuadre />
        <Visor />
        {/* LA LUZ HACE EL VOLUMEN. Con relleno parejo y fuerte, cada planeta
            quedaba iluminado por igual de lado a lado: sin terminador, sin
            sombra, sin bulto — pegatinas redondas. Ahora el relleno es apenas
            el rebote del cielo (la cara de noche se insinúa, no desaparece) y
            el que modela es el sol de AU-RA, desde el centro. */}
        <ambientLight intensity={0.16} color="#5b6f9e" />
        {/* LA LUZ DEL PROPIO CIELO. Un mundo a diez radios del sol no recibe
            casi nada de él — pero SÍ recibe la galaxia entera, que es una
            lámpara enorme y difusa encima. Sin esto los mundos del paisaje
            eran discos negros; con esto tienen media luz azulada arriba y
            penumbra abajo, que es exactamente lo que se ve en una foto del
            sistema solar exterior. */}
        <hemisphereLight args={['#6d84b8', '#161d2e', 0.42]} />
        {/* la luz de contra: el filo frío de la galaxia que despega cada
            mundo del fondo negro, como en cualquier foto bien hecha */}
        <directionalLight position={[-14, 9, -12]} intensity={0.5} color="#7fa8d8" />
        <color attach="background" args={['#030308']} />
        <fogExp2 attach="fog" args={['#05060d', 0.0075]} />
        <Sky />
        <Pulses />
        <TransitRunner />
        <Espacial />
        <GestureLayer />
      </Canvas>
      <Hud />
      <Overlays />
    </div>
  )
}

export const AETHERION_VERSION = '0.1.0 · Semilla del Sistema Vivo'
export type { Marea } from './kernel/sim'
