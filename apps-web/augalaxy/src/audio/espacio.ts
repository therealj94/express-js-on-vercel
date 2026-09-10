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



class Espacio {
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

  /* ══ POR QUÉ AQUÍ YA NO SE CREA NINGUNA VOZ ═══════════════════════════════
   *
   * Cada mundo tenía la suya: dos osciladores y un LFO, sonando sin parar
   * mientras la galaxia estuviera abierta. Con once casas son treinta y tres
   * fuentes encimadas — el «sonido de fondo viejo» que seguía apareciendo
   * debajo de la música por mucho que se apagara el ambiente del otro motor.
   * Eran dos sistemas distintos y solo se había apagado uno.
   *
   * Y había una trampa que hacía imposible callarlas a medias, que es lo que
   * se intentó primero: el LFO del respiro va conectado a `gain.gain`, o sea
   * SUMA a la ganancia en vez de multiplicarla. Poniendo la base en cero, el
   * LFO seguía moviéndola entre menos y más un tercio: las voces «apagadas»
   * seguían respirando, audibles, y el código parecía correcto. Un volumen
   * que se pone a cero y no calla es de las cosas que más cuesta encontrar.
   *
   * Así que no se crean. El fondo de esta casa es UNA pista y nada más. Lo que
   * se queda es el toque de elegir un planeta, que no es fondo: es respuesta a
   * algo que uno hizo, dura un cuarto de segundo y se apaga sola. */

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
  mundo(_id: string, _natura: string, _pos: THREE.Vector3, _apagado = false) {
    /* Ver arriba: los mundos no tienen voz. Se conserva la firma porque el
       cielo la llama por cada casa en cada cuadro, y quitarla obligaría a
       tocar el bucle de dibujado para apagar un sonido. */
  }

  /* ══ EL SOL, CALLADO ══════════════════════════════════════════════════
     Tenía su nota sostenida, y se encendía cuando AU-RA hablaba y se quedaba
     encendida: era la más fácil de oír de todas y la más difícil de explicar.
     Misma razón que las voces de los mundos — el fondo de esta casa es UNA
     pista y nada más.
     La función se queda, sin sonido: la llaman la película y AU-RA en varios
     sitios, y un puente que desaparece obliga a tocar cinco archivos para
     apagar una nota. Los momentos grandes los marca ahora la MÚSICA creciendo
     (MUSICA.crecer), que es lo que hace una película de verdad. */
  solHabla(_nivel: number) {
    /* a propósito, en silencio */
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

  /* Silencio total (salir de la galaxia). Ya no queda nada sostenido que
     callar —los toques mueren solos en un cuarto de segundo— pero la puerta se
     conserva: la llama la casa al salir, y el día que vuelva a haber algo
     continuo tiene que haber un sitio donde apagarlo. */
  callar() {
    /* nada sostenido que apagar */
  }
}

export const espacio = new Espacio()
