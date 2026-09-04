// El barrido: mover el USDT de la dirección provisional a la caja única.
//
// ══════════════════════════════════════════════════════════════════════════
// LA IDEA QUE HACE QUE ESTO SEA SEGURO
//
// Un barrido NO es una transferencia por una cantidad. Es «llevate todo lo
// que haya ahí». Y esa diferencia lo cambia todo:
//
//   · Acreditar tiene que pasar EXACTAMENTE UNA VEZ. Dos veces es dinero
//     inventado, y por eso el vigía se apoya en un índice único.
//   · Barrer dos veces no es nada. La segunda vuelta lee el saldo, encuentra
//     cero, y no firma. El error se cura solo.
//
// Por eso este archivo nunca lleva la cuenta de «a esta ya la barrí». Lee el
// saldo en cada vuelta y decide con lo que ve. Una memoria no sobrevive a un
// reinicio ni a dos dynos; el saldo de la cadena sí.
//
// ══════════════════════════════════════════════════════════════════════════
// LO QUE SÍ NECESITA CANDADO, Y POR QUÉ
//
// Repetir un barrido es inofensivo; hacer DOS A LA VEZ no lo es. Los dos
// firman con la misma llave, el mismo nonce, la misma cantidad: uno entra y
// el otro es rechazado, o —si el nodo les da nonces distintos— el segundo se
// queda esperando fondos que ya no están. No se pierde dinero, pero se gasta
// gas, se ensucia el registro y se pierde media hora entendiendo qué pasó.
//
// El candado es un documento con índice único parcial sobre `estado:
// 'enviando'`: solo puede haber UNO en vuelo por dirección y red, y lo
// garantiza Mongo, no un `if` que no sobrevive a dos dynos.
//
// ══════════════════════════════════════════════════════════════════════════
// LA DUDA
//
// Si el envío revienta por plazo agotado, puede haber una transacción viva en
// el mempool. Reintentar ahí mismo es como se mandan dos. La fila queda
// 'en-duda', el candado se suelta, y NO se vuelve a intentar hasta pasado
// ENFRIAMIENTO_MS — tiempo de sobra para que la transacción entre o muera. La
// vuelta siguiente relee el saldo y el saldo decide: si es cero, entró.
//
// Es la doctrina de cadena5550.js:57-107, aplicada a un caso donde además se
// puede comprobar el resultado leyendo la cadena.
//
// ══════════════════════════════════════════════════════════════════════════
// LO QUE ESTE ARCHIVO NO HACE
//
// NO ACREDITA. Mueve custodia y nada más: el USDT pasa de la dirección
// provisional a la caja, y el libro no se toca. Quién recibe cuánto ORIGEN lo
// decide la orden con su precio congelado (lib/compra.js), y esa cuenta no
// depende de dónde esté guardado el dinero.

const mongoose = require('mongoose');
const { Contract, Wallet, formatUnits } = require('ethers');
const proveedores = require('./proveedores');
const redes = require('./redesUsdt');
const decimales = require('./decimales');
const billeteras = require('./billeteras');
const delegacion = require('./delegacion');
const gas = require('./gas');
const { llaveDeUsuario, MOTIVOS } = require('./deposito');
const { Usuario } = require('../models');
const { DepositoExterno } = require('./vigiaDepositosExternos');

const ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function transfer(address,uint256) returns (bool)',
];

// ── Lo que se guarda ────────────────────────────────────────────────────────

const barridoSchema = new mongoose.Schema({
  cadena: { type: Number, required: true },
  direccion: { type: String, required: true },
  userId: { type: String, required: true },
  // El crudo que había cuando se decidió barrer. No es la cantidad que llegó
  // a la caja necesariamente —si entra otro depósito entre la lectura y la
  // firma, la diferencia se barre en la vuelta siguiente— pero es lo que se
  // firmó, y es lo que hay que poder comparar contra la cadena.
  crudo: { type: String, required: true },
  decimales: { type: Number, required: true },
  cantidad: { type: String, required: true },
  a: { type: String, required: true }, // la caja: se guarda por si algún día cambia
  hash: { type: String, default: null },
  estado: {
    type: String,
    enum: ['enviando', 'hecho', 'en-duda', 'fallo'],
    required: true,
    default: 'enviando',
  },
  motivo: { type: String, default: null },
}, { timestamps: true });

