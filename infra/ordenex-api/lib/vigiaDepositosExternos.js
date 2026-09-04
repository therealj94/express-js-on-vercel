// El vigía de los depósitos de USDT en Polygon, BNB Smart Chain y Ethereum.
//
// ══════════════════════════════════════════════════════════════════════════
// POR QUÉ NO SE COPIA EL VIGÍA DE LA 5550
//
// lib/vigia.js funciona por MARCA DE AGUA: compara el saldo de cada dirección
// con el último que vio y acredita la diferencia. Está bien hecho y para la
// 5550 es correcto. Aquí no sirve, y no por el motivo obvio.
//
// El motivo obvio —que el barrido baja el saldo— sí tiene arreglo: se podría
// llevar «esperado = depósitos − barridos» y comparar contra eso. Los motivos
// de verdad son otros tres y no tienen arreglo:
//
//  · UNA MARCA NO TIENE txHash. Sin hash no hay enlace a PolygonScan para la
//    persona, no hay recibo que volver a pedir contra una reorganización, y no
//    hay `from` que pasarle al tamiz de sanciones. Las tres hacen falta.
//  · UNA MARCA NO DISTINGUE DOS DEPÓSITOS. Dos transferencias en la misma
//    ventana son un solo delta, y con precio congelado por orden eso mezcla
//    dos operaciones en una.
//  · UNA MARCA CUESTA O(direcciones). vigia.js:128 hace una lectura por
//    usuario. Con quince mil usuarios y tres redes es inviable; getLogs cuesta
//    O(actividad), no O(usuarios).
//
// ══════════════════════════════════════════════════════════════════════════
// EL AGUJERO DE LOS EVENTOS, Y POR QUÉ LA MARCA DE AGUA NO SE TIRA
//
// Los eventos tienen un fallo que la marca no tenía, y es el peor de este
// archivo: UN getLogs QUE DEVUELVE 200 OK CON MENOS LOGS DE LOS QUE HAY ES
// INDETECTABLE, Y ES IRREVERSIBLE.
//
// La marca de agua se autoreparaba: miraba el saldo cada treinta segundos para
// siempre, así que un sondeo incompleto se corregía en el siguiente. Los
// eventos no. Si la marca de bloque avanza sobre un rango que el nodo sirvió a
// medias —un nodo desincronizado, una réplica atrasada, un balanceador que
// mandó a un nodo pruneado— ese depósito NO SE VUELVE A MIRAR JAMÁS. La
// persona mandó dinero de verdad, está en la cadena de verdad, y esta casa no
// lo va a ver nunca.
//
// Y no es teórico: proveedores.js elige el RPC por chainId, y un nodo que
// contesta el chainId correcto pero va cuatrocientos bloques atrasado pasa esa
// prueba sin problema.
//
// Por eso la marca de agua NO se tira: cambia de oficio. Detectar con eventos,
// AUDITAR con saldos (`conciliar`, más abajo). Es la red de seguridad y no es
// opcional.
//
// ══════════════════════════════════════════════════════════════════════════
// LO QUE ESTE ARCHIVO NO HACE, Y NO VA A HACER
//
// NO ACREDITA. Ve, identifica y anota — y ahí para. Quien decide qué pasa con
// un depósito es lib/compra.js: le busca su orden, le aplica el precio
// congelado, pasa el tamiz de sanciones y entrega el ORIGEN. Y quien mueve el
// dinero de sitio es lib/barridoExterno.js.
//
// La separación no es de orden de construcción: es permanente, y es lo que
// permite tener este archivo encendido MIRANDO mientras los otros dos están
// apagados. Una semana así enseña lo que ninguna prueba puede — qué RPC falla
// de verdad, cuánto tarda cada red de verdad, y qué hace la gente que no se
// puede predecir— sin que un fallo cueste un centavo.
//
// Por eso `estado` y `custodia` son dos campos distintos en el depósito: este
// archivo escribe el primero al nacer y no vuelve a tocar ninguno.

const mongoose = require('mongoose');
const { Contract, zeroPadValue, getAddress } = require('ethers');
const proveedores = require('./proveedores');
const redes = require('./redesUsdt');
const decimales = require('./decimales');
const { Usuario } = require('../models');

// ── Lo que se guarda ────────────────────────────────────────────────────────

