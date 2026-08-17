// Mover dinero: transferir a otro cliente, cambiar de moneda, y ver el
// historial de la cuenta.
//
// Todo lo que hay aquí termina en un `asentar()`. Este archivo no sabe restar:
// arma el asiento, lo manda por la única puerta, y traduce el error a HTTP.
//
// ══ EL SELLO DE IDEMPOTENCIA ═══════════════════════════════════════════════
//
// Cada operación exige una `ref` del cliente. Si el teléfono pierde la señal
// justo después de mandar la transferencia y reintenta, la segunda llega con
// la misma ref y no manda el dinero dos veces. Es obligatoria a propósito:
// generarla aquí serviría de nada, porque el reintento traería otra.

const { Usuario, Asiento } = require('../models');
const { moneda, aMinimas, aTexto, REFERENCIA } = require('../lib/monedas');
const { asentar } = require('../lib/asientos');
const { cotizar, convertir } = require('../lib/cambio');
const { comision, cabeEnLimites } = require('../lib/tarifas');
const { movidoPor } = require('../lib/consumo');
const genesis = require('../lib/genesis');
const { cuentaDe, pintar } = require('./cuentasController');

// La cuenta donde queda la posición que la casa toma al cambiar divisas. No es
// custodia de nadie: es riesgo propio, y por eso se mira aparte.
const POSICION = 'posicion.cambio';

/** Una ref limpia: del cliente, acotada, y con el gid dentro para que la ref
 *  de un usuario no pueda chocar con la de otro y bloquearle una operación. */
function refDe(gid, cruda) {
  const s = String(cruda || '').trim();
  if (!/^[A-Za-z0-9._:-]{8,80}$/.test(s)) return null;
  return `${gid}:${s}`;
}

/** El usuario de la sesión, ya comprobado que puede mover dinero. */
async function quienMueve(req, res) {
  const usuario = await Usuario.findOne({ gid: req.usuario.gid });
  if (!usuario) {
    res.status(401).json({ error: 'La sesion no es valida.', codigo: 'SESION_INVALIDA' });
    return null;
  }
  if (usuario.verificada !== true) {
    res.status(403).json({
      error: 'Para mover dinero hace falta terminar la verificación de identidad.',
      codigo: 'IDENTIDAD_SIN_VERIFICAR',
    });
    return null;
  }
  return usuario;
}

/**
 * ¿Cabe esta salida en los límites de esta persona? Devuelve true si sí, y si
 * no, YA contestó al cliente.
 *
 * Se le dice al usuario cuánto lleva usado y cuál es su tope. Es un dato suyo
 * y ocultárselo solo consigue que reintente sin entender por qué no pasa.
 */
async function pasaLimites(res, usuario, montoMin, cod) {
  const movido = await movidoPor(cuentaDe(usuario.gid));
  if (!movido) {
    // No se pudo medir. Y no poder medir es un NO: dejar pasar porque el
    // proveedor de tasas está caído es justo cuando conviene mover dinero que
    // no debería moverse.
    res.status(503).json({
      error: 'Ahora mismo no se puede comprobar el límite. Probá en un momento.',
      codigo: 'SIN_TASA',
    });
    return false;
  }
  const veredicto = await cabeEnLimites(usuario.nivel || 1, montoMin, cod, movido);
  if (!veredicto.cabe) {
    if (veredicto.motivo === 'SIN_TASA') {
      res.status(503).json({
        error: 'Ahora mismo no se puede comprobar el límite. Probá en un momento.',
        codigo: 'SIN_TASA',
      });
      return false;
    }
    res.status(400).json({
      error: veredicto.motivo === 'LIMITE_DIARIO'
        ? 'Esta operación pasa tu límite de hoy.'
        : 'Esta operación pasa tu límite de este mes.',
      codigo: veredicto.motivo,
      limite: {
        usado: aTexto(veredicto.usado, REFERENCIA),
        tope: aTexto(veredicto.tope, REFERENCIA),
        estaOperacion: aTexto(veredicto.intento, REFERENCIA),
        moneda: REFERENCIA,
        nivel: usuario.nivel || 1,
      },
    });
    return false;
  }
  return true;
}

/** Traduce el error del libro a HTTP sin filtrar detalles internos. */
function alFallar(res, e, que) {
  if (e?.codigo === 'SALDO_INSUFICIENTE') {
    return res.status(400).json({ error: 'No hay saldo suficiente.', codigo: 'SALDO_INSUFICIENTE' });
  }
  if (e?.codigo === 'CONTENCION') {
    return res.status(503).json({ error: 'Intentalo de nuevo en un momento.', codigo: 'REINTENTA' });
  }
  console.error(`[movimientos] ${que}: ${e.message}`);
  return res.status(503).json({ error: 'No se pudo completar la operación.', codigo: 'NO_SE_PUDO' });
}