/* EL candado. Parcial y no completo: solo se indexa lo que está EN VUELO, así
   que una dirección puede tener veinte barridos 'hecho' a lo largo del tiempo
   y aun así solo uno 'enviando' a la vez. Un índice único sin el parcial
   permitiría barrer esa dirección una única vez en su vida. */
barridoSchema.index(
  { cadena: 1, direccion: 1 },
  { unique: true, partialFilterExpression: { estado: 'enviando' } }
);
barridoSchema.index({ estado: 1, updatedAt: -1 });
barridoSchema.index({ userId: 1, createdAt: -1 });

const Barrido = mongoose.models.BarridoExterno
  || mongoose.model('BarridoExterno', barridoSchema, 'barridosExternos');

// ── Los números ─────────────────────────────────────────────────────────────

const CADA_MS = Number(process.env.BARRIDO_CADA_MS || 60_000);
/** Cuántas direcciones por vuelta. En serie y con tope: cada una descifra o
 *  deriva una llave y habla dos veces con el RPC. */
const POR_VUELTA = Number(process.env.BARRIDO_POR_VUELTA || 25);
/** Cuánto se deja reposar una duda antes de volver a mirarla. Tres minutos es
 *  más que suficiente para que una transacción entre o desaparezca en las tres
 *  redes; en Ethereum, la más lenta, son ~15 bloques. */
const ENFRIAMIENTO_MS = Number(process.env.BARRIDO_ENFRIAMIENTO_MS || 180_000);
/** Un candado abandonado —el proceso murió entre crear la fila y firmar— no
 *  puede bloquear esa dirección para siempre. Pasado esto se da por perdido. */
const CANDADO_VIEJO_MS = Number(process.env.BARRIDO_CANDADO_MS || 600_000);

const fallo = (motivo, extra = {}) => ({ ok: false, motivo, ...extra });

// ── A quién le toca ─────────────────────────────────────────────────────────

/**
 * Las direcciones con depósitos que aún están en la provisional.
 *
 * Se pregunta a los DEPÓSITOS, no a los usuarios: barrer recorriendo la tabla
 * de usuarios es una lectura de saldo por persona en cada vuelta, y con quince
 * mil usuarios eso es inviable y además inútil —la inmensa mayoría no tiene
 * nada. Aquí solo entran las direcciones donde el vigía vio llegar algo.
 */
async function pendientes(red, { ahora = Date.now(), limite = POR_VUELTA } = {}) {
  const id = Number(red);
  const filas = await DepositoExterno.aggregate([
    { $match: { cadena: id, custodia: 'provisional', estado: { $ne: 'anulado' } } },
    { $group: { _id: { direccion: '$direccion', userId: '$userId' }, n: { $sum: 1 } } },
    { $limit: limite * 4 }, // de sobra: abajo se descartan las que están en curso
  ]);

  const salida = [];
  for (const f of filas) {
    const direccion = f._id.direccion;
    const ultimo = await Barrido.findOne({ cadena: id, direccion }).sort({ updatedAt: -1 }).lean();
    if (ultimo && ultimo.estado === 'enviando') {
      // Hay uno en vuelo. Si es reciente, es de otro proceso y se respeta.
      if (ahora - new Date(ultimo.updatedAt).getTime() < CANDADO_VIEJO_MS) continue;
      // Si no, el proceso que lo creó murió. Se marca en duda y se deja para
      // la vuelta que viene: soltar el candado y firmar en el mismo aliento
      // sería firmar encima de una transacción que quizá sigue viva.
      await Barrido.updateOne({ _id: ultimo._id, estado: 'enviando' },
        { estado: 'en-duda', motivo: 'el proceso que lo empezó no volvió' });
      console.error(`[barrido] candado abandonado en ${direccion} (${redes.REDES[id].nombre}): se marca en duda`);
      continue;
    }
    if (ultimo && ultimo.estado === 'en-duda'
        && ahora - new Date(ultimo.updatedAt).getTime() < ENFRIAMIENTO_MS) continue;
    salida.push({ direccion, userId: f._id.userId, depositos: f.n });
    if (salida.length >= limite) break;
  }
  return salida;
}

