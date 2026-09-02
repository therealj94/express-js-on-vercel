// El comprobante de un movimiento y el extracto de un mes.
//
// ══ QUÉ ES UN COMPROBANTE AQUÍ ═════════════════════════════════════════════
//
// Un asiento del libro, visto desde el lado de una persona: qué entró o salió
// de SU cuenta, cuándo, por qué, con qué sello, y cuánto le quedó después. No
// enseña el saldo del banco corresponsal ni el de la otra parte: el asiento se
// puede cuadrar por los nombres de cuenta sin exponer números ajenos.
//
// Lleva una HUELLA: el SHA-256 de los datos que lo componen. Un comprobante
// impreso se puede comprobar contra el API pidiendo el mismo ref y comparando
// la huella. No es una firma —no prueba quién lo emitió— pero sí que lo que
// dice el papel es lo que dice el libro.
//
// ══ EL EXTRACTO ════════════════════════════════════════════════════════════
//
// Un mes, una moneda: saldo al empezar, cada movimiento con su saldo después,
// saldo al terminar, y los totales. Los saldos se DERIVAN del libro sumando
// hasta la fecha, no se leen del atajo: un extracto tiene que ser
// reconstruible desde los asientos aunque el atajo se hubiera perdido.
//
// El CSV se arma aquí para que la pantalla no tenga que saber de comillas.

const { createHash } = require('crypto');
const { Asiento } = require('../models');
const { aTexto, moneda } = require('./monedas');
const { TIPOS } = require('./libro');

const cuentaDe = (gid) => `cliente:${gid}`;

/** Cuánto movió una línea el saldo de un cliente (pasivo: haber suma). */
function deltaCliente(l) {
  const d = BigInt(l.debe || '0') - BigInt(l.haber || '0');
  return TIPOS[l.tipo] === 'debe' ? d : -d;
}

/** El saldo de la cuenta en una moneda justo ANTES de un instante. */
async function saldoHasta(cuenta, cod, hasta) {
  const r = await Asiento.aggregate([
    { $match: { 'lineas.cuenta': cuenta, fecha: { $lt: hasta } } },
    { $unwind: '$lineas' },
    { $match: { 'lineas.cuenta': cuenta, 'lineas.moneda': cod } },
    { $group: {
      _id: '$lineas.tipo',
      debe: { $sum: { $toDecimal: '$lineas.debe' } },
      haber: { $sum: { $toDecimal: '$lineas.haber' } },
    } },
  ]);
  let total = 0n;
  for (const g of r) {
    const d = BigInt(String(g.debe).split('.')[0]);
    const h = BigInt(String(g.haber).split('.')[0]);
    total += TIPOS[g._id] === 'debe' ? d - h : h - d;
  }
  return total;
}

/** Nombres legibles de las cuentas de la casa, para la contraparte. */
function nombreCuenta(cuenta, gid) {
  const c = String(cuenta);
  if (c === cuentaDe(gid)) return 'Tu cuenta';
  if (c === `retiro:${gid}`) return 'Tu retiro en proceso';
  if (c.startsWith('cliente:')) return 'Otra cuenta de AuCorp';
  if (c.startsWith('retiro:')) return 'Retiro en proceso de otra cuenta';
  if (c.startsWith('banco.corresponsal.')) return 'Banco corresponsal';
  if (c === 'posicion.cambio') return 'Posición de cambio de AuCorp';
  if (c === 'ingreso.comisiones') return 'Comisiones de AuCorp';
  return c;
}

const CLASES = {
  deposito: 'Depósito', retiro: 'Retiro', transferencia: 'Transferencia',
  cambio: 'Cambio de moneda', reverso: 'Devolución', ajuste: 'Ajuste', movimiento: 'Movimiento',
};

/**
 * El comprobante de un asiento, visto por `gid`. Devuelve null si el asiento
 * no toca su cuenta: un comprobante ajeno no existe para quien lo pide.
 */
