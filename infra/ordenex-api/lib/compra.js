// La compra de ORIGEN con USDT: el precio congelado, y la entrega.
//
// ══════════════════════════════════════════════════════════════════════════
// LAS DOS COSAS QUE SE CONGELAN, Y LA QUE NO
//
// Se congela EL PRECIO y se congela EL PLAZO. NO se congela la cantidad.
//
// Es la distinción que evita el reclamo más común de una casa de cambio.
// Alguien cotiza 100 USDT, manda 97,5 porque su billetera le cobró comisión,
// y recibe ORIGEN por 97,5 al precio que le prometimos. Si en vez de eso se
// entregara lo cotizado, esta casa estaría regalando 2,5; si se rechazara el
// depósito, tendría dinero de alguien parado sin explicación. La cantidad
// SIEMPRE sale de la cadena; el precio, de la orden.
//
// ══════════════════════════════════════════════════════════════════════════
// CUANDO EL PLAZO SE ACABA
//
// La pantalla promete esto, con estas palabras: «Si el tiempo se acaba antes
// de que llegue, se recalcula al precio de ese momento y te avisamos antes de
// entregarte nada.» Las dos mitades son obligaciones:
//
//   · Se recalcula. Un precio de hace dos horas no es un precio.
//   · SE AVISA ANTES. Una orden vencida NO se entrega sola. Pasa a
//     'recalculada' y espera que la persona diga que sí, viendo el número
//     nuevo. Entregar en silencio a otro precio es cambiarle el trato a
//     alguien que no estaba mirando.
//
// Lo mismo vale para el depósito que llega SIN orden ninguna —alguien que se
// guardó la dirección de la vez pasada—: se le abre una orden ya recalculada
// y se le pregunta. El dinero nunca se queda sin dueño ni sin explicación.
//
// ══════════════════════════════════════════════════════════════════════════
// LA ENTREGA SE HACE UNA VEZ
//
// El paso de 'esperando' a 'entregando' es un findOneAndUpdate condicionado al
// estado anterior: gana uno solo. Es la misma guarda que el candado del
// barrido, y por el motivo contrario — barrer dos veces es inofensivo,
// ENTREGAR dos veces es regalar el doble y no hay forma de deshacerlo.
//
// Y si el envío se queda sin respuesta, la orden queda 'en-duda' y NO se
// reintenta sola. Puede haber una transacción viva. La mira una persona.

const mongoose = require('mongoose');
const { getAddress } = require('ethers');
const cadena = require('./cadena5550');
const referencia = require('./referencia');
const decimales = require('./decimales');
const redes = require('./redesUsdt');
const billeteras = require('./billeteras');
const { Usuario } = require('../models');
const { DepositoExterno } = require('./vigiaDepositosExternos');

const WEI = 10n ** 18n;

/** Cuánto vale una cotización. Quince minutos: sobra para pegar una dirección
 *  y mandar desde otra aplicación, y no tanto como para que el oro se mueva. */
const PLAZO_SEG = Number(process.env.ORDENEX_COMPRA_PLAZO_SEG || 900);
/** La versión de la regla de recálculo que la pantalla enseña y la persona
 *  acepta. Si cambia el texto, cambia esto: una aceptación guardada tiene que
 *  poder decir a QUÉ se dijo que sí. */
const REGLA_RECALCULO = '2026-09-04';
const CADA_MS = Number(process.env.COMPRA_CADA_MS || 20_000);

const genesisPerezoso = () => { try { return require('./genesis'); } catch { return null; } };

// ── Lo que se guarda ────────────────────────────────────────────────────────

const ordenCompraSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  cadena: { type: Number, required: true },
  // La dirección de depósito de esta persona, copiada aquí. Se guarda aunque
  // esté en el usuario: si un día se regenerara, esta orden tiene que seguir
  // sabiendo a qué dirección se le dijo a la persona que mandara.
  direccion: { type: String, required: true },
  // A dónde va el ORIGEN, copiada igual y por lo mismo. Si alguien cambia su
  // billetera a mitad de la operación, se entrega a la que estaba en el trato.
  aWallet: { type: String, required: true },

  montoMicro: { type: String, required: true }, // lo cotizado, en micro-dólares
  precioWei: { type: String, required: true },  // USD por ORIGEN, en wei
  origenWeiCotizado: { type: String, required: true },
  oroUsd: { type: Number, default: null },      // la onza de ese momento, para el recibo
  plazoSeg: { type: Number, required: true },
  venceEn: { type: Date, required: true },
  reglaRecalculo: { type: String, required: true },

  // Lo que llegó de verdad
  depositoId: { type: mongoose.Schema.Types.ObjectId, default: null },
  txDeposito: { type: String, default: null },
  cantidadUsdt: { type: String, default: null }, // canónica, 18 decimales
  origenWei: { type: String, default: null },    // lo que se entrega de verdad
  precioAplicadoWei: { type: String, default: null },
  porQuePrecio: { type: String, enum: ['congelado', 'recalculado', null], default: null },

  hash: { type: String, default: null },
  estado: {
    type: String,
    enum: ['esperando', 'recalculada', 'en-revision', 'entregando', 'entregada',
           'en-duda', 'fallida', 'cancelada', 'vencida'],
    required: true,
    default: 'esperando',
  },
  motivo: { type: String, default: null },
}, { timestamps: true });

ordenCompraSchema.index({ userId: 1, createdAt: -1 });
ordenCompraSchema.index({ estado: 1, cadena: 1 });
// Para buscar la orden a la que le toca un depósito: por dirección y red.
ordenCompraSchema.index({ direccion: 1, cadena: 1, createdAt: -1 });

const OrdenCompra = mongoose.models.OrdenCompra
  || mongoose.model('OrdenCompra', ordenCompraSchema, 'ordenesCompra');

// ── La cuenta por pagar a Orden Global ──────────────────────────────────────
//
// DE DÓNDE SALE EL ORIGEN QUE SE ENTREGA. No de un inventario que Ordenex
// tenga comprado de antemano: Ordenex se lo compra a Orden Global, y cada
// entrega deja una CUENTA POR PAGAR entre las dos empresas.
//
// Por qué esto es una colección y no un comentario en un acta: porque si no
// se anota en el momento de la entrega, no se anota nunca. La entrega es un
// envío en la cadena 5550 y se ve en el explorador, pero el explorador no
// sabe que ese ORIGEN se le debe a nadie. Reconstruir la deuda después, a
// mano, cruzando transacciones con órdenes, es el trabajo que nadie hace y
// que termina en «más o menos tanto».
//
// UNA FILA POR ENTREGA, no un total que se va sumando. Un saldo acumulado que
// se actualiza con `$inc` no se puede auditar: si un día no cuadra, no hay
// forma de saber qué entrega lo descuadró. Con una fila por entrega, el total
// es una suma y cada sumando tiene su hash.
const porPagarSchema = new mongoose.Schema({
  a: { type: String, required: true, default: 'orden-global' },
  ordenId: { type: mongoose.Schema.Types.ObjectId, required: true },
  userId: { type: String, required: true },
  // Lo que se entregó y a qué precio se valoró. Los dos, porque la deuda es en
  // ORIGEN pero se va a conversar en dólares, y el precio de hoy no sirve para
  // valorar una entrega de hace tres meses.
  origenWei: { type: String, required: true },
  precioWei: { type: String, required: true },
  usdMicro: { type: String, required: true },
  hash: { type: String, default: null },      // la entrega en la 5550
  cadenaPago: { type: Number, default: null }, // la red por la que entró el USDT
  liquidada: { type: Boolean, required: true, default: false },
  liquidadaEn: { type: Date, default: null },
  nota: { type: String, default: null },
}, { timestamps: true });

// Una entrega no puede generar dos deudas. El índice lo garantiza aunque dos
// procesos intenten anotarla a la vez.
porPagarSchema.index({ ordenId: 1 }, { unique: true });
porPagarSchema.index({ liquidada: 1, createdAt: 1 });

const PorPagar = mongoose.models.PorPagarOG
  || mongoose.model('PorPagarOG', porPagarSchema, 'porPagarOrdenGlobal');

// ── La cuenta ───────────────────────────────────────────────────────────────

/**
 * ORIGEN que corresponde a una cantidad de USDT a un precio.
 *
 * `usdtCanonico` viene en 18 decimales (lib/decimales.js), `precioWei` es USD
 * por ORIGEN también en 18. La división entera TRUNCA, y trunca A FAVOR DE
 * ESTA CASA por medio wei — que es la dirección correcta para redondear
 * cuando el error no se puede evitar: nunca se entrega más de lo comprado.
 *
 * Es exactamente la misma cuenta que hace la pantalla (comprar.js:origenDe).
 * Que las dos coincidan hasta el último wei es lo que hace que el número que
 * alguien vio antes de mandar sea el número que recibe.
 */
