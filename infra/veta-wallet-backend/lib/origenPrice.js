import { precioOrigenUsd } from "./oraculo";

// ============================================================
// Precio de ORIGEN en USD.
//
// DECIDIDO POR LA DIRECCIÓN EL 26-SEP-2026 (José): 1 ORIGEN = 1 gramo de oro
// dividido entre 55. Es la referencia de SFSP (el «gramín») y la misma que usa
// Ordenex, así que Veta y Ordenex cotizan igual y no queda diferencia que
// aprovechar comprando en uno y vendiendo en el otro (REV-01).
//
//     ORIGEN = (onza de oro / 31,1035) / 55
//
// El número sale del ORÁCULO ÚNICO (lib/oraculo.js, SFSP v0.3 §10.5): el
// mismo archivo, byte a byte, que usa Ordenex. Caché de 30 s y edad máxima de
// 10 min; más viejo que eso no hay precio. Aquí ya no se lee ningún feed por
// cuenta propia.
//
// Los 0,01 USD NO son el precio: son la COMISIÓN por transacción (ver
// lib/comision.js). La decisión del 12-ago que fijaba el precio en 0,01 USD
// confundía las dos cosas y queda sustituida.
//
// Modo fijo sólo si se pide expresamente: OG_PRECIO_MODO=fijo con
// OG_ORIGEN_USD. Sin fuente de precio no se inventa uno: PRECIO_NO_DISPONIBLE.
// ============================================================

function sinPrecio(mensaje = "PRECIO_NO_DISPONIBLE") {
  const e = new Error(mensaje);
  e.code = "PRECIO_NO_DISPONIBLE";
  return e;
}

function precioFijado() {
  const v = parseFloat(process.env.OG_ORIGEN_USD);
  if (!isNaN(v) && v > 0) return v;
  throw sinPrecio("PRECIO_FIJO_SIN_VALOR");
}

async function precioPorOro() {
  // Sin dato fresco el oráculo contesta null, y aquí no se inventa un precio:
  // devolver uno equivocado en un camino de dinero es peor que fallar. Antes
  // se caía a "una onza a 2000", que con el oro a 4.400 acreditaba al usuario
  // la mitad de lo que le tocaba.
  const p = await precioOrigenUsd();
  if (p > 0) return p;
  throw sinPrecio();
}

export async function getOrigenPriceUsd() {
  if ((process.env.OG_PRECIO_MODO || "oro").toLowerCase() === "fijo") {
    return precioFijado();
  }
  return precioPorOro();
}

// Para mostrar en pantalla y en los recibos: de donde salio el numero.
export function origenPriceFuente() {
  const modo = (process.env.OG_PRECIO_MODO || "oro").toLowerCase();
  return modo === "fijo" ? "fijo" : "oro";
}

export default getOrigenPriceUsd;