async function armarComprobante(asiento, gid) {
  const mia = cuentaDe(gid);
  const propias = asiento.lineas.filter((l) => l.cuenta === mia);
  if (!propias.length) return null;

  // Un asiento puede tocar varias monedas (un cambio). Se enseña cada una.
  const porMoneda = new Map();
  for (const l of propias) {
    const cod = l.moneda;
    porMoneda.set(cod, (porMoneda.get(cod) || 0n) + deltaCliente(l));
  }
  const montos = [];
  for (const [cod, delta] of porMoneda) {
    const antes = await saldoHasta(mia, cod, asiento.fecha);
    // Varios asientos con la misma fecha (raro, pero posible) se suman en
    // orden de inserción: los anteriores a este en _id.
    const empatados = await Asiento.find({ 'lineas.cuenta': mia, fecha: asiento.fecha, _id: { $lt: asiento._id } });
    let ajuste = 0n;
    for (const e of empatados) for (const l of e.lineas) if (l.cuenta === mia && l.moneda === cod) ajuste += deltaCliente(l);
    const saldoAntes = antes + ajuste;
    montos.push({
      moneda: cod,
      sentido: delta >= 0n ? 'entra' : 'sale',
      monto: aTexto((delta < 0n ? -delta : delta).toString(), cod),
      saldoAntes: aTexto(saldoAntes.toString(), cod),
      saldoDespues: aTexto((saldoAntes + delta).toString(), cod),
    });
  }

  const contrapartes = [...new Set(asiento.lineas.filter((l) => l.cuenta !== mia).map((l) => nombreCuenta(l.cuenta, gid)))];

  const cuerpo = {
    ref: asiento.ref,
    numero: asiento.ref.split(':').slice(1).join(':') || asiento.ref,   // sin el gid delante
    fecha: asiento.fecha.toISOString(),
    clase: asiento.clase,
    claseTexto: CLASES[asiento.clase] || asiento.clase,
    glosa: asiento.glosa,
    titular: gid,
    montos,
    contrapartes,
    lineas: asiento.lineas.map((l) => ({
      cuenta: nombreCuenta(l.cuenta, gid),
      moneda: l.moneda,
      debe: l.cuenta === mia ? aTexto(l.debe, l.moneda) : null,
      haber: l.cuenta === mia ? aTexto(l.haber, l.moneda) : null,
    })),
  };
  const huella = createHash('sha256').update(JSON.stringify({
    ref: cuerpo.ref, fecha: cuerpo.fecha, glosa: cuerpo.glosa, titular: gid,
    montos: cuerpo.montos.map((m) => [m.moneda, m.sentido, m.monto, m.saldoDespues]),
  })).digest('hex');

  return {
    ...cuerpo,
    huella,
    emitido: new Date().toISOString(),
    emisor: 'AuCorp — institución de tecnología financiera bajo la Regulación FinTech A de Próspera ZEDE. No es un banco con licencia bancaria.',
  };
}

/**
 * El extracto de `gid` en `cod` durante [desde, hasta].
 */
async function armarExtracto(gid, cod, { desde, hasta, etiqueta }) {
  const m = moneda(cod);
  if (!m) throw new Error('moneda desconocida');
  const mia = cuentaDe(gid);
  const inicial = await saldoHasta(mia, m.c, desde);
  const docs = await Asiento.find({
    'lineas.cuenta': mia, 'lineas.moneda': m.c, fecha: { $gte: desde, $lte: hasta },
  }).sort({ fecha: 1, _id: 1 });

  let saldo = inicial;
  let entradas = 0n;
  let salidas = 0n;
  const movimientos = [];
  for (const d of docs) {
    let delta = 0n;
    for (const l of d.lineas) if (l.cuenta === mia && l.moneda === m.c) delta += deltaCliente(l);
    if (delta === 0n) continue;
    saldo += delta;
    if (delta > 0n) entradas += delta; else salidas -= delta;
    movimientos.push({
      ref: d.ref,
      numero: d.ref.split(':').slice(1).join(':') || d.ref,
      fecha: d.fecha.toISOString(),
      clase: d.clase,
      claseTexto: CLASES[d.clase] || d.clase,
      glosa: d.glosa,
      entra: delta > 0n ? aTexto(delta.toString(), m.c) : '',
      sale: delta < 0n ? aTexto((-delta).toString(), m.c) : '',
      saldo: aTexto(saldo.toString(), m.c),
    });
  }

  return {
    titular: gid,
    moneda: m.c,
    monedaNombre: m.n,
    periodo: etiqueta,
    desde: desde.toISOString(),
    hasta: hasta.toISOString(),
    saldoInicial: aTexto(inicial.toString(), m.c),
    saldoFinal: aTexto(saldo.toString(), m.c),
    totalEntradas: aTexto(entradas.toString(), m.c),
    totalSalidas: aTexto(salidas.toString(), m.c),
    cantidad: movimientos.length,
    movimientos,
    emitido: new Date().toISOString(),
    emisor: 'AuCorp — institución de tecnología financiera bajo la Regulación FinTech A de Próspera ZEDE. No es un banco con licencia bancaria. Los saldos no están cubiertos por un seguro de depósitos.',
  };
}

/** Una celda de CSV: entre comillas si hace falta, comillas dobladas. */
const celda = (v) => {
  const s = String(v == null ? '' : v);
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** El extracto como CSV (con BOM para que Excel lo abra en UTF-8). */
function extractoCsv(e) {
  const filas = [
    ['AuCorp — Extracto de cuenta en moneda local'],
    ['Titular', e.titular], ['Moneda', `${e.moneda} — ${e.monedaNombre}`], ['Periodo', e.periodo],
    ['Saldo inicial', e.saldoInicial], ['Saldo final', e.saldoFinal],
    ['Total entradas', e.totalEntradas], ['Total salidas', e.totalSalidas],
    ['Emitido', e.emitido], [e.emisor],
    [],
    ['Fecha', 'Número', 'Tipo', 'Concepto', 'Entra', 'Sale', 'Saldo'],
    ...e.movimientos.map((mv) => [mv.fecha, mv.numero, mv.claseTexto, mv.glosa, mv.entra, mv.sale, mv.saldo]),
  ];
  return '\uFEFF' + filas.map((f) => f.map(celda).join(',')).join('\r\n') + '\r\n';
}

module.exports = { armarComprobante, armarExtracto, extractoCsv, saldoHasta, nombreCuenta, CLASES };