function origenWeiDe(usdtCanonico, precioWei) {
  const c = BigInt(usdtCanonico);
  const p = BigInt(precioWei);
  if (p <= 0n) throw Object.assign(new Error('precio invalido'), { codigo: 'PRECIO_INVALIDO' });
  return ((c * WEI) / p).toString();
}

/** micro-dólares → canónico de 18, sin pasar por coma flotante. */
const microACanonico = (micro) => (BigInt(micro) * (10n ** 12n)).toString();

/**
 * El precio del ORIGEN ahora mismo, en wei.
 *
 * Sale de la MISMA referencia que /mercados: el gramin (onza de oro / 31,1035
 * / 55). Si el feed no contesta esto devuelve null y NO se congela nada — un
 * precio congelado sobre un feed caído es un número inventado con
 * consecuencias, y es peor que no dejar comprar un rato.
 */
async function precioAhora() {
  let r = null;
  try { r = await referencia.referenciaDe('AUKA-ORIGEN'); } catch { r = null; }
  const usd = Number(r?.origenUsd);
  if (!Number.isFinite(usd) || usd <= 0) return null;
  // Micro-dólares primero y wei después: la misma escalera que la pantalla,
  // para que el redondeo del sexto decimal caiga en el mismo sitio en los dos
  // lados. Redondear distinto aquí y allá es cómo se llega a que el número
  // prometido y el entregado no cuadran por unos wei.
  const micro = BigInt(Math.round(usd * 1e6));
  return { wei: (micro * (10n ** 12n)).toString(), usd, oroUsd: r?.usd ?? null, en: new Date() };
}

// ── Abrir una orden ─────────────────────────────────────────────────────────

const fallo = (codigo, mensaje, status = 400) =>
  Object.assign(new Error(mensaje), { codigo, status });

/**
 * Congela un precio para esta persona en esta red.
 *
 * Lo que NO se hace aquí y es a propósito: no se reserva nada, no se toca el
 * libro y no se promete inventario. Una orden es una promesa de PRECIO por un
 * rato; mientras no llegue dinero no hay nada que respaldar.
 */
async function abrir(usuario, { montoMicro, cadena: red, aceptoRecalculo, reglaRecalculoVersion }) {
  const id = Number(red);
  if (!redes.REDES[id]) throw fallo('RED_INVALIDA', 'Esa red no recibe USDT en esta casa.');
  if (!decimales.listo(id)) {
    throw fallo('RED_NO_LISTA', 'Esa red no está disponible ahora mismo.', 503);
  }
  if (!/^[0-9]{1,30}$/.test(String(montoMicro)) || BigInt(montoMicro) <= 0n) {
    throw fallo('MONTO_INVALIDO', 'El monto tiene que ser un entero de micro-dólares positivo.');
  }
  // El mínimo de la red, comprobado AQUÍ y no solo en la pantalla. Quien tiene
  // que negarse es el servidor: una pantalla puede estar vieja o puede no ser
  // la nuestra. En Ethereum el mínimo no es capricho — barrer cuatro dólares
  // cuesta más que los cuatro dólares.
  const minimo = BigInt(redes.REDES[id].minimoMicro || 0);
  if (BigInt(montoMicro) < minimo) {
    throw fallo('BAJO_MINIMO',
      `En ${redes.REDES[id].nombre} el mínimo es ${Number(minimo) / 1e6} USDT.`);
  }
  if (aceptoRecalculo !== true || reglaRecalculoVersion !== REGLA_RECALCULO) {
    // No es burocracia: si el plazo vence, el precio cambia, y eso hay que
    // haberlo dicho ANTES. Una aceptación guardada sin versión no sirve de
    // nada el día que alguien pregunte a qué dijo que sí.
    throw fallo('FALTA_ACEPTAR_RECALCULO', 'Hay que aceptar la regla de recálculo para congelar un precio.');
  }

  // Sin dirección de Veta Wallet la orden NO nace. Cobrarle a alguien por una
  // entrega que no se le puede hacer es el peor orden posible.
  const aWallet = usuario.direccionWallet;
  if (!aWallet) {
    throw fallo('SIN_DIRECCION_WALLET', 'Hace falta una dirección de Veta Wallet para recibir el ORIGEN.');
  }
  let destino;
  try { destino = getAddress(String(aWallet)); } catch {
    throw fallo('WALLET_INVALIDA', 'La dirección de Veta Wallet guardada no es válida.');
  }
  if (billeteras.esDeLaCasa(destino)) {
    // Entregarle a una billetera nuestra y anotarlo como entregado es un
    // descuadre que después no encuentra nadie.
    throw fallo('WALLET_DE_LA_CASA', 'Esa dirección es de la casa: no puede recibir una compra.');
  }

  const direccion = usuario.direccionDeposito;
  if (!direccion) throw fallo('SIN_DIRECCION_DEPOSITO', 'Todavía no hay dirección de depósito.', 503);

  const p = await precioAhora();
  if (!p) throw fallo('SIN_REFERENCIA_AHORA', 'No hay referencia del oro ahora mismo: probá en un rato.', 503);

  const canonico = microACanonico(montoMicro);
  const orden = await OrdenCompra.create({
    userId: String(usuario._id),
    cadena: id,
    direccion,
    aWallet: destino,
    montoMicro: String(montoMicro),
    precioWei: p.wei,
    origenWeiCotizado: origenWeiDe(canonico, p.wei),
    oroUsd: p.oroUsd,
    plazoSeg: PLAZO_SEG,
    venceEn: new Date(Date.now() + PLAZO_SEG * 1000),
    reglaRecalculo: REGLA_RECALCULO,
  });
  return paraPantalla(orden);
}

