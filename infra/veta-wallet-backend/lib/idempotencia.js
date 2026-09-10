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
/**
 * Normaliza el sello que manda el cliente.
 *
 * Se fuerza a texto y se recorta a 200 caracteres por dos motivos:
 *
 *   - Si llegara un objeto (`{"$ne": null}`), acabaria dentro de una consulta a
 *     Mongo. Aqui no daria acceso a nada ajeno —el usuario sale del token, no
 *     del cuerpo— pero no hay ninguna razon para dejar que datos del cliente
 *     entren como operadores en una consulta.
 *   - Un sello larguisimo revienta el limite de clave del indice, y ese error
 *     no es 11000, asi que saldria como un 500 en vez de como lo que es.
 */
export function normalizarSello(valor) {
  if (valor == null) return null;
  if (typeof valor !== "string" && typeof valor !== "number") return null;
  const s = String(valor).trim();
  return s ? s.slice(0, 200) : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// EL SELLO CUANDO EL CLIENTE NO MANDA NINGUNO
//
// Todo el mecanismo de arriba vivia detras de un `if (sello)` en el
// controlador: si el cuerpo no traia `idempotencyKey`, el envio se firmaba y se
// emitia sin ningun control de duplicado. La proteccion la elegia quien tenia
// que estar protegido, y encima cada version vieja de la aplicacion que sigue
// instalada en un telefono la elige que no.
//
// Rechazar de golpe a esos clientes tampoco sirve: le romperia el envio a gente
// que no hizo nada mal y que no puede actualizar hoy. Asi que cuando no viene
// sello se DERIVA uno del contenido: misma cuenta, misma cadena, mismo destino,
// mismo monto, dentro de la misma ventana de tiempo.
//
// POR QUE TRES MINUTOS Y NO OTRA COSA
//
// La ventana tiene que ser mas larga que el rato en el que un envio se repite
// SOLO, y mas corta que el rato en el que alguien repite un envio A PROPOSITO.
//
//   - El limite de abajo lo pone el cliente: la aplicacion espera hasta 90 s
//     antes de darse por vencida (ver el comentario de `send`, sobre la H12 de
//     Heroku a los 30 s). El caso tipico es justamente ese: se corta la
//     respuesta, la persona cree que no salio y vuelve a darle. Con una ventana
//     de 60 s ese reintento cae fuera y se manda dos veces, que es el fallo que
//     esto existe para impedir. 90 s mas margen para volver a escribir la
//     contraseña: tres minutos.
//   - El limite de arriba lo pone la vida real: repetir a proposito el mismo
//     monto EXACTO, al mismo destino, en la misma cadena, antes de tres
//     minutos. Pasa —pagar dos cuotas iguales seguidas— pero es raro, y cuando
//     pasa esto no pierde el dinero ni miente: devuelve el hash del primer
//     envio con `repetido: true`, y la aplicacion puede decir «esto ya lo
//     mandaste, ¿seguro?». Equivocarse hacia este lado cuesta una pregunta;
//     equivocarse hacia el otro cuesta el dinero de alguien.
//
// Veinticuatro horas —lo que dura el sello— habria sido lo comodo de escribir y
// habria bloqueado durante todo un dia el segundo pago legitimo del mismo
// importe. Por eso la ventana es propia y no la del documento.
//
// LA COSTURA ENTRE VENTANAS
//
// Partir el tiempo en tramos deja una costura: dos toques separados por un
// segundo, uno a cada lado del corte, darian sellos distintos y pasarian los
// dos. Por eso se devuelven DOS sellos, el de la ventana en curso y el de la
// anterior, y quien reserva mira primero si el anterior ya existe. Asi la
// costura deja de existir para el caso que importa.
//
// El sello derivado lleva el prefijo `auto:` para que se distinga a simple
// vista, en la base y en cualquier registro, de uno que mando el cliente.
// ─────────────────────────────────────────────────────────────────────────────
export const VENTANA_DERIVADA_MS = 3 * 60 * 1000;

/** [sello de la ventana en curso, sello de la anterior]. */
export function sellosDerivados(usuario, datosDelEnvio, ahora = Date.now()) {
  const base = huellaDe({ usuario, ...datosDelEnvio });
  const ventana = Math.floor(ahora / VENTANA_DERIVADA_MS);
  return [`auto:${base}:${ventana}`, `auto:${base}:${ventana - 1}`];
}

/**
 * El sello que le toca a este envio.
 *
 * Si el cliente mando uno, ese manda: es el unico que sabe si dos peticiones
 * suyas son el mismo envio o dos distintos.
 *
 * Si no mando ninguno, se deriva. Y se prefiere el de la ventana ANTERIOR
 * cuando ya existe en la base, porque entonces el intento de ahora es la
 * continuacion de aquel y tiene que encontrarselo, no estrenar uno nuevo al
 * otro lado de la costura.
 */
export async function selloDelEnvio(selloDelCliente, usuario, datosDelEnvio) {
  const limpio = normalizarSello(selloDelCliente);
  if (limpio) return { clave: limpio, derivado: false };

  const [actual, anterior] = sellosDerivados(usuario, datosDelEnvio);
  const previo = await Idempotencia.findOne({ clave: anterior, usuario });
  return { clave: previo ? anterior : actual, derivado: true };
}

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

/**
 * El envio salio: se guarda la respuesta para devolverla en los reintentos.
 *
 * NUNCA lanza. Es deliberado: para cuando se llama, la transferencia YA se
 * emitio y ya se guardo en el historial. Si un fallo al anotar el sello se
 * propagara, el controlador caeria en su catch y le devolveria un error al
 * usuario por un envio que en realidad salio bien — el peor resultado posible,
 * porque le invita a repetirlo.
 *
 * El precio de tragarse el fallo es que el sello queda en "en-curso" y un
 * reintento recibe un 409 hasta que caduca. Molesto, pero del lado seguro: no
 * transfiere dos veces.
 */
export async function completar(clave, usuario, respuesta) {
  try {
    await Idempotencia.updateOne(
      { clave, usuario },
      { $set: { estado: "listo", respuesta } }
    );
  } catch (error) {
    console.error("[idempotencia] no se pudo anotar el sello como listo:", error?.message);
  }
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
