// SFSP-410 · entregar en cadena el ORIGEN de un deposito de USDT.
//
// Lo usa depositController SOLO con SFSP410_EMISION=1. Apagado, nada de esto
// corre. Ver SFSP410.md y lib/sfsp410.js.
//
// Una fila de EntregaOrigen por deposito. Cada intento llama a
// sfsp410.entregarOrigen con la MISMA referencia de pago, asi que intentar dos
// veces nunca entrega dos veces: la segunda choca con OperationReplay y se da
// por entregada con el hash de la primera.
//
// QUE SE REINTENTA SOLO Y QUE NO
//   'pendiente'      no se llego a firmar (red caida, configuracion): si.
//   'en-duda'        se firmo y no hubo respuesta: si — con la misma
//                    referencia es seguro, o entrega o encuentra la primera.
//   'esperar'        gobierno en pausa: si, espaciado.
//   'cola-gobierno'  cupo agotado / sin cupo / sobre el maximo: NO. Reintentar
//                    contra un cupo vacio es un bucle. Vuelve a la fila con
//                    reencolar() cuando gobierno lo resuelva.
//   'rechazada', 'revisar': NO. Las mira una persona.
//
// Los imports van en una linea cada uno (las pruebas cargan este archivo
// quitandolos).

import EntregaOrigen from "../models/EntregaOrigen";
import sfsp410 from "./sfsp410";

/** Cuanto se espera entre dos intentos automaticos de la misma entrega. */
const ESPACIO_MS = Number(process.env.SFSP410_REINTENTO_MS || 60000);
const REINTENTABLES = ["pendiente", "en-duda", "esperar"];

const ESTADO_DE = {
  entregada: "entregada",
  "ya-entregado": "entregada",
  "cola-gobierno": "cola-gobierno",
  esperar: "esperar",
  rechazada: "rechazada",
  "en-duda": "en-duda",
  revisar: "revisar",
};

/**
 * Un intento de entrega. Nunca lanza: deja el resultado escrito en la fila y
 * la devuelve.
 */
export async function intentarEntrega(entrega) {
  const ahora = new Date();
  let cambios;
  try {
    // REV-410-06 · se espera el minado. Sin esperar, 'entregada' significaba
    // "enviada": una transaccion que se minaba revertida (otro proceso gasto el
    // cupo en el mismo bloque) o que se caia del mempool dejaba la fila
    // 'entregada' sin ORIGEN entregado, y 'entregada' no se reintenta nunca.
    // Coste: la peticion espera un bloque; si pasa el plazo queda 'en-duda',
    // que se reintenta sola y es segura por la referencia de pago.
    const r = await sfsp410.entregarOrigen(entrega.destino, entrega.origenWei, entrega.canonica, entrega.evidenceRoot, { esperar: true });
    // Revertida al minar sin que la referencia este gastada: no salio nada, se
    // puede volver a intentar (si fue el cupo, el siguiente intento lo dira).
    const estado = r.codigo === "REVERTIDA_AL_MINAR" ? "pendiente" : ESTADO_DE[r.estado] || "revisar";
    cambios = {
      estado,
      codigo: r.ok ? (r.estado === "ya-entregado" ? "YA_ENTREGADO" : null) : r.codigo || null,
      mensaje: r.ok ? (r.discrepancia || null) : r.mensaje || null,
      hash: r.hash || entrega.hash || null,
      entregadaEn: r.ok ? ahora : null,
    };
    if (r.discrepancia) console.error(`[sfsp410] DISCREPANCIA en la entrega ${entrega._id}: ${r.discrepancia}`);
    if (estado === "cola-gobierno") console.error(`[sfsp410] cola de gobierno: entrega ${entrega._id} · ${r.codigo}`);
    if (estado === "en-duda") console.error(`[sfsp410] EN DUDA: entrega ${entrega._id} (${r.hash || "sin hash"})`);
  } catch (e) {
    // Solo lanza ANTES de firmar: no hay nada en vuelo, se reintenta despues.
    cambios = { estado: "pendiente", codigo: e.codigo || "ERROR", mensaje: e.message };
    console.error(`[sfsp410] entrega ${entrega._id} sin salir: ${e.codigo || ""} ${e.message}`);
  }
  const fila = await EntregaOrigen.findOneAndUpdate(
    { _id: entrega._id, estado: { $ne: "entregada" } },
    { $set: { ...cambios, ultimoIntento: ahora }, $inc: { intentos: 1 } },
    { new: true }
  );
  return fila || (await EntregaOrigen.findById(entrega._id));
}

/**
 * Reintenta las entregas reintentables de un usuario (o de todos si no se da
 * userId), espaciadas. Devuelve cuantas se intentaron. No lanza.
 */
export async function reintentarPendientes(userId, { limite = 5 } = {}) {
  if (!sfsp410.activo()) return 0;
  const filtro = {
    estado: { $in: REINTENTABLES },
    $or: [{ ultimoIntento: null }, { ultimoIntento: { $lt: new Date(Date.now() - ESPACIO_MS) } }],
  };
  if (userId) filtro.userId = userId;
  let filas = [];
  try {
    filas = await EntregaOrigen.find(filtro).sort({ createdAt: 1 }).limit(limite);
  } catch (e) {
    console.error(`[sfsp410] no se pudieron leer las entregas pendientes: ${e.message}`);
    return 0;
  }
  for (const f of filas) await intentarEntrega(f);
  return filas.length;
}

/**
 * Devuelve a la fila una entrega que espera a gobierno (o que una persona ya
 * reviso). Seguro por la referencia de pago. Para operacion, no para la API.
 */
export async function reencolar(id) {
  const f = await EntregaOrigen.findOneAndUpdate(
    { _id: id, estado: { $in: ["cola-gobierno", "revisar", "esperar", "en-duda"] } },
    { $set: { estado: "pendiente", ultimoIntento: null, mensaje: "devuelta a la fila por una persona" } },
    { new: true }
  );
  return f;
}

/** Lo que ve la pantalla de una entrega. Sin referencias internas. */
export function paraPantalla(e) {
  if (!e) return null;
  return {
    estado: e.estado,
    origenWei: e.origenWei,
    hash: e.hash || null,
    mensaje: e.estado === "entregada" ? null : e.mensaje || null,
  };
}