// ── Lo que ve la pantalla ───────────────────────────────────────────────────

/** El paso del riel. Cuatro renglones, y cada uno dice algo verdadero. */
function pasoDe(o) {
  if (o.estado === 'entregada') return 4;
  if (o.estado === 'entregando' || o.estado === 'en-revision' || o.estado === 'recalculada'
      || o.estado === 'en-duda') return 3;
  if (o.depositoId) return 2;
  return 1;
}

function paraPantalla(o) {
  const cfg = redes.REDES[o.cadena];
  const restanSeg = Math.max(0, Math.round((new Date(o.venceEn).getTime() - Date.now()) / 1000));
  return {
    id: String(o._id),
    cadena: o.cadena,
    montoMicro: o.montoMicro,
    // Lo que LLEGO de verdad, en canonico de 18. Va siempre y no solo en el
    // recalculo: la pantalla tiene que poder dejar de pedir un deposito que
    // ya se hizo. Null mientras no haya llegado nada.
    recibidoUsdt: o.cantidadUsdt || null,
    origenWei: o.origenWei || o.origenWeiCotizado,
    direccion: o.direccion,
    aWallet: o.aWallet,
    precioWei: o.precioAplicadoWei || o.precioWei,
    restanSeg,
    plazoSeg: o.plazoSeg,
    paso: pasoDe(o),
    estado: o.estado,
    hash: o.txDeposito || null,
    explorador: o.txDeposito && cfg ? `${cfg.explorador || ''}${o.txDeposito}` : null,
    // La entrega es OTRO hash y en OTRA cadena. Mezclarlos en un solo campo
    // manda a la gente a buscar en el explorador equivocado.
    hashEntrega: o.estado === 'entregada' ? o.hash : null,
    // Solo cuando hay algo que decidir. Que este campo exista es lo que
    // dispara el aviso en la pantalla: se recalculó y falta que diga que sí.
    recalculo: o.estado === 'recalculada' ? {
      origenWei: o.origenWei,
      precioWei: o.precioAplicadoWei,
      cantidadUsdt: o.cantidadUsdt,
      cotizado: o.origenWeiCotizado,
    } : null,
    motivo: o.motivo || null,
  };
}

async function ver(userId, id) {
  let o;
  try { o = await OrdenCompra.findById(id).lean(); } catch { o = null; }
  if (!o || o.userId !== String(userId)) throw fallo('NO_EXISTE', 'Esa orden no existe.', 404);
  return paraPantalla(o);
}

async function mias(userId, limite = 20) {
  const filas = await OrdenCompra.find({ userId: String(userId) })
    .sort({ createdAt: -1 }).limit(limite).lean();
  return filas.map(paraPantalla);
}

async function cancelar(userId, id) {
  // Solo se cancela lo que todavía no tiene dinero encima. Una orden con
  // depósito no se cancela: ese dinero ya llegó y hay que resolverlo.
  const o = await OrdenCompra.findOneAndUpdate(
    { _id: id, userId: String(userId), estado: 'esperando', depositoId: null },
    { estado: 'cancelada', motivo: 'la canceló la persona' },
    { new: true }
  ).lean();
  if (!o) throw fallo('NO_SE_PUEDE_CANCELAR', 'Esa orden ya no se puede cancelar.', 409);
  return paraPantalla(o);
}

