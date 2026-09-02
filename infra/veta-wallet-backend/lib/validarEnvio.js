// Lo que se comprueba de un envío ANTES de tocar la contraseña, el sello o la
// llave. Existe porque no se comprobaba nada: `amount` y `recipientAddress`
// pasaban directos a ethers, y ethers sólo protesta cuando ya está firmando.
//
// Lo que eso dejaba pasar, cada cosa con su daño:
//   · dirección malformada → ethers tira al firmar, después de haber quemado
//     el sello de idempotencia de esa persona (ver lib/idempotencia.js);
//   · la dirección cero → la plata se va a 0x000…000 y no vuelve nunca;
//   · mandarse a uno mismo → gas gastado por nada, y el historial se llena de
//     movimientos que parecen entradas;
//   · monto negativo, «abc», Infinity o con 30 decimales → parseEther revienta
//     con un texto de biblioteca que la app enseña tal cual.
//
// Es una función pura para que la prueba la ejercite de verdad, en vez de
// hacer grep sobre el archivo del controlador.
import { isAddress, ZeroAddress } from "ethers";

const DECIMALES_MAX = 18;

// Monto como texto normalizado ("1.5"), o null si no vale.
export function montoValido(amount) {
  if (amount === null || amount === undefined) return null;
  const s = String(amount).trim().replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(s)) return null;        // sólo dígitos y un punto
  const [, dec = ""] = s.split(".");
  if (dec.length > DECIMALES_MAX) return null;
  if (Number(s) <= 0) return null;                   // "0", "0.0"
  return s;
}

/**
 * Devuelve `null` si el envío está bien formado, o `{ code, message }` con la
 * misma forma que ya usa el controlador para sus errores.
 */
export function validarEnvio({ recipientAddress, amount, from }) {
  const a = String(recipientAddress || "").trim();
  if (!isAddress(a)) {
    return { code: "INVALID_ADDRESS", message: "La dirección de destino no es válida." };
  }
  if (a.toLowerCase() === ZeroAddress) {
    return { code: "INVALID_ADDRESS", message: "Esa dirección es la dirección cero: lo que se manda ahí se pierde." };
  }
  if (from && a.toLowerCase() === String(from).toLowerCase()) {
    return { code: "SELF_TRANSFER", message: "No podés mandarte a tu propia dirección." };
  }
  if (!montoValido(amount)) {
    return { code: "INVALID_AMOUNT", message: "El monto tiene que ser un número mayor que cero, con hasta 18 decimales." };
  }
  return null;
}
