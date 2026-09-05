/* La venta de ORIGEN por USDT: la salida, que es la otra mitad de compra.js.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * POR QUÉ ES DISTINTA DE LA COMPRA, Y POR QUÉ ES MÁS PELIGROSA
 *
 * Comprar es: la persona manda dinero PRIMERO y la casa entrega después. Si
 * algo se rompe en el medio, el dinero está en nuestra puerta y la deuda es
 * nuestra — mal, pero recuperable.
 *
 * Vender es al revés: la casa PAGA. Y paga a una dirección de fuera, en una
 * cadena que no controlamos, con una transacción que no se puede deshacer.
 * Los tres fallos que eso permite son:
 *
 *  · PAGAR DOS VECES. Un doble clic, un reintento del navegador, dos dynos.
 *    La defensa es de la base de datos y no de un `if`: `ventaKey` tiene
 *    ÍNDICE ÚNICO y la fila se crea ANTES de tocar el saldo o firmar. La
 *    segunda petición con la misma clave choca contra el índice y devuelve la
 *    venta que ya existe. Un `if` en memoria no sobrevive a dos procesos.
 *
 *  · PAGAR SIN COBRAR. Firmar el USDT y no debitar el ORIGEN es regalar el
 *    dinero. Por eso el ORIGEN se debita ANTES de firmar, y si el pago no sale
 *    se devuelve. El orden está elegido para el lado correcto del fallo: entre
 *    deberle una devolución a alguien de la casa —visible, arreglable— y
 *    regalarle USDT a un tercero, lo segundo no se arregla.
 *
 *  · PAGAR MÁS DE LO QUE HAY. La caja tiene lo que tiene. Antes de aceptar
 *    una venta se lee su saldo de verdad y se resta lo comprometido por las
 *    ventas que todavía se están pagando. Sin eso, dos ventas simultáneas de
 *    la mitad de la caja cada una dejan la segunda a medias.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * DE DÓNDE SALE EL USDT, Y LO QUE ESO CUESTA
 *
 * De la caja única (lib/billeteras.js: UNICA), que es donde el barrido junta
 * todo. Y eso CAMBIA la postura de riesgo que tenía esta casa: hasta hoy la
 * caja podía estar quieta, sin llave en ningún servidor, porque nadie firmaba
 * desde ella. Para pagar salidas hay que ponerle una llave caliente.
 *
 * Está escrito acá para que se decida a propósito y no por olvido:
 *
 *   · si ORDENEX_VENTA_KEY no está, la venta NO existe (503) y se dice;
 *   · la llave tiene que derivar EXACTAMENTE la caja, o no se firma;
 *   · lo que la caja tenga es lo máximo que se puede perder si se la llevan.
 *
 * Lo recomendable es tener en la caja solo lo que hace falta para pagar las
 * salidas de unos días y el resto en frío. Cuando haya una billetera pagadora
 * aparte, se agrega a lib/billeteras.js y se cambia `ESPERADA` de acá abajo:
 * es una línea, y el resto de este archivo no se entera.
 */

const mongoose = require('mongoose');
const { getAddress, formatUnits } = require('ethers');

const billeteras = require('./billeteras');
const decimales = require('./decimales');
const redes = require('./redesUsdt');
const referencia = require('./referencia');
const comisionSalida = require('./comisionSalida');
const ledger = require('./ledger');
const genesis = require('./genesis');
const { normalizarLlave } = require('./cripto');
// Se guarda el MODULO y no las funciones sueltas: `const { pagar } = ...`
// captura la referencia al importar y entonces no hay forma de ponerle
// enfrente una cadena fingida sin salir a las redes de verdad. Ver la
// cabecera de lib/pagoUsdt.js.
const pagoUsdt = require('./pagoUsdt');

/** De dónde sale el USDT. Ver la cabecera: hoy es la caja. */
const ESPERADA = billeteras.UNICA;

/** El activo que se vende. Uno solo a propósito: ORIGEN es la moneda de la
 *  casa y la única con referencia publicada. Vender AUKA por USDT sería otra
 *  cosa —otro precio, otra referencia— y no se cuela por acá sin pensarla. */
