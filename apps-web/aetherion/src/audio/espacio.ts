import * as THREE from 'three'
import { audio } from './engine'

/* EL SONIDO CON LUGAR.
 *
 * La regla de la casa sigue en pie: NADA suena solo, todo el rato, de fondo.
 * Eso ya se probó dos veces y molestó dos veces.
 *
 * Esto es otra cosa: cada mundo tiene una VOZ —dos notas apenas desafinadas
 * entre sí, elegidas por su naturaleza— que vive EN su posición del espacio,
 * con oído HRTF. A la distancia de reposo no se oye ninguna; al acercarse a
 * un planeta, su voz emerge del silencio, DESDE donde está el planeta: a la
 * izquierda si está a la izquierda, detrás si quedó detrás — que es la mitad
 * de lo que un visor necesita para que el lugar exista. Alejarse la apaga.
 *
 * Y AU-RA: el sol zumba SOLO mientras habla, desde el centro, con su brillo.
 *
 * Todo cuelga del mismo contexto y el mismo compresor que los efectos: una
 * sola mezcla, y si la casa baja el volumen, baja todo.
 */

interface Voz {
  panner: PannerNode
  gain: GainNode
  osc: OscillatorNode[]
  lfo: OscillatorNode
}

/* La voz de cada naturaleza: fundamental, compañera y el pulso de su respiro.
   Graves los pesados, aireados los helados, un latido de faro para el faro. */
const VOCES: Record<string, { f: [number, number]; onda: OscillatorType; resp: number; peso: number }> = {
  gigante: { f: [55, 82.5], onda: 'sine', resp: 0.07, peso: 1.0 },
  helado: { f: [659, 663.5], onda: 'sine', resp: 0.05, peso: 0.35 },
  forja: { f: [98, 147.2], onda: 'triangle', resp: 0.21, peso: 0.8 },
  oceano: { f: [220, 220.8], onda: 'sine', resp: 0.11, peso: 0.6 },
  jardin: { f: [329.6, 415.3], onda: 'sine', resp: 0.09, peso: 0.5 },
  bunker: { f: [73.4, 77.1], onda: 'sine', resp: 0.04, peso: 0.9 },
  boveda: { f: [174.6, 261.6], onda: 'sine', resp: 0.06, peso: 0.6 },
  nucleo: { f: [261.6, 327.0], onda: 'triangle', resp: 0.16, peso: 0.7 },
  faro: { f: [392, 392.6], onda: 'sine', resp: 0.42, peso: 0.5 },
}

class Espacio {
  private voces = new Map<string, Voz>()
  private sol: Voz | null = null
  private listo = false
  private frente = new THREE.Vector3()
  private arriba = new THREE.Vector3()

  /* Los emisores nacen la primera vez que hay contexto (que a su vez nace del
     primer gesto: los navegadores no dejan sonar nada antes). */
  private despertar(): AudioContext | null {
    const ctx = audio.contexto
    if (!ctx || !audio.salida) return null
    if (!this.listo) this.listo = true
    return ctx
  }

  private crearVoz(ctx: AudioContext, natura: string): Voz {
    const def = VOCES[natura] || VOCES.gigante
    const panner = ctx.createPanner()
    panner.panningModel = 'HRTF'
    panner.distanceModel = 'inverse'
    /* La matemática del silencio: a 3 unidades la voz está entera, a la
       distancia de reposo (~13) queda a un séptimo — bajo el umbral de lo
       que se nota — y en el panorama no existe. Acercarse ES el volumen. */
    panner.refDistance = 2.6
    panner.rolloffFactor = 1.6
    panner.maxDistance = 90
    const gain = ctx.createGain()
    gain.gain.value = 0
    const osc = def.f.map((freq) => {
      const o = ctx.createOscillator()
      o.type = def.onda
      o.frequency.value = freq
      o.connect(gain)
      o.start()
      return o
    })
    // el respiro: la voz sube y baja despacio, nunca es una nota clavada
    const lfo = ctx.createOscillator()
    lfo.frequency.value = def.resp
    const lfoGain = ctx.createGain()
    lfoGain.gain.value = 0.35
    lfo.connect(lfoGain)
    lfoGain.connect(gain.gain)
    lfo.start()
    gain.connect(panner)
    panner.connect(audio.salida!)
    return { panner, gain, osc, lfo }
  }