// ── Atender un depósito ─────────────────────────────────────────────────────

/**
 * Le busca orden a un depósito y la deja lista para entregar.
 *
 * NO entrega: solo decide a qué precio y con qué cantidad, y deja la orden en
 * 'esperando' (lista, dentro de plazo) o en 'recalculada' (vencida o sin
 * orden: falta que la persona diga que sí).
 */
async function atender(dep) {
  const yaTiene = await OrdenCompra.findOne({ depositoId: dep._id }).lean();
  if (yaTiene) return { ok: true, estado: 'ya-atendido', ordenId: String(yaTiene._id) };

  const usuario = await Usuario.findById(dep.userId, { direccionWallet: 1, direccionDeposito: 1 }).lean();
  if (!usuario) return { ok: false, motivo: 'el usuario del depósito no existe' };
  if (!usuario.direccionWallet) {
    // No es un fallo nuestro y no se puede resolver solo: la persona tiene que
    // poner su billetera. El depósito espera, visible, y no se pierde.
    return { ok: false, estado: 'sin-wallet', motivo: 'la persona no tiene dirección de Veta Wallet' };
  }

  // El tamiz de sanciones sobre QUIEN MANDÓ, antes de decidir nada. Si Genesis
  // no contesta, no se sigue: un tamiz que no se pudo hacer no es un tamiz
  // aprobado (misma regla que los retiros).
  const genesis = genesisPerezoso();
  if (!genesis || typeof genesis.tamizDireccion !== 'function') {
    return { ok: false, estado: 'sin-tamiz', motivo: 'el tamiz de sanciones no está disponible' };
  }
  let tamiz;
  try { tamiz = await genesis.tamizDireccion(dep.de); } catch (e) {
    return { ok: false, estado: 'sin-tamiz', motivo: `el tamiz no contestó: ${e.message}` };
  }
  if (!tamiz || tamiz.sancionada === true) {
    await DepositoExterno.updateOne({ _id: dep._id }, { estado: 'anulado', error: 'origen sancionado' });
    console.error(`[compra] depósito ${dep.txHash} anulado: el origen ${dep.de} está sancionado`);
    return { ok: false, estado: 'sancionado', motivo: 'el origen del depósito está sancionado' };
  }

  // La orden a la que le toca: la más reciente que esté esperando en esa
  // dirección y esa red, abierta ANTES de que el dinero entrara en el bloque.
  // El instante que manda es el del BLOQUE, no el de cuando lo vimos: si el
  // vigía estuvo caído veinte minutos, esa avería NUESTRA no puede vencerle el
  // precio a quien pagó a tiempo.
  //
  // LA TOLERANCIA DE RELOJ, y por qué existe. `createdAt` lo pone el reloj de
  // este servidor; `enCadena` lo pone el validador que minó el bloque. Los dos
  // relojes no son el mismo y no tienen por qué coincidir al segundo. Sin
  // holgura, un servidor unos segundos adelantado haría que un depósito hecho
  // JUSTO después de congelar el precio no encontrara su orden, y esa persona
  // vería un recálculo que no le tocaba — con un precio, encima, igual al que
  // ya tenía.
  //
  // Noventa segundos no se pueden aprovechar: el recálculo usa el precio del
  // momento en que se procesa, así que casar con una orden abierta un poco
  // después da exactamente el mismo número. Lo único que cambia es que no se
  // le pregunta de gusto.
  const HOLGURA_RELOJ_MS = 90_000;
  const limite = new Date(new Date(dep.enCadena).getTime() + HOLGURA_RELOJ_MS);
  const orden = await OrdenCompra.findOne({
    direccion: dep.direccion,
    cadena: dep.cadena,
    estado: 'esperando',
    depositoId: null,
    createdAt: { $lte: limite },
  }).sort({ createdAt: -1 });

  const aTiempo = orden && new Date(dep.enCadena) <= new Date(orden.venceEn);

  if (orden && aTiempo) {
    orden.depositoId = dep._id;
    orden.txDeposito = dep.txHash;
    orden.cantidadUsdt = dep.cantidad;
    orden.precioAplicadoWei = orden.precioWei;
    orden.porQuePrecio = 'congelado';
    // LA CANTIDAD SALE DE LA CADENA, no de lo cotizado. Ver la cabecera.
    orden.origenWei = origenWeiDe(dep.cantidad, orden.precioWei);
    await orden.save();
    return { ok: true, estado: 'lista', ordenId: String(orden._id) };
  }

  // Vencida, o sin orden ninguna. En los dos casos se recalcula y SE PREGUNTA.
  const p = await precioAhora();
  if (!p) return { ok: false, estado: 'sin-referencia', motivo: 'no hay referencia del oro para recalcular' };

  const destino = getAddress(String(usuario.direccionWallet));
  if (billeteras.esDeLaCasa(destino)) {
    return { ok: false, estado: 'wallet-de-la-casa', motivo: 'la billetera de destino es de la casa' };
  }

  const base = {
    depositoId: dep._id,
    txDeposito: dep.txHash,
    cantidadUsdt: dep.cantidad,
    precioAplicadoWei: p.wei,
    porQuePrecio: 'recalculado',
    origenWei: origenWeiDe(dep.cantidad, p.wei),
    estado: 'recalculada',
    motivo: orden ? 'el plazo se acabó antes de que llegara' : 'llegó sin una orden abierta',
  };

  if (orden) {
    Object.assign(orden, base);
    await orden.save();
    return { ok: true, estado: 'recalculada', ordenId: String(orden._id) };
  }

  const nueva = await OrdenCompra.create({
    userId: dep.userId,
    cadena: dep.cadena,
    direccion: dep.direccion,
    aWallet: destino,
    montoMicro: (BigInt(dep.cantidad) / (10n ** 12n)).toString(),
    precioWei: p.wei,
    origenWeiCotizado: base.origenWei,
    oroUsd: p.oroUsd,
    plazoSeg: PLAZO_SEG,
    venceEn: new Date(),
    reglaRecalculo: REGLA_RECALCULO,
    ...base,
  });
  return { ok: true, estado: 'recalculada', ordenId: String(nueva._id) };
}