const ACTIVO = 'ORIGEN';

/* Cuánto se aparta de la caja y no se ofrece nunca. No es prudencia vaga: es
   el colchón que evita que la última venta del día deje la caja exactamente
   en cero y el barrido siguiente no tenga contra qué cuadrar. */
const APARTADO_CANONICO = 1n * 10n ** 18n;   // 1 USDT

const esquema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  red: { type: Number, required: true },
  direccion: { type: String, required: true },
  // Lo que se le debita a la persona, en canónico de 18.
  origenWei: { type: String, required: true },
  precioWei: { type: String, required: true },
  oroUsd: { type: Number, default: null },
  // Lo que sale, en canónico de 18 y en el crudo de la red.
  brutoCanonico: { type: String, required: true },
  comisionCanonico: { type: String, required: true },
  netoCanonico: { type: String, required: true },
  netoCrudo: { type: String, required: true },
  comisionPpm: { type: Number, required: true },
  // La clave de idempotencia. Índice único: es LA defensa contra pagar dos
  // veces, y vive en la base porque un proceso no basta.
  ventaKey: { type: String, required: true, unique: true },
  estado: {
    type: String,
    enum: ['pagando', 'pagada', 'fallida', 'en-duda'],
    default: 'pagando',
    index: true,
  },
  hash: { type: String, default: null },
  motivo: { type: String, default: null },
  en: { type: Date, default: Date.now },
}, { versionKey: false });

const OrdenVenta = mongoose.models.OrdenVenta || mongoose.model('OrdenVenta', esquema);

function fallo(codigo, mensaje, status = 400) {
  return Object.assign(new Error(mensaje), { codigo, status });
}

/** ¿Está la venta configurada? Para el panel y para /salud. */
function encendida() {
  return process.env.VENTAS === '1' && Boolean(normalizarLlave(process.env.ORDENEX_VENTA_KEY));
}

/** El precio de ahora, el MISMO que usa la compra. Una casa con dos precios
 *  para la misma cosa no es una casa. */
async function precioAhora() {
  let r = null;
  try { r = await referencia.referenciaDe('AUKA-ORIGEN'); } catch { r = null; }
  const usd = Number(r?.origenUsd);
  if (!Number.isFinite(usd) || usd <= 0) return null;
  const micro = BigInt(Math.round(usd * 1e6));
  return { wei: (micro * (10n ** 12n)).toString(), usd, oroUsd: r?.usd ?? null };
}

/**
 * Cuánto USDT sale por N ORIGEN. En canónico de 18, como todo lo de adentro.
 *
 * Se trunca a propósito (división entera): en una salida, redondear hacia
 * arriba es pagar de más, y de más no se recupera.
 */
function usdtPorOrigen(origenWei, precioWei) {
  return ((BigInt(origenWei) * BigInt(precioWei)) / (10n ** 18n)).toString();
}

/** Lo que ya está comprometido por ventas que se están pagando. */
async function comprometido(red) {
  const vivas = await OrdenVenta.find({ red, estado: { $in: ['pagando', 'en-duda'] } })
    .select('netoCanonico').lean();
  return vivas.reduce((a, v) => a + BigInt(v.netoCanonico || 0), 0n);
}

/**
 * La cotización, sin comprometer nada. Es lo que la pantalla enseña ANTES de
 * que la persona toque nada, y sale de los mismos números que el cobro.
 */
async function cotizar({ origenWei, red }) {
  const id = Number(red);
  if (!redes.REDES[id]) throw fallo('RED_INVALIDA', 'Esa red no paga USDT en esta casa.');
  if (!/^[0-9]{1,40}$/.test(String(origenWei)) || BigInt(origenWei) <= 0n) {
    throw fallo('CANTIDAD_INVALIDA', 'La cantidad de ORIGEN tiene que ser un entero de wei positivo.');
  }
  const p = await precioAhora();
  if (!p) throw fallo('SIN_REFERENCIA_AHORA', 'No hay referencia del oro ahora mismo: probá en un rato.', 503);
  const bruto = usdtPorOrigen(origenWei, p.wei);
  if (BigInt(bruto) <= 0n) throw fallo('MUY_POCO', 'Esa cantidad de ORIGEN no llega ni a una millonésima de dólar.');
  const corte = comisionSalida.partir(bruto);
  return {
    origenWei: String(origenWei),
    precioWei: p.wei, precioUsd: p.usd, oroUsd: p.oroUsd,
    brutoCanonico: corte.bruto, comisionCanonico: corte.comision, netoCanonico: corte.neto,
    comisionPpm: corte.ppm,
    red: id, redNombre: redes.REDES[id].nombre,
  };
}

