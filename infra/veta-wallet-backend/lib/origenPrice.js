import axios from "axios";

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
// Los 0,01 USD NO son el precio: son la COMISIÓN por transacción (ver
// lib/comision.js). La decisión del 12-ago que fijaba el precio en 0,01 USD
// confundía las dos cosas y queda sustituida.
//
// Modo fijo sólo si se pide expresamente: OG_PRECIO_MODO=fijo con
// OG_ORIGEN_USD. Sin fuente de precio no se inventa uno: PRECIO_NO_DISPONIBLE.
// ============================================================

const ONZA_EN_GRAMOS = 31.1035;
const GRAMOS_POR_ORIGEN = 55;


function porOnza(precioOnza) {
  return precioOnza / ONZA_EN_GRAMOS / GRAMOS_POR_ORIGEN;
}

function precioFijado() {
  const v = parseFloat(process.env.OG_ORIGEN_USD);
  if (!isNaN(v) && v > 0) return v;
  const e = new Error("PRECIO_FIJO_SIN_VALOR");
  e.code = "PRECIO_NO_DISPONIBLE";
  throw e;
}

async function precioPorOro() {
  // CoinGecko primero: Binance devuelve 451 desde las IP de EE.UU., que es
  // donde vive este servidor.
  try {
    const res = await axios.get(
      "https://api.coingecko.com/api/v3/simple/price?ids=pax-gold&vs_currencies=usd",
      { timeout: 4000 }
    );
    const oz = res.data?.["pax-gold"]?.usd;
    if (oz && !isNaN(oz) && oz > 0) return porOnza(oz);
  } catch { /* siguiente fuente */ }

  try {
    const res = await axios.get(
      "https://api.binance.com/api/v3/ticker/price?symbol=PAXGUSDT",
      { timeout: 4000 }
    );
    const oz = parseFloat(res.data?.price);
    if (!isNaN(oz) && oz > 0) return porOnza(oz);
  } catch { /* respaldo */ }

  // Sin fuentes no se inventa un precio: devolver uno equivocado en un camino
  // de dinero es peor que fallar. Antes se caia a "una onza a 2000", que con
  // el oro a 4.400 acreditaba al usuario la mitad de lo que le tocaba.
  const e = new Error("PRECIO_NO_DISPONIBLE");
  e.code = "PRECIO_NO_DISPONIBLE";
  throw e;
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