  /* El oído en la cabeza: se llama cada cuadro con la cámara que DIBUJA (en
     visor, la del ojo; en pantalla, la normal). */
  oido(cam: THREE.Camera) {
    const ctx = this.despertar()
    if (!ctx) return
    const L = ctx.listener as AudioListener & Record<string, { value: number } | undefined>
    const p = cam.getWorldPosition(new THREE.Vector3())
    this.frente.set(0, 0, -1).applyQuaternion(cam.quaternion)
    this.arriba.set(0, 1, 0).applyQuaternion(cam.quaternion)
    if ('positionX' in L && (L as any).positionX) {
      const t = ctx.currentTime
      ;(L as any).positionX.setTargetAtTime(p.x, t, 0.05)
      ;(L as any).positionY.setTargetAtTime(p.y, t, 0.05)
      ;(L as any).positionZ.setTargetAtTime(p.z, t, 0.05)
      ;(L as any).forwardX.setTargetAtTime(this.frente.x, t, 0.05)
      ;(L as any).forwardY.setTargetAtTime(this.frente.y, t, 0.05)
      ;(L as any).forwardZ.setTargetAtTime(this.frente.z, t, 0.05)
      ;(L as any).upX.setTargetAtTime(this.arriba.x, t, 0.05)
      ;(L as any).upY.setTargetAtTime(this.arriba.y, t, 0.05)
      ;(L as any).upZ.setTargetAtTime(this.arriba.z, t, 0.05)
    } else if ((L as any).setPosition) {
      // Safari viejo: la API de una sola pieza
      ;(L as any).setPosition(p.x, p.y, p.z)
      ;(L as any).setOrientation(this.frente.x, this.frente.y, this.frente.z,
        this.arriba.x, this.arriba.y, this.arriba.z)
    }
  }

  /* La voz de un mundo, en su sitio. Se llama cada cuadro; crea la voz si no
     existe y la mueve si el mundo se movió (el acomodo los mueve a todos). */
  mundo(id: string, natura: string, pos: THREE.Vector3, apagado = false) {
    const ctx = this.despertar()
    if (!ctx) return
    let v = this.voces.get(id)
    if (!v) {
      v = this.crearVoz(ctx, natura)
      this.voces.set(id, v)
    }
    const t = ctx.currentTime
    const pn = v.panner as PannerNode & Record<string, { value: number } | undefined>
    if ((pn as any).positionX) {
      ;(pn as any).positionX.setTargetAtTime(pos.x, t, 0.08)
      ;(pn as any).positionY.setTargetAtTime(pos.y, t, 0.08)
      ;(pn as any).positionZ.setTargetAtTime(pos.z, t, 0.08)
    } else if ((pn as any).setPosition) {
      ;(pn as any).setPosition(pos.x, pos.y, pos.z)
    }
    const def = VOCES[natura] || VOCES.gigante
    v.gain.gain.setTargetAtTime(apagado ? 0 : 0.016 * def.peso, t, 0.4)
  }

  /* El sol habla cuando AU-RA habla: un zumbido cálido desde el centro que
     sigue su brillo. Callada, el sol calla. */
  solHabla(nivel: number) {
    const ctx = this.despertar()
    if (!ctx) return
    if (!this.sol) {
      this.sol = this.crearVoz(ctx, 'nucleo')
      const pn = this.sol.panner as any
      if (pn.positionX) { pn.positionX.value = 0; pn.positionY.value = 0; pn.positionZ.value = 0 }
      else pn.setPosition?.(0, 0, 0)
    }
    this.sol.gain.gain.setTargetAtTime(0.028 * Math.max(0, Math.min(1, nivel)),
      ctx.currentTime, 0.15)
  }

  /* Un toque CON lugar: la campanita de elegir, sonando desde el planeta
     elegido y no desde el centro de la cabeza. */
  toque(pos: THREE.Vector3, freq = 620) {
    const ctx = this.despertar()
    if (!ctx || !audio.salida) return
    const panner = ctx.createPanner()
    panner.panningModel = 'HRTF'
    panner.distanceModel = 'inverse'
    panner.refDistance = 4
    const pn = panner as any
    if (pn.positionX) { pn.positionX.value = pos.x; pn.positionY.value = pos.y; pn.positionZ.value = pos.z }
    else pn.setPosition?.(pos.x, pos.y, pos.z)
    const o = ctx.createOscillator()
    o.type = 'sine'
    o.frequency.value = freq
    o.frequency.exponentialRampToValueAtTime(freq * 1.5, ctx.currentTime + 0.2)
    const g = ctx.createGain()
    const t = ctx.currentTime
    g.gain.setValueAtTime(0.0001, t)
    g.gain.linearRampToValueAtTime(0.12, t + 0.006)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28)
    o.connect(g)
    g.connect(panner)
    panner.connect(audio.salida)
    o.start()
    o.stop(t + 0.35)
    // el emisor de un toque se limpia solo al terminar
    window.setTimeout(() => { try { panner.disconnect() } catch { /* nada */ } }, 500)
  }

  /* Silencio total (salir de la galaxia): las voces se apagan sin cortarse. */
  callar() {
    const ctx = audio.contexto
    if (!ctx) return
    for (const v of this.voces.values()) v.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.2)
    this.sol?.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.2)
  }
}

export const espacio = new Espacio()
