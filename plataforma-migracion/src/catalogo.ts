// El catálogo de la migración: qué activos pasan a la v2 y desde qué contrato.
//
// Es la única lista de esta plataforma. Cada activo se identifica por su
// contrato heredado y nunca por su símbolo: en la cadena hay contratos
// distintos con el mismo símbolo (SFSP §14.3).
//
// La dirección del contrato v2 no está escrita aquí porque todavía no existe.
// Cuando se despliegue, se fija con la variable de entorno V2_<CLAVE>
// (por ejemplo V2_AUKA=0x…) y la plataforma empieza a conciliar contra ella.
//
// ORIGEN queda nativo (SFSP §10.1): no se migra. Aparece en el catálogo porque
// la plataforma muestra su circulación y lleva sus liberaciones de tesorería.

export type Serie = 'SFSP-200' | 'SFSP-300' | 'SFSP-400' | 'UTILITY'

export interface Activo {
  clave: string
  nombre: string
  /** Símbolo que devuelve el contrato en cadena. */
  simbolo: string
  serie: Serie
  /** Contrato heredado; null para ORIGEN, que es la moneda nativa. */
  heredado: string | null
  decimales: number
  nota?: string
}

export const CATALOGO: Activo[] = [
  { clave: 'ORIGEN', nombre: 'ORIGEN', simbolo: 'ORIGEN', serie: 'SFSP-400', heredado: null, decimales: 18,
    nota: 'Moneda nativa: no se migra. Su supply visible es lo que circula fuera de tesorería.' },
  { clave: 'AUKA', nombre: 'Gold Kapital', simbolo: 'AUKA', serie: 'SFSP-300',
    heredado: '0x6facc8df79cedc6c5065442ce27e915aa3a26b9b', decimales: 18 },
  { clave: 'AGKA', nombre: 'Silver Kapital', simbolo: 'AGKA', serie: 'SFSP-300',
    heredado: '0x961f798f998c7ff44d47d62c7fa1b572ef187a4b', decimales: 18 },
  { clave: 'ONDK', nombre: 'Orden Kapital', simbolo: 'ONDK', serie: 'SFSP-200',
    heredado: '0xfb83eea4b384a4b18e5a1eba7a4bb4c0b7ca19c1', decimales: 18 },
  { clave: 'HARV', nombre: 'Harvi', simbolo: 'HARV', serie: 'SFSP-200',
    heredado: '0x0fa04d11f28b28cbc9b98dd016f02023addb1923', decimales: 18 },
  { clave: 'IBS', nombre: 'IBS Energy', simbolo: 'IBS', serie: 'SFSP-200',
    heredado: '0x7af11d3e94a174f6fc290a5b7791a6dee2718e62', decimales: 18,
    nota: 'Contrato canónico por confirmar entre dos con el mismo símbolo.' },
  { clave: 'MONARKA', nombre: 'Monarka', simbolo: 'MNKA', serie: 'SFSP-200',
    heredado: '0x18b6680cff71c11067bec312fc48786be2e54ead', decimales: 18 },
  { clave: 'AMOR', nombre: 'Amor Global', simbolo: 'LOVE', serie: 'UTILITY',
    heredado: '0x638f2ba0e3e1083d1ba570b449bd266f3860d164', decimales: 18 },
]

/** ORIGEN tiene supply fijo declarado: un billón de unidades (SFSP §10.1). */
export const SUPPLY_ORIGEN = 10n ** 12n * 10n ** 18n

export function activo(clave: string): Activo | undefined {
  return CATALOGO.find((a) => a.clave === clave.toUpperCase())
}

/** Contrato v2 de un activo, si ya está desplegado y configurado. */
export function contratoV2(clave: string, entorno: NodeJS.ProcessEnv = process.env): string | null {
  const v = String(entorno[`V2_${clave.toUpperCase()}`] || '').trim().toLowerCase()
  return /^0x[0-9a-f]{40}$/.test(v) ? v : null
}

export const migrables = () => CATALOGO.filter((a) => a.heredado)
