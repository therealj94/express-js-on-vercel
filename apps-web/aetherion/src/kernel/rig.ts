import * as THREE from 'three'
import { clamp, damp } from './sim'

export const UP = new THREE.Vector3(0, 1, 0)

/* EL RADIO DEL ANILLO DE CASAS. Wells.tsx pone las apps en una órbita de este
   tamaño; el encuadre de la cámara se calcula a partir de él, así que los dos
   números viven juntos y no se pueden desincronizar. */
export const RADIO_ANILLO = 9.4

class Rig {
  theta = 0.65
  phi = 1.02
  radius = 46            // la cámara ENTRA desde lejos: el aterrizaje es el viaje
  tTheta = 0.65
  tPhi = 1.02
  tRadius = 17
  cerca = 6.2
  lejos = 40
  reposo = 17
  reposoPhi = 1.02
  /* A dónde MIRA la cámara. No siempre al centro exacto: el anillo visto en
     perspectiva no cae simétrico en la pantalla, y sin esto quedaba un tercio
     de cielo vacío arriba y las casas apelotonadas abajo. */
  mira = 0.4
  enabled = true

  orbit(dx: number, dy: number) {
    /* Girar con el dedo tiene que sentirse igual de rápido en un teléfono
       angosto que en un monitor ancho: el paso va en fracción de pantalla, no
       en píxeles sueltos. */
    const ancho = typeof window !== 'undefined' ? Math.max(360, window.innerWidth) : 1200
    const paso = 3.1 / ancho
    this.tTheta -= dx * paso
    this.tPhi = clamp(this.tPhi - dy * paso * 0.72, 0.28, 1.44)
  }

  zoomBy(factor: number) {
    this.tRadius = clamp(this.tRadius * factor, this.cerca, this.lejos)
  }

  /* Acercar y alejar por pasos, que es lo que piden los botones, el teclado y
     la mano en el aire. */
  zoomPaso(dir: number) {
    this.zoomBy(dir > 0 ? 0.82 : 1 / 0.82)
  }

  /* La entrada: la galaxia se abre desde lejos y aterriza en su encuadre. */
  entrada() {
    this.radius = clamp(this.reposo * 2.7, 20, 90)
    this.tRadius = this.reposo
    this.tTheta = this.theta = 0.65
    this.tPhi = this.phi = this.reposoPhi
  }

  recentrar() {
    this.tTheta = 0.65
    this.tPhi = this.reposoPhi
    this.tRadius = this.reposo
  }

  get cerquita() { return this.tRadius <= this.cerca + 0.05 }
  get lejitos() { return this.tRadius >= this.lejos - 0.05 }

  /* EL ENCUADRE, MEDIDO Y NO ADIVINADO.
   *
   * Poner la cámara «a tantas veces el radio del anillo» falla: la casa que
   * queda del lado de la cámara está mucho más cerca que la del fondo y se
   * salía por abajo de la pantalla, gigante y cortada. Así que aquí no se
   * estima: se PROYECTAN las casas de verdad con una cámara de prueba y se va
   * alejando hasta que todas caben, con su margen para el aro y el letrero.
   *
   * Las posiciones las registra el cielo (anclas) al armar los planetas, así
   * que si mañana cambia el reparto, el encuadre se entera solo.
   */
  anclas: Array<{ pos: THREE.Vector3; r: number }> = []

  private posicionar(cam: THREE.PerspectiveCamera, d: number, phi: number) {
    const sp = Math.sin(phi)
    cam.position.set(d * sp * Math.sin(this.tTheta), d * Math.cos(phi), d * sp * Math.cos(this.tTheta))
    cam.lookAt(0, this.mira, 0)
    cam.updateMatrixWorld(true)
    cam.updateProjectionMatrix()
  }

  private cabeTodo(prueba: THREE.PerspectiveCamera, d: number, phi: number) {
    this.posicionar(prueba, d, phi)
    const p = new THREE.Vector3()
    for (const a of this.anclas) {
      p.copy(a.pos).project(prueba)
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return false
      /* el planeta ocupa lo suyo alrededor del ancla, y el letrero cuelga
         debajo: el margen de abajo es el más generoso */
      const medio = Math.tan((prueba.fov * Math.PI) / 180 / 2)
      const dist = prueba.position.distanceTo(a.pos)
      const rY = (a.r * 1.5) / (medio * dist)
      const rX = rY / prueba.aspect
      if (Math.abs(p.x) + rX > 0.94) return false
      if (p.y + rY > 0.9 || p.y - rY * 1.6 < -0.9) return false
    }
    return true
  }

