// Capa de comercio del ecosistema: catálogos de productos/servicios por
// comercio, precios en ORIGEN, y datos de retiro (moneda + bancos por país).
// Todo simulado y determinístico — al conectar el backend real, este módulo
// se reemplaza por la API sin tocar las pantallas.
import type { Company } from './types'
import { ORIGEN_USD } from '../store/wallet'

export interface CatalogItem {
  id: string
  name: string
  detail: string
  priceUsd: number
}

export function toOrigen(usd: number): number {
  return Math.round((usd / ORIGEN_USD) * 100) / 100
}

export function fmtOrigen(n: number): string {
  return n.toLocaleString('es-HN', { maximumFractionDigits: 2 })
}

export function fmtUsd(n: number): string {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// ---------- catálogos curados de las 4 empresas demo ----------
const CURATED: Record<string, CatalogItem[]> = {
  'mtp-demo-cafe': [
    { id: 'c1', name: 'Espresso doble', detail: 'Grano hondureño de altura', priceUsd: 2.8 },
    { id: 'c2', name: 'Cappuccino Veta', detail: 'Con arte latte de la casa', priceUsd: 3.9 },
    { id: 'c3', name: 'Cold brew 16 oz', detail: 'Infusión fría 18 horas', priceUsd: 4.5 },
    { id: 'c4', name: 'Baleada gourmet', detail: 'Frijol, aguacate y queso seco', priceUsd: 5.2 },
    { id: 'c5', name: 'Cheesecake de café', detail: 'Porción individual', priceUsd: 6.0 },
    { id: 'c6', name: 'Bolsa de grano 340 g', detail: 'Tueste medio, molienda a elección', priceUsd: 14.5 },
  ],
  'mtp-demo-hotel': [
    { id: 'h1', name: 'Habitación estándar (noche)', detail: 'Vista jardín · 2 personas', priceUsd: 68 },
    { id: 'h2', name: 'Suite vista al mar (noche)', detail: 'Balcón privado · desayuno incluido', priceUsd: 145 },
    { id: 'h3', name: 'Tour de snorkel', detail: 'Arrecife de Roatán · 3 horas', priceUsd: 39 },
    { id: 'h4', name: 'Cena romántica en la playa', detail: 'Menú de 3 tiempos para 2', priceUsd: 85 },
    { id: 'h5', name: 'Traslado aeropuerto', detail: 'Ida o vuelta', priceUsd: 22 },
    { id: 'h6', name: 'Masaje frente al mar', detail: '60 minutos', priceUsd: 55 },
  ],
  'mtp-demo-gym': [
    { id: 'g1', name: 'Día de entrenamiento', detail: 'Acceso completo por un día', priceUsd: 8 },
    { id: 'g2', name: 'Membresía mensual', detail: 'Acceso ilimitado + clases', priceUsd: 42 },
    { id: 'g3', name: 'Plan trimestral', detail: 'Ahorra 15% vs. mensual', priceUsd: 108 },
    { id: 'g4', name: 'Entrenamiento personal', detail: 'Sesión 1 a 1 · 60 min', priceUsd: 25 },
    { id: 'g5', name: 'Plan nutricional', detail: 'Evaluación + menú mensual', priceUsd: 35 },
    { id: 'g6', name: 'Camiseta Ironhouse', detail: 'Dry-fit edición ORIGEN', priceUsd: 18 },
  ],
  'mtp-demo-tech': [
    { id: 't1', name: 'Audífonos inalámbricos', detail: 'Cancelación de ruido', priceUsd: 59 },
    { id: 't2', name: 'Cargador rápido 65 W', detail: 'USB-C GaN', priceUsd: 32 },
    { id: 't3', name: 'Funda + vidrio templado', detail: 'Instalación incluida', priceUsd: 15 },
    { id: 't4', name: 'Cambio de pantalla', detail: 'Servicio técnico · 2 horas', priceUsd: 89 },
    { id: 't5', name: 'Smartwatch Nova', detail: 'Monitor de salud + GPS', priceUsd: 129 },
    { id: 't6', name: 'Diagnóstico técnico', detail: 'Laptop o teléfono', priceUsd: 12 },
  ],
}

// ---------- catálogo generado para el resto del directorio ----------
const PRICE_RANGE: Record<string, [number, number]> = {
  cafeterias: [2.5, 9],
  restaurantes: [6, 24],
  hoteles: [40, 150],
  gimnasios: [8, 48],
  belleza: [12, 60],
  'vida-nocturna': [5, 18],
  conveniencia: [1.5, 12],
  supermercados: [2, 20],
  moda: [9, 55],
  tecnologia: [12, 250],
  salud: [15, 70],
  educacion: [20, 120],
  automotriz: [15, 90],
  turismo: [18, 95],
  servicios: [20, 110],
}

function hash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h
}

