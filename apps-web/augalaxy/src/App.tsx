import { useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { AgXToneMapping } from 'three'
import { Kernel, QualityWatcher } from './kernel/Kernel'
import { Encuadre } from './kernel/Encuadre'
import { Visor } from './kernel/Visor'
import { Destello } from './kernel/Destello'
import { Teatro } from './kernel/Teatro'
import { Portico } from './kernel/Portico'
import { Casa } from './kernel/Casa'
import { Sky } from './sky/Sky'
import { Pulses } from './pulses/Pulses'
import { TransitRunner } from './transit/TransitRunner'
import { GestureLayer } from './gesture/useGestures'
import { Hud } from './hud/Hud'
import { Overlays } from './hud/Overlays'
import { Espacial } from './audio/Espacial'
import { sim } from './kernel/sim'
import { useUiStore } from './state/uiStore'

/* LAS LUCES OBEDECEN A LA NOCHE. El sol ya lo hacía, pero el relleno de
   ambiente, la contra y la luz del propio cielo no: con ellas puestas, «en el
   principio había oscuridad» se veía como un mediodía nublado. En la tiniebla
   del Génesis se apaga TODO menos un rescoldo — sin él la pantalla sería un
   rectángulo negro y nadie sabría si la app se rompió. */
function Luces() {
  const amb = useRef<THREE.AmbientLight>(null)
  const dir = useRef<THREE.DirectionalLight>(null)
  const hemi = useRef<THREE.HemisphereLight>(null)
  useFrame(() => {
    const k = 1 - 0.93 * sim.noche
    if (amb.current) amb.current.intensity = 0.16 * k
    if (dir.current) dir.current.intensity = 0.5 * k
    if (hemi.current) hemi.current.intensity = 0.42 * k
  })
  return (
    <>
      <ambientLight ref={amb} intensity={0.16} color="#5b6f9e" />
      <directionalLight ref={dir} position={[-14, 9, -12]} intensity={0.5} color="#7fa8d8" />
      <hemisphereLight ref={hemi} args={['#6d84b8', '#161d2e', 0.42]} />
    </>
  )
}

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
        onCreated={({ gl, camera, scene }) => {
          gl.toneMapping = AgXToneMapping
          gl.toneMappingExposure = 1.05
          ;(window as any).__aeCamera = camera
          /* La escena, para que una prueba pueda preguntarle QUÉ se está
             dibujando. Un «negro absoluto» que no es negro se ve en una foto
             pero no se explica sin poder recorrer el árbol. */
          ;(window as any).__aeScene = scene
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
        <Teatro />
        <Destello />
        <Portico />
        <Casa />
        {/* LA LUZ HACE EL VOLUMEN. Con relleno parejo y fuerte, cada planeta
            quedaba iluminado por igual de lado a lado: sin terminador, sin
            sombra, sin bulto — pegatinas redondas. Ahora el relleno es apenas
            el rebote del cielo (la cara de noche se insinúa, no desaparece) y
            el que modela es el sol de AU-RA, desde el centro. */}
        <Luces />

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

export const AUGALAXY_VERSION = '0.1.0 · Semilla del Sistema Vivo'
export type { Marea } from './kernel/sim'