// ── POST /movimientos/transferir ────────────────────────────────────────────
// { ref, para (gid), moneda, monto } → mueve saldo entre dos clientes.
async function transferir(req, res) {
  const cod = String(req.body?.moneda || '').toUpperCase();
  const m = moneda(cod);
  if (!m) return res.status(400).json({ error: 'Esa moneda no existe.', codigo: 'MONEDA_DESCONOCIDA' });

  const monto = aMinimas(req.body?.monto, cod);
  if (!monto || BigInt(monto) <= 0n) {
    // aMinimas ya rechaza lo que no se entiende; aquí solo falta el cero.
    return res.status(400).json({ error: 'El monto no es válido.', codigo: 'MONTO_INVALIDO' });
  }

  const destino = String(req.body?.para || '').trim();
  if (!destino) return res.status(400).json({ error: 'Falta a quién.', codigo: 'DESTINO_FALTA' });
  if (destino === req.usuario.gid) {
    return res.status(400).json({ error: 'No podés transferirte a vos mismo.', codigo: 'DESTINO_ES_ORIGEN' });
  }

  const ref = refDe(req.usuario.gid, req.body?.ref);
  if (!ref) return res.status(400).json({ error: 'Falta el sello de la operación.', codigo: 'REF_FALTA' });

  try {
    const usuario = await quienMueve(req, res);
    if (!usuario) return;

    // El que recibe tiene que existir Y estar verificado: mandar dinero a una
    // cuenta sin KYC es exactamente el agujero que la norma quiere cerrado.
    const otro = await Usuario.findOne({ gid: destino });
    if (!otro || otro.verificada !== true) {
      return res.status(400).json({
        error: 'Esa cuenta no puede recibir transferencias.', codigo: 'DESTINO_NO_APTO',
      });
    }

    if (!await pasaLimites(res, usuario, monto, cod)) return;

    /* La comisión sale del que manda, no del que recibe: quien te manda 100
       tiene que poder decirte «te mandé 100» y que te lleguen 100. Se le
       descuenta a él, aparte, y va a la cuenta de ingresos con su nombre. */
    const cargo = comision('transferencia', monto, cod);
    const lineas = [
      { cuenta: cuentaDe(usuario.gid), tipo: 'pasivo', moneda: cod, debe: monto },
      { cuenta: cuentaDe(otro.gid), tipo: 'pasivo', moneda: cod, haber: monto },
    ];
    if (BigInt(cargo) > 0n) {
      lineas.push({ cuenta: cuentaDe(usuario.gid), tipo: 'pasivo', moneda: cod, debe: cargo });
      lineas.push({ cuenta: 'ingreso.comisiones', tipo: 'ingreso', moneda: cod, haber: cargo });
    }

    const { asiento, repetido } = await asentar({
      ref, glosa: `Transferencia de ${usuario.gid} a ${otro.gid}`
        + (BigInt(cargo) > 0n ? ` (comisión ${aTexto(cargo, cod)} ${cod})` : ''),
      lineas,
    }, { clase: 'transferencia' });

    // El reporte al monitoreo va DESPUÉS y no puede tumbar la operación: el
    // dinero ya se movió y deshacerlo porque el reportero tosió sería peor.
    genesis.reportarMovimiento(usuario.gid, {
      id: asiento.ref, tipo: 'transferencia_fiat', moneda: cod,
      monto: aTexto(monto, cod), contraparte: otro.gid,
    });

    return res.json({
      ref: asiento.ref, repetido, moneda: cod,
      monto: pintar(monto, cod),
      comision: pintar(cargo, cod),
      total: pintar((BigInt(monto) + BigInt(cargo)).toString(), cod),
    });
  } catch (e) {
    return alFallar(res, e, 'transferencia');
  }
}

// ── GET /movimientos/cotizar?de=USD&a=HNL&monto=100 ─────────────────────────
// La cotización ANTES de cambiar. Sin tasa real devuelve 503 y la pantalla
// pinta un guion: nunca una tasa inventada.
async function cotizacion(req, res) {
  const de = String(req.query?.de || '').toUpperCase();
  const a = String(req.query?.a || '').toUpperCase();
  const c = await cotizar(de, a);
  if (!c) {
    return res.status(503).json({
      error: 'Ahora mismo no hay tasa para ese par.', codigo: 'SIN_TASA',
    });
  }
  const salida = { cotizacion: c };
  if (req.query?.monto) {
    const min = aMinimas(req.query.monto, de);
    if (min) {
      const destino = convertir(min, de, a, c.aplicada);
      salida.simulacion = { entrega: pintar(min, de), recibe: pintar(destino, a) };
    }
  }
  return res.json(salida);
}

