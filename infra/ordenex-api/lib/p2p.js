/**
 * EL P2P: LA MÁQUINA DE ESTADOS Y EL RELOJ.
 *
 * El contrato entero está en DISENO-P2P.md. Aquí va el tramo 1: tomar una
 * orden, pagarla, liberarla, cancelarla, y que venza sola.
 *
 * ── LAS CUATRO COSAS QUE ORDENAN ESTE ARCHIVO ───────────────────────────────
 *
 * 1. EL RELOJ ES UNA FECHA GUARDADA, NO UN TEMPORIZADOR.
 *    Un `setTimeout` se lo lleva el primer reinicio del dyno, y con él el
 *    vencimiento de todas las órdenes abiertas: el ORIGEN de alguien queda
 *    bloqueado para siempre y nadie sabe por qué. Se guarda `venceEn` y lo
 *    mira el barredor — y también CUALQUIER lectura, porque entre dos pasadas
 *    del barredor hay veinte segundos en los que una orden ya vencida seguiría
 *    contestando «podés pagar».
 *
 * 2. AL MARCAR PAGADO, EL RELOJ SE PARA.
 *    `venceEn = null`. Desde ahí la orden no vence nunca. Nadie puede perder
 *    su dinero porque se acabe un tiempo DESPUÉS de haber transferido. Y el
 *    pagador deja de poder cancelar: si pudiera, cancelaría cada vez que el
 *    precio se moviera a su favor.
 *
 * 3. NUNCA SE LIBERA SOLO.
 *    No existe en este archivo ninguna rama por la que el ORIGEN salga de la
 *    garantía sin que una persona lo suelte o un árbitro lo resuelva. Si
 *    existiera un «si nadie hace nada en X minutos, se libera», el fraude
 *    sería de una línea: tomo la orden, marco pagado sin pagar, espero.
 *
 * 4. TODA TRANSICIÓN VA CON GUARDA ATÓMICA.
 *    `findOneAndUpdate({_id, estado: de})`. Dos toques del mismo botón no
 *    liberan dos veces, y dos barredores no vencen la misma orden dos veces.
 *    Se escribe así desde el primer día porque después no se arregla: se
 *    descubre con el dinero de alguien en el medio.
 *
 * ── EL RELOJ SE PUEDE MOVER, A PROPÓSITO ────────────────────────────────────
 * `ahora()` es inyectable. Un reloj que no se puede mover no se puede probar,
 * y lo único que de verdad hay que probar aquí es qué pasa cuando el tiempo
 * pasa. Con `Date.now()` esparcido, la prueba del vencimiento sería esperar
 * quince minutos de verdad — o sea, no probarlo.
 */

const { Anuncio, P2POrden, Falta, Contador } = require('../models');
const ledger = require('./ledger');

// ── El reloj ────────────────────────────────────────────────────────────────
let _ahora = () => new Date();
const ahora = () => _ahora();
/** Solo para las pruebas. En producción nadie llama a esto. */
function ponerReloj(fn) { _ahora = fn || (() => new Date()); }

// ── Números de dinero, con el criterio de la casa ───────────────────────────
const esWei = (v) => typeof v === 'string' && /^[0-9]{1,78}$/.test(v) && BigInt(v) > 0n;
const esCentavos = (v) => typeof v === 'string' && /^[0-9]{1,15}$/.test(v) && BigInt(v) > 0n;

const UNO = 10n ** 18n;

/**
 * Cuánto fiat cuesta una cantidad de activo. Todo en enteros: el precio son
 * centavos por UNA unidad entera, así que se multiplica y se divide por 1e18.
 *
 * REDONDEA HACIA ARRIBA, y no es un detalle de estilo: hacia abajo, quien
 * compra paga un centavo de menos por cada orden, y ese centavo sale del
 * bolsillo del que entrega. Cuando el redondeo tiene que caer para un lado,
 * cae en contra de quien pide la operación.
 */
function fiatDe(cantidadWei, precioCentavos) {
  const n = BigInt(cantidadWei) * BigInt(precioCentavos);
  return ((n + UNO - 1n) / UNO).toString();
}