const depositoExternoSchema = new mongoose.Schema({
  cadena: { type: Number, required: true },
  txHash: { type: String, required: true },
  logIndex: { type: Number, required: true },
  bloque: { type: Number, required: true },
  // El instante del BLOQUE, no el de cuando lo vimos. Es el que manda para
  // juzgar un precio congelado: si el vigía estuvo caído veinte minutos, esa
  // avería NUESTRA no puede vencerle el precio a quien pagó a tiempo.
  enCadena: { type: Date, required: true },
  de: { type: String, required: true }, // el `from`: lo que va al tamiz
  direccion: { type: String, required: true }, // nuestra dirección de depósito
  userId: { type: String, required: true },
  // Los dos, y no uno. El crudo permite rehacer la cuenta contra la cadena el
  // día que alguien discuta; el canónico es el que iría al libro. Guardar solo
  // uno obliga a confiar en que la conversión de aquel día fue la correcta.
  crudo: { type: String, required: true },
  decimales: { type: Number, required: true },
  cantidad: { type: String, required: true },
  // DOS EJES, Y NO UNO. `estado` cuenta la vida del depósito frente a la
  // persona; `custodia` cuenta dónde está el dinero. Son independientes de
  // verdad: un depósito puede estar acreditado y todavía sin barrer (normal:
  // el barrido va detrás), o barrido y sin acreditar (el tamiz lo retuvo).
  //
  // Meterlos en un solo campo es lo que hace que un día barrer PAREZCA
  // acreditar. Ese error no da ningún síntoma: la persona simplemente no
  // recibe lo suyo, y el descuadre aparece semanas después en un arqueo.
  estado: {
    type: String,
    enum: ['visto', 'confirmado', 'acreditado', 'anulado'],
    required: true,
    default: 'visto',
  },
  custodia: {
    type: String,
    enum: ['provisional', 'barrido'],
    required: true,
    default: 'provisional',
  },
  barridoHash: { type: String, default: null },
  error: { type: String, default: null },
}, { timestamps: true });

/* EL índice. Es lo único que impide anotar (y mañana acreditar) dos veces, y
   por eso la fila se crea con él puesto: si dos procesos ven el mismo log, uno
   crea y el otro choca con 11000. La guarda es de la base de datos, no un `if`
   en memoria — un `if` no sobrevive a dos dynos. (vigiaCompras.js:109-111.) */
depositoExternoSchema.index({ cadena: 1, txHash: 1, logIndex: 1 }, { unique: true });
depositoExternoSchema.index({ estado: 1, cadena: 1 });
// El índice del barrido: pregunta por «lo que sigue en la provisional» en
// cada vuelta, y sin esto sería un recorrido de toda la colección cada minuto.
depositoExternoSchema.index({ custodia: 1, cadena: 1 });
depositoExternoSchema.index({ userId: 1, createdAt: -1 });

const marcaSchema = new mongoose.Schema({
  clave: { type: String, required: true, unique: true },
  bloque: { type: Number, required: true },
});

const DepositoExterno = mongoose.models.DepositoExterno
  || mongoose.model('DepositoExterno', depositoExternoSchema, 'depositosExternos');
// El MISMO modelo que usa vigiaCompras — pero NUNCA las mismas claves. Aquel
// usa 'polygon' y 'bsc'; si este usara las mismas, los dos se pisarían la marca
// y cada uno se saltaría los bloques que leyó el otro. De ahí el prefijo `dep:`.
const Marca = mongoose.models.MarcaVigia || mongoose.model('MarcaVigia', marcaSchema, 'marcasVigia');

const claveMarca = (red) => `dep:${redes.REDES[Number(red)].clave}`;

// ── Los números que gobiernan la vuelta ─────────────────────────────────────

const CADA_MS = Number(process.env.VIGIA_EXTERNO_CADA_MS || 30_000);
/** Cuántas direcciones caben en un filtro. Más de 250 y algunos públicos
 *  rechazan el cuerpo de la consulta. */
const POR_TROZO = Number(process.env.VIGIA_EXTERNO_TROZO || 250);
/** Bloques por consulta. Arranca conservador y SE ADAPTA: el tope real de un
 *  RPC público no es de bloques sino de logs devueltos, y eso depende de
 *  cuánto se mueva la cadena ese día. Un número fijo está mal siempre. */
