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

/* CONTRA QUE CADENA SE LEE, Y POR QUE SE COMPRUEBA
 *
 * El nombre `RPC_8532_URL` es de cuando la cadena era la 8532. Hoy la red
 * oficial es la 5550 y ese nombre MIENTE, así que se acepta `GENESIS_RPC_URL`
 * —que no envejece— y el viejo queda solo por compatibilidad.
 *
 * El 20-ago apareció por qué esto importa. El panel enseñaba 39.998,40958
 * ORIGEN en una billetera que en la cadena tiene 0,983. El saldo de la cadena
 * era el correcto: la consolidación había dejado 1 ORIGEN y el resto era
 * gasolina gastada. Lo que estaba mal era la pantalla, que arrastraba una
 * lectura vieja hecha contra la 8532 —apagada ese mismo día— y la enseñaba con
 * la misma cara que un dato de hace un minuto.
 *
 * La regla de «si falla, conservo lo anterior» es correcta y se queda: inventar
 * un cero es peor. Lo que faltaba era la otra mitad — comprobar QUE CADENA está
 * contestando antes de creerle. Si el nodo dice un chainId que no es el nuestro,
 * no se escribe ni un saldo: se devuelve la lectura entera como fallida.
 *
 * Un panel de cumplimiento donde un operador aprueba a una persona mirando
 * saldos no puede mezclar dos cadenas. Y este fallo era invisible: los números
 * eran plausibles y estaban bien formados; solo eran de otro sitio.
 */
const RPC = () =>
  process.env.GENESIS_RPC_URL || process.env.RPC_8532_URL || 'https://rpc.ordenglobal-rpc.com/'

/** La cadena que este servicio da por buena. */
const CADENA_ESPERADA = Number(process.env.GENESIS_CADENA_ID || 5550)

/** Solo el anfitrión, para poder publicarlo en /healthz sin soltar credenciales
 *  si algún día la URL llevara una en la ruta o en el usuario. */
export function rpcAnfitrion(): string {
  try { return new URL(RPC()).host } catch { return '(url inválida)' }
}

/**
 * Qué cadena contesta de verdad en ese RPC.
 *
 * @returns el chainId, o `null` si el nodo no contestó.
 */
export async function cadenaDelNodo(): Promise<number | null> {
  try {
    const ctrl = new AbortController()
    const alarma = setTimeout(() => ctrl.abort(), 10000)
    const r = await fetch(RPC(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }),
      signal: ctrl.signal,
    })
    clearTimeout(alarma)
    const j: any = await r.json()
    return j?.result ? Number(BigInt(j.result)) : null
  } catch {
    return null
  }
}

/**
 * Lo mismo pero SIN ESPERAR, para /healthz.
 *
 * `/healthz` es la sonda de salud de Render: si tarda, el servicio se reinicia.
 * Preguntarle al nodo en cada llamada metería hasta diez segundos de espera en
 * el sitio donde menos se puede. Así que se devuelve lo último que se supo y se
 * dispara la siguiente lectura por detrás, como mucho una por minuto.
 *
 * `cadenaQueContesta: null` significa «todavía no lo he preguntado», no «el nodo
 * está caído»: en el primer arranque es lo normal durante unos segundos.
 */
let ultimoEstado: { rpc: string; cadenaEsperada: number; cadenaQueContesta: number | null; coincide: boolean } | null = null
let ultimaMirada = 0

export function estadoCadenaRapido() {
  const ahora = Date.now()
  if (ahora - ultimaMirada > 60_000) {
    ultimaMirada = ahora
    estadoCadena().then((e) => { ultimoEstado = e }).catch(() => { /* se reintenta al minuto */ })
  }
  return ultimoEstado ?? {
    rpc: rpcAnfitrion(),
    cadenaEsperada: CADENA_ESPERADA,
    cadenaQueContesta: null,
    coincide: false,
  }
}

