import { useEffect, useRef } from 'react'
import { capa, rotulos, sol } from '../sky/rotulos'

/* ══ LA CAPA DE NOMBRES ══════════════════════════════════════════════════════
 *
 * Por qué existe: ver `sky/rotulos.ts`. Aquí se REPARTEN.
 *
 * Cada cuadro, de delante hacia atrás (el sol primero, después la casa
 * elegida, después las demás por cercanía), cada nombre prueba cuatro sitios
 * alrededor de su esfera, en este orden:
 *
 *     debajo  →  a la derecha  →  a la izquierda  →  arriba
 *
 * Debajo es donde un nombre se lee como de ESA casa; a los lados, pegado y a
 * media altura, también; arriba es el último recurso. El primer sitio libre
 * gana. «Libre» quiere decir:
 *
 *   · dentro del cuadro, sin cortarse en el borde;
 *   · sin pisar un nombre ya puesto;
 *   · sin pisar el disco de un mundo que esté MÁS CERCA (un nombre sobre un
 *     planeta ajeno se lee como el nombre de ese planeta), ni el sol;
 *   · sin quedar debajo de un botón, del saludo o de la ficha.
 *
 * Y el sitio que ya tenía se prueba PRIMERO: con las órbitas moviéndose, un
 * nombre que salta de abajo a la derecha y vuelve a cada rato se lee como un
 * parpadeo. Se queda donde estaba mientras siga libre.
 *
 * Si no hay ningún sitio libre —dos casas justo una detrás de la otra—, el de
 * atrás se calla hasta que el giro lo despeje. Es lo único que apaga un
 * nombre: antes se apagaban por distancia, y media galaxia se quedaba sin
 * decir qué era.
 */

type Caja = { x: number; y: number; w: number; h: number }
type Sitio = 'abajo' | 'der' | 'izq' | 'arriba' | 'abajoDer' | 'abajoIzq' | 'arribaDer' | 'arribaIzq'
/* Las diagonales van al final: arrimadas a la esfera por la esquina, siguen
   leyéndose como suyas y salvan los casos en que los cuatro lados están
   ocupados por vecinas. */
const ORDEN: Sitio[] = ['abajo', 'der', 'izq', 'arriba', 'abajoDer', 'abajoIzq', 'arribaDer', 'arribaIzq']

const HUECO = 5          // entre la esfera y su nombre
const AIRE = 4           // entre dos nombres
const ALTO = 22          // alto de la pastilla
const EVITAR = 'button, .ae-whisper, .ae-saludo, #aura-orbe, #ae-dice, [data-rotulos-evita]'

const choca = (a: Caja, b: Caja, pad = 0) =>
  Math.abs(a.x - b.x) < (a.w + b.w) / 2 + pad && Math.abs(a.y - b.y) < (a.h + b.h) / 2 + pad

/* ¿La caja entra en el disco? Se encoge el disco un poco: rozar el borde de
   un halo no es taparlo. */
const pisaDisco = (c: Caja, o: { x: number; y: number; r: number }) => {
  const rr = o.r * 0.86
  const dx = Math.max(Math.abs(c.x - o.x) - c.w / 2, 0)
  const dy = Math.max(Math.abs(c.y - o.y) - c.h / 2, 0)
  return dx * dx + dy * dy < rr * rr
}

function caja(sitio: Sitio, x: number, y: number, r: number, w: number, h: number): Caja {
  /* El disco que se ve es algo menor que el radio del mundo con su halo: el
     nombre se arrima al borde visible, no al del aura. */
  const rv = r * 0.9
  switch (sitio) {
    case 'abajo': return { x, y: y + rv + HUECO + h / 2, w, h }
    case 'arriba': return { x, y: y - rv - HUECO - h / 2, w, h }
    case 'der': return { x: x + rv + HUECO + w / 2, y, w, h }
    case 'izq': return { x: x - rv - HUECO - w / 2, y, w, h }
    /* En diagonal, la esquina de la pastilla toca el disco a 45°. */
    case 'abajoDer': return { x: x + rv * 0.7 + w / 2, y: y + rv * 0.7 + HUECO + h / 2, w, h }
    case 'abajoIzq': return { x: x - rv * 0.7 - w / 2, y: y + rv * 0.7 + HUECO + h / 2, w, h }
    case 'arribaDer': return { x: x + rv * 0.7 + w / 2, y: y - rv * 0.7 - HUECO - h / 2, w, h }
    case 'arribaIzq': return { x: x - rv * 0.7 - w / 2, y: y - rv * 0.7 - HUECO - h / 2, w, h }
  }
}