const RANGO_INICIAL = { 137: 500, 56: 500, 1: 800 };
const RANGO_MAXIMO = { 137: 2000, 56: 2000, 1: 5000 };
/** Para que recuperar cinco días de caída no monopolice el proceso ni el RPC. */
const PAGINAS_POR_VUELTA = Number(process.env.VIGIA_EXTERNO_PAGINAS || 40);
/** El primer arranque, sin marca: ~2 horas de bloques. Ni el génesis ni la
 *  punta — cubre el hueco de un despliegue sin releer historia que no existía. */
const VENTANA_INICIAL_HORAS = 2;

const rangoDe = new Map(); // red -> bloques por consulta, adaptativo

function rango(red) {
  const id = Number(red);
  return rangoDe.get(id) || RANGO_INICIAL[id] || 500;
}

/** Los errores que significan «el rango era muy grande», no «el nodo falló». */
function esDeRango(e) {
  const m = `${e?.code || ''} ${e?.message || e}`.toLowerCase();
  return /-32005|limit exceeded|more than|range|too large|response size|query timeout|too many/.test(m);
}

// ── Las direcciones que se vigilan ──────────────────────────────────────────

/**
 * Todas las direcciones de depósito, en minúsculas, con su dueño.
 *
 * Se relee al principio de CADA vuelta y no se cachea: una dirección creada
 * hace diez segundos tiene que entrar en el filtro de esta vuelta, porque es
 * justo la que alguien está mirando en la pantalla mientras manda su dinero.
 */
async function direcciones() {
  const filas = await Usuario.find(
    { direccionDeposito: { $ne: null } },
    { direccionDeposito: 1 }
  ).lean();
  const porDireccion = new Map();
  for (const f of filas) porDireccion.set(String(f.direccionDeposito).toLowerCase(), String(f._id));
  return porDireccion;
}

function trozos(lista, n) {
  const out = [];
  for (let i = 0; i < lista.length; i += n) out.push(lista.slice(i, i + n));
  return out;
}

// ── Leer una página de bloques ──────────────────────────────────────────────

/**
 * Los Transfer de USDT hacia NUESTRAS direcciones, entre dos bloques.
 *
 * El filtro va por `topics[2]` —el destinatario— con la lista de direcciones,
 * que eth_getLogs trata como un O lógico. Así filtra el NODO, con los filtros
 * de Bloom del bloque, y la respuesta es casi siempre vacía. La alternativa
 * —pedir todos los Transfer del contrato y cruzar en memoria— traería del
 * orden de un millón de logs diarios solo de BSC para tirar el 99,99%.
 */
async function leerPagina(pv, red, a, b, listaTrozos) {
  const cfg = redes.REDES[Number(red)];
  const salida = [];
  for (const trozo of listaTrozos) {
    const logs = await pv.getLogs({
      address: cfg.usdt, // lista blanca de UN contrato: otro token es invisible
      fromBlock: a,
      toBlock: b,
      topics: [redes.TEMA_TRANSFER, null, trozo.map((d) => zeroPadValue(d, 32))],
    });
    salida.push(...logs);
  }
  return salida;
}

/** Lee un rango partiéndolo a la mitad cuando el nodo dice que es muy grande. */
async function leerRango(pv, red, a, b, listaTrozos) {
  try {
    return await leerPagina(pv, red, a, b, listaTrozos);
  } catch (e) {
    if (!esDeRango(e) || a >= b) throw e;
    // Se parte y se reintenta cada mitad. Es la única forma de no tener que
    // adivinar el tope de cada proveedor, y de sobrevivir a que lo cambien.
    const medio = Math.floor((a + b) / 2);
    const izq = await leerRango(pv, red, a, medio, listaTrozos);
    const der = await leerRango(pv, red, medio + 1, b, listaTrozos);
    rangoDe.set(Number(red), Math.max(100, Math.floor(rango(red) / 2)));
    return izq.concat(der);
  }
}

// ── Anotar ──────────────────────────────────────────────────────────────────