/** La persona vio el número nuevo y dijo que sí. */
async function confirmarRecalculo(userId, id) {
  const o = await OrdenCompra.findOneAndUpdate(
    { _id: id, userId: String(userId), estado: 'recalculada' },
    { estado: 'esperando', motivo: 'la persona aceptó el precio recalculado' },
    { new: true }
  ).lean();
  if (!o) throw fallo('NO_HAY_QUE_CONFIRMAR', 'Esa orden no está esperando confirmación.', 409);
  return paraPantalla(o);
}

// ── Entregar ────────────────────────────────────────────────────────────────

/**
 * Manda el ORIGEN. Se entrega UNA vez y no se reintenta sola.
 *
 * El paso a 'entregando' es atómico y condicionado al estado anterior: si dos
 * procesos llegan a la vez, gana uno. Barrer dos veces es inofensivo; entregar
 * dos veces es regalar el doble.
 */
async function entregar(ordenId) {
  const o = await OrdenCompra.findOneAndUpdate(
    { _id: ordenId, estado: 'esperando', depositoId: { $ne: null }, origenWei: { $ne: null } },
    { estado: 'entregando' },
    { new: true }
  );
  if (!o) return { ok: false, estado: 'no-tocaba' };

  const soltar = async (estado, motivo) => {
    await OrdenCompra.updateOne({ _id: o._id }, { estado, motivo });
    return { ok: false, estado, motivo };
  };

  if (!cadena.direccionCaliente()) return soltar('fallida', 'la billetera de entrega no está configurada');
  if (billeteras.esDeLaCasa(o.aWallet)) return soltar('fallida', 'el destino es una billetera de la casa');
  if (BigInt(o.origenWei) <= 0n) {
    return soltar('fallida', 'la cantidad no llega ni a un wei de ORIGEN');
  }

  // ¿Hay ORIGEN para entregar? Se mira ANTES de firmar: una transacción que
  // revierte por saldo cuesta gas y deja la orden en duda sin motivo.
  const saldo = await cadena.saldoDe(cadena.direccionCaliente(), 'ORIGEN');
  if (!saldo.ok) return soltar('en-duda', `no se pudo leer el inventario: ${saldo.error}`);
  if (BigInt(saldo.wei) < BigInt(o.origenWei)) {
    console.error(`[compra] SIN INVENTARIO: hacen falta ${o.origenWei} wei de ORIGEN y hay ${saldo.wei}`);
    return soltar('en-revision', 'no hay ORIGEN suficiente para entregar: lo tiene que ver una persona');
  }

  try {
    const envio = await cadena.enviarDesdeCaliente({
      a: o.aWallet, activo: 'ORIGEN', cantidadWei: o.origenWei,
    });
    await OrdenCompra.updateOne({ _id: o._id }, { estado: 'entregada', hash: envio.hash, motivo: null });
    await DepositoExterno.updateOne({ _id: o.depositoId }, { estado: 'acreditado' });
    await anotarPorPagar(o, envio.hash);
    console.log(`[compra] entregados ${o.origenWei} wei de ORIGEN a ${o.aWallet} · ${envio.hash}`);
    return { ok: true, estado: 'entregada', hash: envio.hash };
  } catch (e) {
    // `nuncaSalio` lo marca lib/cadena5550.js en los errores que son
    // anteriores a la firma. Todo lo demás es DUDA: puede haber una
    // transacción viva y reintentarla es como se entrega dos veces.
    if (e && e.nuncaSalio === true) {
      return soltar('fallida', `${e.codigo || ''} ${e.message}`.trim());
    }
    console.error(`[compra] EN DUDA: la orden ${o._id} pudo haber emitido ${o.origenWei} wei a ${o.aWallet} — ${e.message}`);
    return soltar('en-duda', `${e.codigo || ''} ${e.message}`.trim());
  }
}