// ── Barrer una dirección ────────────────────────────────────────────────────

/**
 * Mueve todo el USDT de una dirección provisional a la caja única.
 *
 * @returns {{ok, estado, hash?, crudo?, motivo?}}
 *   estado ∈ 'vacia' | 'barrido' | 'sin-gas' | 'ocupada' | 'en-duda' | 'no-se-pudo'
 */
async function barrer(red, direccion, userId) {
  const id = Number(red);
  const cfg = redes.REDES[id];
  if (!cfg) return fallo(`la red ${red} no recibe USDT`, { estado: 'no-se-pudo' });
  // Sin decimales comprobados no se anota una cantidad. Es la misma regla que
  // en el vigía y no se relaja porque aquí «solo» se mueva custodia: la fila
  // del barrido lleva una cantidad canónica y esa cantidad se lee después.
  if (!decimales.listo(id)) {
    return fallo(`los decimales de ${cfg.nombre} no están comprobados`, { estado: 'no-se-pudo' });
  }

  let pv;
  try { pv = await proveedores.proveedorDe(id); } catch (e) {
    return fallo(e.message, { estado: 'no-se-pudo' });
  }

  // ¿Sigue siendo una cuenta normal? Una dirección con código encima reenvía
  // lo que entra —así se fueron los 15 USDT del 4 de septiembre— y aquí el
  // riesgo es doble: el gas que le mandemos para poder barrer se va por el
  // mismo agujero. Ver lib/delegacion.js.
  const forma = await delegacion.de(pv, direccion);
  if (!forma.ok) return fallo(`no se pudo comprobar si está delegada: ${forma.error}`, { estado: 'no-se-pudo' });
  if (!forma.limpia) {
    console.error(`[barrido] NO SE BARRE: ${delegacion.motivo(forma, direccion)}`);
    return fallo(delegacion.motivo(forma, direccion), { estado: 'no-se-pudo' });
  }

  const usdt = new Contract(cfg.usdt, ABI, pv);
  let crudo;
  try { crudo = (await usdt.balanceOf(direccion)).toString(); } catch (e) {
    return fallo(`no se pudo leer el saldo: ${e.message}`, { estado: 'no-se-pudo' });
  }
  if (BigInt(crudo) === 0n) {
    // Nada que mover. Puede ser que ya se barrió en una vuelta anterior cuya
    // respuesta se perdió: se cierran los depósitos y se sigue. Que esto sea
    // un caso NORMAL y no un error es lo que hace que repetir sea inofensivo.
    await cerrar(id, direccion, null);
    return { ok: true, estado: 'vacia', crudo: '0' };
  }

  // El candado. Se crea ANTES de pedir gas: pedir gas ya cuesta dinero, y dos
  // procesos pidiendo gas para la misma dirección lo gastan dos veces.
  let candado;
  try {
    candado = await Barrido.create({
      cadena: id,
      direccion,
      userId,
      crudo,
      decimales: decimales.decimalesDe(id, 'USDT'),
      cantidad: decimales.aCanonico(crudo, id, 'USDT'),
      a: billeteras.UNICA,
    });
  } catch (e) {
    if (e && e.code === 11000) return { ok: true, estado: 'ocupada' }; // otro va
    return fallo(`no se pudo anotar el barrido: ${e.message}`, { estado: 'no-se-pudo' });
  }

  // El gas. El plan es la transferencia de verdad, para que la estimación sea
  // la de la transacción que se va a firmar y no una aproximación.
  const plan = { contrato: cfg.usdt, a: billeteras.UNICA, cantidad: crudo };
  let g;
  try { g = await gas.asegurarGas(id, direccion, plan); } catch (e) {
    g = { ok: false, estado: 'no-se-pudo', motivo: e.message };
  }
  if (!g.ok) {
    await Barrido.updateOne({ _id: candado._id },
      { estado: g.estado === 'en-duda' ? 'en-duda' : 'fallo', motivo: `gas: ${g.motivo}` });
    return fallo(`gas: ${g.motivo}`, { estado: g.estado === 'sin-fondos' ? 'sin-gas' : g.estado });
  }

  // La llave. lib/deposito.js comprueba que controle EXACTAMENTE esta
  // dirección antes de devolverla: firmar sin esa comprobación es firmar desde
  // la dirección de otro.
  let usuario;
  try {
    usuario = await Usuario.findById(userId,
      { direccionDeposito: 1, llaveDepositoCifrada: 1, origenDeLlave: 1, indiceDeposito: 1 }).lean();
  } catch (e) {
    await Barrido.updateOne({ _id: candado._id }, { estado: 'fallo', motivo: `mongo: ${e.message}` });
    return fallo(`no se pudo leer el usuario: ${e.message}`, { estado: 'no-se-pudo' });
  }
  if (!usuario) {
    await Barrido.updateOne({ _id: candado._id }, { estado: 'fallo', motivo: 'el usuario no existe' });
    return fallo('el usuario de esa dirección no existe', { estado: 'no-se-pudo' });
  }
  const r = llaveDeUsuario(usuario);
  if (!r.ok) {
    const motivo = MOTIVOS[r.motivo] || r.motivo;
    await Barrido.updateOne({ _id: candado._id }, { estado: 'fallo', motivo });
    return fallo(motivo, { estado: 'no-se-pudo' });
  }

  try {
    const firmante = new Wallet(r.llave, pv);
    const c = new Contract(cfg.usdt, ABI, firmante);
    const tx = await c.transfer(billeteras.UNICA, crudo);
    await tx.wait(1);
    await Barrido.updateOne({ _id: candado._id }, { estado: 'hecho', hash: tx.hash });
    await cerrar(id, direccion, tx.hash);
    const dec = decimales.decimalesDe(id, 'USDT');
    console.log(`[barrido] ${cfg.nombre}: ${formatUnits(crudo, dec)} USDT de ${direccion} → caja · ${tx.hash}`);
    return { ok: true, estado: 'barrido', hash: tx.hash, crudo };
  } catch (e) {
    // Igual que en el fondeo: un plazo agotado es una DUDA, no un fallo. Se
    // suelta el candado y se deja reposar; la vuelta siguiente lee el saldo y
    // el saldo dice la verdad.
    const nuncaSalio = e?.code === 'INSUFFICIENT_FUNDS' || e?.code === 'NONCE_EXPIRED'
      || e?.code === 'CALL_EXCEPTION';
    const motivo = `${e?.code || ''} ${e?.message || e}`.trim();
    await Barrido.updateOne({ _id: candado._id },
      { estado: nuncaSalio ? 'fallo' : 'en-duda', motivo });
    return fallo(motivo, { estado: nuncaSalio ? 'no-se-pudo' : 'en-duda' });
  }
}

