// Lectura de la red 5550. Solo lectura: esta plataforma no firma ni envía nada.
//
// El nodo acepta lotes de hasta 20 llamadas (con 25 responde «Batch request
// length too long») y eth_getLogs de hasta 1.000 bloques. Las dos cosas se
// respetan aquí y en ningún otro sitio.
//
// Regla de toda la plataforma: «no lo sé» y «es cero» son cosas distintas. Si
// una llamada falla, se lanza un error; nunca se devuelve un cero inventado.

export const LOTE = 20
export const TRAMO_LOGS = 1000
export const TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'

export type Transporte = (cuerpo: unknown) => Promise<any>

export function transporteHttp(url: string): Transporte {
  return async (cuerpo) => {
    let ultimo: unknown
    for (let intento = 0; intento < 5; intento++) {
      try {
        const r = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(cuerpo),
          signal: AbortSignal.timeout(30_000),
        })
        if (r.status >= 500) throw new Error(`HTTP ${r.status}`)
        return await r.json()
      } catch (e) {
        ultimo = e
        await new Promise((ok) => setTimeout(ok, 800 * (intento + 1)))
      }
    }
    throw new Error(`el nodo no respondió: ${String((ultimo as any)?.message || ultimo)}`)
  }
}

export class Cadena {
  constructor(private enviar: Transporte) {}

  async llamar(metodo: string, params: unknown[]): Promise<any> {
    const j = await this.enviar({ jsonrpc: '2.0', id: 1, method: metodo, params })
    if (j?.error) throw new Error(`${metodo}: ${j.error.message || JSON.stringify(j.error)}`)
    return j?.result
  }

  /** Varias llamadas, de a LOTE por petición. Falla entero si falta una respuesta. */
  async lote(llamadas: [string, unknown[]][]): Promise<any[]> {
    const salida: any[] = []
    for (let i = 0; i < llamadas.length; i += LOTE) {
      const trozo = llamadas.slice(i, i + LOTE)
      const j = await this.enviar(trozo.map(([method, params], id) => ({ jsonrpc: '2.0', id, method, params })))
      if (!Array.isArray(j)) throw new Error(`lote rechazado por el nodo: ${JSON.stringify(j)?.slice(0, 160)}`)
      const porId = new Map(j.map((x: any) => [x.id, x]))
      trozo.forEach((_, id) => {
        const x: any = porId.get(id)
        if (!x || x.error || x.result == null) {
          throw new Error(`llamada sin respuesta (${trozo[id][0]}): ${JSON.stringify(x?.error || 'vacía')}`)
        }
        salida.push(x.result)
      })
    }
    return salida
  }

  async ultimoBloque(): Promise<number> {
    return Number(BigInt(await this.llamar('eth_blockNumber', [])))
  }

  async supply(contrato: string, bloque: number): Promise<bigint> {
    return BigInt(await this.llamar('eth_call', [{ to: contrato, data: '0x18160ddd' }, hex(bloque)]))
  }

  /** Saldos de varias direcciones en un bloque: del contrato, o nativos si contrato es null. */
  async saldos(contrato: string | null, direcciones: string[], bloque: number): Promise<bigint[]> {
    const b = hex(bloque)
    const res = await this.lote(direcciones.map((d): [string, unknown[]] => contrato
      ? ['eth_call', [{ to: contrato, data: '0x70a08231' + d.slice(2).padStart(64, '0') }, b]]
      : ['eth_getBalance', [d, b]]))
    return res.map((r) => BigInt(r === '0x' ? 0 : r))
  }

  /** Remitentes y destinatarios de todo evento Transfer hasta un bloque. */
  async direccionesDeTransfer(hasta: number, desde = 0): Promise<Set<string>> {
    const vistas = new Set<string>()
    for (let b = desde; b <= hasta; b += TRAMO_LOGS) {
      const logs = await this.llamar('eth_getLogs', [{
        fromBlock: hex(b), toBlock: hex(Math.min(b + TRAMO_LOGS - 1, hasta)), topics: [TRANSFER],
      }])
      for (const l of logs || []) {
        if (l.topics?.length >= 3) {
          vistas.add(('0x' + l.topics[1].slice(-40)).toLowerCase())
          vistas.add(('0x' + l.topics[2].slice(-40)).toLowerCase())
        }
      }
    }
    return vistas
  }

  /** Remitentes y destinatarios de toda transacción nativa hasta un bloque. */
  async direccionesNativas(hasta: number, desde = 0): Promise<Set<string>> {
    const vistas = new Set<string>()
    for (let b = desde; b <= hasta; b += 200) {
      const bloques = await this.lote(Array.from({ length: Math.min(200, hasta - b + 1) },
        (_, i): [string, unknown[]] => ['eth_getBlockByNumber', [hex(b + i), true]]))
      for (const bl of bloques) {
        for (const tx of bl?.transactions || []) {
          vistas.add(String(tx.from).toLowerCase())
          if (tx.to) vistas.add(String(tx.to).toLowerCase())
        }
      }
    }
    return vistas
  }

  async recibo(hash: string): Promise<any | null> {
    return this.llamar('eth_getTransactionReceipt', [hash])
  }

  async transaccion(hash: string): Promise<any | null> {
    return this.llamar('eth_getTransactionByHash', [hash])
  }
}

export const hex = (n: number) => '0x' + n.toString(16)
export const CERO = '0x' + '0'.repeat(40)
export const esDireccion = (d: unknown): d is string => typeof d === 'string' && /^0x[0-9a-fA-F]{40}$/.test(d)