// ── POST /movimientos/cambiar ───────────────────────────────────────────────
// { ref, de, a, monto } → cambia de una moneda propia a otra propia.
async function cambiar(req, res) {
  const de = String(req.body?.de || '').toUpperCase();
  const a = String(req.body?.a || '').toUpperCase();
  if (!moneda(de) || !moneda(a)) {
    return res.status(400).json({ error: 'Esa moneda no existe.', codigo: 'MONEDA_DESCONOCIDA' });
  }
  if (de === a) return res.status(400).json({ error: 'Son la misma moneda.', codigo: 'MISMO_PAR' });

  const monto = aMinimas(req.body?.monto, de);
  if (!monto || BigInt(monto) <= 0n) {
    return res.status(400).json({ error: 'El monto no es válido.', codigo: 'MONTO_INVALIDO' });
  }
  const ref = refDe(req.usuario.gid, req.body?.ref);
  if (!ref) return res.status(400).json({ error: 'Falta el sello de la operación.', codigo: 'REF_FALTA' });

  try {
    const usuario = await quienMueve(req, res);
    if (!usuario) return;

    if (!await pasaLimites(res, usuario, monto, de)) return;

    // La tasa se pide AQUÍ y se guarda en la glosa del asiento. Un cambio con
    // una tasa que no quedó escrita es un cambio que nadie puede auditar.
    const c = await cotizar(de, a);
    if (!c) return res.status(503).json({ error: 'Ahora mismo no hay tasa para ese par.', codigo: 'SIN_TASA' });

    const recibe = convertir(monto, de, a, c.aplicada);
    if (BigInt(recibe) <= 0n) {
      // El monto es tan chico que a la otra moneda no llega ni a una unidad.
      // Aceptarlo sería quedarse con el dinero a cambio de nada.
      return res.status(400).json({
        error: 'El monto es demasiado chico para ese cambio.', codigo: 'MONTO_MINIMO',
      });
    }

    const { asiento, repetido } = await asentar({
      ref,
      glosa: `Cambio ${de}→${a} a ${c.aplicada}/${c.escala} (media ${c.media}, margen ${c.margenBps}bps, ${c.cuando || 'sin fecha de fuente'})`,
      lineas: [
        { cuenta: cuentaDe(usuario.gid), tipo: 'pasivo', moneda: de, debe: monto },
        { cuenta: POSICION, tipo: 'activo', moneda: de, haber: monto },
        { cuenta: POSICION, tipo: 'activo', moneda: a, debe: recibe },
        { cuenta: cuentaDe(usuario.gid), tipo: 'pasivo', moneda: a, haber: recibe },
      ],
    }, { clase: 'cambio' });

    genesis.reportarMovimiento(usuario.gid, {
      id: asiento.ref, tipo: 'cambio_divisa',
      moneda: de, monto: aTexto(monto, de),
      monedaDestino: a, montoDestino: aTexto(recibe, a),
    });

    return res.json({
      ref: asiento.ref, repetido,
      entrega: pintar(monto, de), recibe: pintar(recibe, a),
      tasa: c,
    });
  } catch (e) {
    return alFallar(res, e, 'cambio de divisa');
  }
}

// ── GET /movimientos?moneda=USD&pagina=0 ────────────────────────────────────
// El extracto. Se devuelve el asiento ENTERO —las dos patas— porque un
// extracto que solo enseña tu lado es un extracto en el que no se puede
// comprobar nada.
async function historial(req, res) {
  try {
    const cuenta = cuentaDe(req.usuario.gid);
    const cod = String(req.query?.moneda || '').toUpperCase();
    const filtro = { 'lineas.cuenta': cuenta };
    if (moneda(cod)) filtro['lineas.moneda'] = cod;

    const pagina = Math.max(0, Math.min(500, parseInt(req.query?.pagina || '0', 10) || 0));
    const porPagina = 50;
    const docs = await Asiento.find(filtro).sort({ fecha: -1 })
      .skip(pagina * porPagina).limit(porPagina);

    return res.json({
      pagina, porPagina,
      movimientos: docs.map((d) => ({
        ref: d.ref, glosa: d.glosa, fecha: d.fecha, clase: d.clase,
        // Solo las líneas del usuario llevan monto legible; las de la casa se
        // enseñan por nombre de cuenta para que el asiento se pueda cuadrar
        // sin exponer el saldo del banco corresponsal.
        lineas: d.lineas.map((l) => ({
          cuenta: l.cuenta === cuenta ? 'yo' : l.cuenta,
          moneda: l.moneda,
          debe: l.cuenta === cuenta ? aTexto(l.debe, l.moneda) : null,
          haber: l.cuenta === cuenta ? aTexto(l.haber, l.moneda) : null,
        })),
      })),
    });
  } catch (e) {
    console.error(`[movimientos] no se pudo leer el historial: ${e.message}`);
    return res.status(503).json({ error: 'No se pudo leer el historial.', codigo: 'NO_SE_PUDO' });
  }
}

module.exports = { transferir, cotizacion, cambiar, historial, POSICION, refDe };
