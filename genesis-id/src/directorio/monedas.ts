// ─────────────────────────────────────────────────────────────────────────────
// Las monedas del ecosistema, y cómo se leen sus saldos.
//
// Cada contrato de esta lista se comprobó contra la cadena 8532 antes de
// escribirlo: existe, responde `decimals()` y su `symbol()` en cadena coincide
// con el símbolo de aquí. Una dirección copiada mal no da error — devuelve cero
// para todo el mundo, y un panel que enseña ceros se ve igual de bien que uno
// correcto.
//
// Se puede cambiar sin tocar código con GENESIS_MONEDAS:
//   "SIMBOLO|nombre|0xcontrato|decimales,SIMBOLO|nombre||18"
// (contrato vacío = moneda nativa de la cadena).
// ─────────────────────────────────────────────────────────────────────────────

export interface Moneda {
  simbolo: string
  nombre: string
  /** `null` para la moneda nativa de la cadena. */
  contrato: string | null
  decimales: number
}

const DEL_ECOSISTEMA: Moneda[] = [
  { simbolo: 'ORIGEN',    nombre: 'Origen',                   contrato: null, decimales: 18 },
  { simbolo: 'ONDK',      nombre: 'Orden Kapital',            contrato: '0xfb83eEA4B384a4b18E5A1EBa7a4bb4C0b7CA19c1', decimales: 18 },
  { simbolo: 'AUKA',      nombre: 'Gold Kapital',             contrato: '0x6Facc8Df79cEDc6C5065442ce27e915Aa3a26B9B', decimales: 18 },
  { simbolo: 'AGKA',      nombre: 'AGKA Token',               contrato: '0x961f798f998c7Ff44D47d62C7FA1B572eF187a4B', decimales: 18 },
  { simbolo: 'MNKA',      nombre: 'Monarka',                  contrato: '0x18b6680CFF71c11067bec312Fc48786bE2e54Ead', decimales: 18 },
  { simbolo: 'AUBEX',     nombre: 'Aubex',                    contrato: '0xF1498640B27A66C0DC505093D70911C060e04fb0', decimales: 18 },
  { simbolo: 'IBS',       nombre: 'IBS Energy',               contrato: '0x7AF11D3E94A174f6fc290A5B7791A6DEE2718E62', decimales: 18 },
  { simbolo: 'HARV',      nombre: 'Harvi',                    contrato: '0x0fa04D11F28B28cbC9b98dd016F02023AdDb1923', decimales: 18 },
  { simbolo: 'AGRO',      nombre: 'Agrotech',                 contrato: '0x2A31ba919A5339fCB0F8aEeFfCE2c807B16007fe', decimales: 18 },
  { simbolo: 'AIT',       nombre: 'Artificial Intelligence',  contrato: '0xAE14Db486872AC07d74Ad69cC09590239b21BA2e', decimales: 18 },
  { simbolo: 'ASL',       nombre: 'Athletic',                 contrato: '0x69846aC960D45F9946C613DFCe1b761D37Faf098', decimales: 18 },
  { simbolo: 'REST',      nombre: 'Real State',               contrato: '0x1aC12Ebd7739003059d1E9EA2a4863C92D1505DD', decimales: 18 },
  { simbolo: 'SOL',       nombre: 'Solar',                    contrato: '0xAAc6aE2E2037fC2e94d0b060792E7eB4E5fBfa66', decimales: 18 },
  { simbolo: 'LOVE',      nombre: 'Amor Global',              contrato: '0x638F2ba0e3E1083D1ba570b449BD266F3860D164', decimales: 18 },
  { simbolo: 'POLITICAL', nombre: 'Political',                contrato: '0x92496E1848e001428A3495409a9A9f616bB6dD3B', decimales: 18 },
]

export function monedas(): Moneda[] {
  const crudo = (process.env.GENESIS_MONEDAS || '').trim()
  if (!crudo) return DEL_ECOSISTEMA
  return crudo.split(',').map((linea) => {
    const [simbolo, nombre, contrato, decimales] = linea.split('|').map((s) => s.trim())
    return {
      simbolo: (simbolo || '').toUpperCase(),
      nombre: nombre || simbolo,
      contrato: contrato && /^0x[0-9a-fA-F]{40}$/.test(contrato) ? contrato : null,
      decimales: Number(decimales) || 18,
    }
  }).filter((m) => m.simbolo)
}

const RPC = () => process.env.RPC_8532_URL || 'https://rpc.ordenglobal-rpc.com/'

/** `balanceOf(address)` con la dirección rellenada a 32 bytes. */
const datosBalanceOf = (direccion: string) =>
  '0x70a08231' + '0'.repeat(24) + direccion.replace(/^0x/, '').toLowerCase()

/**
 * Lee TODAS las monedas de VARIAS direcciones de una sola vez.
 *
 * Se usa el modo por lotes de JSON-RPC: un array de llamadas en una sola
 * petición HTTP. Sin eso, 489 personas por 15 monedas serían 7.335 peticiones
 * sueltas y el nodo se caería antes de terminar. Así son unas cincuenta.
 *
 * Si el nodo no responde o una llamada falla, esa moneda queda sin dato y se
 * conserva lo que hubiera antes. Nunca se escribe un cero inventado: «no lo sé»
 * y «tiene cero» son cosas distintas, y confundirlas en un panel de control es
 * cómo se toman decisiones equivocadas con cara de estar informado.
 */
export async function saldosDe(
  direcciones: string[],
): Promise<Map<string, Record<string, number>>> {
  const lista = monedas()
  const salida = new Map<string, Record<string, number>>()
  if (!direcciones.length) return salida

  const llamadas: { id: number; direccion: string; moneda: Moneda }[] = []
  const cuerpo: any[] = []
  let id = 0
  for (const d of direcciones) {
    for (const m of lista) {
      llamadas.push({ id, direccion: d, moneda: m })
      cuerpo.push(m.contrato
        ? { jsonrpc: '2.0', id, method: 'eth_call', params: [{ to: m.contrato, data: datosBalanceOf(d) }, 'latest'] }
        : { jsonrpc: '2.0', id, method: 'eth_getBalance', params: [d, 'latest'] })
      id++
    }
  }

  const TROZO = 300
  for (let i = 0; i < cuerpo.length; i += TROZO) {
    const trozo = cuerpo.slice(i, i + TROZO)
    try {
      const ctrl = new AbortController()
      const alarma = setTimeout(() => ctrl.abort(), 25000)
      const r = await fetch(RPC(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(trozo),
        signal: ctrl.signal,
      })
      clearTimeout(alarma)
      const respuestas: any[] = await r.json()
      if (!Array.isArray(respuestas)) continue

      for (const res of respuestas) {
        const meta = llamadas[res?.id]
        if (!meta || !res?.result || res.result === '0x') continue
        let valor: number
        try {
          valor = Number(BigInt(res.result)) / Math.pow(10, meta.moneda.decimales)
        } catch { continue }
        if (!Number.isFinite(valor)) continue
        const actual = salida.get(meta.direccion) ?? {}
        // Solo se anotan los saldos que existen. Guardar quince ceros por
        // persona haría la tabla ilegible y el documento tres veces más grande.
        if (valor > 0) actual[meta.moneda.simbolo] = Math.round(valor * 1e6) / 1e6
        salida.set(meta.direccion, actual)
      }
    } catch {
      // Trozo perdido: se sigue con el siguiente. Lo que ya estaba se conserva.
    }
  }
  return salida
}
