import axios from "axios";

// ============================================================
// Precio de ORIGEN en USD.
//
// DECIDIDO EL 12-AGO-2026: PRECIO FIJO DE 0,01 USD PARA LA 5550.
//
// Hasta hoy este archivo calculaba el precio del oro en vivo:
//
//     ORIGEN = (onza de oro / 31,1035) / 55        // 1/55 de gramo de oro
//
// Con el oro a 4.397,97 la onza —medido el 12-ago-2026— eso da **2,5709 USD
// por ORIGEN**. Contra el precio fijado de 0,01, la diferencia es de **257
// veces**, y no es un numero de informe: lo usan tres caminos que mueven
// dinero de verdad.
//
//   · Depositar USDT      El usuario pone 100 USDT y se le acreditan
//                         100 / 2,5709 = 38,9 ORIGEN. Si el ORIGEN vale 0,01,
//                         acaba de pagar 100 dolares por 39 centavos.
//   · Fondear la tarjeta  Al reves: el usuario entrega 1 ORIGEN y se le
//                         cargan 2,57 dolares en la tarjeta. Cada ORIGEN que
//                         entra por ahi le cuesta a la empresa 2,56 dolares.
//   · Canje (swap)        Valora lo enviado con el mismo precio.
//
// Mientras las dos puntas usaran la misma formula el error se cancelaba. En el
// momento en que el precio publico de la 5550 es 0,01 y este modulo dice 2,57,
// deja de cancelarse y alguien paga la diferencia. Por eso el cambio de precio
// NO es una linea en un documento: es este archivo.
//
// De paso desaparecen dos cosas que no deberian estar en un camino de dinero:
//
//   1. Binance contesta **451** a las IP de Estados Unidos, que es donde corre
//      Heroku. La primera fuente de precio no funcionaba nunca en produccion:
//      cada consulta gastaba sus 4 segundos de espera para acabar en el
//      respaldo. Comprobado el 12-ago-2026.
//   2. Con precio fijo no hay llamada de red, asi que el precio no puede
//      cambiar entre que se cotiza una operacion y se ejecuta.
//
// Para volver al oro: OG_PRECIO_MODO=oro. Se deja escrito porque la decision
// de precio es de la Junta y puede cambiar; lo que no puede es estar en dos
// sitios a la vez.
// ============================================================

const ONZA_EN_GRAMOS = 31.1035;
const GRAMOS_POR_ORIGEN = 55;

// El precio acordado. Se puede mover con OG_ORIGEN_USD sin tocar codigo, pero
// tiene un valor por omision a proposito: un precio que depende de que alguien
// se acuerde de poner una variable de entorno es un precio que un dia vale
// cero.
const PRECIO_FIJO_USD = 0.01;

function porOnza(precioOnza) {
  return precioOnza / ONZA_EN_GRAMOS / GRAMOS_POR_ORIGEN;
}

function precioFijado() {
  const v = parseFloat(process.env.OG_ORIGEN_USD);
  if (!isNaN(v) && v > 0) return v;
  return PRECIO_FIJO_USD;
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
  if ((process.env.OG_PRECIO_MODO || "fijo").toLowerCase() === "oro") {
    return precioPorOro();
  }
  return precioFijado();
}

// Para mostrar en pantalla y en los recibos: de donde salio el numero.
export function origenPriceFuente() {
  const modo = (process.env.OG_PRECIO_MODO || "fijo").toLowerCase();
  return modo === "oro" ? "oro" : "fijo";
}

export default getOrigenPriceUsd;
