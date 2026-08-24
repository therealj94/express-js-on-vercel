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
  /* La noche del Génesis: 1 = el sol todavía no fue dicho (tiniebla), 0 = luz
     normal. Solo el tour la toca; el resto del motor la deja en cero. */
  noche: 0,
  /* Hay película rodando, y QUIÉN pone los nombres:
       0 = no hay película
       1 = rodando con rótulos en HTML (pantalla): la escena se calla del
           todo, porque el nombre ya lo dice la capa de la película y dos
           nombres del mismo planeta, a dos tamaños, se leen como un error
       2 = rodando dentro del visor: ahí no hay HTML que valga, así que el
           rótulo de la escena es el único que puede contarlo */
  pelicula: 0 as 0 | 1 | 2,
  /* Hay un PLANO de casa en curso: el sol baja su resplandor para no comerse
     el encuadre. Lo que se apaga es el adorno, no la luz que modela. */
  plano: 0,
  /* QUIÉN ES EL PROTAGONISTA DEL PLANO. Durante la presentación de una casa,
     las demás se apartan: se apagan hasta quedar en sombra y dejan de disputar
     el cuadro. Sin esto, presentar una casa era enseñar nueve mundos con uno
     un poco más grande — «muy pegadas», y con el rótulo peleando por leerse
     contra otro planeta iluminado detrás.
     En cine esto se hace con luz e iris; aquí, apagando lo que no es el tema.
     Nulo = ninguna casa manda y todas se ven igual. */
  protagonista: null as string | null,
  /* CUÁNTAS ESTRELLAS FUGACES. 1 = el goteo de siempre, una cada diez segundos
     largos, que es lo correcto para un cielo en el que uno vive. En el plano
     grande de la película se abre el caudal: ahí el tema ES el cielo, y una
     sola estrella cada diez segundos no cuenta nada. */
  lluvia: 1,
  /* Los puentes de diagnóstico de la película. Van aquí y no en cada archivo
     porque lo que se quiere saber es el ESTADO, y el estado vive aquí. */
  /* El vacío de antes del principio: 1 = ni siquiera hay cielo. Lo usa el
     primer acto del Génesis, el que empieza en negro absoluto. */
  vacio: 0,
  /* ¿hay un visor puesto? El post-procesado y otros lujos se apartan */
  visor: false,
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

/* ── LOS PUENTES DE DIAGNÓSTICO DE LA PELÍCULA ────────────────────────────────
 *
 * Lo que hace que un plano de presentación funcione —quién manda en el cuadro,
 * cuánto se apagaron los demás, si el cielo está lloviendo— no se distingue en
 * una captura de pantalla: un planeta apagado y uno fuera de cuadro se ven
 * exactamente igual, y solo uno de los dos es lo que se quería. Así que el
 * estado se dice en voz alta y una prueba puede comprobarlo. */
if (typeof window !== 'undefined') {
  const w = window as unknown as Record<string, unknown>
  w.__AE_PROTA = () => sim.protagonista
  w.__AE_LLUVIA = () => sim.lluvia
}
