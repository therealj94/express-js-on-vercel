import * as THREE from 'three'
import { rig } from './rig'
import { sim } from './sim'
import { wellRegistry } from '../sky/Wells'
import { useUiStore } from '../state/uiStore'
import { audio } from '../audio/engine'
import { espacio } from '../audio/espacio'

/* EL GÉNESIS · la película.
 *
 * ══ QUÉ ES ════════════════════════════════════════════════════════════════
 *
 * La historia del ecosistema contada SOBRE la galaxia de verdad — no un vídeo
 * aparte, no una animación pregrabada: la misma escena que se toca todos los
 * días, dirigida como se dirige una película.
 *
 * Empieza en la tiniebla, con todo disperso y el sol sin ser. Llega la
 * palabra. Nace la luz. Los mundos encuentran su órbita y se presentan uno a
 * uno. Y entonces la cámara se va hacia atrás hasta que cabe el universo
 * entero, y ahí se dice lo único que importa: que esto lo construimos, que no
 * es una aplicación más, y que quien está mirando no llegó por casualidad.
 *
 * ══ POR QUÉ LA CÁMARA SE MUEVE ASÍ ════════════════════════════════════════
 *
 * La versión anterior SALTABA: cada acto ponía la cámara en su sitio y el
 * amortiguador la llevaba. Eso se lee como diapositivas, no como cine. Aquí
 * cada acto tiene un MOVIMIENTO con su curva propia —un acercamiento lento,
 * un arco alrededor, un retroceso que abre— y el coreógrafo lo interpola
 * cuadro a cuadro. La cámara nunca está quieta del todo, que es exactamente
 * lo que separa una película de una presentación.
 *
 * Y las curvas no son la misma para todo: el retroceso que revela el universo
 * arranca despacio y ACELERA (easeIn), porque una revelación tiene que crecer;
 * el acercamiento a una casa frena al llegar (easeOut), porque aterrizar de
 * golpe marea.
 *
 * ══ QUIÉN PONE LAS PALABRAS ═══════════════════════════════════════════════
 *
 * Este módulo no sabe hablar ningún idioma: solo grita en qué acto está. La
 * casa pone los rótulos, la voz de AU-RA y la música. Así el mismo director
 * sirve para la pantalla, para el visor —donde no hay HTML que valga y la voz
 * lo cuenta todo— y para lo que venga.
 */

type Curva = 'suave' | 'entra' | 'sale' | 'recta' | 'llega'

interface Movimiento {
  /* Adónde va la cámara. Lo que no se dice, no se toca. */
  radio?: number
  phi?: number
  /* El giro se pide RELATIVO: «date un cuarto de vuelta desde donde estés».
     Absoluto obligaría a saber dónde quedó el acto anterior. */
  giro?: number
  mira?: number
  curva?: Curva
}

export interface Acto {
  clave: string
  dura: number
  mover?: Movimiento
  /* Un acto puede apuntar a una casa: la cámara se pone del mismo lado que
     ella para que quede entre el ojo y el sol, a contraluz. */
  casa?: string
}

interface Opciones {
  alActo?: (clave: string) => void
  alFin?: (salteado: boolean) => void
  casas?: string[]
  /* Quién pone los nombres: la casa con su capa HTML, o la propia escena
     (que es lo único que hay dentro de un visor). */
  rotulos?: 'html' | 'escena'
}

const CURVAS: Record<Curva, (p: number) => number> = {
  suave: (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2),
  entra: (p) => p * p * p,                    // arranca quieto y acelera
  sale: (p) => 1 - Math.pow(1 - p, 3),        // llega frenando
  recta: (p) => p,
  /* LLEGAR Y SOSTENER. Un plano de presentación tiene que estar COMPUESTO
     cuando aparece el rótulo: si la cámara sigue viajando mientras se lee el
     nombre de la casa, lo que se ve es una cámara buscando, no un plano. Así
     que llega en el primer 55% y el resto lo pasa empujando apenas —ese
     acercamiento lento que tiene cualquier plano sostenido de cine. */
  llega: (p) => (p < 0.55
    ? (1 - Math.pow(1 - p / 0.55, 3)) * 0.94
    : 0.94 + ((p - 0.55) / 0.45) * 0.06),
}

const ARRIBA = new THREE.Vector3(0, 1, 0)
const tmpSol = new THREE.Vector3()
const tmpLado = new THREE.Vector3()
const tmpDir = new THREE.Vector3()
const tmpCam = new THREE.Vector3()
const tmpPrueba = new THREE.Vector3()
const tmpMira = new THREE.Vector3()
const tmpAlSolCam = new THREE.Vector3()