export function Rotulos() {
  const raiz = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const capaEl = raiz.current!
    const els = new Map<string, HTMLDivElement>()
    const anchos = new Map<string, number>()
    const sitios = new Map<string, Sitio>()
    const ops = new Map<string, number>()
    let evitar: Caja[] = []
    let cuadro = 0
    let raf = 0

    const pastilla = (clave: string, texto: string, clase = '') => {
      let el = els.get(clave)
      if (!el) {
        el = document.createElement('div')
        el.className = 'ae-rotulo' + (clase ? ' ' + clase : '')
        el.dataset.casa = clave
        capaEl.appendChild(el)
        els.set(clave, el)
      }
      if (el.textContent !== texto) { el.textContent = texto; anchos.delete(clave) }
      return el
    }

    const medirEvitar = () => {
      const base = capaEl.getBoundingClientRect()
      evitar = []
      for (const el of document.querySelectorAll<HTMLElement>(EVITAR)) {
        if (capaEl.contains(el)) continue
        const b = el.getBoundingClientRect()
        if (!b.width || !b.height) continue
        /* Oculto de verdad, mirando también a sus padres: el globo de
           bienvenida se esconde con una clase en el contenedor y su caja
           seguía midiendo 214×200 en medio del cielo, apagando los nombres
           de AuCorp y Ajustes mucho después de que se fuera. */
        if (el.closest('.oculto, [hidden], [aria-hidden="true"].yendo')) continue
        if (typeof (el as any).checkVisibility === 'function'
          && !(el as any).checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue
        const cs = getComputedStyle(el)
        if (cs.visibility === 'hidden' || +cs.opacity < 0.05) continue
        const x = b.left - base.left, y = b.top - base.top
        if (x > base.width || y > base.height || x + b.width < 0 || y + b.height < 0) continue
        evitar.push({ x: x + b.width / 2, y: y + b.height / 2, w: b.width + 8, h: b.height + 8 })
      }
      // para las pruebas: qué zonas se están esquivando
      ;(window as any).__AE_ROTULOS_EVITAR = evitar
    }

    let antes = performance.now()
    let suave = 0.2
    const paso = () => {
      raf = requestAnimationFrame(paso)
      const ahora = performance.now()
      suave = 1 - Math.exp(-Math.min(0.25, (ahora - antes) / 1000) / 0.09)
      antes = ahora
      const W = capaEl.clientWidth, H = capaEl.clientHeight
      const w = window as any
      const cajaPub: Record<string, Caja & { op: number }> = (w.__AE_ROTULO_CAJA = {})
      const opPub: Record<string, number> = (w.__AE_ROTULO_OP = {})
      capaEl.style.display = capa.xr ? 'none' : ''
      if (capa.xr || !W) return
      if (cuadro++ % 20 === 0) medirEvitar()

      const puestas: Caja[] = []
      const destino = new Map<string, { c: Caja | null; vis: number }>()
      const ancho = (clave: string, el: HTMLDivElement) => {
        let a = anchos.get(clave)
        if (a === undefined || cuadro % 60 === 0) { a = el.offsetWidth; anchos.set(clave, a) }
        return a
      }
      const dentro = (c: Caja) =>
        c.x - c.w / 2 >= 4 && c.x + c.w / 2 <= W - 4 && c.y - c.h / 2 >= 4 && c.y + c.h / 2 <= H - 4
      const libre = (c: Caja, delante: { x: number; y: number; r: number }[]) =>
        dentro(c)
        && !puestas.some((p) => choca(c, p, AIRE))
        && !evitar.some((e) => choca(c, e))
        && !delante.some((o) => pisaDisco(c, o))
      /* ¿DE QUIÉN ES ESTE NOMBRE? Un nombre que roza OTRA esfera —aunque
         esté detrás— se lee como de esa: «PULSE2CHAT» colgado entre su
         planeta y el de Ordenscan parecía el nombre de Ordenscan. En la
         primera vuelta se exige que no toque ningún otro disco; si así no
         cabe en ningún sitio, se acepta pisar uno de atrás. */
      /* Cuánto de la pastilla cae sobre discos ajenos, en píxeles cuadrados
         (aproximado con la caja del disco: basta para comparar sitios). */
      const tapado = (c: Caja, otros: { x: number; y: number; r: number }[]) => {
        let t = 0
        for (const o of otros) {
          const ix = Math.min(c.x + c.w / 2, o.x + o.r) - Math.max(c.x - c.w / 2, o.x - o.r)
          const iy = Math.min(c.y + c.h / 2, o.y + o.r) - Math.max(c.y - c.h / 2, o.y - o.r)
          if (ix > 0 && iy > 0) t += ix * iy
        }
        return t
      }
      const ajeno = (c: Caja, otros: { x: number; y: number; r: number }[]) =>
        otros.some((o) => pisaDisco(c, { x: o.x, y: o.y, r: o.r / 0.86 + 3 }))

      /* ── EL SOL, PRIMERO ── Su nombre va debajo del resplandor; si abajo no
         cabe, arriba. Nunca adentro. */
      {
        const el = pastilla('__sol', 'AU-RA', 'ae-rotulo-sol')
        const a = ancho('__sol', el)
        let c: Caja | null = null
        if (sol.frente && sol.vis > 0) {
          const planetas = [...rotulos.values()].filter((o) => o.frente && o.vis > 0.01)
          const delante = planetas.map((o) => ({ x: o.x, y: o.y, r: o.r }))
          const prev = sitios.get('__sol')
          for (const s of (prev ? [prev, 'abajo', 'arriba', 'abajoDer', 'abajoIzq'] : ['abajo', 'arriba', 'abajoDer', 'abajoIzq']) as Sitio[]) {
            const k = caja(s, sol.x, sol.y, sol.r, a, ALTO)
            if (libre(k, delante)) { c = k; sitios.set('__sol', s); break }
          }
        }
        if (c) puestas.push(c)
        destino.set('__sol', { c, vis: sol.vis })
      }

      /* ── LAS CASAS, DE DELANTE HACIA ATRÁS ── */
      const orden = [...rotulos.entries()]
        .filter(([, o]) => o.frente && o.vis > 0.01)
        .sort(([, a], [, b]) => (a.sel !== b.sel ? (a.sel ? -1 : 1) : a.d - b.d))
      const discoSol = sol.frente && sol.vis > 0 ? [{ x: sol.x, y: sol.y, r: sol.r }] : []
      for (const [clave, o] of orden) {
        const el = pastilla(clave, o.nombre.toUpperCase())
        const a = ancho(clave, el)
        /* Los mundos de DELANTE —y el sol— no se pisan. Los de atrás sí: el
           nombre es de un mundo de delante y se lee como tal. */
        const delante = discoSol.concat(orden
          .filter(([k, p]) => k !== clave && p.d < o.d)
          .map(([, p]) => ({ x: p.x, y: p.y, r: p.r })))
        const otros = orden.filter(([k]) => k !== clave).map(([, p]) => ({ x: p.x, y: p.y, r: p.r }))
        let c: Caja | null = null
        const prev = sitios.get(clave)
        const prueba = prev ? [prev, ...ORDEN] : ORDEN
        for (const s of prueba) {
          const k = caja(s, o.x, o.y, o.r, a, ALTO)
          if (libre(k, delante) && !ajeno(k, otros)) { c = k; sitios.set(clave, s); break }
        }
        /* Si ningún sitio queda limpio, el que MENOS esfera ajena tape: el
           primero que sirviera podía caer justo encima de otro planeta. */
        if (!c) {
          let mejor = Infinity
          for (const s of prueba) {
            const k = caja(s, o.x, o.y, o.r, a, ALTO)
            if (!libre(k, delante)) continue
            const coste = tapado(k, otros)
            if (coste < mejor - 0.5) { mejor = coste; c = k; sitios.set(clave, s) }
          }
        }
        if (c) puestas.push(c)
        destino.set(clave, { c, vis: o.vis })
      }

      /* ── Y SE PINTA ── La opacidad entra y sale suave, para que girar no
         los haga parpadear; la posición va pegada a su esfera. */
      for (const [clave, el] of els) {
        const d = destino.get(clave)
        const meta = d?.c ? Math.min(1, d.vis) : 0
        /* Por reloj y no por cuadro: en un teléfono lento, «un 22 % por
           cuadro» tardaba segundos en apagar los nombres cuando cae la
           tiniebla, y quedaban flotando sobre el negro. */
        const op = (ops.get(clave) ?? 0) + (meta - (ops.get(clave) ?? 0)) * suave
        ops.set(clave, op < 0.01 && meta === 0 ? 0 : op)
        if (d?.c) {
          el.style.transform = `translate(${Math.round(d.c.x - d.c.w / 2)}px, ${Math.round(d.c.y - d.c.h / 2)}px)`
          el.dataset.sitio = sitios.get(clave) || ''
        }
        el.style.opacity = String(op)
        el.style.visibility = op < 0.02 ? 'hidden' : ''
        opPub[clave] = op
        if (d?.c) cajaPub[clave] = { ...d.c, op }
      }
    }

    raf = requestAnimationFrame(paso)
    return () => { cancelAnimationFrame(raf); for (const el of els.values()) el.remove() }
  }, [])

  /* Los nombres NO se tocan: el toque es del planeta, y una pastilla que se
     comiera el dedo haría fallar justo el toque que se está arreglando. */
  return <div ref={raiz} className="ae-rotulos" aria-hidden="true" />
}