const MINUTOS = 60 * 1000;
const APELABLE_MIN = () => Number(process.env.ORDENEX_P2P_APELACION_MIN || 10);
const FALTAS_TOPE = () => Number(process.env.ORDENEX_P2P_FALTAS_24H || 3);
const ABIERTAS_TOPE = () => Number(process.env.ORDENEX_P2P_ORDENES_ABIERTAS || 3);

const fallo = (codigo, status, mensaje) => Object.assign(new Error(mensaje), { codigo, status });

/** Un número legible. El contador es atómico; contar documentos no lo es. */
async function siguienteNumero() {
  const c = await Contador.findOneAndUpdate(
    { clave: 'p2p' }, { $inc: { valor: 1 } }, { new: true, upsert: true }
  ).lean();
  return `ONX-P2P-${String(c.valor).padStart(6, '0')}`;
}

/** Los papeles, decididos UNA vez y guardados. */
function papeles(anuncio, tomadorId) {
  return anuncio.lado === 'vendo'
    ? { pagadorId: tomadorId, entregadorId: String(anuncio.comercianteId) }
    : { pagadorId: String(anuncio.comercianteId), entregadorId: tomadorId };
}

/**
 * La transición, con guarda. Devuelve la orden ya cambiada, o null si alguien
 * llegó antes — y `null` no es un error del que llama: es que la carrera la
 * ganó otro, y quien la ganó ya hizo el trabajo.
 */
async function transitar(id, de, a, quien, { nota = null, extra = null } = {}) {
  return P2POrden.findOneAndUpdate(
    { _id: id, estado: de },
    {
      $set: { estado: a, ...(extra || {}) },
      $push: { historia: { de, a, quien, en: ahora(), nota } },
    },
    { new: true }
  ).lean();
}

// ── Las faltas ──────────────────────────────────────────────────────────────

async function faltasRecientes(userId) {
  const desde = new Date(ahora().getTime() - 24 * 60 * MINUTOS);
  return Falta.countDocuments({ userId: String(userId), en: { $gte: desde } });
}

async function anotarFalta(userId, ordenId, motivo) {
  try { await Falta.create({ userId: String(userId), ordenId: String(ordenId), motivo, en: ahora() }); }
  catch { /* una falta que no se pudo anotar no puede tumbar la operación */ }
}

// ── Devolver la garantía y el inventario ────────────────────────────────────
//
// Las dos cosas van juntas SIEMPRE: si vuelve el ORIGEN pero no el inventario
// del anuncio, el comerciante tiene su dinero y su anuncio dice que ya no le
// queda nada que vender. Se queda vendiendo aire hasta que alguien lo note.
async function devolver(orden, ref) {
  await ledger.liberar(orden.entregadorId, orden.activo, orden.cantidad, ref);
  await Anuncio.updateOne(
    { _id: orden.anuncioId },
    { $set: { estado: 'publicado' } , $inc: {} }
  ).catch(() => {});
  const a = await Anuncio.findById(orden.anuncioId).lean().catch(() => null);
  if (a) {
    const nuevo = (BigInt(a.cantidadRestante) + BigInt(orden.cantidad)).toString();
    await Anuncio.updateOne({ _id: a._id }, { $set: { cantidadRestante: nuevo } }).catch(() => {});
  }
}

// ── Tomar una orden ─────────────────────────────────────────────────────────

/**
 * Nace la orden. En este orden y no en otro:
 *   1. se valida contra el anuncio
 *   2. se BLOQUEA la garantía — si esto falla, no hay orden
 *   3. se descuenta el inventario del anuncio
 *   4. se escribe la orden con su reloj corriendo
 *
 * El paso 2 antes del 4 es deliberado: una orden sin garantía es una promesa,
 * y al otro lado hay alguien a punto de mandar dinero por un banco. Si el 4
 * falla después del 2, la reserva queda huérfana y lleva la `ref` de la orden;
 * el barredor la devuelve.
 */