let vivoAhora = false
let raf = 0
let acomodoRaf = 0
let nocheRaf = 0

function acomodar(hasta: number, dura: number) {
  cancelAnimationFrame(acomodoRaf)
  const desde = sim.acomodo
  const t0 = performance.now()
  const paso = () => {
    const p = Math.min(1, (performance.now() - t0) / dura)
    sim.acomodo = desde + (hasta - desde) * CURVAS.suave(p)
    if (p < 1) acomodoRaf = requestAnimationFrame(paso)
  }
  if (dura <= 0) { sim.acomodo = hasta; return }
  acomodoRaf = requestAnimationFrame(paso)
}

let vacioRaf = 0
/* EL VACÍO: 1 = ni siquiera hay cielo. Es distinto de la noche —la noche es
   un sistema sin sol; el vacío es la nada de antes de la primera palabra. */
function llevarVacio(hasta: number, dura: number) {
  cancelAnimationFrame(vacioRaf)
  const desde = sim.vacio
  const t0 = performance.now()
  const paso = () => {
    const p = Math.min(1, (performance.now() - t0) / dura)
    sim.vacio = desde + (hasta - desde) * CURVAS.suave(p)
    if (p < 1) vacioRaf = requestAnimationFrame(paso)
  }
  if (dura <= 0) { sim.vacio = hasta; return }
  vacioRaf = requestAnimationFrame(paso)
}

function anochecer(hasta: number, dura: number) {
  cancelAnimationFrame(nocheRaf)
  const desde = sim.noche
  const t0 = performance.now()
  const paso = () => {
    const p = Math.min(1, (performance.now() - t0) / dura)
    sim.noche = desde + (hasta - desde) * CURVAS.suave(p)
    if (p < 1) nocheRaf = requestAnimationFrame(paso)
  }
  if (dura <= 0) { sim.noche = hasta; return }
  nocheRaf = requestAnimationFrame(paso)
}

/* El ángulo del lado de una casa, por el camino corto desde donde está la
   cámara: sin esto, ir de una casa a la siguiente podía dar la vuelta larga
   entera y el espectador se marea sin entender por qué. */
function anguloDe(key: string, desde: number): number | null {
  const h = wellRegistry.get(key)
  if (!h) return null
  const p = h.getPos()
  let a = Math.atan2(p.x, p.z)
  while (a - desde > Math.PI) a -= Math.PI * 2
  while (a - desde < -Math.PI) a += Math.PI * 2
  return a
}

let saltarAhora: (() => void) | null = null

function terminar(salteado: boolean, opciones: Opciones) {
  vivoAhora = false
  sim.pelicula = 0
  sim.plano = 0
  cancelAnimationFrame(raf)
  cancelAnimationFrame(acomodoRaf)
  cancelAnimationFrame(nocheRaf)
  cancelAnimationFrame(vacioRaf)
  sim.vacio = 0
  anochecer(0, salteado ? 500 : 0)
  acomodar(0, salteado ? 900 : 0)
  rig.deriva = true
  rig.mira = 0
  rig.objetivo = null
  useUiStore.getState().select(null)
  rig.recentrar()
  opciones.alFin?.(salteado)
}

