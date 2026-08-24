import { rig } from './rig'
import { sim } from './sim'
import { wellRegistry } from '../sky/Wells'
import { useUiStore } from '../state/uiStore'
import { audio } from '../audio/engine'
import { espacio } from '../audio/espacio'

/* EL GÉNESIS.
 *
 * La historia del ecosistema, contada como se cuenta el principio: primero la
 * tiniebla —el sistema suelto, los mundos a la deriva, el sol sin ser—, luego
 * LA PALABRA, y con la palabra la luz: el sol nace, los mundos viajan a su
 * órbita, y uno a uno se presentan a quien mira. Al final, el panorama: la
 * galaxia entera, de una pieza.
 *
 * Este módulo es el COREÓGRAFO: mueve la cámara, la noche, el acomodo y la
 * elección — y va gritando en qué fase está. Las PALABRAS son de la casa: la
 * wallet pinta los rótulos y pone la voz (y en el visor, donde no hay HTML,
 * la voz sola cuenta la historia entera). Así el mismo motor sirve para la
 * pantalla y para la cabeza.
 *
 * Se sale cuando se quiera: saltar() apaga la historia y deja la galaxia
 * como si la historia ya hubiera pasado — porque pasó.
 */

export interface FaseGenesis {
  clave: string          // 'tiniebla' | 'palabra' | 'luz' | 'acomodo' | 'casa:<key>' | 'panorama' | 'fin'
  dura: number           // en milisegundos
}

interface Opciones {
  alFase?: (clave: string) => void
  alFin?: (salteado: boolean) => void
  /* Las casas a presentar, en orden. Si no llega, las principales que estén
     registradas, en el orden del anillo. */
  casas?: string[]
}

let vivoAhora = false
let raf = 0
let acomodoRaf = 0

function acomodar(hasta: number, dura: number) {
  cancelAnimationFrame(acomodoRaf)
  const desde = sim.acomodo
  const t0 = performance.now()
  const paso = () => {
    const p = Math.min(1, (performance.now() - t0) / dura)
    const e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2
    sim.acomodo = desde + (hasta - desde) * e
    if (p < 1) acomodoRaf = requestAnimationFrame(paso)
  }
  acomodoRaf = requestAnimationFrame(paso)
}

/* La noche también viaja suave. */
let nocheRaf = 0
function anochecer(hasta: number, dura: number) {
  cancelAnimationFrame(nocheRaf)
  const desde = sim.noche
  const t0 = performance.now()
  const paso = () => {
    const p = Math.min(1, (performance.now() - t0) / dura)
    const e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2
    sim.noche = desde + (hasta - desde) * e
    if (p < 1) nocheRaf = requestAnimationFrame(paso)
  }
  if (dura <= 0) { sim.noche = hasta; return }
  nocheRaf = requestAnimationFrame(paso)
}

/* Poner una casa DELANTE. La cámara siempre mira al centro, así que basta
   pararse del mismo lado que la casa: queda entre la cámara y el sol, con el
   resplandor detrás — el encuadre de presentación que uno haría a mano. */
function apuntarA(key: string) {
  const h = wellRegistry.get(key)
  if (!h) return
  const p = h.getPos()
  let objetivo = Math.atan2(p.x, p.z)
  /* El camino corto: sin esto la cámara podía dar la vuelta larga entera
     entre una casa y la siguiente. */
  while (objetivo - rig.tTheta > Math.PI) objetivo -= Math.PI * 2
  while (objetivo - rig.tTheta < -Math.PI) objetivo += Math.PI * 2
  rig.tTheta = objetivo
  rig.tRadius = Math.max(rig.cerca + 4, p.length() + 5.6)
  rig.tPhi = 1.12
  rig.mira = p.y * 0.75
}

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

let saltarAhora: (() => void) | null = null

function empezar(opciones: Opciones = {}) {
  if (vivoAhora) return
  vivoAhora = true
  audio.ensure()

  const casas = opciones.casas?.filter((k) => wellRegistry.has(k))
    ?? [...wellRegistry.entries()].filter(([, h]) => (h.def as any).banda === 0)
      .map(([k]) => k)

  /* El guion. Los tiempos son los de una lectura en voz alta sin apuro:
     la fase de cada casa dura lo que tarda una frase de presentación. */
  const fases: FaseGenesis[] = [
    { clave: 'tiniebla', dura: 3200 },
    { clave: 'palabra', dura: 4300 },
    { clave: 'luz', dura: 2600 },
    { clave: 'acomodo', dura: 4600 },
    ...casas.map((k) => ({ clave: `casa:${k}`, dura: 5600 })),
    { clave: 'panorama', dura: 6200 },
  ]

  let i = -1
  let desde = performance.now()

  const entrarFase = (f: FaseGenesis) => {
    opciones.alFase?.(f.clave)
    const st = useUiStore.getState()
    if (f.clave === 'tiniebla') {
      /* Todo se suelta y se apaga: el estado de ANTES del principio. */
      anochecer(1, 1400)
      acomodar(1, 2600)
      st.select(null)
      rig.deriva = true
      rig.tRadius = Math.min(rig.lejos, Math.max(rig.reposo * 2.1, 34))
      rig.tPhi = 0.98
      rig.mira = 0
    } else if (f.clave === 'palabra') {
      // quieto: la tiniebla sostiene la palabra
    } else if (f.clave === 'luz') {
      /* Y FUE LA LUZ: el sol nace de golpe, con su estallido, y el trueno
         suave del audio lo acompaña desde el centro. */
      anochecer(0, 900)
      sim.auraBrillo = 1.6
      audio.land()
      espacio.solHabla(1)
    } else if (f.clave === 'acomodo') {
      acomodar(0, 4400)
      rig.volar(4400)
      rig.deriva = true
    } else if (f.clave.startsWith('casa:')) {
      const key = f.clave.slice(5)
      rig.deriva = false
      apuntarA(key)
      st.select(key)
      const h = wellRegistry.get(key)
      if (h) espacio.toque(h.getPos(), 520)
    } else if (f.clave === 'panorama') {
      st.select(null)
      rig.deriva = true
      rig.mira = 0
      rig.tPhi = rig.reposoPhi
      rig.tRadius = Math.min(rig.lejos * 0.85, rig.reposo * 2.6)
    }
  }

  const paso = () => {
    if (!vivoAhora) return
    const ahora = performance.now()
    if (i < 0 || ahora - desde >= fases[i].dura) {
      i++
      desde = ahora
      if (i >= fases.length) { terminar(false, opciones); opciones.alFase?.('fin'); return }
      entrarFase(fases[i])
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

/* El puente con la casa: la wallet cuenta la historia por aquí. */
if (typeof window !== 'undefined') {
  ;(window as any).__AE_GENESIS = genesis
}