/**
 * Marca los depósitos de esa dirección como ya no custodiados en la provisional.
 *
 * Toca `custodia`, NUNCA `estado`. Son dos ejes distintos a propósito: `estado`
 * cuenta la vida del depósito (visto → acreditado) y `custodia` cuenta dónde
 * está el dinero. Mezclarlos haría que barrer pareciese acreditar, que es
 * exactamente el error que nadie encuentra después.
 */
async function cerrar(red, direccion, hash) {
  await DepositoExterno.updateMany(
    { cadena: Number(red), direccion, custodia: 'provisional' },
    { custodia: 'barrido', barridoHash: hash }
  );
}

// ── La vuelta ───────────────────────────────────────────────────────────────

let corriendo = false;

async function vuelta(red) {
  const id = Number(red);
  const lista = await pendientes(id);
  const salida = { red: id, miradas: lista.length, barridas: 0, vacias: 0, sinGas: 0, fallos: [] };
  // En serie: cada una firma y espera confirmación. En paralelo, veinticinco
  // firmas simultáneas desde la misma billetera de gas se pisan el nonce.
  for (const p of lista) {
    let r;
    try { r = await barrer(id, p.direccion, p.userId); } catch (e) {
      r = fallo(e.message, { estado: 'no-se-pudo' });
    }
    if (r.estado === 'barrido') salida.barridas += 1;
    else if (r.estado === 'vacia') salida.vacias += 1;
    else if (r.estado === 'sin-gas') salida.sinGas += 1;
    else if (r.estado !== 'ocupada') salida.fallos.push({ direccion: p.direccion, estado: r.estado, motivo: r.motivo });
  }
  return salida;
}