async function anotar(red, log, dueno, pv) {
  const id = Number(red);
  const a = getAddress('0x' + log.topics[2].slice(26));
  const de = getAddress('0x' + log.topics[1].slice(26));
  const crudo = BigInt(log.data).toString();
  if (BigInt(crudo) === 0n) return null; // un transfer de cero no es un depósito

  // Los decimales SE LEEN de la cadena (lib/decimales.js) y si esa red no está
  // comprobada, esto lanza. Es lo correcto: anotar una cantidad en una unidad
  // que no se comprobó es exactamente el error de los 0,0000000001.
  const dec = decimales.decimalesDe(id, 'USDT');
  const cantidad = decimales.aCanonico(crudo, id, 'USDT');

  let enCadena = null;
  try {
    const b = await pv.getBlock(log.blockNumber);
    enCadena = b ? new Date(b.timestamp * 1000) : new Date();
  } catch {
    enCadena = new Date();
  }

  try {
    const fila = await DepositoExterno.create({
      cadena: id,
      txHash: log.transactionHash,
      logIndex: log.index ?? log.logIndex,
      bloque: log.blockNumber,
      enCadena,
      de,
      direccion: a,
      userId: dueno,
      crudo,
      decimales: dec,
      cantidad,
    });
    console.log(`[vigia-ext] ${redes.REDES[id].nombre}: ${crudo} (${dec} dec) → ${a} · ${log.transactionHash}`);
    return fila;
  } catch (e) {
    if (e && e.code === 11000) return null; // ya lo teníamos
    throw e;
  }
}

// ── La vuelta ───────────────────────────────────────────────────────────────

let sondeando = false;

async function vuelta(red) {
  const id = Number(red);
  const cfg = redes.REDES[id];
  if (!cfg) return { ok: false, error: `la red ${red} no recibe USDT` };

  // Sin decimales comprobados NO se mira esa cadena. Anotar cantidades en una
  // unidad no verificada es el error que lib/decimales.js existe para impedir,
  // y saltárselo aquí lo devolvería por la puerta de atrás.
  if (!decimales.listo(id)) {
    return { ok: false, error: `los decimales de ${cfg.nombre} no están comprobados` };
  }

  let pv;
  try { pv = await proveedores.proveedorDe(id); } catch (e) {
    return { ok: false, error: e.message };
  }

  const porDireccion = await direcciones();
  if (porDireccion.size === 0) return { ok: true, vistos: 0, paginas: 0, nota: 'sin direcciones que vigilar' };

  let hasta;
  try { hasta = await redes.techo(pv, id); } catch (e) {
    return { ok: false, error: `no se pudo saber hasta dónde leer: ${e.message}` };
  }
  if (hasta <= 0) return { ok: true, vistos: 0, paginas: 0 };

  const marca = await Marca.findOne({ clave: claveMarca(id) }).lean();

  // CORDURA DEL PROVEEDOR. Si el nodo dice ir por detrás de lo que ya leímos,
  // está atrasado o es una réplica vieja, y creerle avanzaría la marca sobre
  // bloques que no vio. Se abandona esta vuelta y se olvida ese proveedor.
  if (marca && hasta < marca.bloque) {
    proveedores._adentro.recordado.delete(id);
    return { ok: false, error: `el RPC va por detrás de la marca (${hasta} < ${marca.bloque})` };
  }

  const porHora = Math.ceil(3600 / (redes._adentro.medido.get(id)?.segundos || cfg.bloqueSegundos));
  const desde = marca ? marca.bloque + 1 : Math.max(0, hasta - porHora * VENTANA_INICIAL_HORAS);
  if (desde > hasta) return { ok: true, vistos: 0, paginas: 0 };

  const listaTrozos = trozos([...porDireccion.keys()], POR_TROZO);
  let vistos = 0;
  let paginas = 0;

  for (let a = desde; a <= hasta; ) {
    const b = Math.min(a + rango(id) - 1, hasta);
    let logs;
    try {
      logs = await leerRango(pv, id, a, b, listaTrozos);
    } catch (e) {
      // La marca NO avanza sobre una página que no se leyó entera. Es la regla
      // que impide el fallo irreversible descrito en la cabecera.
      return { ok: false, error: `getLogs ${a}-${b}: ${e.message}`, vistos, paginas };
    }

    for (const log of logs) {
      const a2 = ('0x' + log.topics[2].slice(26)).toLowerCase();
      const dueno = porDireccion.get(a2);
      if (!dueno) {
        // El nodo devolvió un log que no pedimos. Nunca se confía en que su
        // filtro fue correcto: se descarta y se canta, porque un RPC que
        // filtra mal puede estar filtrando de menos en otra parte.
        console.error(`[vigia-ext] ${cfg.nombre}: log con destino ajeno ${a2} — el RPC filtró mal`);
        continue;
      }
      if (await anotar(id, log, dueno, pv)) vistos++;
    }

    // La marca avanza POR PÁGINA y solo después de que Mongo confirmó. Si
    // avanzara al final del bucle, una página que truena a mitad de una
    // recuperación larga tiraría el trabajo de todas las anteriores.
    await Marca.findOneAndUpdate({ clave: claveMarca(id) }, { bloque: b }, { upsert: true });
    a = b + 1;
    if (++paginas >= PAGINAS_POR_VUELTA) break; // se sigue en la vuelta que viene
  }

  const atrasoBloques = hasta - (desde + paginas * rango(id));
  if (atrasoBloques > porHora) {
    console.error(`[vigia-ext] ${cfg.nombre}: ATRASADO ~${atrasoBloques} bloques — se sigue recuperando`);
  }
  return { ok: true, vistos, paginas };
}