/**
 * Anota lo que esta entrega le debe a Orden Global.
 *
 * NUNCA tumba una entrega. La transacción ya salió y el ORIGEN ya está en la
 * billetera de la persona: negarle su compra porque no se pudo escribir un
 * apunte contable sería el orden de prioridades al revés. Si esto falla, se
 * canta con todo para que se pueda anotar a mano — y el índice único deja
 * volver a intentarlo sin duplicar.
 */
async function anotarPorPagar(orden, hash) {
  try {
    const precio = orden.precioAplicadoWei || orden.precioWei;
    // El valor en dólares de lo entregado, en micro-dólares y con enteros:
    // origen * precio / 10^18, y otra vez / 10^12 para bajar de wei a micro.
    const usdMicro = ((BigInt(orden.origenWei) * BigInt(precio)) / WEI / (10n ** 12n)).toString();
    await PorPagar.create({
      ordenId: orden._id,
      userId: orden.userId,
      origenWei: orden.origenWei,
      precioWei: precio,
      usdMicro,
      hash,
      cadenaPago: orden.cadena,
    });
  } catch (e) {
    if (e && e.code === 11000) return; // ya estaba anotada
    console.error(
      `[compra] CUENTA POR PAGAR SIN ANOTAR: la orden ${orden._id} entregó ${orden.origenWei} wei de ORIGEN (${hash}) y la deuda con Orden Global no se pudo escribir: ${e.message}`
    );
  }
}

/** Lo que Ordenex le debe a Orden Global, sin liquidar. Para el panel. */
async function deuda() {
  const filas = await PorPagar.aggregate([
    { $match: { liquidada: false } },
    { $group: { _id: null, n: { $sum: 1 } } },
  ]);
  // La suma se hace en BigInt y no en Mongo: $sum sobre strings no suma, y
  // sobre números perdería enteros pasado 2^53 — que son 0,009 ORIGEN.
  const todas = await PorPagar.find({ liquidada: false }).select('origenWei usdMicro').lean();
  let origen = 0n;
  let usd = 0n;
  for (const f of todas) { origen += BigInt(f.origenWei); usd += BigInt(f.usdMicro); }
  return {
    a: 'Orden Global',
    porQue: 'el ORIGEN que Ordenex le compró para entregar',
    entregas: filas[0]?.n || 0,
    origenWei: origen.toString(),
    usdMicro: usd.toString(),
  };
}

// ── La vuelta ───────────────────────────────────────────────────────────────

let corriendo = false;

