// La cola de reportes al monitoreo AML de Genesis ID.
//
// Cada compraventa completada se reporta como un movimiento por cada parte.
// El reporte no se manda «y a ver»: se guarda en el almacén y se despacha en
// orden, reintentando con espera creciente si Genesis ID no está o limita las
// peticiones (429). Un reporte que no llega tiene que llegar después, no
// perderse: es lo único que permite a cumplimiento contrastar los movimientos
// reales con lo que la persona declaró.
//
// A la persona nunca se le dice nada de esto, ni si saltó una alerta.

import { store } from '../store.js'
import { id as nuevoId } from '../lib/uid.js'
import { llamar, genesisConfigurado } from './genesis.js'
import type { ReporteAml } from '../types.js'

const MAX_INTENTOS = 12
/** Espera antes del siguiente intento: 5 s, 10 s, 20 s… hasta 10 minutos. */
const espera = (intentos: number) => Math.min(600000, 5000 * 2 ** Math.max(0, intentos - 1))

let despachando = false
let programado: NodeJS.Timeout | null = null

export function encolar(gid: string, movimiento: Record<string, unknown>): ReporteAml | null {
  if (!genesisConfigurado() || !gid) return null
  const r: ReporteAml = {
    id: nuevoId('aml'), gid, movimiento, intentos: 0, creadoEn: new Date().toISOString(), ultimoIntento: null, ultimoError: null,
  }
  store.todo().reportesAml.push(r)
  store.guardar()
  pronto()
  return r
}

export const pendientes = (): ReporteAml[] => store.todo().reportesAml

/** Despacha en cuanto se pueda, sin apilar despachos. */
export function pronto(): void {
  if (programado) return
  programado = setTimeout(() => { programado = null; despachar().catch(() => undefined) }, 50)
  programado.unref?.()
}

/** Manda lo que toque mandar ahora. Un reporte a la vez: Genesis ID limita por ruta. */
export async function despachar(): Promise<{ enviados: number; pendientes: number }> {
  if (despachando || !genesisConfigurado()) return { enviados: 0, pendientes: pendientes().length }
  despachando = true
  let enviados = 0
  try {
    const ahora = Date.now()
    const cola = pendientes().filter((r) => !r.ultimoIntento || ahora - Date.parse(r.ultimoIntento) >= espera(r.intentos))
    for (const r of cola) {
      const res = await llamar('/api/v1/movimientos', { method: 'POST', body: { gid: r.gid, movimientos: [r.movimiento] } })
      r.intentos += 1
      r.ultimoIntento = new Date().toISOString()
      if (res.ok) {
        quitar(r)
        enviados += 1
        continue
      }
      r.ultimoError = `${res.estado} ${JSON.stringify(res.cuerpo?.error ?? res.cuerpo ?? '').slice(0, 200)}`
      // Que no se avise a la persona no significa que se pierda en silencio.
      console.warn(`[ordenexchange] monitoreo AML: Genesis ID respondió ${r.ultimoError} (intento ${r.intentos})`)
      const definitivo = (res.estado === 400 || res.estado === 404) || r.intentos >= MAX_INTENTOS
      if (definitivo) {
        console.error(`[ordenexchange] monitoreo AML: reporte ${r.id} (${r.gid}) descartado tras ${r.intentos} intento(s): ${r.ultimoError}`)
        quitar(r)
      }
      // Con 429 o Genesis caído no tiene sentido seguir con la cola ahora mismo.
      if (res.estado === 429 || res.estado >= 500) break
    }
    store.guardar()
  } finally {
    despachando = false
  }
  return { enviados, pendientes: pendientes().length }
}

function quitar(r: ReporteAml): void {
  const lista = store.todo().reportesAml
  const i = lista.indexOf(r)
  if (i >= 0) lista.splice(i, 1)
}