/** Pregunta al nodo de verdad. Puede tardar; no usar en /healthz. */
export async function estadoCadena(): Promise<{
  rpc: string
  cadenaEsperada: number
  cadenaQueContesta: number | null
  coincide: boolean
}> {
  const c = await cadenaDelNodo()
  return {
    rpc: rpcAnfitrion(),
    cadenaEsperada: CADENA_ESPERADA,
    cadenaQueContesta: c,
    coincide: c === CADENA_ESPERADA,
  }
}

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
/**
 * Cuántas llamadas acepta el nodo en un solo lote.
 *
 * Veinte. Lo dice el nodo: con veinticinco responde
 * `-32600 Batch request length too long`. Estaba puesto en 300 y TODOS los
 * lotes salían rechazados — el panel enseñaba cero tenedores de ONDK y de las
 * otras trece monedas, y parecía un dato cuando era un fallo.
 *
 * El error no estaba en el número sino en tragárselo: el `catch` daba el lote
 * por vacío y seguía, así que «el nodo me rechazó» y «esa persona no tiene
 * nada» acababan pintados igual en la pantalla. Ahora se cuenta y se devuelve.
 */
const MAX_LOTE_RPC = Number(process.env.RPC_MAX_LOTE || 20)

async function lote(cuerpo: any[]): Promise<any[] | null> {
  try {
    const ctrl = new AbortController()
    const alarma = setTimeout(() => ctrl.abort(), 25000)
    const r = await fetch(RPC(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo),
      signal: ctrl.signal,
    })
    clearTimeout(alarma)
    const j = await r.json()
    if (Array.isArray(j)) return j
    // Respuesta que no es un arreglo = el lote entero fue rechazado.
    console.error('[monedas] lote rechazado por el nodo:',
      JSON.stringify(j)?.slice(0, 200))
    return null
  } catch (e: any) {
    console.error('[monedas] el nodo no respondió:', e?.message)
    return null
  }
}

export interface LecturaSaldos {
  saldos: Map<string, Record<string, number>>
  /** Cuántas llamadas quedaron sin respuesta. Si no es 0, la tabla está coja. */
  fallidas: number
  /** Cuándo se leyó. Un saldo sin fecha se ve igual de fresco que uno de agosto. */
  leidoEn: string
  /** Qué cadena contestó. `null` = el nodo no dijo nada. */
  cadena: number | null
  /** `false` cuando el nodo contestó otra cadena y NO se leyó ningún saldo. */
  cadenaCorrecta: boolean
  /**
   * Por cada dirección, QUE MONEDAS se leyeron de verdad — con saldo o sin él.
   *
   * Existe porque «no tiene nada» y «no me contestaron» salían iguales: el mapa
   * traía `{}` en los dos casos y quien llamaba lo escribía encima, borrando
   * saldos buenos cada vez que el nodo tosía.
   *
   * El primer intento de arreglarlo fue todo-o-nada por dirección, y era PEOR:
   * con quince monedas por persona, una sola llamada perdida dejaba esa ficha
   * sin actualizar entera. Se notó enseguida — una cuenta que acababa de
   * vaciarse siguió mostrando sus tokens.
   *
   * La cuenta correcta es POR MONEDA: se actualiza lo que contestó y se deja
   * intacto lo que no. Ni se inventa un cero ni se bloquea la ficha por una
   * moneda floja.
   */
  leidas: Map<string, Set<string>>
}

/**
 * Lee todas las monedas de varias direcciones.
 *
 * Devuelve además cuántas llamadas se perdieron, para que quien llame pueda
 * decir «faltan datos» en vez de enseñar ceros con cara de certeza.
 */