async function tomar({ anuncioId, tomadorId, cantidad = null, montoFiat = null, ordenKey = null }) {
  const anuncio = await Anuncio.findById(anuncioId).lean();
  if (!anuncio) throw fallo('NO_EXISTE', 404, 'Ese anuncio no existe.');
  if (anuncio.estado !== 'publicado') throw fallo('NO_PUBLICADO', 409, 'Ese anuncio no está disponible ahora mismo.');
  if (String(anuncio.comercianteId) === String(tomadorId)) {
    throw fallo('ES_SUYO', 400, 'No podés tomar tu propio anuncio.');
  }

  if (ordenKey) {
    const ya = await P2POrden.findOne({ ordenKey: String(ordenKey) }).lean();
    if (ya) return ya;                       // idempotencia: la misma llave, la misma orden
  }

  /* El tope de órdenes abiertas frena de paso la cosecha de datos bancarios:
     tomar y cancelar en serie es cómo se arma una lista de cuentas ajenas. */
  const abiertas = await P2POrden.countDocuments({
    $or: [{ pagadorId: String(tomadorId) }, { entregadorId: String(tomadorId) }],
    estado: { $in: ['creada', 'pagada', 'apelada'] },
  });
  if (abiertas >= ABIERTAS_TOPE()) {
    throw fallo('MUCHAS_ABIERTAS', 429, `Ya tenés ${abiertas} órdenes abiertas. Terminá alguna antes de abrir otra.`);
  }

  const faltas = await faltasRecientes(tomadorId);
  if (faltas >= FALTAS_TOPE()) {
    throw fallo('BLOQUEADO', 429, `Cancelaste o dejaste vencer ${faltas} órdenes en las últimas 24 horas. Podés volver a tomar anuncios mañana.`);
  }

  /* Se puede pedir por cantidad de activo o por monto de fiat. Se acepta una
     sola: dar las dos deja al servidor eligiendo cuál obedece, y la que no
     obedezca va a ser justo la que la persona miraba en la pantalla. */
  if ((cantidad && montoFiat) || (!cantidad && !montoFiat)) {
    throw fallo('MONTO', 400, 'Pedí la orden por cantidad de ORIGEN o por monto en fiat, una de las dos.');
  }
  let cant, fiat;
  if (cantidad) {
    if (!esWei(cantidad)) throw fallo('CANTIDAD', 400, 'La cantidad no es válida.');
    cant = String(cantidad);
    fiat = fiatDe(cant, anuncio.precio);
  } else {
    if (!esCentavos(montoFiat)) throw fallo('MONTO_FIAT', 400, 'El monto no es válido.');
    fiat = String(montoFiat);
    cant = ((BigInt(fiat) * UNO) / BigInt(anuncio.precio)).toString();
    if (BigInt(cant) <= 0n) throw fallo('MONTO_FIAT', 400, 'Ese monto es demasiado chico para este precio.');
  }

  if (BigInt(fiat) < BigInt(anuncio.minFiat) || BigInt(fiat) > BigInt(anuncio.maxFiat)) {
    throw fallo('FUERA_DE_LIMITE', 400, `Este anuncio acepta entre ${anuncio.minFiat} y ${anuncio.maxFiat} (en centavos).`);
  }

  /* El inventario se descuenta con guarda: `$expr` compara restante ≥ cantidad
     DENTRO de la misma escritura. Comprobarlo antes y descontar después deja
     una rendija por la que dos órdenes simultáneas se llevan el mismo ORIGEN. */
  const bajado = await Anuncio.findOneAndUpdate(
    { _id: anuncio._id, estado: 'publicado', $expr: { $gte: [{ $toDecimal: '$cantidadRestante' }, { $toDecimal: cant }] } },
    { $set: { cantidadRestante: (BigInt(anuncio.cantidadRestante) - BigInt(cant)).toString() } },
    { new: true }
  ).lean();
  if (!bajado) throw fallo('SIN_INVENTARIO', 409, 'Ese anuncio ya no tiene esa cantidad disponible.');

  const { pagadorId, entregadorId } = papeles(anuncio, String(tomadorId));
  const numero = await siguienteNumero();
  const ref = `p2p:${numero}`;

  try {
    await ledger.reservar(entregadorId, anuncio.activo, cant, ref);
  } catch (e) {
    /* Sin garantía no hay orden, y el inventario vuelve: si se quedara
       descontado, cada intento fallido comería el anuncio de alguien. */
    await Anuncio.updateOne({ _id: anuncio._id },
      { $set: { cantidadRestante: (BigInt(bajado.cantidadRestante) + BigInt(cant)).toString() } }).catch(() => {});
    throw fallo('SIN_GARANTIA', 409, `No se pudo poner el ORIGEN en garantía: ${e.message}`);
  }

  const nace = ahora();
  try {
    const o = await P2POrden.create({
      numero, anuncioId: String(anuncio._id), comercianteId: String(anuncio.comercianteId),
      tomadorId: String(tomadorId), pagadorId, entregadorId,
      activo: anuncio.activo, cantidad: cant, moneda: anuncio.moneda, montoFiat: fiat,
      precio: anuncio.precio, estado: 'creada',
      venceEn: new Date(nace.getTime() + anuncio.minutosParaPagar * MINUTOS),
      ordenKey: ordenKey ? String(ordenKey) : null,
      historia: [{ de: null, a: 'creada', quien: `usuario:${tomadorId}`, en: nace }],
    });
    return o.toObject();
  } catch (e) {
    /* La orden no se escribió: se deshacen las dos cosas que sí pasaron. */
    await ledger.liberar(entregadorId, anuncio.activo, cant, ref).catch(() => {});
    await Anuncio.updateOne({ _id: anuncio._id },
      { $set: { cantidadRestante: (BigInt(bajado.cantidadRestante) + BigInt(cant)).toString() } }).catch(() => {});
    throw fallo('NO_SE_PUDO', 500, `No se pudo abrir la orden: ${e.message}`);
  }
}