async function ciclo() {
  if (corriendo) return;
  corriendo = true;
  try {
    // 1. Los depósitos que nadie atendió todavía.
    let nuevos = [];
    try {
      nuevos = await DepositoExterno.find({ estado: 'visto' }).sort({ enCadena: 1 }).limit(50).lean();
    } catch (e) {
      // Mongo no contestó. Se dice y se sigue: la vuelta que viene lo intenta
      // otra vez. Lo que NO puede pasar es que esto salga de `ciclo` — ver
      // `arrancar`, más abajo.
      console.error(`[compra] no se pudieron leer los depósitos: ${e.message}`);
    }
    for (const d of nuevos) {
      try {
        const r = await atender(d);
        if (!r.ok) console.error(`[compra] ${d.txHash}: ${r.estado || ''} ${r.motivo}`);
      } catch (e) {
        console.error(`[compra] ${d.txHash}: ${e.message}`);
      }
    }
    // 2. Las órdenes listas para entregar.
    let listas = [];
    try {
      listas = await OrdenCompra.find({
        estado: 'esperando', depositoId: { $ne: null }, origenWei: { $ne: null },
      }).limit(25).lean();
    } catch (e) {
      console.error(`[compra] no se pudieron leer las órdenes listas: ${e.message}`);
    }
    for (const o of listas) {
      try {
        const r = await entregar(o._id);
        if (!r.ok && r.estado !== 'no-tocaba') console.error(`[compra] orden ${o._id}: ${r.estado} — ${r.motivo}`);
      } catch (e) {
        console.error(`[compra] orden ${o._id}: ${e.message}`);
      }
    }
    // 3. Las que se quedaron sin dinero encima y ya vencieron: se cierran para
    //    que no se acumulen abiertas para siempre. No es una pérdida de nada:
    //    una orden sin depósito es una cotización que caducó.
    try {
      await OrdenCompra.updateMany(
        { estado: 'esperando', depositoId: null, venceEn: { $lt: new Date(Date.now() - 3600_000) } },
        { estado: 'vencida', motivo: 'caducó sin que llegara nada' }
      );
    } catch (e) {
      console.error(`[compra] no se pudieron cerrar las caducadas: ${e.message}`);
    }
  } finally {
    corriendo = false;
  }
}

async function arrancar() {
  await OrdenCompra.syncIndexes().catch((e) => console.error(`[compra] indices: ${e.message}`));
  await PorPagar.syncIndexes().catch((e) => console.error(`[compra] indices por pagar: ${e.message}`));
  console.log(`[compra] atendiendo depósitos cada ${CADA_MS / 1000}s · plazo de ${PLAZO_SEG}s`);
  // EL RELOJ SE PONE PASE LO QUE PASE EN LA PRIMERA VUELTA.
  //
  // Antes se hacía `await ciclo()` a pelo, y eso tenía un fallo que solo se ve
  // arrancando de verdad: si Mongo tarda en contestar en el arranque —cosa
  // normal en Heroku— la primera vuelta truena, la excepción sale de aquí, el
  // `setInterval` NUNCA se crea, y el bucle de entrega queda muerto para
  // siempre. Sin ruido: el proceso sirve peticiones tan campante y nadie
  // recibe su ORIGEN hasta que alguien reinicia el dyno.
  await ciclo().catch((e) => console.error(`[compra] la primera vuelta falló: ${e.message}`));
  const reloj = setInterval(() => { ciclo().catch((e) => console.error(`[compra] ${e.message}`)); }, CADA_MS);
  reloj.unref?.();
  return reloj;
}

/** Para el panel. Lo que hay que mirar son 'en-duda' y 'en-revision'. */
async function resumen() {
  try {
    const por = await OrdenCompra.aggregate([{ $group: { _id: '$estado', n: { $sum: 1 } } }]);
    const quierenOjos = await OrdenCompra.find({ estado: { $in: ['en-duda', 'en-revision', 'fallida'] } })
      .sort({ updatedAt: -1 }).limit(20)
      .select('userId cadena aWallet origenWei estado motivo txDeposito hash updatedAt').lean();
    const p = await precioAhora();
    let porPagar = null;
    try { porPagar = await deuda(); } catch (e) { porPagar = { error: e.message }; }
    return {
      plazoSeg: PLAZO_SEG,
      porPagar,
      reglaRecalculo: REGLA_RECALCULO,
      precio: p ? { usd: p.usd, wei: p.wei, oroUsd: p.oroUsd } : null,
      por: Object.fromEntries(por.map((x) => [x._id, x.n])),
      quierenOjos,
    };
  } catch (e) {
    return { error: e.message };
  }
}

module.exports = {
  OrdenCompra, PorPagar, PLAZO_SEG, REGLA_RECALCULO,
  abrir, ver, mias, cancelar, atender, confirmarRecalculo, entregar,
  ciclo, arrancar, resumen, precioAhora, deuda,
  _adentro: { origenWeiDe, microACanonico, paraPantalla, pasoDe, anotarPorPagar },
};
