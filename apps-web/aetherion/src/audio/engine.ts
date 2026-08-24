import * as THREE from 'three'

class Haptics {
  private ok = typeof navigator !== 'undefined' && 'vibrate' in navigator
  private v(p: number | number[]) {
    if (this.ok) navigator.vibrate(p)
  }
  tick() {
    this.v(8)
  }
  commit() {
    this.v([10, 30, 10])
  }
  ramp(ms = 180) {
    this.v(Math.min(ms, 300))
  }
  thud() {
    this.v(28)
  }
  alert() {
    this.v([18, 60, 18, 60, 40])
  }
}

export const haptic = new Haptics()

class AetherAudio {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private ambientGain: GainNode | null = null
  private noiseBuf: AudioBuffer | null = null
  private started = false
  private volume = 0.52

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume()
      return
    }
    const AC = window.AudioContext || (window as any).webkitAudioContext
    if (!AC) return
    this.ctx = new AC()
    const comp = this.ctx.createDynamicsCompressor()
    comp.threshold.value = -18
    comp.ratio.value = 6
    this.master = this.ctx.createGain()
    this.master.gain.value = this.volume
    this.master.connect(comp)
    comp.connect(this.ctx.destination)

    const len = this.ctx.sampleRate * 2
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate)
    const d = buf.getChannelData(0)
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
    this.noiseBuf = buf
  }

  /* SIN FONDO. Aquí hubo un zumbido grave, y después un acorde suspendido con
   * su polvo de estrellas. Ninguno de los dos gustó, y la razón es más simple
   * que la mezcla: un sonido que suena SOLO, todo el rato, sin que nadie lo
   * haya pedido, molesta por definición — por bonito que sea. Cansa en dos
   * minutos, se pisa con la música de quien está escuchando algo, y no aporta
   * ninguna información.
   *
   * Los efectos se quedan, y esos sí sirven: el clic confirma que la mano
   * tocó, el zarpe acompaña un viaje, el golpe avisa que algo pasó. Suenan
   * porque ocurrió algo, que es la única razón decente para que una app haga
   * ruido.
   *
   * La función sigue existiendo —la llaman los gestos al despertar el audio— y
   * lo que hace ahora es exactamente eso: dejar el contexto listo para los
   * efectos, sin arrancar ningún fondo. */
  startAmbient() {
    if (this.started || !this.ctx || !this.master) return
    this.started = true
    // el contexto queda despierto; el cielo se queda callado
  }

  setVolume(v: number) {
    this.volume = v
    if (this.master && this.ctx)
      this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.1)
  }

  duck(factor: number) {
    if (this.master && this.ctx)
      this.master.gain.setTargetAtTime(this.volume * factor, this.ctx.currentTime, 0.2)
  }

  private env(g: GainNode, peak: number, attack: number, decay: number) {
    if (!this.ctx) return
    const t = this.ctx.currentTime
    g.gain.setValueAtTime(0.0001, t)
    g.gain.linearRampToValueAtTime(peak, t + attack)
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay)
  }

  private tone(freq: number, type: OscillatorType, peak: number, attack: number, decay: number, freqEnd?: number) {
    if (!this.ctx || !this.master) return
    const o = this.ctx.createOscillator()
    o.type = type
    o.frequency.value = freq
    if (freqEnd !== undefined)
      o.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), this.ctx.currentTime + attack + decay)
    const g = this.ctx.createGain()
    this.env(g, peak, attack, decay)
    o.connect(g)
    g.connect(this.master)
    o.start()
    o.stop(this.ctx.currentTime + attack + decay + 0.05)
  }

  private noise(peak: number, dur: number, f0: number, f1: number, q = 1) {
    if (!this.ctx || !this.master || !this.noiseBuf) return
    const src = this.ctx.createBufferSource()
    src.buffer = this.noiseBuf
    const bp = this.ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.Q.value = q
    const t = this.ctx.currentTime
    bp.frequency.setValueAtTime(f0, t)
    bp.frequency.exponentialRampToValueAtTime(f1, t + dur)
    const g = this.ctx.createGain()
    this.env(g, peak, dur * 0.35, dur * 0.65)
    src.connect(bp)
    bp.connect(g)
    g.connect(this.master)
    src.start()
    src.stop(t + dur + 0.1)
  }

  onBeat() {
    if (!this.started) return
    this.tone(58, 'sine', 0.05, 0.005, 0.16, 40)
  }

  select(mass = 0.5) {
    this.ensure()
    this.tone(480 + mass * 260, 'sine', 0.08, 0.004, 0.22, (480 + mass * 260) * 1.5)
  }

  commit() {
    this.ensure()
    this.tone(660, 'sine', 0.07, 0.004, 0.1)
    window.setTimeout(() => this.tone(880, 'sine', 0.06, 0.004, 0.14), 90)
  }

  prep() {
    this.ensure()
    this.tone(38, 'sine', 0.06, 0.4, 0.6)
  }

  whoosh(up: boolean) {
    this.ensure()
    if (up) this.noise(0.16, 0.85, 300, 5200, 0.9)
    else this.noise(0.14, 0.7, 4200, 260, 0.9)
  }

  land() {
    this.ensure()
    this.tone(72, 'sine', 0.14, 0.006, 0.5, 44)
    this.noise(0.05, 1.4, 900, 220, 0.5)
  }

  snap() {
    this.ensure()
    this.tone(1400, 'square', 0.045, 0.002, 0.07, 900)
  }

  chime(urgent: boolean) {
    this.ensure()
    if (urgent) {
      this.tone(740, 'sine', 0.09, 0.004, 0.4)
      window.setTimeout(() => this.tone(1108, 'sine', 0.08, 0.004, 0.5), 110)
    } else {
      this.tone(587, 'sine', 0.05, 0.004, 0.35)
    }
  }

  sparkle() {
    if (!this.started || !this.ctx) return
    const scale = [523, 587, 659, 784, 880, 1046]
    const f = scale[Math.floor(Math.random() * scale.length)]
    this.tone(f, 'sine', 0.02, 0.005, 0.9)
  }

  /* El plano espacial (espacio.ts) cuelga sus emisores del MISMO contexto y
     del mismo máster: una sola mezcla, un solo compresor, un solo volumen. */
  get contexto() { return this.ctx }
  get salida() { return this.master }
  get ruido() { return this.noiseBuf }

  pause() {
    if (this.ctx && this.ctx.state === 'running') this.ctx.suspend()
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume()
  }
}

export const audio = new AetherAudio()

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) audio.pause()
    else audio.resume()
  })
}
