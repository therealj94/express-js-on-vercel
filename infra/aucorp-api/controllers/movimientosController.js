// Mover dinero: transferir a otro cliente, cambiar de moneda, y ver el
// historial de la cuenta — con filtros, comprobante por movimiento y extracto
// mensual.
//
// Todo lo que mueve dinero termina en un `asentar()`. Este archivo no sabe
// restar: arma el asiento, lo manda por la única puerta, y traduce el error a
// HTTP.
//
// ══ EL SELLO DE IDEMPOTENCIA ═══════════════════════════════════════════════
//
// Cada operación exige una `ref` del cliente. Si el teléfono pierde la señal
// justo después de mandar la transferencia y reintenta, la segunda llega con
// la misma ref y no manda el dinero dos veces. Es obligatoria a propósito:
// generarla aquí serviría de nada, porque el reintento traería otra.
//
// ══ LA VALIDACIÓN ══════════════════════════════════════════════════════════
//
// Cada dato de entrada pasa por lib/validar.js ANTES de tocar la base. Lo que
// no tiene forma se rechaza con 400 y con el nombre del campo: un monto con
// tres decimales en dólares, un gid mal tecleado, una fecha que no existe.

const { Usuario, Asiento } = require('../models');
const { aTexto, REFERENCIA } = require('../lib/monedas');
const { asentar } = require('../lib/asientos');
const { cotizar, convertir } = require('../lib/cambio');
const { comision, cabeEnLimites } = require('../lib/tarifas');
const { movidoPor } = require('../lib/consumo');
const { armarComprobante, armarExtracto, extractoCsv, CLASES } = require('../lib/comprobante');
const genesis = require('../lib/genesis');
const V = require('../lib/validar');
const { cuentaDe, pintar } = require('./cuentasController');

// La cuenta donde queda la posición que la casa toma al cambiar divisas. No es
// custodia de nadie: es riesgo propio, y por eso se mira aparte.
const POSICION = 'posicion.cambio';

/** Una ref limpia: del cliente, acotada, y con el gid dentro para que la ref
 *  de un usuario no pueda chocar con la de otro y bloquearle una operación.
 *  Lanza ErrorDeEntrada si no tiene forma. */
