/**
 * El respaldo de la cadena 8532, la que se cerró.
 *
 * ── POR QUE ESTO VIVE EN GENESIS ID ─────────────────────────────────────────
 *
 * La 8532 se congeló el 10 de agosto y se sustituyó por la 5550. Su nodo ya no
 * contesta —lo comprobé: `23.23.205.33` no responde— así que lo único que queda
 * de esa cadena es el volcado de estado del corte, guardado en S3.
 *
 * Un respaldo que solo existe en un bucket es un respaldo que nadie mira. Y las
 * preguntas que se le hacen a estos datos —«¿cuánto tenía esta dirección antes
 * del cambio?», «¿cuántas billeteras había?»— son justo las que llegan cuando
 * alguien reclama, que es cuando ya no hay tiempo de ir a buscar un fichero de
 * 5 MB en un bucket y abrirlo a mano.
 *
 * ── DE DONDE SALE, EXACTAMENTE ──────────────────────────────────────────────
 *
 *   s3://ordenglobal-cadena-8532-respaldo/2026-08-10/traspaso/estado-v3.json
 *
 * Es el MISMO volcado que se usó para construir el génesis de la 5550, o sea el
 * que decidió qué saldo se llevó cada quien. No es una copia parecida: es el
 * documento que mandó.
 *
 * ── LOS SALDOS VIAJAN COMO CADENA, Y NO ES UN DESCUIDO ──────────────────────
 *
 * En wei son hasta 21 dígitos. `JSON.parse` los convierte a `double` y
 * 250000000000000000000000000000 deja de ser el número que estaba en la cadena.
 * En un respaldo de algo que ya no se puede volver a consultar, un redondeo no
 * se detecta nunca más. Se comparan y se ordenan con BigInt.
 */

import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const AQUI = dirname(fileURLToPath(import.meta.url))

export type CuentaVieja = {
  /* NULO cuando la dirección nunca se supo: el árbol de estado guarda el HASH
     de la dirección, y para 18 cuentas del corte no se encontró la preimagen.
     Son todas contratos y todas con saldo cero —o sea que no hay ni un ORIGEN
     sin dueño conocido— pero se conservan igual: quitarlas haría que la suma
     dejara de cuadrar con la raíz de estado, que es lo único con lo que este
     respaldo se puede contrastar. */
  direccion: string | null
  hash: string
  saldo: string
  nonce: number
  tipo: 'billetera' | 'contrato'
}

export type RespaldoCadena = {
  cadena: Record<string, unknown>
  resumen: Record<string, number | string>
  cuentas: CuentaVieja[]
}

let cache: RespaldoCadena | null = null

/** El respaldo entero. Se lee una vez: son 35 KB y no cambian nunca más. */
export function respaldo(): RespaldoCadena {
  if (cache) return cache
  const ruta = join(AQUI, '..', '..', 'datos', 'cadena-8532.json')
  cache = JSON.parse(readFileSync(ruta, 'utf8')) as RespaldoCadena
  return cache
}

export type Filtro = {
  texto?: string
  tipo?: string
  minimo?: string        // en ORIGEN enteros, no en wei: es lo que se teclea
  soloConSaldo?: boolean
  soloQueMovieron?: boolean
  orden?: 'saldo' | 'nonce' | 'direccion'
  desde?: number
  limite?: number
}

const UNO = 10n ** 18n

/**
 * Busca en el respaldo.
 *
 * El `total` son las que CUADRAN con el filtro, no las que caben en la página.
 * Es la misma lección que la lista de identidades, donde devolver la longitud
 * de la página ya cortada hacía que el tablero y la lista dijeran números
 * distintos sin que nada explicara la diferencia.
 */
export function buscar(f: Filtro) {
  const r = respaldo()
  const t = (f.texto || '').toLowerCase().trim()
  const min = f.minimo ? BigInt(Math.max(0, Math.floor(Number(f.minimo) || 0))) * UNO : 0n

  const cuadran = r.cuentas.filter((c) => {
    // Se busca también por el hash: para las cuentas sin dirección conocida
    // es su único identificador, y omitirlas del buscador las haría invisibles.
    if (t && !(c.direccion || '').toLowerCase().includes(t)
          && !c.hash.toLowerCase().includes(t)) return false
    if (f.tipo && c.tipo !== f.tipo) return false
    if (f.soloConSaldo && BigInt(c.saldo) === 0n) return false
    if (f.soloQueMovieron && c.nonce === 0) return false
    if (min > 0n && BigInt(c.saldo) < min) return false
    return true
  })

  const orden = f.orden || 'saldo'
  cuadran.sort((a, b) => {
    if (orden === 'nonce') return b.nonce - a.nonce
    if (orden === 'direccion') return (a.direccion || a.hash).localeCompare(b.direccion || b.hash)
    // Con BigInt, porque restar dos saldos en wei desborda el número de JS.
    const x = BigInt(a.saldo), y = BigInt(b.saldo)
    return x === y ? 0 : (x > y ? -1 : 1)
  })

  const desde = Math.max(0, Number(f.desde) || 0)
  const limite = Math.min(500, Math.max(1, Number(f.limite) || 100))
  const pagina = cuadran.slice(desde, desde + limite)

  /* La suma de lo FILTRADO, no del universo. Si alguien filtra «billeteras con
     más de 1000», lo que quiere saber es cuánto suman esas — un total que
     ignorara el filtro sería el mismo número siempre y no diría nada. */
  const suma = cuadran.reduce((a, c) => a + BigInt(c.saldo), 0n)

  return {
    cuentas: pagina,
    total: cuadran.length,
    desde,
    hayMas: desde + pagina.length < cuadran.length,
    sumaFiltrada: suma.toString(),
  }
}

/** Una dirección concreta, para responder «¿qué tenía esta antes del cambio?». */
export function porDireccion(direccion: string): CuentaVieja | undefined {
  const d = String(direccion || '').toLowerCase()
  return respaldo().cuentas.find((c) => (c.direccion || '').toLowerCase() === d
                                     || c.hash.toLowerCase() === d)
}
