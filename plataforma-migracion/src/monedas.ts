// La lista única de monedas de la red: la que leen Veta Wallet, Genesis ID, el explorador y AURA.
//
// Antes cada app tenía su copia a mano de los mismos contratos y precios. El día del corte habría
// que haber cambiado seis copias a la vez. Ahora todas leen /api/monedas y guardan una copia de
// respaldo por si no responde. El cambio a la v2 es una variable en Render (V2_<CLAVE>=0x…): desde
// ese momento el «contrato vigente» de la moneda es el v2 y todas las apps lo usan.
//
// Las monedas heredadas fuera del catálogo siguen en la lista mientras la Junta no ratifique su
// inactivación (§14.4). Se ocultan en todas las apps con MONEDAS_OCULTAS=AUBEX,ASL,…

import { CATALOGO, contratoV2 } from './catalogo.js'

export type EstadoMoneda = 'nativa' | 'heredada' | 'migrada' | 'fuera-de-catalogo'

export interface Moneda {
  /** Símbolo en cadena: es la clave con la que la buscan las apps. */
  simbolo: string
  clave: string
  nombre: string
  decimales: number
  /** El contrato que hay que leer hoy: el v2 si ya está, si no el heredado. null para ORIGEN. */
  contrato: string | null
  heredado: string | null
  v2: string | null
  estado: EstadoMoneda
  visible: boolean
  /** Precio de referencia en USD para las que no cotizan en ningún mercado. null = sin precio. */
  precioFijo: number | null
}

/** Las heredadas que la propuesta de §14.4 inactiva: siguen visibles hasta que se decida ocultarlas. */
const FUERA_DE_CATALOGO: { simbolo: string; nombre: string; contrato: string; precioFijo: number | null }[] = [
  // AUBEX sin precio: el precio fijo de 10 USD se retira (SFSP §19, «inmediato»).
  { simbolo: 'AUBEX', nombre: 'Aubex', contrato: '0xf1498640b27a66c0dc505093d70911c060e04fb0', precioFijo: null },
  { simbolo: 'ASL', nombre: 'Athletic', contrato: '0x69846ac960d45f9946c613dfce1b761d37faf098', precioFijo: 2.328 },
  { simbolo: 'REST', nombre: 'Real State', contrato: '0x1ac12ebd7739003059d1e9ea2a4863c92d1505dd', precioFijo: 8.57 },
  { simbolo: 'SOL', nombre: 'Solar', contrato: '0xaac6ae2e2037fc2e94d0b060792e7eb4e5fbfa66', precioFijo: 0.75 },
  { simbolo: 'AIT', nombre: 'Artificial Intelligence', contrato: '0xae14db486872ac07d74ad69cc09590239b21ba2e', precioFijo: 5.32 },
  { simbolo: 'AGRO', nombre: 'Agrotech', contrato: '0x2a31ba919a5339fcb0f8aeeffce2c807b16007fe', precioFijo: 13.13 },
  { simbolo: 'POLITICAL', nombre: 'Political', contrato: '0x92496e1848e001428a3495409a9a9f616bb6dd3b', precioFijo: 0.33 },
]

/** Precios de referencia de las del catálogo que no cotizan (los de AUKA, AGKA y ORIGEN salen del oro y la plata). */
const PRECIO_FIJO: Record<string, number> = { HARV: 0.75, IBS: 1.2, AMOR: 0.1 }

export function monedas(entorno: NodeJS.ProcessEnv = process.env): Moneda[] {
  const ocultas = new Set(String(entorno.MONEDAS_OCULTAS || '').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean))
  const delCatalogo: Moneda[] = CATALOGO.map((a) => {
    const v2 = a.heredado ? contratoV2(a.clave, entorno) : null
    return {
      simbolo: a.simbolo, clave: a.clave, nombre: a.nombre, decimales: a.decimales,
      contrato: v2 ?? a.heredado, heredado: a.heredado, v2,
      estado: !a.heredado ? 'nativa' : v2 ? 'migrada' : 'heredada',
      visible: !ocultas.has(a.simbolo) && !ocultas.has(a.clave),
      precioFijo: PRECIO_FIJO[a.clave] ?? null,
    }
  })
  const fuera: Moneda[] = FUERA_DE_CATALOGO.map((m) => ({
    simbolo: m.simbolo, clave: m.simbolo, nombre: m.nombre, decimales: 18,
    contrato: m.contrato, heredado: m.contrato, v2: null, estado: 'fuera-de-catalogo',
    visible: !ocultas.has(m.simbolo), precioFijo: m.precioFijo,
  }))
  return [...delCatalogo, ...fuera]
}
