// Vender ORIGEN por USDT. Tres rutas, y ninguna hace cuentas: todas se apoyan
// en lib/venta.js, que es donde vive el orden de escritura que impide pagar
// dos veces y pagar sin cobrar.
//
// LO QUE ESTE ARCHIVO CUIDA. Que una venta sea de QUIEN LA PIDE: `mias` filtra
// por el usuario de la sesión y no acepta un id de fuera. Y que un error de
// servidor no cuente por qué: hacia afuera va una frase, y el motivo de
// verdad va al log de la casa.

const venta = require('../lib/venta');
const tarjeta = require('../lib/tarjeta');
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

// ── GET /ventas/tarjeta ─────────────────────────────────────────────────────
//
// Dónde se recarga MI tarjeta. Es lo que hace que «recargar la tarjeta» sea un
// botón y no un ejercicio de copiar cuarenta y dos caracteres sin equivocarse.
//
// La dirección se busca con la `direccionWallet` de la SESIÓN, nunca con una
// que venga en la petición: si el cliente pudiera pedir la de otro, cualquiera
// con cuenta iría descubriendo dónde se recarga la tarjeta de los demás.
async function miTarjeta(req, res) {
  try {
    const usuario = await Usuario.findById(req.usuario.id).lean();
    if (!usuario) return res.status(404).json({ error: 'No existe esa cuenta.', codigo: 'NO_EXISTE' });
    /* Un 200 con `tiene:false` y no un 404: no tener tarjeta todavía no es un
       error de nadie, y la pantalla necesita poder explicarlo con calma. */
    return res.json(await tarjeta.recargaDe(usuario.direccionWallet));
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

// ── GET /ventas/limites ─────────────────────────────────────────────────────
// Publica y sin sesion, como /salud y /tarifas: el techo de lo que la casa
// puede pagar es de quien va a vender, antes de vender. Se cachea quince
// segundos porque lee la caja por RPC y la sondea toda pantalla abierta.
const CAPACIDAD_MS = 15_000;
let capacidadCache = { en: 0, promesa: null };
async function limites(req, res) {
  try {
    if (!capacidadCache.promesa || Date.now() - capacidadCache.en >= CAPACIDAD_MS) {
      const promesa = venta.capacidad();
      capacidadCache = { en: Date.now(), promesa };
      promesa.catch(() => { if (capacidadCache.promesa === promesa) capacidadCache = { en: 0, promesa: null }; });
    }
    return res.json(await capacidadCache.promesa);
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

module.exports = { cotizar, vender, mias, limites, miTarjeta };