export function getCatalog(company: Company): CatalogItem[] {
  const curated = CURATED[company.id]
  if (curated) return curated
  const [lo, hi] = PRICE_RANGE[company.categorySlug] ?? [5, 40]
  return company.productsServices.slice(0, 6).map((name, i) => {
    const h = hash(company.id + name)
    const priceUsd = Math.round((lo + (h % 1000) / 1000 * (hi - lo)) * 2) / 2
    return { id: `gen-${i}`, name, detail: 'Precio en ORIGEN al pagar', priceUsd }
  })
}

// ---------- retiro (cash out): moneda y bancos por país ----------
export interface PayoutInfo {
  currency: string
  symbol: string
  /** unidades de moneda local por 1 USD */
  ratePerUsd: number
  banks: string[]
}

const PAYOUTS: Record<string, PayoutInfo> = {
  honduras: { currency: 'HNL', symbol: 'L', ratePerUsd: 24.75, banks: ['Banco Atlántida', 'BAC Credomatic', 'Banpaís', 'Ficohsa', 'Banco de Occidente'] },
  guatemala: { currency: 'GTQ', symbol: 'Q', ratePerUsd: 7.75, banks: ['Banco Industrial', 'Banrural', 'BAM', 'G&T Continental'] },
  'el-salvador': { currency: 'USD', symbol: '$', ratePerUsd: 1, banks: ['Banco Agrícola', 'Banco Cuscatlán', 'BAC Credomatic', 'Davivienda'] },
  nicaragua: { currency: 'NIO', symbol: 'C$', ratePerUsd: 36.8, banks: ['Banpro', 'BAC Credomatic', 'Lafise Bancentro', 'BDF'] },
  'costa-rica': { currency: 'CRC', symbol: '₡', ratePerUsd: 512, banks: ['Banco Nacional', 'Banco de Costa Rica', 'BAC Credomatic', 'Scotiabank'] },
  panama: { currency: 'USD', symbol: '$', ratePerUsd: 1, banks: ['Banco General', 'Banistmo', 'BAC Credomatic', 'Global Bank'] },
  mexico: { currency: 'MXN', symbol: '$', ratePerUsd: 17.1, banks: ['BBVA', 'Banorte', 'Santander', 'Citibanamex'] },
}

const DEFAULT_PAYOUT: PayoutInfo = { currency: 'USD', symbol: '$', ratePerUsd: 1, banks: ['Banco internacional (SWIFT)'] }

export function payoutInfo(countrySlug: string): PayoutInfo {
  return PAYOUTS[countrySlug] ?? DEFAULT_PAYOUT
}

/** Convierte ORIGEN a moneda local del país. */
export function origenToLocal(amountOrigen: number, info: PayoutInfo): number {
  return Math.round(amountOrigen * ORIGEN_USD * info.ratePerUsd * 100) / 100
}

export function fmtLocal(n: number, info: PayoutInfo): string {
  return `${info.symbol}${n.toLocaleString('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${info.currency}`
}