function empezar(opciones: Opciones = {}) {
  if (vivoAhora) return
  vivoAhora = true
  sim.pelicula = opciones.rotulos === 'escena' ? 2 : 1
  audio.ensure()

  const casas = (opciones.casas ?? ['wallet', 'chat', 'gid', 'pay', 'genesis'])
    .filter((k) => wellRegistry.has(k))

  /* ── EL GUION ───────────────────────────────────────────────────────────
     Los tiempos son los de una lectura en voz alta sin apuro. Cada acto sabe
     qué hace la cámara mientras se dice lo suyo. */
  const guion: Acto[] = [
    /* 0. EL NEGRO. Antes de la primera palabra no hay NADA que mirar: ni
       estrellas, ni polvo, ni el rescoldo del sol. Pantalla negra de verdad,
       tres segundos largos. Es incómodo, y por eso funciona: cuando después
       aparece una sola línea de texto sobre ese vacío, pesa. */
    { clave: 'negro', dura: 3400 },
    /* I. LA TINIEBLA. El cielo asoma apenas —lo justo para entender que hay
       algo ahí fuera, disperso—, y la cámara empieza a acercarse. */
    { clave: 'tiniebla', dura: 5200, mover: { radio: 46, phi: 1.02, giro: 0.22, mira: 0, curva: 'suave' } },
    /* II. LA PALABRA. La cámara sigue entrando, más decidida, hacia un centro
       que todavía está vacío. La tensión la hace el movimiento, no el texto. */
    { clave: 'palabra', dura: 5600, mover: { radio: 30, giro: 0.3, curva: 'entra' } },
    /* III. Y FUE LA LUZ. El sol nace y la cámara RETROCEDE de golpe, como
       quien se echa atrás ante algo que estalla. Es el único movimiento
       brusco de toda la película, y por eso funciona. */
    { clave: 'luz', dura: 3400, mover: { radio: 38, curva: 'sale' } },
    /* IV. Y DIJO: ORDEN. La palabra que da nombre a la casa, dicha sobre un
       sistema todavía suelto. */
    { clave: 'palabraOrden', dura: 3800, mover: { radio: 33, giro: 0.25, curva: 'suave' } },
    /* V. Y SE ORDENÓ. Los mundos viajan a su órbita mientras la cámara los
       rodea despacio: se ve el sistema formándose desde fuera. */
    { clave: 'orden', dura: 6600, mover: { radio: 26, phi: 0.9, giro: 0.9, curva: 'suave' } },
    /* V-IX. LAS CASAS. Cada una a contraluz, con un acercamiento que frena. */
    ...casas.map((k) => ({ clave: `casa:${k}`, dura: 5400, casa: k,
      mover: { curva: 'llega' as Curva } })),
    /* X. EL UNIVERSO. El retroceso grande: arranca lento y acelera hasta que
       cabe todo — los mundos de fuera, los soles, los agujeros negros. */
    { clave: 'universo', dura: 8600, mover: { radio: 104, phi: 0.82, giro: 1.5, mira: 0, curva: 'entra' } },
    /* XI. LO QUE HICIMOS. Quieta en el panorama, girando apenas: el texto
       manda y la imagen sostiene. */
    { clave: 'obra', dura: 7600, mover: { giro: 0.55, curva: 'recta' } },
    /* XII. VOS. La cámara vuelve hacia el sistema — de vuelta a casa. */
    { clave: 'vos', dura: 7200, mover: { radio: 34, phi: 0.95, giro: 0.5, curva: 'suave' } },
    /* XIII. EL PROPÓSITO. Sigue entrando, ya cerca. */
    { clave: 'proposito', dura: 7600, mover: { radio: 24, giro: 0.35, curva: 'suave' } },
    /* XIV. LA INVITACIÓN. El encuadre de casa, el de todos los días. */
    { clave: 'invitacion', dura: 6400, mover: { radio: rig.reposo || 20, phi: rig.reposoPhi, giro: 0.2, curva: 'sale' } },
  ]

  let i = -1
  let t0 = 0
  /* Cuánto se aparta la cámara del eje casa-sol en un plano de casa. Vive
     fuera del acto porque el coreógrafo lo suma al giro cuadro a cuadro. */
  let anguloCasa: number | null = null
  let mov: (Movimiento & { r0: number; f0: number; g0: number; m0: number }) | null = null

  const entrarActo = (a: Acto) => {
    opciones.alActo?.(a.clave)
    const st = useUiStore.getState()

    if (a.clave === 'negro') {
      /* NEGRO ABSOLUTO: la noche a tope de golpe, y el firmamento también
         apagado. No es «oscuro»: es que todavía no hay nada. */
      anochecer(1, 500)
      sim.vacio = 1
      acomodar(1, 2200)
      st.select(null)
      rig.deriva = false
      rig.tRadius = Math.min(rig.lejos, 62)
      rig.tPhi = 1.06
      rig.mira = 0
    } else if (a.clave === 'tiniebla') {
      /* El cielo aparece: sigue sin haber sol, pero ya hay universo. */
      llevarVacio(0, 2600)
      anochecer(1, 300)
      acomodar(1, 3000)
      st.select(null)
      rig.deriva = false
      rig.tRadius = Math.min(rig.lejos, 62)
      rig.tPhi = 1.06
      rig.mira = 0
    } else if (a.clave === 'palabraOrden') {
      // quieta: la palabra sostiene
    } else if (a.clave === 'luz') {
      /* Y FUE LA LUZ: de golpe, con su trueno. La noche se va en menos de un
         segundo — el nacimiento de una estrella no se desvanece, ocurre. */
      llevarVacio(0, 400)
      anochecer(0, 850)
      sim.auraBrillo = 1.8
      audio.land()
      espacio.solHabla(1)
    } else if (a.clave === 'orden') {
      acomodar(0, 5600)
    } else if (a.clave.startsWith('casa:')) {
      const key = a.clave.slice(5)
      st.select(key)
      const h = wellRegistry.get(key)
      /* EL SOL NO PUEDE QUEMAR EL PLANO. Aunque quede en el borde del cuadro,
         su fogonazo y sus rayos se comen medio encuadre: durante un plano de
         casa se le bajan, y vuelven solos al terminar. La luz que MODELA a la
         casa no se toca — lo que se apaga es el resplandor, que es adorno. */
      sim.plano = 1
      if (h) {
        espacio.toque(h.getPos(), 520)
        /* EL PLANO DE UNA CASA, COMPUESTO DE VERDAD.
         *
         * Antes la cámara se ponía detrás de la casa y miraba al CENTRO — que
         * es donde está el sol. Resultado: el sol clavado en medio del cuadro,
         * quemado, y la casa desplazada a un borde. En un teléfono, donde el
         * cuadro es angosto, quedaba directamente fuera.
         *
         * Ahora la cámara MIRA A LA CASA (rig.objetivo) y se para a un lado
         * del eje casa-sol: así el sol raspa desde el costado, la casa se ve
         * con su media luna iluminada y su terminador, y el resplandor entra
         * por el borde del cuadro en vez de comérselo. Es el plano que uno
         * haría a mano. */
        rig.objetivo = h.getPos()
        /* EL SITIO DE LA CÁMARA SE ELIGE EN EL MUNDO, NO EN LA ÓRBITA.
         *
         * El timón es esférico alrededor del CENTRO: pedirle «ponete detrás
         * de esta casa» lo deja a diez unidades, mirando de arriba, y con el
         * sol dentro del cuadro — que es exactamente lo que quemaba el plano.
         *
         * Así que el plano se compone donde se compone un plano: en el
         * espacio. Se elige el punto exacto desde donde se quiere ver la
         * casa —cerca, ladeado unos setenta grados del eje casa-sol, un poco
         * por encima— y RECIÉN DESPUÉS se traduce ese punto a las tres
         * coordenadas que el timón entiende. Setenta grados es el ángulo del
         * retratista: la casa sale con su media luna y su terminador, y el
         * sol queda fuera del cuadro tirando luz desde el costado. */
        const q = h.getPos()
        const alSol = tmpSol.copy(q).negate().normalize()
        tmpLado.crossVectors(alSol, ARRIBA).normalize()
        /* Si la casa cae justo sobre el eje vertical el producto cruzado se
           desmorona: cualquier perpendicular sirve. */
        if (tmpLado.lengthSq() < 0.01) tmpLado.set(1, 0, 0)
        /* LA DISTANCIA SALE DEL TAMAÑO QUE SE QUIERE EN PANTALLA, no de un
           número a ojo: la casa ocupa la misma parte del cuadro en un
           monitor y en un teléfono. En vertical se pide menos, porque el
           rótulo se queda con el tercio de abajo. */
        const alto = typeof window !== 'undefined' ? innerHeight : 900
        const anchoV = typeof window !== 'undefined' ? innerWidth : 1400
        const angosto = anchoV / alto < 0.8
        const fovV = (angosto ? 74 : 62) * Math.PI / 180
        /* MENOS ZOOM EN EL TELÉFONO. Con 0.34 la casa llenaba el cuadro y se
           perdía el sistema alrededor: lo que hace grande a un plano de
           presentación no es que el planeta sea enorme, es que se vea DÓNDE
           está. */
        const parte = angosto ? 0.24 : 0.36
        const dist = Math.max(4.2, h.radius / Math.tan(parte * fovV / 2))

        /* DE QUÉ LADO PONERSE. Hay dos sitios buenos alrededor de una casa:
           del lado del sol (queda iluminada de frente) o del contrario
           (queda a contraluz, con su corona). Cuál de los dos aparta más el
           sol del cuadro depende de dónde caiga esa casa —las hay cerca del
           centro y lejos—, así que no se elige de antemano: se prueban los
           dos y gana el que deje el sol más lejos del eje de la cámara.
           Media línea de cuenta que evita un plano quemado. */
        const ang = 0.61
        let mejor = -2
        for (const signo of [1, -1]) {
          tmpDir.copy(alSol).multiplyScalar(signo * Math.cos(ang))
            .addScaledVector(tmpLado, Math.sin(ang))
            .addScaledVector(ARRIBA, 0.16)
            .normalize()
          tmpPrueba.copy(q).addScaledVector(tmpDir, dist)
          // el coseno del ángulo entre «adónde mira» y «dónde está el sol»
          tmpMira.copy(q).sub(tmpPrueba).normalize()
          tmpAlSolCam.copy(tmpPrueba).negate().normalize()
          const cos = tmpMira.dot(tmpAlSolCam)
          if (-cos > mejor) { mejor = -cos; tmpCam.copy(tmpPrueba) }
        }

        const r = Math.max(rig.cerca + 1.5, tmpCam.length())
        a.mover = {
          ...a.mover,
          radio: r,
          phi: Math.acos(Math.max(-1, Math.min(1, tmpCam.y / Math.max(0.001, tmpCam.length())))),
        }
        // el giro se pide relativo, así que se guarda el destino absoluto
        anguloCasa = Math.atan2(tmpCam.x, tmpCam.z)
      }
    } else if (a.clave === 'universo') {
      // fuera de las casas la cámara vuelve a mirar al sistema entero
      rig.objetivo = null
      anguloCasa = null
      sim.plano = 0
      st.select(null)
      audio.whoosh(false)
    } else {
      rig.objetivo = null
      anguloCasa = null
      sim.plano = 0
    }

    /* El movimiento se congela AQUÍ: de dónde sale la cámara es lo que hay
       ahora mismo, y de ahí en adelante el coreógrafo interpola. */
    let g: number | null = null
    if (a.casa && anguloCasa !== null) {
      /* Por el camino corto: sin esto, ir de una casa a la siguiente podía
         dar la vuelta larga entera y marear sin motivo. */
      g = anguloCasa
      while (g - rig.tTheta > Math.PI) g -= Math.PI * 2
      while (g - rig.tTheta < -Math.PI) g += Math.PI * 2
    }
    mov = {
      ...a.mover,
      r0: rig.tRadius, f0: rig.tPhi, g0: rig.tTheta, m0: rig.mira,
      giro: g !== null ? g - rig.tTheta : (a.mover?.giro ?? 0),
    }
    rig.deriva = false
  }

  const paso = () => {
    if (!vivoAhora) return
    const ahora = performance.now()
    if (i < 0 || ahora - t0 >= guion[i].dura) {
      i++
      t0 = ahora
      if (i >= guion.length) { opciones.alActo?.('fin'); terminar(false, opciones); return }
      entrarActo(guion[i])
    }

    /* EL COREÓGRAFO. Cuadro a cuadro empuja los destinos del timón por la
       curva del acto; el amortiguador del propio timón hace el resto y el
       resultado es un movimiento continuo, sin tirones ni saltos. */
    if (mov) {
      /* La casa BOTA en su sitio. Si el objetivo se congelara al empezar el
         acto, la casa se iría saliendo del encuadre despacio durante los
         cinco segundos que dura su presentación. */
      const act = guion[i]
      if (act.casa) {
        const h = wellRegistry.get(act.casa)
        if (h) rig.objetivo = h.getPos()
      }
      const p = Math.min(1, (ahora - t0) / act.dura)
      const e = CURVAS[mov.curva || 'suave'](p)
      if (mov.radio !== undefined) rig.tRadius = mov.r0 + (mov.radio - mov.r0) * e
      if (mov.phi !== undefined) rig.tPhi = mov.f0 + (mov.phi - mov.f0) * e
      if (mov.giro) rig.tTheta = mov.g0 + mov.giro * e
      if (mov.mira !== undefined) rig.mira = mov.m0 + (mov.mira - mov.m0) * e
    }
    raf = requestAnimationFrame(paso)
  }

  saltarAhora = () => terminar(true, opciones)
  raf = requestAnimationFrame(paso)
}

export const genesis = {
  empezar,
  saltar: () => { if (vivoAhora) saltarAhora?.() },
  vivo: () => vivoAhora,
}

if (typeof window !== 'undefined') {
  ;(window as any).__AE_GENESIS = genesis
  // para que una prueba pueda ver la tiniebla, que es lo que no se puede leer
  // desde fuera en una foto: si está oscuro o no
  ;(window as any).__AE_NOCHE = () => sim.noche
  ;(window as any).__AE_PELICULA = () => sim.pelicula
  ;(window as any).__AE_VACIO = () => sim.vacio
  // para diagnóstico: adónde apunta la cámara ahora mismo
  ;(window as any).__AE_OBJETIVO = () => rig.objetivo ? rig.objetivo.toArray().map((n) => Math.round(n * 10) / 10) : null
  /* Y qué tan encendido está cada rótulo: en una foto no se puede distinguir
     un nombre apagado de uno que quedó fuera de cuadro, y la regla de la
     película es justamente que se callen. */
  ;(window as any).__AE_ROTULOS = () =>
    [...wellRegistry.keys()].map((k) => {
      const o = (window as any).__AE_ROTULO_OP?.[k]
      return typeof o === 'number' ? o : 0
    })
}
