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

type Curva = 'suave' | 'entra' | 'sale' | 'recta'

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
}

const CURVAS: Record<Curva, (p: number) => number> = {
  suave: (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2),
  entra: (p) => p * p * p,                    // arranca quieto y acelera
  sale: (p) => 1 - Math.pow(1 - p, 3),        // llega frenando
  recta: (p) => p,
}

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
  cancelAnimationFrame(raf)
  cancelAnimationFrame(acomodoRaf)
  cancelAnimationFrame(nocheRaf)
  anochecer(0, salteado ? 500 : 0)
  acomodar(0, salteado ? 900 : 0)
  rig.deriva = true
  rig.mira = 0
  useUiStore.getState().select(null)
  rig.recentrar()
  opciones.alFin?.(salteado)
}

function empezar(opciones: Opciones = {}) {
  if (vivoAhora) return
  vivoAhora = true
  audio.ensure()

  const casas = (opciones.casas ?? ['wallet', 'chat', 'gid', 'pay', 'genesis'])
    .filter((k) => wellRegistry.has(k))

  /* ── EL GUION ───────────────────────────────────────────────────────────
     Los tiempos son los de una lectura en voz alta sin apuro. Cada acto sabe
     qué hace la cámara mientras se dice lo suyo. */
  const guion: Acto[] = [
    /* I. LA TINIEBLA. Lejísimos, todo disperso, sin luz. La cámara se acerca
       apenas — lo justo para que se note que algo va a pasar. */
    { clave: 'tiniebla', dura: 5200, mover: { radio: 46, phi: 1.02, giro: 0.22, mira: 0, curva: 'suave' } },
    /* II. LA PALABRA. La cámara sigue entrando, más decidida, hacia un centro
       que todavía está vacío. La tensión la hace el movimiento, no el texto. */
    { clave: 'palabra', dura: 5600, mover: { radio: 30, giro: 0.3, curva: 'entra' } },
    /* III. Y FUE LA LUZ. El sol nace y la cámara RETROCEDE de golpe, como
       quien se echa atrás ante algo que estalla. Es el único movimiento
       brusco de toda la película, y por eso funciona. */
    { clave: 'luz', dura: 3400, mover: { radio: 38, curva: 'sale' } },
    /* IV. EL ORDEN. Los mundos viajan a su órbita mientras la cámara los
       rodea despacio: se ve el sistema formándose desde fuera. */
    { clave: 'orden', dura: 6400, mover: { radio: 26, phi: 0.9, giro: 0.9, curva: 'suave' } },
    /* V-IX. LAS CASAS. Cada una a contraluz, con un acercamiento que frena. */
    ...casas.map((k) => ({ clave: `casa:${k}`, dura: 5400, casa: k,
      mover: { phi: 1.12, curva: 'sale' as Curva } })),
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
  let mov: (Movimiento & { r0: number; f0: number; g0: number; m0: number }) | null = null

  const entrarActo = (a: Acto) => {
    opciones.alActo?.(a.clave)
    const st = useUiStore.getState()

    if (a.clave === 'tiniebla') {
      anochecer(1, 1500)
      acomodar(1, 3000)
      st.select(null)
      rig.deriva = false
      rig.tRadius = Math.min(rig.lejos, 62)
      rig.tPhi = 1.06
      rig.mira = 0
    } else if (a.clave === 'luz') {
      /* Y FUE LA LUZ: de golpe, con su trueno. La noche se va en menos de un
         segundo — el nacimiento de una estrella no se desvanece, ocurre. */
      anochecer(0, 850)
      sim.auraBrillo = 1.8
      audio.land()
      espacio.solHabla(1)
    } else if (a.clave === 'orden') {
      acomodar(0, 5400)
    } else if (a.clave.startsWith('casa:')) {
      const key = a.clave.slice(5)
      st.select(key)
      const h = wellRegistry.get(key)
      if (h) {
        espacio.toque(h.getPos(), 520)
        /* El acercamiento se calcula CON la casa ya en su sitio: quedarse a
           poco más que su radio la deja llenando el cuadro sin cortarla. */
        const d = h.getPos().length()
        a.mover = { ...a.mover, radio: Math.max(rig.cerca + 4.5, d + 5.4), mira: h.getPos().y * 0.7 }
      }
    } else if (a.clave === 'universo') {
      st.select(null)
      audio.whoosh(false)
    }

    /* El movimiento se congela AQUÍ: de dónde sale la cámara es lo que hay
       ahora mismo, y de ahí en adelante el coreógrafo interpola. */
    const g = a.casa ? anguloDe(a.casa, rig.tTheta) : null
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
      const p = Math.min(1, (ahora - t0) / guion[i].dura)
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
}