/**
 * Vender. El camino entero, con el orden de escritura elegido a mano.
 *
 * Devuelve la venta para la pantalla. Si la `ventaKey` ya existía, devuelve la
 * que existe SIN volver a pagar: eso es lo que hace que reintentar sea
 * inofensivo, que es lo único que un cliente puede hacer bien ante un error
 * de red.
 */
async function vender(usuario, { origenWei, red, direccion, ventaKey }) {
  if (process.env.VENTAS !== '1') {
    throw fallo('VENTA_APAGADA', 'La venta de ORIGEN por USDT está cerrada en este momento.', 503);
  }
  const id = Number(red);
  if (!redes.REDES[id]) throw fallo('RED_INVALIDA', 'Esa red no paga USDT en esta casa.');
  if (!redes.abierta(id)) {
    throw fallo('RED_CERRADA', `${redes.REDES[id].nombre} no está pagando salidas en este momento. Elegí otra red.`, 503);
  }
  if (!decimales.listo(id)) throw fallo('RED_NO_LISTA', 'Esa red no está disponible ahora mismo.', 503);
  if (typeof ventaKey !== 'string' || ventaKey.length < 8 || ventaKey.length > 100) {
    // Se exige con cuerpo: sin ella un doble clic son dos pagos, y eso no es
    // un error de la persona sino nuestro por dejarlo.
    throw fallo('VENTA_KEY_INVALIDA', 'Falta ventaKey (entre 8 y 100 caracteres).');
  }
  let destino;
  try { destino = getAddress(String(direccion || '')); } catch {
    throw fallo('DIRECCION_INVALIDA', 'La dirección de destino no es válida.');
  }
  if (billeteras.esDeLaCasa(destino)) {
    const porQue = billeteras.porQueRetirada(destino);
    throw fallo('DIRECCION_DE_LA_CASA',
      `Esa dirección es de la casa: no se puede pagar hacia ella${porQue ? ` (${porQue})` : ''}.`);
  }

  // El tamiz de sanciones sobre QUIEN COBRA. Si Genesis no contesta, no se
  // paga: un tamiz que no se pudo hacer no es un tamiz.
  let tamiz;
  try { tamiz = await genesis.tamizDireccion(destino); } catch (e) {
    throw fallo('SIN_TAMIZ', `No se pudo comprobar la dirección de destino: ${e.message}`, 503);
  }
  if (!tamiz || tamiz.sancionada === true) {
    throw fallo('DIRECCION_SANCIONADA', 'Esa dirección no puede recibir pagos de esta casa.');
  }

  const c = await cotizar({ origenWei, red: id });

  // El mínimo de la red, sobre lo que SALE. Pagar dos dólares en Ethereum
  // cuesta más que los dos dólares.
  const minimoCanonico = BigInt(redes.REDES[id].minimoMicro || 0) * (10n ** 12n);
  if (BigInt(c.netoCanonico) < minimoCanonico) {
    throw fallo('BAJO_MINIMO',
      `En ${redes.REDES[id].nombre} la salida mínima es ${Number(redes.REDES[id].minimoMicro) / 1e6} USDT y esa venta da menos.`);
  }

  // La pagadora, y lo que la caja tiene DE VERDAD. Las dos cosas antes de
  // tocar el saldo de nadie.
  const quien = pagoUsdt.configurada();
  if (!quien.ok) {
    console.error(`[venta] no se puede pagar: ${quien.motivo}`);
    throw fallo('VENTA_SIN_BILLETERA', 'La venta no está disponible en este momento.', 503);
  }
  let caja;
  try { caja = await pagoUsdt.saldo(id); } catch (e) {
    throw fallo('CAJA_ILEGIBLE', 'No puedo confirmar el USDT disponible ahora mismo. Probá en un rato.', 503);
  }
  const enVuelo = await comprometido(id);
  const libre = BigInt(caja.canonico) - enVuelo - APARTADO_CANONICO;
  if (libre < BigInt(c.netoCanonico)) {
    console.error(`[venta] SIN CAJA en ${redes.REDES[id].nombre}: hay ${caja.canonico}, en vuelo ${enVuelo}, piden ${c.netoCanonico}`);
    throw fallo('SIN_CAJA',
      'No hay suficiente USDT disponible para esa venta ahora mismo. Probá con menos, o en un rato.', 503);
  }

  /* Del canónico de 18 al crudo de la red. `aNativo` trunca y devuelve el
     resto: en Polygon o Ethereum, con USDT de 6 decimales, lo que no entra en
     la rejilla se cae. Se paga lo truncado y se ANOTA lo truncado —no lo
     pedido— para que lo que dice la fila sea exactamente lo que salió. */
  const corte = decimales.aNativo(c.netoCanonico, id, 'USDT');
  const netoCrudo = corte.nativo;
  if (BigInt(netoCrudo) <= 0n) {
    throw fallo('MUY_POCO', 'Esa cantidad no llega ni a la unidad más chica de USDT en esa red.');
  }
  const netoCanonico = decimales.aCanonico(netoCrudo, id, 'USDT');

  // EL CANDADO, antes de tocar el saldo y antes de firmar. Si esta clave ya
  // se usó, se devuelve aquella venta y no pasa nada más.
  let orden;
  try {
    orden = await OrdenVenta.create({
      userId: String(usuario._id), red: id, direccion: destino,
      origenWei: c.origenWei, precioWei: c.precioWei, oroUsd: c.oroUsd,
      brutoCanonico: c.brutoCanonico, comisionCanonico: c.comisionCanonico,
      netoCanonico, netoCrudo, comisionPpm: c.comisionPpm,
      ventaKey: String(ventaKey), estado: 'pagando',
    });
  } catch (e) {
    if (e && e.code === 11000) {
      const yaEsta = await OrdenVenta.findOne({ ventaKey: String(ventaKey) }).lean();
      if (yaEsta) return paraPantalla(yaEsta);
    }
    throw fallo('NO_SE_PUDO_ANOTAR', 'No se pudo anotar la venta. Probá de nuevo.', 503);
  }

  // El cobro. ANTES de firmar: pagar sin cobrar es regalar el dinero.
  try {
    await ledger.debitar(String(usuario._id), ACTIVO, c.origenWei, `venta:${orden._id}`);
  } catch (e) {
    await OrdenVenta.updateOne({ _id: orden._id }, { estado: 'fallida', motivo: `no se pudo debitar: ${e.message}` });
    if (e && e.codigo === 'SALDO_INSUFICIENTE') {
      throw fallo('SALDO_INSUFICIENTE', 'No tenés tanto ORIGEN disponible en Ordenex.');
    }
    throw fallo(e?.codigo || 'NO_SE_PUDO_COBRAR', e?.message || 'No se pudo tomar el ORIGEN.', e?.status || 400);
  }

  // El pago. De acá para abajo puede haber una transacción viva.
  try {
    const pago = await pagoUsdt.pagar(id, { a: destino, crudo: netoCrudo });
    await OrdenVenta.updateOne({ _id: orden._id }, { estado: 'pagada', hash: pago.hash, motivo: null });
    try { await genesis.reportarMovimiento?.({ tipo: 'venta', gid: usuario.gid, direccion: destino, hash: pago.hash }); } catch { /* el aviso no puede tumbar la venta */ }
    const leida = await OrdenVenta.findById(orden._id).lean();
    return paraPantalla(leida);
  } catch (e) {
    /* La frontera de la duda. Estos códigos son ANTERIORES a que la
       transacción salga: el nodo la rechazó y no hay nada vivo, así que el
       ORIGEN se devuelve. Cualquier otra cosa —un plazo agotado, una
       respuesta que no llegó— puede tener una transacción viva: devolver el
       ORIGEN ahí sería pagar Y no cobrar. Eso lo mira una persona. */
    const nuncaSalio = e?.nuncaSalio === true || e?.code === 'INSUFFICIENT_FUNDS'
      || e?.code === 'NONCE_EXPIRED' || e?.code === 'CALL_EXCEPTION' || e?.code === 'UNCONFIGURED_NAME';
    const motivo = `${e?.code || ''} ${e?.message || e}`.trim().slice(0, 300);
    if (nuncaSalio) {
      await ledger.acreditar(String(usuario._id), ACTIVO, c.origenWei, `venta-devuelta:${orden._id}`);
      await OrdenVenta.updateOne({ _id: orden._id }, { estado: 'fallida', motivo });
      console.error(`[venta] no salió y se devolvió el ORIGEN: ${motivo}`);
      throw fallo('NO_SE_PUDO_PAGAR', 'No se pudo hacer el pago y te devolvimos el ORIGEN. Probá de nuevo.', 502);
    }
    await OrdenVenta.updateOne({ _id: orden._id }, { estado: 'en-duda', motivo });
    console.error(`[venta] EN DUDA: la venta ${orden._id} pudo haber pagado ${netoCrudo} a ${destino} — ${motivo}`);
    throw fallo('EN_DUDA',
      'El pago quedó en duda y lo está mirando una persona. No lo repitas: si salió, vas a verlo en tu billetera.', 502);
  }
}