  encuadrar(cam: THREE.PerspectiveCamera) {
    /* De pie (teléfono) el anillo se mira más desde arriba y llena el alto;
       acostado (monitor) se mira más de canto y gana profundidad. */
    const dePie = cam.aspect < 1
    const inclinacion = dePie ? 0.74 : 0.92
    const seguia = Math.abs(this.tPhi - this.reposoPhi) < 0.02
    this.reposoPhi = inclinacion
    if (seguia) this.tPhi = inclinacion

    let d = 12
    if (this.anclas.length) {
      const prueba = new THREE.PerspectiveCamera(cam.fov, cam.aspect, 0.1, 400)
      d = 40
      for (let x = 11; x <= 40; x += 0.5) {
        if (this.cabeTodo(prueba, x, inclinacion)) { d = x; break }
      }
    } else {
      // sin casas registradas todavía: el radio pelado con su margen
      const medio = Math.tan((cam.fov * Math.PI) / 180 / 2)
      d = Math.max((RADIO_ANILLO * 1.5) / medio * 0.68, (RADIO_ANILLO * 1.5) / (medio * cam.aspect))
    }
    /* CENTRAR LO QUE HAY. Con la distancia ya elegida, se mira dónde cae la
       nube de casas en la pantalla y se corrige el punto de mira hasta que
       queda centrada de arriba abajo. Tres pasadas alcanzan. */
    if (this.anclas.length) {
      const prueba = new THREE.PerspectiveCamera(cam.fov, cam.aspect, 0.1, 400)
      const p = new THREE.Vector3()
      for (let paso = 0; paso < 3; paso++) {
        this.posicionar(prueba, d, inclinacion)
        let alto = -Infinity
        let bajo = Infinity
        for (const a of this.anclas) {
          p.copy(a.pos).project(prueba)
          const r = (a.r * 1.5) / (Math.tan((cam.fov * Math.PI) / 180 / 2) * prueba.position.distanceTo(a.pos))
          alto = Math.max(alto, p.y + r)
          bajo = Math.min(bajo, p.y - r * 1.6)
        }
        const centro = (alto + bajo) / 2
        if (Math.abs(centro) < 0.02) break
        const mundoMedio = Math.tan((cam.fov * Math.PI) / 180 / 2) * d
        this.mira = clamp(this.mira + centro * mundoMedio * 0.85, -8, 5)
      }
      // si el centrado apretó los bordes, se vuelve a comprobar que todo cabe
      let ok = false
      for (let x = d; x <= 40; x += 0.5) {
        if (this.cabeTodo(prueba, x, inclinacion)) { d = x; ok = true; break }
      }
      if (!ok) d = 40
    }
    this.reposo = clamp(d, 11, 40)
    this.lejos = clamp(this.reposo * 1.9, 22, 62)
    this.cerca = 6.2
    return this.reposo
  }

  resync(cam: THREE.Camera) {

    const p = cam.position
    this.radius = this.tRadius = clamp(p.length(), this.cerca, this.lejos)
    this.theta = this.tTheta = Math.atan2(p.x, p.z)
    this.phi = this.tPhi = clamp(Math.acos(clamp(p.y / Math.max(0.001, p.length()), -1, 1)), 0.28, 1.44)
  }

  update(cam: THREE.Camera, dt: number) {
    if (!this.enabled) return
    this.theta = damp(this.theta, this.tTheta, 6, dt)
    this.phi = damp(this.phi, this.tPhi, 6, dt)
    this.radius = damp(this.radius, this.tRadius, 3.2, dt)
    const sp = Math.sin(this.phi)
    cam.position.set(
      this.radius * sp * Math.sin(this.theta),
      this.radius * Math.cos(this.phi),
      this.radius * sp * Math.cos(this.theta)
    )
    cam.lookAt(0, this.mira, 0)
  }

  altitudeLabel(): string {
    const en = typeof window !== 'undefined' && (window as any).__AE_LANG === 'en'
    const r = this.radius / Math.max(1, this.reposo)
    if (r > 1.18) return en ? 'SKY' : 'CIELO'
    if (r > 0.62) return en ? 'CONSTELLATION' : 'CONSTELACIÓN'
    return en ? 'ORBIT' : 'ÓRBITA'
  }
}

export const rig = new Rig()