async function ciclo() {
  if (corriendo) return;
  corriendo = true;
  try {
    for (const id of Object.keys(redes.REDES).map(Number)) {
      try {
        const r = await vuelta(id);
        if (r.barridas || r.fallos.length) {
          console.log(`[barrido] ${redes.REDES[id].nombre}: ${r.barridas} barridas, ${r.fallos.length} con problema`);
        }
        for (const f of r.fallos) console.error(`[barrido] ${f.direccion}: ${f.estado} — ${f.motivo}`);
        if (r.sinGas) console.error(`[barrido] ${redes.REDES[id].nombre}: ${r.sinGas} direcciones esperando gas`);
      } catch (e) {
        console.error(`[barrido] ${redes.REDES[id].nombre}: ${e.message}`);
      }
    }
  } finally {
    corriendo = false;
  }
}

async function arrancar() {
  await Barrido.syncIndexes().catch((e) => console.error(`[barrido] indices: ${e.message}`));
  console.log(`[barrido] cada ${CADA_MS / 1000}s → todo a ${billeteras.UNICA}`);
  // El reloj se pone pase lo que pase en la primera vuelta: si Mongo tarda en
  // el arranque y esto trueña, el setInterval no se crearía nunca y el barrido
  // quedaría muerto en silencio. Mismo motivo que en lib/compra.js.
  await ciclo().catch((e) => console.error(`[barrido] la primera vuelta falló: ${e.message}`));
  const reloj = setInterval(() => { ciclo().catch((e) => console.error(`[barrido] ${e.message}`)); }, CADA_MS);
  reloj.unref?.();
  return reloj;
}

/** Para el panel. Lo que importa mirar es 'en-duda': son los que necesitan ojos. */
async function resumen() {
  try {
    const por = await Barrido.aggregate([
      { $group: { _id: { cadena: '$cadena', estado: '$estado' }, n: { $sum: 1 } } },
    ]);
    const enDuda = await Barrido.find({ estado: { $in: ['en-duda', 'fallo'] } })
      .sort({ updatedAt: -1 }).limit(20)
      .select('cadena direccion cantidad estado motivo hash updatedAt').lean();
    const sinBarrer = await DepositoExterno.countDocuments({ custodia: 'provisional', estado: { $ne: 'anulado' } });
    return {
      caja: billeteras.UNICA,
      por: por.map((x) => ({ cadena: x._id.cadena, estado: x._id.estado, n: x.n })),
      pendientesDeBarrer: sinBarrer,
      quierenOjos: enDuda,
    };
  } catch (e) {
    return { error: e.message };
  }
}

module.exports = {
  Barrido, barrer, pendientes, vuelta, ciclo, arrancar, resumen, cerrar,
  _adentro: { ENFRIAMIENTO_MS, CANDADO_VIEJO_MS, POR_VUELTA, CADA_MS, ABI },
};
