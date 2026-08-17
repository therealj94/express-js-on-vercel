// La frontera: por dónde entra y por dónde sale el dinero de verdad.
//
// ══ POR QUÉ ESTO NO ES UNA RUTA DE USUARIO ═════════════════════════════════
//
// Un depósito no lo declara quien deposita. Lo confirma quien VIO llegar el
// dinero: el corresponsal que recibió la transferencia, o el agente que contó
// los billetes. Una ruta donde el propio cliente dice «me llegaron mil» es una
// ruta donde cualquiera se acredita mil.
//
// Por eso estas dos rutas van detrás de X-Admin-Key, y la clave vive solo en
// el servidor de operaciones. Cuando haya integración directa con el
// corresponsal, el que llame aquí será el webhook firmado de ese banco y esta
// misma puerta seguirá sirviendo — cambia quién toca, no la puerta.
//
// ══ LO QUE FALTA, DICHO ════════════════════════════════════════════════════
//
// Hoy la confirmación es MANUAL: una persona de operaciones marca el depósito
// contra el extracto del corresponsal. Eso es lo que hay y así está escrito;
// no hay conciliación automática todavía, y fingir que la hay sería peor que
// no tenerla, porque nadie estaría revisando.

const { Usuario } = require('../models');
const { moneda, aMinimas, aTexto } = require('../lib/monedas');
const { asentar, reconciliar } = require('../lib/asientos');
const genesis = require('../lib/genesis');
const { cuentaDe, pintar } = require('./cuentasController');
const { refDe } = require('./movimientosController');

/** Solo operaciones. Sin clave configurada NO entra nadie — nunca «si no hay
 *  clave, pasa». Comparación de longitud constante para no filtrar por tiempo
 *  cuántos caracteres acertó quien prueba. */
function soloOperaciones(req, res, next) {
  const esperada = (process.env.AUCORP_ADMIN_KEY || '').trim();
  if (!esperada) {
    console.error('[tesoreria] AUCORP_ADMIN_KEY no está puesta: la frontera queda cerrada');
    return res.status(503).json({ error: 'El servicio no está configurado.', codigo: 'SIN_CONFIGURAR' });
  }
  const dada = String(req.headers['x-admin-key'] || '');
  const { timingSafeEqual } = require('crypto');
  const a = Buffer.from(dada);
  const b = Buffer.from(esperada);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return res.status(401).json({ error: 'No.', codigo: 'NO_AUTORIZADO' });
  }
  return next();
}

/** La cuenta de la casa donde está el dinero de esa plaza. Una por moneda:
 *  mezclar el corresponsal hondureño con el guatemalteco en una sola cuenta
 *  haría imposible saber cuánto hay REALMENTE en cada banco. */
const custodiaDe = (cod) => `banco.corresponsal.${cod.toLowerCase()}`;

async function movimientoDeFrontera(req, res, { entra }) {
  const cod = String(req.body?.moneda || '').toUpperCase();
  const m = moneda(cod);
  if (!m) return res.status(400).json({ error: 'Esa moneda no existe.', codigo: 'MONEDA_DESCONOCIDA' });

  const monto = aMinimas(req.body?.monto, cod);
  if (!monto || BigInt(monto) <= 0n) {
    return res.status(400).json({ error: 'El monto no es válido.', codigo: 'MONTO_INVALIDO' });
  }

  const gid = String(req.body?.gid || '').trim();
  if (!gid) return res.status(400).json({ error: 'Falta de quién.', codigo: 'GID_FALTA' });

  const ref = refDe(gid, req.body?.ref);
  if (!ref) return res.status(400).json({ error: 'Falta el sello de la operación.', codigo: 'REF_FALTA' });

  // El comprobante NO es opcional. Un asiento de frontera sin referencia al
  // extracto del banco es un asiento que en una auditoría no se puede seguir.
  const comprobante = String(req.body?.comprobante || '').trim().slice(0, 200);
  if (!comprobante) {
    return res.status(400).json({
      error: 'Falta el comprobante del corresponsal o del agente.', codigo: 'COMPROBANTE_FALTA',
    });
  }

  try {
    const usuario = await Usuario.findOne({ gid });
    if (!usuario) return res.status(404).json({ error: 'No hay tal cuenta.', codigo: 'NO_EXISTE' });
    if (usuario.verificada !== true) {
      return res.status(403).json({
        error: 'Esa cuenta no está verificada.', codigo: 'IDENTIDAD_SIN_VERIFICAR',
      });
    }

    const banco = custodiaDe(cod);
    const lineas = entra
      ? [
        { cuenta: banco, tipo: 'activo', moneda: cod, debe: monto },
        { cuenta: cuentaDe(gid), tipo: 'pasivo', moneda: cod, haber: monto },
      ]
      : [
        { cuenta: cuentaDe(gid), tipo: 'pasivo', moneda: cod, debe: monto },
        { cuenta: banco, tipo: 'activo', moneda: cod, haber: monto },
      ];

    const { asiento, repetido } = await asentar({
      ref,
      glosa: `${entra ? 'Depósito' : 'Retiro'} ${cod} de ${gid} — ${comprobante}`,
      lineas,
    }, { clase: entra ? 'deposito' : 'retiro' });

    genesis.reportarMovimiento(gid, {
      id: asiento.ref, tipo: entra ? 'deposito_fiat' : 'retiro_fiat',
      moneda: cod, monto: aTexto(monto, cod), comprobante,
    });

    return res.json({ ref: asiento.ref, repetido, moneda: cod, monto: pintar(monto, cod) });
  } catch (e) {
    if (e?.codigo === 'SALDO_INSUFICIENTE') {
      return res.status(400).json({ error: 'No hay saldo suficiente.', codigo: 'SALDO_INSUFICIENTE' });
    }
    console.error(`[tesoreria] ${entra ? 'depósito' : 'retiro'}: ${e.message}`);
    return res.status(503).json({ error: 'No se pudo completar la operación.', codigo: 'NO_SE_PUDO' });
  }
}

// ── POST /tesoreria/deposito ────────────────────────────────────────────────
const deposito = (req, res) => movimientoDeFrontera(req, res, { entra: true });

// ── POST /tesoreria/retiro ──────────────────────────────────────────────────
const retiro = (req, res) => movimientoDeFrontera(req, res, { entra: false });

// ── GET /tesoreria/reconciliar ──────────────────────────────────────────────
// Compara el atajo contra el libro. Solo mira; para que ARREGLE hay que
// pedirlo con ?arreglar=1, porque una reparación silenciosa de la contabilidad
// es justo lo que nadie debería poder hacer sin decidirlo.
async function revisar(req, res) {
  try {
    const r = await reconciliar({ arreglar: req.query?.arreglar === '1' });
    return res.json(r);
  } catch (e) {
    console.error(`[tesoreria] no se pudo reconciliar: ${e.message}`);
    return res.status(503).json({ error: 'No se pudo reconciliar.', codigo: 'NO_SE_PUDO' });
  }
}

module.exports = { soloOperaciones, deposito, retiro, revisar, custodiaDe };
