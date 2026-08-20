// ─────────────────────────────────────────────────────────────────────────────
// La cadena 8532, consultada directo por RPC.
//
// «Pagado» en este sistema tiene dos niveles. El primero es el comprobante que
// manda la app (el hash): rápido, suficiente para cerrar la mesa. El segundo es
// ESTE: preguntar a la cadena si esa transferencia existe, salió bien, va a la
// dirección del comercio y trae el monto. Es la diferencia entre «me dijeron
// que pagaron» y «el dinero está en la billetera del negocio».
//
// ORIGEN es la moneda nativa de la 8532, así que la transferencia es un envío
// de valor plano: destino en `tx.to`, monto en `tx.value` (18 decimales),
// éxito en `receipt.status === 0x1`.
// ─────────────────────────────────────────────────────────────────────────────

const RPC = (process.env.RPC_8532_URL || 'https://rpc.ordenglobal-rpc.com/').replace(/\/$/, '') + '/'

export type VeredictoCadena =
  | 'confirmada'      // existe, exitosa, destino y monto cuadran
  | 'monto-menor'     // existe pero trae menos de lo que el cobro esperaba
  | 'destino-ajeno'   // existe pero va a otra dirección
  | 'fallida'         // existe pero la ejecución falló
  | 'no-encontrada'   // la cadena no la conoce (aún, o nunca)
  | 'sin-respuesta'   // la RPC no contestó: no se sabe, no se inventa

async function rpc(method: string, params: unknown[]): Promise<any> {
  const control = new AbortController()
  const timer = setTimeout(() => control.abort(), 12_000)
  try {
    const r = await fetch(RPC, {
      method: 'POST',
      signal: control.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    })
    const d: any = await r.json()
    return d?.result ?? null
  } finally {
    clearTimeout(timer)
  }
}

const aOrigen = (hexWei: string): number => Number(BigInt(hexWei)) / 1e18

/**
 * ¿Esta transferencia deposita al menos `montoOrigen` en `destino`?
 *
 * `montoOrigen` llega con una tolerancia de redondeo de 1e-6: los repartos de
 * partes redondean a seis decimales y no puede ser que un centavo de gramín
 * perdido en el redondeo marque un pago legítimo como corto.
 */
export async function verificarTransferencia(
  txHash: string,
  destino: string,
  montoOrigen: number,
): Promise<{ veredicto: VeredictoCadena; detalle?: string }> {
  try {
    const tx = await rpc('eth_getTransactionByHash', [txHash])
    if (!tx) return { veredicto: 'no-encontrada' }

    if (String(tx.to || '').toLowerCase() !== destino.toLowerCase()) {
      return { veredicto: 'destino-ajeno', detalle: `va a ${String(tx.to || '').slice(0, 10)}…` }
    }

    const recibo = await rpc('eth_getTransactionReceipt', [txHash])
    if (!recibo) return { veredicto: 'no-encontrada', detalle: 'sin recibo todavía' }
    if (recibo.status !== '0x1') return { veredicto: 'fallida' }

    const valor = aOrigen(tx.value || '0x0')
    if (valor + 1e-6 < montoOrigen) {
      return { veredicto: 'monto-menor', detalle: `trae ${valor}, se esperaban ${montoOrigen}` }
    }

    return { veredicto: 'confirmada' }
  } catch {
    return { veredicto: 'sin-respuesta' }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Reconciliación por dirección.
//
// POR QUÉ HACE FALTA
//
// El circuito normal depende de que quien paga vuelva a la app con el hash. Y
// eso falla en la vida real: la pantalla se cae, el teléfono se queda sin
// batería, la persona cierra la app y se va a comer. Pasó de verdad: el dinero
// entró a la billetera del comercio y MyTokenPay nunca se enteró.
//
// Un cobro no puede depender de que el cliente termine un viaje de vuelta. Así
// que el comercio también puede preguntar al revés: «¿qué entró a MI dirección
// que cuadre con lo que me deben?». La cadena es la fuente de verdad y está
// ahí para cualquiera que quiera mirarla.
// ─────────────────────────────────────────────────────────────────────────────

const EXPLORADOR = (process.env.EXPLORADOR_8532_URL || 'https://orden-global-scan-c4abe71e8024.herokuapp.com').replace(/\/$/, '')

export interface EntradaCadena {
  hash: string
  origenRecibido: number
  de: string
  cuando: string | null
}

/** Transferencias que ENTRARON a una dirección, más recientes primero. */
export async function entradasA(direccion: string): Promise<EntradaCadena[]> {
  const control = new AbortController()
  const timer = setTimeout(() => control.abort(), 15_000)
  try {
    const r = await fetch(`${EXPLORADOR}/address/${encodeURIComponent(direccion)}`, { signal: control.signal })
    if (!r.ok) return []
    const d: any = await r.json()
    const txs: any[] = Array.isArray(d?.transactions) ? d.transactions : []
    return txs
      .filter((t) => String(t?.to || '').toLowerCase() === direccion.toLowerCase())
      .map((t) => ({
        hash: String(t.hash || ''),
        origenRecibido: Number(t.value || 0) / 1e18,
        de: String(t.from || ''),
        cuando: t.timestamp ? String(t.timestamp) : null,
      }))
      .filter((t) => t.hash && t.origenRecibido > 0)
  } catch {
    return []
  } finally {
    clearTimeout(timer)
  }
}
