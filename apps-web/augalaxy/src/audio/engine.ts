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
    /* DOS ETAPAS, NO UNA. El compresor de antes dejaba pasar los picos
       rápidos —un golpe grave de seis milisegundos entra y sale antes de que
       reaccione— y esos picos, sumados a la música que corre en SU PROPIO
       contexto, saturaban la salida del aparato: eso es el crujido. Ahora
       hay un compresor suave que domestica el cuerpo del sonido y detrás un
       LIMITADOR duro, de ataque instantáneo, que es el que no deja salir
       nada por encima del techo pase lo que pase. */
    const comp = this.ctx.createDynamicsCompressor()
    comp.threshold.value = -20
    comp.ratio.value = 4
    comp.attack.value = 0.006
    comp.release.value = 0.18
    const tope = this.ctx.createDynamicsCompressor()
    tope.threshold.value = -3
    tope.ratio.value = 20
    tope.knee.value = 0
    tope.attack.value = 0.001
    tope.release.value = 0.08
    this.master = this.ctx.createGain()
    this.master.gain.value = this.volume
    this.master.connect(comp)
    comp.connect(tope)
    tope.connect(this.ctx.destination)

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

  /* EL ATAQUE MÍNIMO ES MEDIO CICLO. Un tono de 72 Hz tarda catorce
     milisegundos en dar una vuelta: subirle el volumen en seis es pedirle al
     altavoz que salte de golpe, y ese salto se oye como un chasquido. Aquí
     ningún ataque baja de doce milisegundos, y las colas terminan en cero de
     verdad —una cola que se corta a 0.0001 y ahí para también chasquea. */
  private env(g: GainNode, peak: number, attack: number, decay: number) {
    if (!this.ctx) return
    const t = this.ctx.currentTime
    const a = Math.max(0.012, attack)
    g.gain.setValueAtTime(0.0001, t)
    g.gain.linearRampToValueAtTime(peak, t + a)
    g.gain.exponentialRampToValueAtTime(0.0006, t + a + decay)
    g.gain.linearRampToValueAtTime(0, t + a + decay + 0.03)
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

  /* Cuando la casa va a hacer ruido de verdad —un zarpe, un aterrizaje— se
     avisa, y la música se agacha sola. Los dos viven en contextos de audio
     distintos y no pueden compartir un limitador: la única forma de que no
     se peleen es que uno se aparte cuando habla el otro. */
  private avisarGolpe(ms: number) {
    try { dispatchEvent(new CustomEvent('ae-golpe', { detail: { ms } })) } catch { /* nada */ }
  }

  whoosh(up: boolean) {
    this.ensure()
    this.avisarGolpe(1100)
    /* Menos nivel y filtro más cerrado (Q alto): el ruido blanco ancho es
       justo lo que se oye como estática. Con la banda estrecha suena a aire
       moviéndose, que es lo que tiene que ser. */
    if (up) this.noise(0.085, 0.9, 340, 4200, 2.2)
    else this.noise(0.075, 0.75, 3600, 300, 2.2)
  }

  land() {
    this.ensure()
    this.avisarGolpe(1400)
    // 40 ms de ataque en un grave: se siente el golpe sin que chasquee
    this.tone(72, 'sine', 0.11, 0.04, 0.6, 44)
    this.noise(0.03, 1.4, 800, 240, 1.4)
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