// ── El reloj: vencer ────────────────────────────────────────────────────────

/**
 * Vence una orden si le tocaba. Devuelve la orden vencida, o null.
 *
 * Es idempotente por la guarda de `transitar`: si dos barredores entran a la
 * vez —o si algún día hay dos dynos— solo uno cambia el estado, y solo ese
 * devuelve la garantía. El otro recibe null y no hace nada.
 */
async function vencerSiTocaba(orden) {
  if (!orden || orden.estado !== 'creada' || !orden.venceEn) return null;
  if (new Date(orden.venceEn).getTime() > ahora().getTime()) return null;

  const v = await transitar(orden._id, 'creada', 'vencida', 'casa',
    { nota: 'se acabó el tiempo para pagar', extra: { venceEn: null } });
  if (!v) return null;                       // otro llegó antes

  await devolver(v, `p2p:${v.numero}`);
  await anotarFalta(v.pagadorId, v._id, 'vencio');
  return v;
}

/**
 * Lee una orden y la vence de paso si le tocaba.
 *
 * Esto es lo que tapa el hueco entre dos pasadas del barredor: sin ello, una
 * orden ya vencida contestaría «podés pagar» durante veinte segundos, y quien
 * pagara en esa rendija tendría razón y no tendría orden.
 */
async function leer(id) {
  const o = await P2POrden.findById(id).lean();
  if (!o) return null;
  const v = await vencerSiTocaba(o);
  return v || o;
}

/** La pasada del barredor. Devuelve cuántas venció. */
async function barrer({ limite = 50 } = {}) {
  const candidatas = await P2POrden.find({ estado: 'creada', venceEn: { $ne: null, $lte: ahora() } })
    .limit(limite).lean();
  let n = 0;
  for (const o of candidatas) { if (await vencerSiTocaba(o)) n += 1; }
  return n;
}

// ── Las transiciones que pide una persona ───────────────────────────────────

/** AQUÍ SE CONGELA EL TIEMPO. */
async function marcarPagado({ id, quien, referencia = null }) {
  const o = await leer(id);
  if (!o) throw fallo('NO_EXISTE', 404, 'Esa orden no existe.');
  if (String(o.pagadorId) !== String(quien)) {
    throw fallo('NO_ES_SUYO', 403, 'Solo quien paga puede marcar la transferencia como hecha.');
  }
  if (o.estado === 'vencida') throw fallo('VENCIDA', 409, 'Esa orden se venció antes de que la marcaras. La garantía volvió a quien entregaba.');
  if (o.estado !== 'creada') throw fallo('ESTADO', 409, `Esa orden está en «${o.estado}» y ya no se puede marcar como pagada.`);

  const n = ahora();
  const r = await transitar(id, 'creada', 'pagada', `usuario:${quien}`, {
    nota: referencia ? `referencia ${referencia}` : 'sin número de referencia',
    extra: {
      /* LAS TRES LÍNEAS QUE JOSÉ PIDIÓ POR NOMBRE. */
      venceEn: null,                                        // el reloj se PARA
      congeladoEn: n,
      apelableEn: new Date(n.getTime() + APELABLE_MIN() * MINUTOS),
      referenciaPago: referencia ? String(referencia).slice(0, 120) : null,
    },
  });
  if (!r) throw fallo('ESTADO', 409, 'Esa orden cambió de estado mientras la marcabas.');
  return r;
}

