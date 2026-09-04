// Comprar ORIGEN con USDT. Cuatro rutas y ninguna hace cuentas: todas se
// apoyan en lib/compra.js, que es donde vive la regla del precio congelado.
//
// LO QUE ESTE ARCHIVO CUIDA. Que la orden sea de QUIEN LA PIDE. Un id de orden
// es un ObjectId y se puede adivinar de a poco; sin comprobar el dueño,
// cualquiera con sesión podría leer a cuánto compró otro y confirmarle un
// recálculo que no vio. La comprobación va dentro de lib/compra.js, en la
// misma consulta, para que no dependa de que este archivo se acuerde.

const compra = require('../lib/compra');
const { Usuario } = require('../models');

const responder = (res, e) => {
  const status = e?.status || 500;
  if (status >= 500) console.error(`[compras] ${e?.codigo || ''} ${e?.message || e}`);
  return res.status(status).json({
    error: status >= 500 ? 'No se pudo completar la operación.' : e.message,
    codigo: e?.codigo || 'ERROR',
  });
};

// ── POST /compras ───────────────────────────────────────────────────────────
// { montoMicro, cadena, aceptoRecalculo, reglaRecalculoVersion }
//
// Congela un precio. No reserva nada y no promete inventario: una orden es una
// promesa de PRECIO por un rato, y mientras no llegue dinero no hay nada que
// respaldar. Ver la cabecera de lib/compra.js.
async function abrir(req, res) {
  try {
    // Los términos los exige el router con exigirTerminos, igual que para
    // colocar una orden: comprar es una operación con dinero y el aviso de
    // riesgo aplica entero.
    const usuario = await Usuario.findById(req.usuario.id).lean();
    if (!usuario) return res.status(404).json({ error: 'No existe esa cuenta.', codigo: 'NO_EXISTE' });
    return res.json(await compra.abrir(usuario, req.body || {}));
  } catch (e) {
    return responder(res, e);
  }
}

// ── GET /compras/:id ────────────────────────────────────────────────────────
// El sondeo de la pantalla, cada ocho segundos. Barato a propósito: una
// lectura de un documento, sin tocar la cadena.
async function ver(req, res) {
  try {
    return res.json(await compra.ver(req.usuario.id, req.params.id));
  } catch (e) {
    return responder(res, e);
  }
}

// ── GET /compras ────────────────────────────────────────────────────────────
async function mias(req, res) {
  try {
    return res.json(await compra.mias(req.usuario.id));
  } catch (e) {
    return responder(res, e);
  }
}

// ── POST /compras/:id/confirmar ─────────────────────────────────────────────
// La persona vio el precio recalculado y dijo que sí. Sin esto, una orden
// vencida NO se entrega: la pantalla prometió avisar antes, y avisar sin
// esperar respuesta no es avisar.
async function confirmar(req, res) {
  try {
    return res.json(await compra.confirmarRecalculo(req.usuario.id, req.params.id));
  } catch (e) {
    return responder(res, e);
  }
}

// ── POST /compras/:id/cancelar ──────────────────────────────────────────────
// Solo se cancela lo que todavía no tiene dinero encima.
async function cancelar(req, res) {
  try {
    return res.json(await compra.cancelar(req.usuario.id, req.params.id));
  } catch (e) {
    return responder(res, e);
  }
}

module.exports = { abrir, ver, mias, confirmar, cancelar };
