import { createHash } from "crypto";
import Idempotencia from "../models/Idempotencia";

// Idempotencia de los envios de dinero.
//
// EL PROBLEMA QUE RESUELVE
//
// Mandar dinero no es una operacion que se pueda repetir sin consecuencias. Y
// se repite sola con facilidad: el usuario toca dos veces, la red va lenta y
// el telefono reintenta, o la respuesta se pierde de vuelta y nadie sabe si la
// transferencia salio. En todos esos casos llega un segundo POST identico, y
// sin esto el backend firma y emite una segunda transferencia.
//
// LA REGLA DE ORO: RESERVAR ANTES DE FIRMAR
//
// El sello se reserva ANTES de emitir la transaccion, nunca despues. Si se
// reservara despues, dos peticiones simultaneas pasarian las dos la
// comprobacion y las dos transferirian, que es exactamente lo que se quiere
// impedir.
//
// La reserva se apoya en el indice unico de la coleccion: cuando dos llegan a
// la vez, la base deja entrar una y a la otra le devuelve un error de clave
// duplicada. Eso convierte una carrera en una respuesta clara.
//
// QUE PASA CUANDO ALGO FALLA
//
// Depende de si la transaccion pudo haber salido o no:
//
//   - Fallo ANTES de emitir (contraseña mala, saldo insuficiente, nonce): el
//     sello se libera, porque reintentar es seguro y correcto.
//   - Fallo DUDOSO (se corto la red al emitir): el sello se queda marcado como
//     dudoso. Un reintento con el mismo sello NO vuelve a transferir: devuelve
//     el aviso de que hay que verificar en la cadena antes de repetir.
//
// Preferir molestar al usuario con una verificacion antes que arriesgarse a
// mandar su dinero dos veces.

/** Huella de lo que se pidio, para detectar el mismo sello con otros datos. */
export function huellaDe(datos) {
  return createHash("sha256").update(JSON.stringify(datos)).digest("hex").slice(0, 32);
}

/**
 * Codigos de ethers en los que se sabe que la transaccion NO llego a emitirse.
 * Con cualquiera de ellos reintentar es seguro, asi que el sello se libera.
 */
const FALLOS_ANTES_DE_EMITIR = new Set([
  "INSUFFICIENT_FUNDS",
  "NONCE_EXPIRED",
  "REPLACEMENT_UNDERPRICED",
  "UNPREDICTABLE_GAS_LIMIT",
  "INVALID_ARGUMENT",
  "CALL_EXCEPTION",
  "NUMERIC_FAULT",
]);

export const seSabeQueNoSalio = (error) => FALLOS_ANTES_DE_EMITIR.has(error?.code);

/**
 * Reserva el sello. Devuelve que hacer:
 *
 *   { accion: 'seguir' }                  primera vez: adelante
 *   { accion: 'devolver', respuesta }     ya se hizo: devolver lo mismo
 *   { accion: 'esperar' }                 hay otro intento en curso ahora mismo
 *   { accion: 'verificar', error }        quedo en duda: no repetir a ciegas
 *   { accion: 'conflicto' }               mismo sello, datos distintos
 */
export async function reservar(clave, usuario, datosDelEnvio) {
  const huella = huellaDe(datosDelEnvio);

  try {
    await Idempotencia.create({ clave, usuario, huella, estado: "en-curso" });
    return { accion: "seguir", huella };
  } catch (error) {
    // 11000 = clave duplicada. Es la señal de que este sello ya existe.
    if (error?.code !== 11000) throw error;
  }

  const previo = await Idempotencia.findOne({ clave, usuario });
  if (!previo) {
    // Caduco entre la insercion fallida y esta lectura. Rarisimo, pero si pasa
    // es mas seguro pedir un sello nuevo que asumir cualquier cosa.
    return { accion: "conflicto" };
  }

  if (previo.huella !== huella) return { accion: "conflicto" };
  if (previo.estado === "listo") return { accion: "devolver", respuesta: previo.respuesta };
  if (previo.estado === "dudoso") return { accion: "verificar", error: previo.error };
  return { accion: "esperar" };
}

/** El envio salio: se guarda la respuesta para devolverla en los reintentos. */
export async function completar(clave, usuario, respuesta) {
  await Idempotencia.updateOne(
    { clave, usuario },
    { $set: { estado: "listo", respuesta } }
  );
}

/**
 * El envio fallo.
 *
 * @param seguroQueNoSalio  si consta que la transaccion no llego a emitirse.
 *                          Solo entonces se libera el sello para reintentar.
 */
export async function marcarFallo(clave, usuario, error, seguroQueNoSalio) {
  if (seguroQueNoSalio) {
    await Idempotencia.deleteOne({ clave, usuario });
    return;
  }
  await Idempotencia.updateOne(
    { clave, usuario },
    { $set: { estado: "dudoso", error: String(error?.message || error).slice(0, 300) } }
  );
}

/**
 * Traduce el resultado de `reservar` a una respuesta HTTP.
 * Devuelve `null` si hay que seguir adelante con el envio.
 */
export function responderSiCorresponde(res, reserva) {
  switch (reserva.accion) {
    case "devolver":
      // 200 con la respuesta original: para la app es como si hubiera
      // funcionado, que es la verdad — funciono la primera vez.
      return res.status(200).json({ ...reserva.respuesta, repetido: true });

    case "esperar":
      return res.status(409).json({
        message:
          "Ya hay un envio en curso con este mismo sello. Espere el resultado; " +
          "no lo reintente todavia.",
        codigo: "en-curso",
      });

    case "verificar":
      return res.status(409).json({
        message:
          "Un intento anterior de este envio quedo sin confirmar. Revise si la " +
          "transaccion salio antes de repetirla.",
        codigo: "verificar-antes-de-repetir",
        detalle: reserva.error,
      });

    case "conflicto":
      return res.status(422).json({
        message:
          "Este sello ya se uso para un envio con otros datos. Use un sello nuevo.",
        codigo: "sello-reutilizado",
      });

    default:
      return null;
  }
}