/** Una vuelta por cada red, sin que un tropiezo de una toque a las otras. */
async function ciclo() {
  if (sondeando) return;
  sondeando = true;
  try {
    for (const id of Object.keys(redes.REDES).map(Number)) {
      try {
        const r = await vuelta(id);
        if (!r.ok) console.error(`[vigia-ext] ${redes.REDES[id].nombre}: ${r.error}`);
      } catch (e) {
        console.error(`[vigia-ext] ${redes.REDES[id].nombre}: ${e.message}`);
      }
    }
  } finally {
    sondeando = false;
  }
}

async function arrancar() {
  for (const id of Object.keys(redes.REDES).map(Number)) {
    try { await redes.medir(id); } catch (e) {
      console.error(`[usdt] no se pudo medir ${id}: ${e.message}`);
    }
  }
  await DepositoExterno.syncIndexes().catch(() => {});
  // Se dice si los OTROS dos están encendidos, porque es la pregunta que se
  // hace quien lee este log: «¿esto ya mueve dinero?». Decir solo «mirando»
  // era cierto de este archivo y engañoso del sistema.
  const mueve = [
    process.env.BARRIDO === '1' ? 'barrido ON' : 'barrido OFF',
    process.env.COMPRAS === '1' ? 'entrega ON' : 'entrega OFF',
  ].join(', ');
  console.log(`[vigia-ext] mirando ${Object.keys(redes.REDES).length} redes cada ${CADA_MS / 1000}s` +
    ` — este vigía solo anota (${mueve})`);
  // Igual que el barrido y las compras: el reloj se pone aunque la primera
  // vuelta truene. Una excepción aquí dejaría al vigía sin latir para siempre.
  await ciclo().catch((e) => console.error(`[vigia-ext] la primera vuelta falló: ${e.message}`));
  const reloj = setInterval(() => { ciclo().catch((e) => console.error(`[vigia-ext] ${e.message}`)); }, CADA_MS);
  reloj.unref?.();
  return reloj;
}

/** Para el panel: qué se ha visto, por red y por estado. */
async function resumen() {
  try {
    const por = await DepositoExterno.aggregate([
      { $group: { _id: { cadena: '$cadena', estado: '$estado' }, n: { $sum: 1 } } },
    ]);
    const marcas = await Marca.find({ clave: /^dep:/ }).lean();
    return {
      encendido: process.env.VIGIA_EXTERNO !== '0',
      vistos: por.map((x) => ({ cadena: x._id.cadena, estado: x._id.estado, n: x.n })),
      marcas: marcas.map((m) => ({ clave: m.clave, bloque: m.bloque })),
      redes: redes.estado(),
    };
  } catch (e) {
    return { error: e.message };
  }
}

module.exports = {
  DepositoExterno, Marca, claveMarca,
  arrancar, ciclo, vuelta, resumen, direcciones,
  _adentro: { leerPagina, leerRango, anotar, esDeRango, trozos, rango, rangoDe,
              RANGO_INICIAL, RANGO_MAXIMO, POR_TROZO },
};