function paraPantalla(v) {
  const cfg = redes.REDES[v.red];
  return {
    id: String(v._id),
    red: v.red, redNombre: cfg ? cfg.nombre : String(v.red),
    direccion: v.direccion,
    origenWei: v.origenWei,
    precioWei: v.precioWei,
    brutoCanonico: v.brutoCanonico,
    comisionCanonico: v.comisionCanonico,
    comisionPpm: v.comisionPpm,
    netoCanonico: v.netoCanonico,
    estado: v.estado,
    hash: v.hash || null,
    explorador: v.hash && cfg && cfg.explorador ? `${cfg.explorador}${v.hash}` : null,
    motivo: v.motivo || null,
    en: v.en,
  };
}

/** Las ventas de una persona, las últimas primero. */
async function mias(userId, { limite = 20 } = {}) {
  const v = await OrdenVenta.find({ userId: String(userId) }).sort({ en: -1 }).limit(limite).lean();
  return v.map(paraPantalla);
}

/** Para el panel: si se puede pagar, con qué, y lo que hay que mirar. */
async function estado() {
  const salida = {
    encendida: encendida(),
    paga: ESPERADA,
    llave: { puesta: Boolean(normalizarLlave(process.env.ORDENEX_VENTA_KEY)), valida: false, motivo: null },
    caja: {},
    quierenOjos: [],
  };
  const q = pagoUsdt.configurada();
  salida.llave.valida = q.ok; salida.llave.motivo = q.motivo;
  for (const id of redes.abiertas()) {
    try {
      const c = await pagoUsdt.saldo(id);
      const enVuelo = await comprometido(id);
      salida.caja[id] = {
        red: redes.REDES[id].nombre,
        usdt: formatUnits(c.canonico, 18),
        enVuelo: formatUnits(enVuelo.toString(), 18),
      };
    } catch (e) {
      salida.caja[id] = { red: redes.REDES[id]?.nombre || String(id), error: String(e.message).slice(0, 120) };
    }
  }
  salida.quierenOjos = (await OrdenVenta.find({ estado: { $in: ['en-duda'] } })
    .sort({ en: -1 }).limit(20).lean()).map(paraPantalla);
  return salida;
}

module.exports = {
  OrdenVenta, cotizar, vender, mias, estado, encendida, ESPERADA, ACTIVO,
  _adentro: { usdtPorOrigen, comprometido, precioAhora, paraPantalla, APARTADO_CANONICO },
};
