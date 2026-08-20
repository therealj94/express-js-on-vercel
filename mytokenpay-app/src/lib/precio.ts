// Cuánto vale un ORIGEN, y cuánto vale un dólar en lempiras.
//
// POR QUE ESTO NO PUEDE ESTAR ESCRITO A MANO EN EL TELEFONO
//
// La app móvil lleva `export const ORIGEN_USD = 2.35` dentro del código. Eso
// significa que el precio con el que se cobra en el mostrador es el que tenía
// la aplicación el día que se compiló: cuando el precio se mueva, cada teléfono
// cobrará a un precio distinto según cuándo actualizó, y ninguno al de hoy.
//
// El precio vive AQUI, en una variable de entorno con el MISMO nombre que usa
// el backend de la billetera (`OG_TOKEN_PRICE_USD`). Una sola cifra en la casa:
// si se separaran, la wallet cobraría a un precio y MyTokenPay reportaría a
// otro, y el descuadre aparecería en la contabilidad meses después.
//
// EL PRECIO SE CONGELA EN EL COBRO
//
// Cada cobro guarda el equivalente en dólares y en lempiras del momento en que
// se emitió. Recalcularlos al leerlo haría que una factura de ayer cambiara de
// importe hoy, que es exactamente lo que un comercio no puede aceptar.

/** Dólares por ORIGEN. Sin la variable puesta no se inventa: se dice que no hay. */
export function precioOrigenUsd(): number | null {
  const p = parseFloat(process.env.OG_TOKEN_PRICE_USD || '')
  return Number.isFinite(p) && p > 0 ? p : null
}

/** Lempiras por dólar. */
export function lempirasPorDolar(): number | null {
  const p = parseFloat(process.env.HNL_POR_USD || '')
  return Number.isFinite(p) && p > 0 ? p : null
}

/**
 * Convierte un importe en ORIGEN a sus equivalentes.
 *
 * Devuelve ceros cuando no hay precio configurado, y quien llama tiene que
 * decidir si eso le sirve. No se usa un precio por omisión a propósito: un
 * cobro emitido con un precio inventado es un cobro por el importe equivocado,
 * y es preferible que el comercio vea el problema a que cobre de menos.
 */
export function equivalencias(montoOrigen: number): {
  usd: number; hnl: number; precioUsado: number | null
} {
  const p = precioOrigenUsd()
  if (!p) return { usd: 0, hnl: 0, precioUsado: null }
  const usd = Math.round(montoOrigen * p * 100) / 100
  const tasa = lempirasPorDolar()
  return { usd, hnl: tasa ? Math.round(usd * tasa * 100) / 100 : 0, precioUsado: p }
}

/** Redondeo del ORIGEN. Cuatro decimales, como la app móvil. */
export const redondearOrigen = (n: number): number => Math.round(n * 10000) / 10000
