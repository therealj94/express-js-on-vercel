/**
 * Firmar y mandar una transacción a la cadena 5550.
 *
 * ── PARA QUE EXISTE ─────────────────────────────────────────────────────────
 *
 * Para el ancla de la bitácora. Toda la garantía de Genesis ID terminaba en
 * «confíen en nosotros»: la firma HMAC impide inventar asientos, pero quien
 * tenga la base puede BORRAR los últimos y dejar la cadena terminando antes de
 * tiempo, perfectamente íntegra. Contra eso solo sirve dejar constancia fuera.
 *
 * Y la constancia de fuera que tenemos es única: una cadena propia. Un hash al
 * día escrito ahí convierte «confíen en nosotros» en «compruébenlo ustedes»,
 * que es la frase que un regulador o un banco corresponsal piden y casi nadie
 * puede dar.
 *
 * ── POR QUE UNA TRANSACCION PELADA Y NO UN CONTRATO ─────────────────────────
 *
 * El ancla es un hash. No hay lógica que ejecutar, no hay estado que guardar, y
 * la cadena YA guarda el `data` de cada transacción para siempre. Un contrato
 * añadiría: código que auditar, un despliegue, una dirección más que cuidar y
 * un camino de actualización — todo para guardar 32 bytes que la transacción
 * guarda sola.
 *
 * Las anclas se encuentran listando las transacciones DESDE la dirección del
 * ancla, que es una consulta que el explorador ya sabe hacer.
 *
 * ── LO QUE NO SE HACE, Y ES A PROPOSITO ─────────────────────────────────────
 *
 * No se firma nada que no sea el ancla. Esta pieza no sabe transferir valor: la
 * transacción va SIEMPRE a la propia dirección del ancla y con valor cero. Si
 * la llave se filtrara, lo peor que puede hacer quien la tenga con este código
 * es gastar el gas de la cuenta.
 *
 * ── LA LLAVE ────────────────────────────────────────────────────────────────
 *
 * Sale de `GENESIS_ANCLA_LLAVE` y no se escribe en ningún registro, ni entera
 * ni en trozos. De ella solo se publica la DIRECCION, que es pública por
 * definición: sin ella nadie podría comprobar el ancla.
 */

import { secp256k1 } from '@noble/curves/secp256k1'
import { keccak_256 } from '@noble/hashes/sha3'

const hex = (b: Uint8Array) => '0x' + Buffer.from(b).toString('hex')
const deHex = (s: string) => Uint8Array.from(Buffer.from(s.replace(/^0x/, ''), 'hex'))

/* ── RLP, lo justo para una transacción ──────────────────────────────────────
 *
 * Se escribe a mano y no se trae una librería porque son treinta líneas y el
 * formato no cambia desde 2015. Traer un paquete entero para esto es más
 * superficie de la que ahorra.
 */
function rlpLargo(largo: number, offset: number): Uint8Array {
  if (largo < 56) return Uint8Array.of(offset + largo)
  const b = []
  for (let n = largo; n > 0; n = Math.floor(n / 256)) b.unshift(n % 256)
  return Uint8Array.from([offset + 55 + b.length, ...b])
}

function rlp(x: Uint8Array | Uint8Array[]): Uint8Array {
  if (x instanceof Uint8Array) {
    // Un solo byte por debajo de 0x80 se codifica como él mismo.
    if (x.length === 1 && x[0] < 0x80) return x
    return Uint8Array.from([...rlpLargo(x.length, 0x80), ...x])
  }
  const cuerpo = x.map(rlp)
  const total = cuerpo.reduce((a, c) => a + c.length, 0)
  return Uint8Array.from([...rlpLargo(total, 0xc0), ...cuerpo.flatMap((c) => [...c])])
}

/** Un número a bytes SIN ceros a la izquierda, que es lo que exige RLP. */
function num(n: bigint | number): Uint8Array {
  let v = BigInt(n)
  if (v === 0n) return new Uint8Array(0)      // el cero es la cadena vacía
  const b: number[] = []
  while (v > 0n) { b.unshift(Number(v & 0xffn)); v >>= 8n }
  return Uint8Array.from(b)
}

/** La dirección que corresponde a una llave privada. */
export function direccionDe(llavePrivada: string): string {
  const priv = deHex(llavePrivada)
  const pub = secp256k1.getPublicKey(priv, false).slice(1)   // sin el 0x04
  return hex(keccak_256(pub).slice(-20))
}

export type Tx = {
  nonce: bigint
  precioGas: bigint
  limiteGas: bigint
  a: string
  valor: bigint
  datos: Uint8Array
  cadenaId: number
}

/**
 * Firma una transacción legacy (tipo 0) con EIP-155.
 *
 * Legacy y no 1559 a propósito: la 5550 corre Besu con QBFT y precio de gas
 * fijo, así que el mercado de tarifas de 1559 no aporta nada y el formato
 * legacy tiene la mitad de piezas que se pueden escribir mal.
 */
export function firmarTx(tx: Tx, llavePrivada: string): string {
  const base = [
    num(tx.nonce), num(tx.precioGas), num(tx.limiteGas),
    deHex(tx.a), num(tx.valor), tx.datos,
  ]
  // EIP-155: se firma con chainId, 0, 0 al final para que la firma no valga en
  // otra cadena. Sin esto, una transacción de la 5550 se puede reenviar tal
  // cual en cualquier red con el mismo formato.
  const paraFirmar = keccak_256(rlp([...base, num(tx.cadenaId), num(0), num(0)]))
  const firma = secp256k1.sign(paraFirmar, deHex(llavePrivada), { prehash: false })
  const v = BigInt(tx.cadenaId) * 2n + 35n + BigInt(firma.recovery)
  const crudo = rlp([...base, num(v), num(firma.r), num(firma.s)])
  return hex(crudo)
}

async function rpc(url: string, metodo: string, params: unknown[]): Promise<any> {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: metodo, params }),
    signal: AbortSignal.timeout(20_000),
  })
  const j = await r.json()
  if (j.error) throw new Error(`${metodo}: ${j.error.message || JSON.stringify(j.error)}`)
  return j.result
}

/**
 * Escribe unos bytes en la cadena, a la propia dirección y con valor cero.
 *
 * Devuelve el hash de la transacción. No espera a que se mine: el ancla es
 * diaria y bloquear el arranque del servicio esperando un bloque sería pagar
 * disponibilidad por una garantía que igual llega en diez segundos.
 */
export async function escribirEnLaCadena(
  rpcUrl: string, llavePrivada: string, datos: Uint8Array, cadenaId: number,
): Promise<{ hash: string; desde: string }> {
  const desde = direccionDe(llavePrivada)
  const nonce = BigInt(await rpc(rpcUrl, 'eth_getTransactionCount', [desde, 'pending']))
  const precio = BigInt(await rpc(rpcUrl, 'eth_gasPrice', []))

  /* 21000 de base + 16 por byte distinto de cero. Se calcula en vez de poner un
     número redondo: un límite de gas corto rechaza la transacción y uno largo
     no cuesta más —solo se cobra lo usado— pero esconde errores de tamaño. */
  const gas = 21000n + BigInt(datos.length) * 16n + 1000n

  const crudo = firmarTx({
    nonce, precioGas: precio, limiteGas: gas,
    a: desde,                 // a sí misma: esta pieza no sabe mover valor
    valor: 0n, datos, cadenaId,
  }, llavePrivada)

  const hash = await rpc(rpcUrl, 'eth_sendRawTransaction', [crudo])
  return { hash, desde }
}