function refDe(gid, cruda) {
  return `${gid}:${V.ref(cruda)}`;
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
const transferir = V.conEntrada(async (req, res) => {
  const b = V.cuerpo(req);
  const cod = V.moneda(b.moneda);
  const monto = V.monto(b.monto, cod);
  const destino = V.gid(b.para, { campo: 'para', etiqueta: 'el Genesis ID del destinatario' });
  if (destino === req.usuario.gid) {
    return res.status(400).json({ error: 'No podés transferirte a vos mismo.', codigo: 'DESTINO_ES_ORIGEN', campo: 'para' });
  }
  const ref = refDe(req.usuario.gid, b.ref);

  try {
    const usuario = await quienMueve(req, res);
    if (!usuario) return;

    // El que recibe tiene que existir Y estar verificado: mandar dinero a una
    // cuenta sin KYC es exactamente el agujero que la norma quiere cerrado.
    const otro = await Usuario.findOne({ gid: destino });
    if (!otro || otro.verificada !== true) {
      return res.status(400).json({
        error: 'Esa cuenta no puede recibir transferencias.', codigo: 'DESTINO_NO_APTO', campo: 'para',
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
});

// ── GET /movimientos/cotizar?de=USD&a=HNL&monto=100 ─────────────────────────
// La cotización ANTES de cambiar. Sin tasa real devuelve 503 y la pantalla
// pinta un guion: nunca una tasa inventada.
const cotizacion = V.conEntrada(async (req, res) => {
  const de = V.moneda(req.query?.de, { campo: 'de' });
  const a = V.moneda(req.query?.a, { campo: 'a' });
  if (de === a) return res.status(400).json({ error: 'Son la misma moneda.', codigo: 'MISMO_PAR', campo: 'a' });
  const c = await cotizar(de, a);
  if (!c) {
    return res.status(503).json({
      error: 'Ahora mismo no hay tasa para ese par.', codigo: 'SIN_TASA',
    });
  }
  const salida = { cotizacion: c };
  if (req.query?.monto) {
    const min = V.monto(req.query.monto, de);
    const destino = convertir(min, de, a, c.aplicada);
    salida.simulacion = { entrega: pintar(min, de), recibe: pintar(destino, a) };
  }
  return res.json(salida);
});

// ── POST /movimientos/cambiar ───────────────────────────────────────────────
// { ref, de, a, monto } → cambia de una moneda propia a otra propia.
const cambiar = V.conEntrada(async (req, res) => {
  const b = V.cuerpo(req);
  const de = V.moneda(b.de, { campo: 'de' });
  const a = V.moneda(b.a, { campo: 'a' });
  if (de === a) return res.status(400).json({ error: 'Son la misma moneda.', codigo: 'MISMO_PAR', campo: 'a' });
  const monto = V.monto(b.monto, de);
  const ref = refDe(req.usuario.gid, b.ref);

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
        error: 'El monto es demasiado chico para ese cambio.', codigo: 'MONTO_MINIMO', campo: 'monto',
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
});

// ── GET /movimientos?moneda=USD&clase=deposito&desde=2026-08-01&hasta=2026-08-31&q=texto&pagina=0
// El historial, con filtros. Se devuelve el asiento ENTERO —las dos patas—
// porque un extracto que solo enseña tu lado es un extracto en el que no se
// puede comprobar nada. Cada filtro se valida: una fecha que no existe se
// rechaza en vez de convertirse en un historial vacío que parece verdad.
const historial = V.conEntrada(async (req, res) => {
  const cuenta = cuentaDe(req.usuario.gid);
  const q = req.query || {};
  const filtro = { 'lineas.cuenta': cuenta };
  if (q.moneda) filtro['lineas.moneda'] = V.moneda(q.moneda);
  if (q.clase) filtro.clase = V.opcion(q.clase, Object.keys(CLASES), { campo: 'clase', etiqueta: 'el tipo de movimiento' });
  const desde = q.desde ? V.fecha(q.desde, { campo: 'desde' }) : null;
  const hasta = q.hasta ? V.fecha(q.hasta, { campo: 'hasta', fin: true }) : null;
  if (desde && hasta && desde > hasta) {
    return res.status(400).json({ error: '«Desde» no puede ser posterior a «hasta».', codigo: 'RANGO_INVALIDO', campo: 'desde' });
  }
  if (desde || hasta) {
    filtro.fecha = {};
    if (desde) filtro.fecha.$gte = desde;
    if (hasta) filtro.fecha.$lte = hasta;
  }
  const texto = V.texto(q.q, { campo: 'q', max: 80, etiqueta: 'la búsqueda' });
  if (texto) {
    // Búsqueda literal en la glosa o en la ref, con los metacaracteres
    // escapados: lo que escribe una persona no es una expresión regular.
    const re = new RegExp(texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filtro.$or = [{ glosa: re }, { ref: re }];
  }
  const pagina = V.entero(q.pagina, { campo: 'pagina', min: 0, max: 500, porDefecto: 0, etiqueta: 'la página' });
  const porPagina = 50;

  try {
    const total = await Asiento.countDocuments(filtro);
    const docs = await Asiento.find(filtro).sort({ fecha: -1, _id: -1 })
      .skip(pagina * porPagina).limit(porPagina);

    return res.json({
      pagina, porPagina, total,
      clases: CLASES,
      movimientos: docs.map((d) => ({
        ref: d.ref,
        numero: d.ref.split(':').slice(1).join(':') || d.ref,
        glosa: d.glosa, fecha: d.fecha, clase: d.clase,
        claseTexto: CLASES[d.clase] || d.clase,
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
});

// ── GET /movimientos/:numero/comprobante ────────────────────────────────────
// El comprobante de UN movimiento. `numero` es la ref sin el gid delante (lo
// que ve el cliente); se busca con SU gid, así que un número ajeno no
// devuelve nada aunque exista.
const comprobante = V.conEntrada(async (req, res) => {
  const numero = V.ref(req.params.numero, { campo: 'numero' });
  const ref = `${req.usuario.gid}:${numero}`;
  try {
    const a = await Asiento.findOne({ ref, 'lineas.cuenta': cuentaDe(req.usuario.gid) });
    if (!a) return res.status(404).json({ error: 'No hay un movimiento con ese número en tu cuenta.', codigo: 'NO_EXISTE' });
    const c = await armarComprobante(a, req.usuario.gid);
    if (!c) return res.status(404).json({ error: 'No hay un movimiento con ese número en tu cuenta.', codigo: 'NO_EXISTE' });
    return res.json({ comprobante: c });
  } catch (e) {
    console.error(`[movimientos] no se pudo armar el comprobante: ${e.message}`);
    return res.status(503).json({ error: 'No se pudo armar el comprobante.', codigo: 'NO_SE_PUDO' });
  }
});

// ── GET /extracto?moneda=USD&mes=2026-08&formato=json|csv ───────────────────
// El extracto de un mes. En JSON para la pantalla (que lo imprime a PDF con
// el navegador) y en CSV para descargar.
const extracto = V.conEntrada(async (req, res) => {
  const q = req.query || {};
  const cod = V.moneda(q.moneda);
  const mes = V.mes(q.mes);
  const formato = V.opcion(q.formato, ['json', 'csv'], { campo: 'formato', porDefecto: 'json' });
  try {
    const e = await armarExtracto(req.usuario.gid, cod, mes);
    if (formato === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="aucorp-extracto-${cod}-${mes.etiqueta}.csv"`);
      return res.send(extractoCsv(e));
    }
    return res.json({ extracto: e });
  } catch (e) {
    console.error(`[movimientos] no se pudo armar el extracto: ${e.message}`);
    return res.status(503).json({ error: 'No se pudo armar el extracto.', codigo: 'NO_SE_PUDO' });
  }
});

module.exports = { transferir, cotizacion, cambiar, historial, comprobante, extracto, POSICION, refDe };
