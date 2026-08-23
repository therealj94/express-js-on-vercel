import * as THREE from 'three'

export type Marea = 'alba' | 'pleamar' | 'bajamar'

export const sim = {
  now: 0,
  dt: 0,
  time: 0,
  breath: 0,
  beat: 0,
  beatCount: 0,
  intro: 0,
  /* la bienvenida de AURA: sube a 1 al entrar alguien y decae sola */
  auraBrillo: 0,
  /* EL ACOMODO. 1 = el sistema disperso, como se ve desde el umbral: los
     mundos sueltos, lejos, cada uno por su lado. 0 = cada casa en su órbita.
     Entrar es exactamente el viaje de 1 a 0, y por eso los planetas se
     ACOMODAN mientras la cámara se acerca. */
  acomodo: 1,
  timeScale: 1,
  timeScaleT: 1,
  desat: 0,
  desatT: 0,
  iris: 0,
  distort: 0,
  distortT: 0,
  edge: 0,
  eclipse: 0,
  eclipseT: 0,
  exposureBias: 0,
  mareaColor: new THREE.Color('#59d9ff'),
  dustColor: new THREE.Color('#9fe8ff'),
  fogDensity: 0.0075,
  expoMul: 1,
  pointer: new THREE.Vector2(0, 0),
  pointerMovedAt: -10,
  tuLuz: new THREE.Vector3(0, 0, 8),
  frameEma: 16.7,
  reducedMotion: false,
}

export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t
export const damp = (cur: number, target: number, lambda: number, dt: number) =>
  THREE.MathUtils.damp(cur, target, lambda, dt)
export const norm = (v: number, a: number, b: number) => clamp((v - a) / (b - a), 0, 1)
export const easeInOut = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3)
export const easeOutBack = (t: number) => {
  const c = 1.35
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2)
}
export const bell = (x: number, center: number, width: number) =>
  Math.exp(-((x - center) * (x - center)) / (2 * width * width))

export function mulberry32(a: number) {
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface MareaPalette {
  filament: string
  dust: string
  fog: number
  expo: number
}

export const PALETTES: Record<Marea, MareaPalette> = {
  alba: { filament: '#59d9ff', dust: '#9fe8ff', fog: 0.0075, expo: 1.0 },
  pleamar: { filament: '#b96bff', dust: '#e2c4ff', fog: 0.0105, expo: 0.92 },
  bajamar: { filament: '#2a5f8f', dust: '#35506b', fog: 0.0055, expo: 0.8 },
}
