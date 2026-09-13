// ─────────────────────────────────────────────────────────────────────────────
// El historial de movimientos de una persona.
//
// Sale del explorador de la cadena (ordenscan), que ya tiene todo indexado por
// dirección: transferencias nativas de ORIGEN y de las catorce monedas, con su
// símbolo, su monto y su fecha. Reconstruirlo aquí —recorriendo cuatro millones
// de bloques por cada persona que se abre en el panel— sería tirar a la basura
// un índice que ya existe y funciona.
//
// Una advertencia sobre lo que se ve y lo que no: aquí solo aparece lo que pasó
// EN LA CADENA. Veta Wallet es una billetera custodia y lleva además su propia
// contabilidad interna; un movimiento que solo existe en esa base no deja rastro
// en la 5550 y por tanto no sale en esta lista. Cuando las dos versiones no
// coinciden, esa diferencia es justo lo que hay que mirar.
// ─────────────────────────────────────────────────────────────────────────────

// Igual que el RPC: se aceptan el nombre neutro y los dos con número, para que
// renombrar la variable en Render no dependa de un despliegue simultáneo.
const EXPLORADOR = (process.env.EXPLORADOR_ORDEN_URL
  || process.env.EXPLORADOR_5550_URL || process.env.EXPLORADOR_8532_URL
  || 'https://orden-global-scan-c4abe71e8024.herokuapp.com').replace(/\/$/, '')

export interface Movimiento {
  hash: string
  bloque: number
  en: string
  /** `entrada` si el dinero llegó a esta dirección, `salida` si se fue. */
  sentido: 'entrada' | 'salida' | 'propia'
  moneda: string
  monto: number
  de: string
  a: string
  contrato: string | null
}

export interface HistorialDireccion {
  direccion: string
  movimientos: Movimiento[]
  /** Saldo nativo según el explorador. Sirve para contrastar con el del RPC. */
  saldoNativo: number | null
  saldosToken: Record<string, number>
  /** `false` si el explorador no respondió: la lista está incompleta, no vacía. */
  leido: boolean
}

const num = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

export async function historialDe(direccion: string): Promise<HistorialDireccion> {
  const dir = direccion.toLowerCase()
  const vacio: HistorialDireccion = {
    direccion: dir, movimientos: [], saldoNativo: null, saldosToken: {}, leido: false,
  }
  try {
    const ctrl = new AbortController()
    const alarma = setTimeout(() => ctrl.abort(), 20000)
    const r = await fetch(`${EXPLORADOR}/address/${dir}`, { signal: ctrl.signal })
    clearTimeout(alarma)
    if (!r.ok) return vacio
    const d: any = await r.json()

    const movimientos: Movimiento[] = (Array.isArray(d?.transactions) ? d.transactions : [])
      .map((t: any): Movimiento => {
        const de = String(t?.from || '').toLowerCase()
        const a = String(t?.to || '').toLowerCase()
        return {
          hash: String(t?.hash || ''),
          bloque: num(t?.blockNumber),
          // El explorador da la fecha en segundos; el panel la quiere en ISO.
          en: new Date(num(t?.timestamp) * 1000).toISOString(),
          sentido: de === dir && a === dir ? 'propia' : de === dir ? 'salida' : 'entrada',
          moneda: String(t?.symbol || 'ORIGEN').toUpperCase(),
          monto: num(t?.value),
          de, a,
          contrato: t?.addressContract ? String(t.addressContract).toLowerCase() : null,
        }
      })
      .filter((m: Movimiento) => m.hash)
      .sort((a: Movimiento, b: Movimiento) => b.bloque - a.bloque)

    const saldosToken: Record<string, number> = {}
    for (const [sim, info] of Object.entries<any>(d?.tokensBalance ?? {})) {
      const n = num(info?.balance)
      if (n > 0) saldosToken[sim.toUpperCase()] = n
    }

    return {
      direccion: dir,
      movimientos,
      saldoNativo: d?.balance !== undefined ? num(d.balance) : null,
      saldosToken,
      leido: true,
    }
  } catch {
    return vacio
  }
}

export interface ResumenMovimientos {
  total: number
  /** Por moneda: cuánto entró, cuánto salió, y cuántos movimientos hubo. */
  porMoneda: { moneda: string; entradas: number; salidas: number; neto: number; veces: number }[]
  primero: string | null
  ultimo: string | null
  incompleto: boolean
}

export function resumirMovimientos(
  historiales: HistorialDireccion[],
): { movimientos: Movimiento[]; resumen: ResumenMovimientos } {
  const movimientos = historiales.flatMap((h) => h.movimientos)
    .sort((a, b) => b.bloque - a.bloque)

  const acum = new Map<string, { entradas: number; salidas: number; veces: number }>()
  for (const m of movimientos) {
    const x = acum.get(m.moneda) ?? { entradas: 0, salidas: 0, veces: 0 }
    if (m.sentido === 'entrada') x.entradas += m.monto
    else if (m.sentido === 'salida') x.salidas += m.monto
    x.veces++
    acum.set(m.moneda, x)
  }

  const r6 = (n: number) => Math.round(n * 1e6) / 1e6
  return {
    movimientos,
    resumen: {
      total: movimientos.length,
      porMoneda: [...acum.entries()]
        .map(([moneda, x]) => ({
          moneda,
          entradas: r6(x.entradas),
          salidas: r6(x.salidas),
          neto: r6(x.entradas - x.salidas),
          veces: x.veces,
        }))
        .sort((a, b) => b.veces - a.veces),
      primero: movimientos.length ? movimientos[movimientos.length - 1].en : null,
      ultimo: movimientos.length ? movimientos[0].en : null,
      // Si alguna dirección no se pudo leer, la lista está coja y hay que
      // decirlo: un historial incompleto que se presenta como completo lleva a
      // concluir que alguien no movió nada cuando sí lo hizo.
      incompleto: historiales.some((h) => !h.leido),
    },
  }
}
