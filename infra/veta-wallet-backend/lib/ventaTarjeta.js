/**
 * LA VENTA DE LA TARJETA.
 *
 * ── QUÉ CAMBIA ──────────────────────────────────────────────────────────────
 * Hasta hoy la tarjeta se emitía gratis: bastaba tener Genesis ID aprobado y
 * tocar el botón. Desde ahora cuesta **5 USD, pagados en ORIGEN**, y el ORIGEN
 * va a una billetera propia de las ventas de tarjeta — no al treasury que
 * fondea los saldos. Son dos dineros distintos: uno es el precio del plástico
 * y el otro es el respaldo de lo que se gasta con él. Mezclarlos hace
 * imposible saber cuánto se vendió y cuánto se debe.
 *
 * ── EL PRECIO ───────────────────────────────────────────────────────────────
 * El precio está en DÓLARES y se convierte a ORIGEN al momento de cobrar, con
 * la misma referencia que usa el resto de la casa (`lib/origenPrice.js`).
 * Ponerlo fijo en ORIGEN sería fijarlo en oro: el día que el oro se mueva, la
 * tarjeta costaría otra cosa sin que nadie lo haya decidido.
 *
 * ── EL TOPE ─────────────────────────────────────────────────────────────────
 * Hay un tope de tarjetas que la casa puede tener emitidas. NO es un número
 * que publique el emisor —su API no expone ninguno; se comprobó— así que lo
 * pone la casa y lo cuenta la casa, preguntándole al emisor cuántas hay de
 * verdad y no fiándose del contador propio.
 *
 * ES INTERNO Y NO SE ENSEÑA. Ni el tope ni cuántas quedan salen jamás en una
 * respuesta al cliente: «quedan 3» convierte una decisión de operación en una
 * carrera, y «hay 40» le dice a cualquiera el tamaño exacto de la operación.
 * Cuando no hay cupo se dice que no se están emitiendo tarjetas nuevas, que es
 * verdad y es todo lo que hace falta saber.
 *
 * Y SE CUENTA FALLANDO CERRADO. Si no se puede preguntar cuántas hay, no se
 * emite. Un tope que se abre solo cuando el emisor no contesta no es un tope.
 */

import axios from "axios";
import { getAddress } from "ethers";
import { getOrigenPriceUsd } from "./origenPrice";

/** Lo que cuesta una tarjeta, en dólares. */
export const PRECIO_USD = Number(process.env.CARD_PRECIO_USD || 5);

/* Cuántas tarjetas puede tener la casa emitidas. INTERNO: no sale en ninguna
   respuesta. Se deja como variable de entorno para poder subirlo sin
   desplegar, con el 40 acordado como valor de siempre. */
export const TOPE_TARJETAS = Number(process.env.CARD_TOPE || 40);

/**
 * A DÓNDE VA EL ORIGEN DE LA VENTA.
 *
 * Va escrita acá y no solo en una variable de entorno, y se comprueba su
 * checksum al cargar el módulo: una dirección con un carácter cambiado es
 * dinero al vacío, y EIP-55 lo detecta gratis. Si esto lanza al arrancar, es
 * un error de tipeo en ESTE archivo y hay que arreglarlo antes de seguir —
 * mejor que el proceso no levante a que levante cobrando hacia la nada.
 */
export const DESTINO = getAddress("0xc3B6a925AdC91069b62D97666A482136eA0a7311");

const CRYPTOMATE = "https://api.cryptomate.me";

/**
 * El precio de ahora: en dólares (que es como está fijado) y en ORIGEN (que es
 * como se paga). Devuelve también el precio del ORIGEN para que la pantalla
 * pueda enseñar de dónde sale el número en vez de pedir que se lo crean.
 */
export async function precio() {
  const origenPriceUsd = await getOrigenPriceUsd();
  if (!(origenPriceUsd > 0)) throw new Error("No hay precio de ORIGEN ahora mismo");
  /* Se redondea HACIA ARRIBA al sexto decimal: cobrar de menos por un
     redondeo es regalar; el pelo de más es de la casa y no de nadie. */
  const origen = Math.ceil((PRECIO_USD / origenPriceUsd) * 1e6) / 1e6;
  return { usd: PRECIO_USD, origen, origenPriceUsd };
}

/**
 * Cuántas tarjetas hay emitidas DE VERDAD, según el emisor.
 *
 * No se cuenta la colección propia: una tarjeta creada a mano desde el panel
 * de CryptoMate existe igual y ocupa cupo igual. Lanza si no se puede
 * preguntar — quien llama tiene que tratar eso como «no se emite», no como
 * «cero».
 */
export async function cuantasHay() {
  const { data } = await axios.get(`${CRYPTOMATE}/cards/virtual-cards/list`, {
    headers: { "x-api-key": process.env.CRYPTOMATE_API_KEY },
    timeout: 15000,
  });
  const lista = Array.isArray(data) ? data : data?.data || data?.cards;
  if (!Array.isArray(lista)) throw new Error("El emisor no devolvió una lista de tarjetas");
  // Las canceladas no ocupan cupo: el emisor las deja en la lista con su
  // estado, y contarlas cerraría la puerta por tarjetas que ya no existen.
  return lista.filter((c) => String(c?.status || "").toUpperCase() !== "DELETED").length;
}

/**
 * ¿Se puede emitir una más?
 *
 * Devuelve `{ hay, cuantas }`. `cuantas` es para el registro del servidor, no
 * para la respuesta: no se lo mandes al cliente.
 */
export async function hayCupo() {
  const cuantas = await cuantasHay();
  return { hay: cuantas < TOPE_TARJETAS, cuantas, tope: TOPE_TARJETAS };
}

/**
 * Lo que se le puede contar a quien está mirando la pantalla: cuánto cuesta y
 * si se está emitiendo. Ni el tope, ni cuántas hay, ni cuántas quedan.
 *
 * Si no se puede preguntar por el cupo, `abierta` va en false: es lo mismo que
 * hará el cobro, y prometer en la pantalla algo que la puerta va a negar es
 * peor que decir que no desde el principio.
 */
export async function paraLaPantalla() {
  const p = await precio();
  let abierta = false;
  try {
    abierta = (await hayCupo()).hay;
  } catch (e) {
    console.error("[ventaTarjeta] no se pudo contar las tarjetas:", e?.message || e);
  }
  return {
    abierta,
    precioUsd: p.usd,
    precioOrigen: p.origen,
    origenPriceUsd: p.origenPriceUsd,
  };
}
