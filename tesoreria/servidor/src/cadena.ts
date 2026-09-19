// Lectura de la cadena 5550 (Orden Global Chain).
//
// La Tesorería decide cuántos tokens PUEDEN existir; la cadena dice cuántos
// EXISTEN. Conciliar las dos cosas es lo que convierte al libro en algo más que
// una intención: si un contrato tiene más supply del autorizado, hay tokens sin
// expediente y eso tiene que verse en rojo.
//
// Solo se lee. El servidor no firma transacciones ni tiene llaves de la cadena.

const RPC = () =>
  process.env.RPC_ORDEN_URL || process.env.RPC_5550_URL || 'https://rpc.ordenglobal-rpc.com/'

async function rpc(cuerpo: unknown, ms = 8000): Promise<any> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), ms)
  try {
    const r = await fetch(RPC(), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo), signal: ctrl.signal })
    if (!r.ok) throw new Error(`RPC respondió ${r.status}`)
    return await r.json()
  } finally {
    clearTimeout(t)
  }
}

export async function alturaDeBloque(): Promise<number | null> {
  try {
    const j = await rpc({ jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] })
    return j?.result ? Number(BigInt(j.result)) : null
  } catch {
    return null
  }
}

/**
 * totalSupply() de varios contratos en un solo lote JSON-RPC.
 * Devuelve `null` para lo que no se pudo leer: «no lo sé» no es «cero».
 */
export async function emisionesEnCadena(contratos: { id: string; contrato: string; decimales?: number }[]): Promise<Record<string, number | null>> {
  const salida: Record<string, number | null> = {}
  for (const c of contratos) salida[c.id] = null
  if (!contratos.length) return salida
  const cuerpo = contratos.map((c, i) => ({
    jsonrpc: '2.0', id: i, method: 'eth_call', params: [{ to: c.contrato, data: '0x18160ddd' }, 'latest'],
  }))
  let res: any[]
  try { res = await rpc(cuerpo) } catch { return salida }
  if (!Array.isArray(res)) return salida
  for (const x of res) {
    const c = contratos[x?.id]
    if (!c || !x?.result || x.result === '0x') continue
    try { salida[c.id] = Number(BigInt(x.result)) / Math.pow(10, c.decimales ?? 18) } catch { /* null */ }
  }
  return salida
}

/**
 * Compara lo que dice la cadena con lo que autorizó la Tesorería.
 *
 * `emitido` es lo que la tesorería registra como emitido; `autorizado` el techo
 * que la Autoridad concedió. Si la cadena supera lo autorizado, hay supply sin
 * respaldo y el veredicto es `excede`. Si está por debajo de lo emitido aquí,
 * el registro va adelantado a la cadena (`por_emitir`), que es normal mientras
 * la emisión on-chain no se ejecute.
 */
export async function conciliar(estado: any) {
  const tokens = [...estado.securities, ...estado.utilities]
  const conContrato = tokens.filter((t) => typeof t.contrato === 'string' && /^0x[0-9a-fA-F]{40}$/.test(t.contrato))
  const [bloque, supplies] = await Promise.all([
    alturaDeBloque(),
    emisionesEnCadena(conContrato.map((t) => ({ id: t.id, contrato: t.contrato, decimales: t.decimales ?? 18 }))),
  ])
  const filas = tokens.map((t) => {
    const enCadena = t.contrato ? supplies[t.id] ?? null : null
    const emitido = t.supply.emitido - (t.supply.quemado || 0)
    const autorizado = t.supply.autorizado
    let veredicto: 'cuadra' | 'excede' | 'por_emitir' | 'sin_dato' | 'sin_contrato' = 'sin_contrato'
    let diferencia = 0
    if (t.contrato) {
      if (enCadena === null) veredicto = 'sin_dato'
      else if (enCadena > autorizado + 1e-6) { veredicto = 'excede'; diferencia = enCadena - autorizado }
      else if (Math.abs(enCadena - emitido) <= 1e-6) veredicto = 'cuadra'
      else if (enCadena < emitido) veredicto = 'por_emitir'
      else veredicto = 'cuadra'
    }
    return { id: t.id, simbolo: t.simbolo, nombre: t.nombre, contrato: t.contrato || null, enCadena, emitido, autorizado, veredicto, diferencia }
  })
  return { rpc: RPC(), bloque, en: new Date().toISOString(), tokens: filas, alertas: filas.filter((f) => f.veredicto === 'excede').length }
}
