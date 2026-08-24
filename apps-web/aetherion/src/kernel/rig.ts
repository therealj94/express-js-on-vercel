import * as THREE from 'three'
import { clamp, damp, sim } from './sim'

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
  cerca = 4.4
  lejos = 40
  reposo = 17
  reposoPhi = 1.02
  /* A dónde MIRA la cámara. No siempre al centro exacto: el anillo visto en
     perspectiva no cae simétrico en la pantalla, y sin esto quedaba un tercio
     de cielo vacío arriba y las casas apelotonadas abajo. */
  mira = 0.4
  /* LA PUERTA. Antes de entrar, la galaxia se mira desde lejos: los planetas
     orbitan despacio y la cámara deriva sola, como un sistema visto desde el
     umbral. deriva la apaga el primer gesto de la persona o el vuelo. */
  deriva = false
  /* EL VUELO DE ENTRADA. Un solo movimiento de cámara, sin cortes: iniciar
     sesión es acercarse en línea directa; crear cuenta es un descenso más
     lento, con fase de descubrimiento. Mientras dura, el vuelo es el único
     dueño del radio. */
  vuelo: { desde: number; t0: number; dura: number; alFin?: () => void } | null = null
  /* La distancia desde la que se ve el sistema entero: es el tope de alejar y
     el destino del botón «ver todo». */
  panorama = 26
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

  /* La cámara al umbral: lejos, alta y a la deriva. Es el estado de la
     pantalla de entrada. */
  puerta() {
    this.vuelo = null
    this.deriva = true
    /* El umbral tiene que quedar POR FUERA de la nube dispersa: con el sistema
       suelto, los mundos ocupan mucho más que el anillo y algunos caían encima
       de la cámara, gigantes y cortados por el borde. */
    const lejos = clamp(Math.max(this.panorama * 2.4, RADIO_ANILLO * 5.4), 44, 96)
    this.radius = this.tRadius = lejos
    this.tPhi = this.phi = Math.min(1.2, this.reposoPhi + 0.16)
    this.lejos = Math.max(this.lejos, lejos)
  }

  /* El vuelo: del radio actual al encuadre de casa, en un solo gesto. */
  volar(dura: number, alFin?: () => void) {
    this.deriva = false
    this.vuelo = { desde: this.radius, t0: -1, dura, alFin }
  }

  recentrar() {
    this.objetivo = null
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
  anclas: Array<{ pos: THREE.Vector3; r: number; principal?: boolean }> = []
  /* El punto que la cámara mira cuando NO es el centro. Solo lo usa la
     película; el timón de todos los días lo deja en nulo. */
  objetivo: THREE.Vector3 | null = null

  private posicionar(cam: THREE.PerspectiveCamera, d: number, phi: number) {
    const sp = Math.sin(phi)
    cam.position.set(d * sp * Math.sin(this.tTheta), d * Math.cos(phi), d * sp * Math.cos(this.tTheta))
    /* La cámara de MEDIR siempre mira al centro: con ella se calcula dónde
       cae cada casa para elegir el encuadre, y apuntarla a otro sitio daría
       distancias sin sentido. La que mira a un planeta es la de verdad, en
       update(). */
    cam.lookAt(0, this.mira, 0)
    cam.updateMatrixWorld(true)
    cam.updateProjectionMatrix()
  }

  private cabeTodo(prueba: THREE.PerspectiveCamera, d: number, phi: number, soloPrincipales = false) {
    this.posicionar(prueba, d, phi)
    const p = new THREE.Vector3()
    for (const a of this.anclas) {
      if (soloPrincipales && !a.principal) continue
      p.copy(a.pos).project(prueba)
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return false
      /* el planeta ocupa lo suyo alrededor del ancla, y el letrero cuelga
         debajo: el margen de abajo es el más generoso */
      const medio = Math.tan((prueba.fov * Math.PI) / 180 / 2)
      const dist = prueba.position.distanceTo(a.pos)
      const rY = (a.r * 1.5) / (medio * dist)
      const rX = rY / prueba.aspect
      if (Math.abs(p.x) + rX > 0.96) return false
      if (p.y + rY > 0.92 || p.y - rY * 1.25 < -0.92) return false
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
      /* DOS DISTANCIAS Y UN CRITERIO. Una es donde cabe TODO; la otra, donde
         caben las casas de todos los días. Mirar desde donde cabe todo deja la
         galaxia lejos y chiquita —que es justo lo que no queríamos—, así que se
         entra bastante más cerca y las casas de afuera asoman por el borde: se
         llega a ellas girando, alejando o tocando. Lo que NO se permite es
         cortar una casa principal. */
      let todo = 40
      for (let x = 9; x <= 40; x += 0.5) {
        if (this.cabeTodo(prueba, x, inclinacion)) { todo = x; break }
      }
      let principales = 9
      for (let x = 9; x <= 40; x += 0.5) {
        if (this.cabeTodo(prueba, x, inclinacion, true)) { principales = x; break }
      }
      /* EL ENCUADRE DE CASA. Antes se entraba tan pegado que se perdía el
         sistema: se veían cuatro planetas gigantes y ni sol ni galaxia. Ahora
         se entra a la distancia donde CABE TODO —las nueve casas, el sol en
         medio y el cielo alrededor— con un pelo de holgura para que respire.
         Acercarse sigue estando a un gesto: para eso está el timón. */
      d = Math.max(principales, todo * 1.04)
      // el tope de alejar SÍ tiene que dar el panorama entero
      this.panorama = todo
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
        /* El centro se calcula con PESO: una casa cercana ocupa más pantalla
           y tira más de la composición que una que asoma al fondo. Sin esto
           quedaba un tercio de cielo vacío arriba. */
        let suma = 0
        let peso = 0
        for (const a of this.anclas) {
          p.copy(a.pos).project(prueba)
          const dist = prueba.position.distanceTo(a.pos)
          const r = (a.r * 1.5) / (Math.tan((cam.fov * Math.PI) / 180 / 2) * dist)
          const cuanto = r * r * (a.principal ? 1.6 : 1)
          suma += p.y * cuanto
          peso += cuanto
        }
        const centro = peso > 0 ? suma / peso : 0
        if (Math.abs(centro) < 0.02) break
        const mundoMedio = Math.tan((cam.fov * Math.PI) / 180 / 2) * d
        this.mira = clamp(this.mira + centro * mundoMedio * 0.85, -8, 5)
      }
      // tras centrar, las principales tienen que seguir enteras
      let ok = false
      for (let x = d; x <= 40; x += 0.5) {
        if (this.cabeTodo(prueba, x, inclinacion, true)) { d = x; ok = true; break }
      }
      if (!ok) d = this.panorama
    }
    this.reposo = clamp(d, 9, 40)
    /* Alejar tiene que ENSEÑAR LA GALAXIA: no solo las casas más chicas, sino
       los mundos de afuera, el polvo y las estrellas. Por eso el tope de
       alejar es muy superior al panorama de las casas. */
    this.lejos = clamp(Math.max(this.panorama * 2.6, this.reposo * 3), 40, 130)
    this.cerca = 4.4
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
    if (this.deriva) this.tTheta += dt * 0.02
    if (this.vuelo) {
      const v = this.vuelo
      /* Reloj de PARED, no el de la simulación: sim.now recorta dt a 50 ms y
         en un teléfono a 30 fps el vuelo duraría el doble de lo pedido. La
         entrada dura lo que dice que dura, corra como corra el dibujo. */
      if (v.t0 < 0) v.t0 = performance.now()
      const p = Math.min(1, (performance.now() - v.t0) / v.dura)
      /* easeInOutCubic: arranca suave, cruza con decisión, frena con calma —
         el «un solo movimiento» del que habla el diseño. */
      const e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2
      /* El destino es el reposo VIVO, no una foto: si el encuadre se mide a
         mitad de vuelo (la primera visita, un giro de pantalla), el vuelo
         aterriza donde corresponde y no donde correspondía. */
      this.tRadius = v.desde + (this.reposo - v.desde) * e
      this.radius = this.tRadius
      this.tPhi += (this.reposoPhi - this.tPhi) * Math.min(1, dt * 2.2)
      if (p >= 1) {
        this.vuelo = null
        v.alFin?.()
      }
    }
    this.theta = damp(this.theta, this.tTheta, 6, dt)
    this.phi = damp(this.phi, this.tPhi, 6, dt)
    this.radius = damp(this.radius, this.tRadius, 3.2, dt)
    const sp = Math.sin(this.phi)
    cam.position.set(
      this.radius * sp * Math.sin(this.theta),
      this.radius * Math.cos(this.phi),
      this.radius * sp * Math.cos(this.theta)
    )
    /* ADÓNDE MIRA. Normalmente al centro —ahí vive AU-RA y ahí está la
       composición—, pero la película necesita apuntar a una casa concreta:
       mirando siempre al centro, el sol queda clavado en medio del cuadro,
       quemado, y la casa que se presenta se va fuera de pantalla. Con
       objetivo puesto, manda el objetivo. */
    if (this.objetivo) cam.lookAt(this.objetivo)
    else cam.lookAt(0, this.mira, 0)
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
