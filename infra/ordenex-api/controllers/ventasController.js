// Vender ORIGEN por USDT. Tres rutas, y ninguna hace cuentas: todas se apoyan
// en lib/venta.js, que es donde vive el orden de escritura que impide pagar
// dos veces y pagar sin cobrar.
//
// LO QUE ESTE ARCHIVO CUIDA. Que una venta sea de QUIEN LA PIDE: `mias` filtra
// por el usuario de la sesión y no acepta un id de fuera. Y que un error de
// servidor no cuente por qué: hacia afuera va una frase, y el motivo de
// verdad va al log de la casa.

const venta = require('../lib/venta');
const { Usuario } = require('../models');

const responder = (res, e) => {
  const status = e?.status || 500;
  if (status >= 500) console.error(`[ventas] ${e?.codigo || ''} ${e?.message || e}`);
  return res.status(status).json({
    error: status >= 500 ? 'No se pudo completar la operación.' : e.message,
    codigo: e?.codigo || 'ERROR',
  });
};

// ── POST /ventas/cotizar ────────────────────────────────────────────────────
// { origenWei, red } → lo que saldría, sin comprometer nada.
//
// Existe separada de POST /ventas porque la pantalla necesita enseñar el
// número ANTES de que la persona decida, y pedirlo no puede tener ningún
// efecto. Es una lectura y se comporta como tal.
async function cotizar(req, res) {
  try {
    return res.json(await venta.cotizar(req.body || {}));
  } catch (e) {
    return responder(res, e);
  }
}

// ── POST /ventas ────────────────────────────────────────────────────────────
// { origenWei, red, direccion, ventaKey }
//
// Cobra el ORIGEN y paga el USDT. `ventaKey` es obligatoria y es lo que hace
// que reintentar sea inofensivo: la misma clave devuelve la misma venta sin
// volver a pagar.
async function vender(req, res) {
  try {
    const usuario = await Usuario.findById(req.usuario.id).lean();
    if (!usuario) return res.status(404).json({ error: 'No existe esa cuenta.', codigo: 'NO_EXISTE' });
    return res.json(await venta.vender(usuario, req.body || {}));
  } catch (e) {
    return responder(res, e);
  }
}

// ── GET /ventas ─────────────────────────────────────────────────────────────
async function mias(req, res) {
  try {
    return res.json(await venta.mias(req.usuario.id));
  } catch (e) {
    return responder(res, e);
  }
}

module.exports = { cotizar, vender, mias };