/** Soltar el ORIGEN. Lo hace una persona, siempre. */
async function liberar({ id, quien }) {
  const o = await leer(id);
  if (!o) throw fallo('NO_EXISTE', 404, 'Esa orden no existe.');
  if (String(o.entregadorId) !== String(quien)) {
    throw fallo('NO_ES_SUYO', 403, 'Solo quien puso el ORIGEN en garantía puede soltarlo.');
  }
  if (o.estado !== 'pagada') throw fallo('ESTADO', 409, `Esa orden está en «${o.estado}»: solo se libera una que esté marcada como pagada.`);

  /* El estado cambia ANTES de mover el dinero. Si se moviera primero y el
     cambio de estado fallara, dos toques liberarían dos veces; al revés, lo
     peor que pasa es una orden liberada con el asiento pendiente, que se ve y
     se arregla. Entre perder dinero y tener que mirar una fila, se elige la
     fila. */
  const r = await transitar(id, 'pagada', 'liberada', `usuario:${quien}`, { extra: { liberadaEn: ahora() } });
  if (!r) throw fallo('ESTADO', 409, 'Esa orden cambió de estado mientras la liberabas.');

  await ledger.ejecutarReserva(o.entregadorId, o.activo, o.cantidad, o.pagadorId, `p2p:${o.numero}`);
  return r;
}

/** Cancelar. SOLO el pagador, y SOLO antes de haber marcado el pago. */
async function cancelar({ id, quien, nota = null }) {
  const o = await leer(id);
  if (!o) throw fallo('NO_EXISTE', 404, 'Esa orden no existe.');
  if (String(o.pagadorId) !== String(quien)) {
    /* Que el que entrega no pueda cancelar no es una omisión: si pudiera,
       cancelaría cada vez que el precio se moviera en su contra, y un mercado
       donde el que vende se echa atrás no es un mercado. */
    throw fallo('NO_ES_SUYO', 403, 'Quien entrega el ORIGEN no puede cancelar una orden ya abierta. Si hay un problema, se apela.');
  }
  if (o.estado === 'pagada') {
    throw fallo('YA_PAGADA', 409, 'Ya marcaste esta orden como pagada: desde ahí no se cancela, se apela.');
  }
  if (o.estado !== 'creada') throw fallo('ESTADO', 409, `Esa orden está en «${o.estado}» y ya no se puede cancelar.`);

  const r = await transitar(id, 'creada', 'cancelada', `usuario:${quien}`, { nota, extra: { venceEn: null } });
  if (!r) throw fallo('ESTADO', 409, 'Esa orden cambió de estado mientras la cancelabas.');

  await devolver(r, `p2p:${r.numero}`);
  await anotarFalta(r.pagadorId, r._id, 'cancelo');
  return r;
}

/** Cuánto le queda al reloj, en segundos. La pantalla dibuja con esto. */
function segundosQueQuedan(orden) {
  if (!orden?.venceEn) return null;          // parado: pagada, o ya terminada
  return Math.max(0, Math.round((new Date(orden.venceEn).getTime() - ahora().getTime()) / 1000));
}

module.exports = {
  tomar, marcarPagado, liberar, cancelar, leer, barrer, vencerSiTocaba,
  segundosQueQuedan, fiatDe, papeles, faltasRecientes,
  ponerReloj, _adentro: { ahora, transitar, devolver, APELABLE_MIN, FALTAS_TOPE, ABIERTAS_TOPE },
};