export async function saldosDe(direcciones: string[]): Promise<LecturaSaldos> {
  const lista = monedas()
  const saldos = new Map<string, Record<string, number>>()
  const leidoEn = new Date().toISOString()
  let fallidas = 0
  if (!direcciones.length) {
    return { saldos, fallidas, leidoEn, cadena: null, cadenaCorrecta: true, leidas: new Map() }
  }

  /* LA PUERTA. Antes de creerle un solo número al nodo, se le pregunta qué
     cadena es. Si contesta otra —o no contesta—, se devuelve la lectura entera
     como fallida y sin ningún saldo dentro. Quien llama ya sabe conservar lo
     anterior cuando faltan datos, así que la pantalla se queda con lo que
     tenía en vez de mezclar dos cadenas. */
  const cadena = await cadenaDelNodo()
  if (cadena !== CADENA_ESPERADA) {
    console.error(
      `[monedas] NO se leyeron saldos: ${rpcAnfitrion()} contesta la cadena ` +
      `${cadena ?? 'ninguna'} y se esperaba la ${CADENA_ESPERADA}`
    )
    for (const d of direcciones) saldos.set(d, {})
    return {
      saldos,
      fallidas: direcciones.length * lista.length,
      leidoEn,
      cadena,
      cadenaCorrecta: false,
      leidas: new Map(),   // nada: no se guarda ni una moneda de otra cadena
    }
  }

  const llamadas: { direccion: string; moneda: Moneda }[] = []
  const cuerpo: any[] = []
  for (const d of direcciones) {
    for (const m of lista) {
      const id = llamadas.length
      llamadas.push({ direccion: d, moneda: m })
      cuerpo.push(m.contrato
        ? { jsonrpc: '2.0', id, method: 'eth_call', params: [{ to: m.contrato, data: datosBalanceOf(d) }, 'latest'] }
        : { jsonrpc: '2.0', id, method: 'eth_getBalance', params: [d, 'latest'] })
    }
    // Toda dirección consultada aparece en el mapa, aunque no tenga nada. Sin
    // esto, «sin saldo» y «no la consulté» se confunden río abajo.
    saldos.set(d, {})
  }

  /* Qué monedas contestó cada dirección. Lo que no esté aquí no se toca al
     guardar: se conserva lo que hubiera, que es viejo pero cierto. */
  const leidas = new Map<string, Set<string>>(direcciones.map((d) => [d, new Set<string>()]))
  const anotarLeida = (id: any) => {
    const m = llamadas[id]
    if (m) leidas.get(m.direccion)?.add(m.moneda.simbolo)
  }

  for (let i = 0; i < cuerpo.length; i += MAX_LOTE_RPC) {
    const trozo = cuerpo.slice(i, i + MAX_LOTE_RPC)
    const res = await lote(trozo)
    if (!res) { fallidas += trozo.length; continue }

    for (const x of res) {
      const meta = llamadas[x?.id]
      if (!meta) { fallidas++; continue }
      if (!x?.result || x.result === '0x') { fallidas++; continue }
      let valor: number
      try {
        valor = Number(BigInt(x.result)) / Math.pow(10, meta.moneda.decimales)
      } catch { fallidas++; continue }
      if (!Number.isFinite(valor)) { fallidas++; continue }
      // Contestó: esta moneda se puede escribir, valga cero o valga mucho.
      anotarLeida(x.id)
      // Solo se anotan los saldos que existen: quince ceros por persona harían
      // la tabla ilegible y el documento tres veces más grande.
      if (valor > 0) saldos.get(meta.direccion)![meta.moneda.simbolo] = Math.round(valor * 1e6) / 1e6
    }
  }
  return { saldos, fallidas, leidoEn, cadena, cadenaCorrecta: true, leidas }
}

/**
 * Cuánto se emitió de cada moneda, según la propia cadena.
 *
 * Sin esto, una moneda que nadie tiene se ve exactamente igual que una que el
 * panel no pudo leer, y lo primero que piensa cualquiera es que la lista está
 * rota. Con la emisión al lado se distinguen tres casos muy distintos: emitida
 * y repartida, emitida y sin repartir, y sin emisión.
 */
export async function emisiones(): Promise<Record<string, number | null>> {
  const lista = monedas().filter((m) => m.contrato)
  const salida: Record<string, number | null> = {}
  for (const m of monedas()) salida[m.simbolo] = null
  if (!lista.length) return salida

  // La misma puerta que en saldosDe: la emisión de otra cadena no es la nuestra.
  // Todo queda en `null`, que aquí significa «no lo sé» y se pinta distinto de
  // un cero.
  const cadena = await cadenaDelNodo()
  if (cadena !== CADENA_ESPERADA) {
    console.error(
      `[monedas] NO se leyeron emisiones: ${rpcAnfitrion()} contesta la cadena ` +
      `${cadena ?? 'ninguna'} y se esperaba la ${CADENA_ESPERADA}`
    )
    return salida
  }

  const cuerpo = lista.map((m, i) => ({
    jsonrpc: '2.0', id: i, method: 'eth_call',
    params: [{ to: m.contrato, data: '0x18160ddd' }, 'latest'],   // totalSupply()
  }))
  for (let i = 0; i < cuerpo.length; i += MAX_LOTE_RPC) {
    const res = await lote(cuerpo.slice(i, i + MAX_LOTE_RPC))
    if (!res) continue                     // queda en null: «no lo sé», no «cero»
    for (const x of res) {
      const m = lista[x?.id]
      if (!m || !x?.result || x.result === '0x') continue
      try { salida[m.simbolo] = Number(BigInt(x.result)) / Math.pow(10, m.decimales) } catch { /* null */ }
    }
  }
  return salida
}
