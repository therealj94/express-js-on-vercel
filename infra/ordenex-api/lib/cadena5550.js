// La unica puerta de Ordenex hacia la cadena 5550: leer saldos y firmar
// envios. Todo lo demas (ledger, motor, fiat) vive en Mongo; lo que toque la
// cadena pasa por aqui para que el fail-closed y el manejo del nonce esten en
// UN solo sitio y no repartidos por los controllers.
//
// Dos reglas que hereda de lib/saldos.js de la wallet:
//
// 1. Si no se pudo leer, no se contesta. Ninguna funcion de lectura devuelve
//    un cero cuando el nodo no responde: devuelve ok=false y quien llama se
//    niega a seguir. Un cero por averia de red, en la puerta del vigia, seria
//    un deposito que jamas se acredita — o peor, una marca de agua que baja
//    sola y acredita dos veces.
//
// 2. El dinero es SIEMPRE un string de wei. Aqui no se formatea nada: los 18
//    decimales son un asunto de la pantalla, no del backend.

const { JsonRpcProvider, Contract, Wallet, getAddress } = require('ethers');
const { TOKENS, PORSIMBOLO } = require('./tokens');
const { esLlavePrivada, normalizarLlave } = require('./cripto');

const OG_RPC = process.env.OG_CHAIN_PROVIDER || 'https://rpc.ordenglobal-rpc.com';

// Lo minimo que Ordenex necesita de un ERC20: mirar y mover. Ni decimals()
// se pregunta — los 14 usan 18 y esta confirmado contra la cadena (ver
// lib/tokens.js); preguntarlo en cada sondeo del vigia seria duplicar las
// llamadas al RPC para recibir siempre la misma respuesta.
const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function transfer(address to, uint256 value) returns (bool)',
];

// Un solo proveedor para todo el proceso, creado a demanda: staticNetwork
// evita el eth_chainId de arranque en cada llamada, y compartirlo evita que
// el vigia abra 15 conexiones cada 30 segundos.
let _proveedor = null;
function proveedor() {
  if (!_proveedor) {
    _proveedor = new JsonRpcProvider(OG_RPC, undefined, { staticNetwork: true });
  }
  return _proveedor;
}

/** Un tiempo maximo para cada consulta: un nodo colgado no cuelga un retiro. */
function conPlazo(promesa, ms, que) {
  return Promise.race([
    promesa,
    new Promise((_, rechaza) => {
      setTimeout(() => {
        const e = new Error(`${que}: sin respuesta en ${ms}ms`);
        e.codigo = 'SIN_RESPUESTA';
        rechaza(e);
      }, ms);
    }),
  ]);
}

// ── UN PLAZO AGOTADO NO ES UN FALLO: ES UNA DUDA ────────────────────────────
//
// El plazo corta la ESPERA, no la transaccion. Si el nodo acepto el envio y
// tardo veintiun segundos en contestar, la transaccion esta en el mempool y se
// va a minar igual, pero aqui ya rebotamos un error. Quien llame a esto (el
// retiro) lo tratara como "no salio", le devolvera el saldo al usuario y le
// dira que no se movio. Se movio, y el dinero salio dos veces.
//
// Por eso todo error que sale de este modulo lleva `nuncaSalio`, y solo va en
// true cuando se SABE que no hay transaccion firmada dando vueltas:
//
//   - todo lo anterior a la firma (activo desconocido, direccion invalida,
//     llave que no es llave, gas que no se pudo leer, nonce que no se pudo
//     pedir): no hubo que aceptar, no hay nada en vuelo;
//   - y el rechazo EXPLICITO del nodo, que es el nodo diciendo "esta no la
//     tomo": saldo que no da para el gas, nonce ya usado, firma o argumento
//     invalidos, revert al estimar.
//
// Todo lo demas, empezando por el plazo agotado, sale SIN la marca. La regla
// para quien lea esto es la unica que no cuesta dinero equivocarse: sin
// `nuncaSalio === true`, hay duda, y ante la duda no se reacredita.
//
// La marca es afirmativa y no al reves (`enDuda`) a proposito: si mañana
// alguien añade un camino de error nuevo y se olvida de marcarlo, cae del lado
// de la duda, que es el lado caro pero seguro. Un default que se olvida tiene
// que ser el prudente.
const RECHAZOS = [
  'INSUFFICIENT_FUNDS',
  'NONCE_EXPIRED',
  'REPLACEMENT_UNDERPRICED',
  'INVALID_ARGUMENT',
  'UNSUPPORTED_OPERATION',
  'CALL_EXCEPTION',
  'ACTION_REJECTED',
];

/** Marca un error como "esto no llego a salir". Devuelve el mismo error. */
function nuncaSalio(e) {
  if (e && typeof e === 'object') e.nuncaSalio = true;
  return e;
}

/**
 * Marca el error de un envio ya firmado: solo se da por no salido cuando el
 * nodo lo rechazo con nombre y apellido. Un plazo agotado, un socket cortado o
 * un 502 del RPC dejan la duda intacta.
 */
function segunElNodo(e) {
  if (e && typeof e === 'object' && RECHAZOS.includes(e.code)) e.nuncaSalio = true;
  return e;
}

/** Corre lo que pasa ANTES de firmar: si truena, no hay nada en vuelo. */
async function antesDeFirmar(fn) {
  try {
    return await fn();
  } catch (e) {
    throw nuncaSalio(e);
  }
}

// El precio del gas sale de la cadena, nunca de una constante (la leccion de
// lib/gas.js de la wallet: los 400 gwei fijos cobraban 4 veces de mas). La
// 5550 es de gasPrice clasico; getFeeData puede traerlo en null en redes
// EIP-1559, y para ese caso se cae al RPC crudo.
async function precioDeGas(p) {
  const datos = await conPlazo(p.getFeeData(), 12000, 'gasPrice');
  if (datos.gasPrice != null) return datos.gasPrice;
  const crudo = await conPlazo(p.send('eth_gasPrice', []), 12000, 'eth_gasPrice');
  return BigInt(crudo);
}

// Un envio nativo son 21000 exactos. Para un token se estima contra la cadena
// con un margen del 20% (un estimado justo revierte por un SSTORE de mas) y,
// si el nodo no estima, un techo fijo por encima de los 52472 medidos en la
// wallet — mejor reservar gas de sobra que dejar un retiro a medias.
const LIMITE_NATIVO = 21000n;
const LIMITE_TOKEN_POR_OMISION = 65000n;

/**
 * Todo lo que hay en una direccion: el ORIGEN nativo y los 14 tokens, en wei.
 *
 * Devuelve `{ ok, saldos, vacia, error }`:
 *   ok=false → NO se pudo leer. `saldos` vacio y `vacia` en null — nunca true.
 *   ok=true  → `saldos` trae LOS QUINCE, incluidos los ceros. El vigia compara
 *              cada saldo contra su marca de agua, y un cero real (la cuenta
 *              se barrio) es un dato tan importante como un deposito: por eso
 *              aqui no se filtran los ceros como hace la wallet.
 *
 * Las lecturas van en paralelo y el fallo de UNA invalida la respuesta
 * entera: si no se pudo leer un token, no se sabe que hay — se sabe que no
 * se sabe.
 */
async function saldosDe(direccion) {
  const p = proveedor();
  try {
    const lecturas = await Promise.all(
      TOKENS.map(async (t) => {
        if (t.nativo) {
          const wei = await conPlazo(p.getBalance(direccion), 12000, 'ORIGEN nativo');
          return { simbolo: t.s, wei: wei.toString() };
        }
        const c = new Contract(t.contrato, ERC20_ABI, p);
        const wei = await conPlazo(c.balanceOf(direccion), 12000, t.s);
        return { simbolo: t.s, contrato: t.contrato, wei: wei.toString() };
      })
    );
    const vacia = lecturas.every((l) => l.wei === '0');
    return { ok: true, saldos: lecturas, vacia, error: null };
  } catch (e) {
    // Ni un cero de consuelo: se dice que no se pudo mirar.
    return { ok: false, saldos: [], vacia: null, error: e.message };
  }
}

/**
 * El saldo de UN activo en una direccion. Para el barrido, que va activo por
 * activo. Mismo contrato de honestidad: `{ ok, wei, error }` y wei en null
 * cuando no se pudo leer.
 */
async function saldoDe(direccion, activo) {
  const t = PORSIMBOLO[activo];
  if (!t) return { ok: false, wei: null, error: `activo desconocido: ${activo}` };
  const p = proveedor();
  try {
    let wei;
    if (t.nativo) {
      wei = await conPlazo(p.getBalance(direccion), 12000, 'ORIGEN nativo');
    } else {
      const c = new Contract(t.contrato, ERC20_ABI, p);
      wei = await conPlazo(c.balanceOf(direccion), 12000, t.s);
    }
    return { ok: true, wei: wei.toString(), error: null };
  } catch (e) {
    return { ok: false, wei: null, error: e.message };
  }
}

/** La direccion de la billetera caliente, o null si no esta configurada. */
function direccionCaliente() {
  const llave = normalizarLlave(process.env.ORDENEX_HOT_KEY);
  if (!llave) return null;
  return new Wallet(llave).address;
}

// El envio de verdad, desde cualquier llave. No espera el minado: el hash es
// la prueba de emision y el estado final lo dira la cadena. Esperar bloqueaba
// mas de los 30s del router de Heroku (la leccion H12 de la wallet).
//
// La frontera de la duda esta dentro de esta funcion, y es exacta: todo lo que
// pasa antes de la linea marcada no puede haber emitido nada (va envuelto en
// `antesDeFirmar`); el envio de despues si, y solo el nodo puede decir que no.
async function emitir(llave, { a, activo, cantidadWei, nonce }) {
  const t = PORSIMBOLO[activo];
  if (!t) {
    const e = new Error(`activo desconocido: ${activo}`);
    e.codigo = 'ACTIVO_INVALIDO';
    throw nuncaSalio(e);
  }
  const p = proveedor();
  const preparado = await antesDeFirmar(async () => {
    const billetera = new Wallet(llave, p);
    const destino = getAddress(a); // normaliza y valida; lanza si no es direccion
    const gasPrice = await precioDeGas(p);
    const n = nonce != null
      ? nonce
      : await conPlazo(p.getTransactionCount(billetera.address, 'latest'), 12000, 'nonce');
    return { billetera, destino, gasPrice, n };
  });
  const { billetera, destino, gasPrice, n } = preparado;

  if (t.nativo) {
    // ─── de aqui en adelante puede haber transaccion en vuelo ───
    try {
      const tx = await conPlazo(
        billetera.sendTransaction({
          to: destino,
          value: BigInt(cantidadWei),
          gasLimit: LIMITE_NATIVO,
          gasPrice,
          nonce: n,
        }),
        20000,
        'envio nativo'
      );
      return { hash: tx.hash, de: billetera.address, nonce: n };
    } catch (e) {
      e.nonce = n;
      throw segunElNodo(e);
    }
  }

  const contrato = new Contract(t.contrato, ERC20_ABI, billetera);
  let gasLimit = LIMITE_TOKEN_POR_OMISION;
  try {
    const estimado = await conPlazo(
      contrato.transfer.estimateGas(destino, BigInt(cantidadWei)),
      12000,
      `${t.s} estimateGas`
    );
    gasLimit = (estimado * 120n) / 100n;
  } catch (e) {
    // El nodo no quiso estimar: se va con el techo por omision. Si de verdad
    // no alcanza, la propia emision lo dira. Estimar no firma nada, asi que
    // este catch no cambia la duda de sitio.
  }
  // ─── de aqui en adelante puede haber transaccion en vuelo ───
  try {
    const tx = await conPlazo(
      contrato.transfer(destino, BigInt(cantidadWei), { gasLimit, gasPrice, nonce: n }),
      20000,
      `envio ${t.s}`
    );
    return { hash: tx.hash, de: billetera.address, nonce: n };
  } catch (e) {
    e.nonce = n;
    throw segunElNodo(e);
  }
}

// ── La caliente: nonce serializado ──────────────────────────────────────────
// Dos retiros simultaneos firmando desde la MISMA llave con el mismo nonce
// son una transaccion perdida (la segunda reemplaza o revienta). Por eso todo
// envio desde la caliente pasa por una cola de promesa encadenada — un dyno,
// cero carreras, igual que la cola por mercado del motor — y el nonce se
// lleva contado en memoria: pedirlo a la cadena entre envio y envio veria el
// viejo, porque no esperamos el minado.
let colaCaliente = Promise.resolve();
let nonceCaliente = null;
// El nonce del ultimo envio que quedo EN DUDA (plazo agotado, RPC mudo). No
// se sabe si esa transaccion esta en el mempool, asi que el proximo envio no
// puede reusar ese numero a ciegas: ver `nonceFresco`.
let nonceEnDuda = null;

/**
 * De donde sale el nonce cuando el contador local se tiro: de 'pending', NO de
 * 'latest'.
 *
 * Este era el agravante del retiro dudoso. Tras un fallo se ponia el contador
 * en null y el siguiente envio pedia `getTransactionCount(..., 'latest')`, que
 * cuenta SOLO lo minado y no ve el mempool. Si la transaccion dudosa estaba
 * ahi esperando, el siguiente retiro salia con SU MISMO nonce y una de las dos
 * reemplazaba a la otra: un retiro pagado dos veces o uno que nunca llega,
 * segun cual ganara.
 *
 * 'pending' si cuenta lo que espera en el mempool, asi que en un nodo sano
 * resuelve los dos casos solo: si la dudosa entro, devuelve el siguiente; si
 * no entro, devuelve el mismo y se reusa bien.
 *
 * Y si el nodo no sabe contestar 'pending', se cae a 'latest' con una guarda:
 * nunca por debajo de `nonceEnDuda + 1`. Eso puede dejar un hueco (una
 * transaccion que espera a otra que jamas existio) y frena la cola hasta que
 * un humano mire, pero el otro lado del error es reemplazar en silencio un
 * retiro que ya salio. Se elige el fallo que se ve.
 */
async function nonceFresco(p, direccion) {
  let n;
  try {
    n = await conPlazo(p.getTransactionCount(direccion, 'pending'), 12000, 'nonce caliente');
  } catch (e) {
    if (e.codigo === 'SIN_RESPUESTA') throw e; // el nodo no contesta: no se inventa
    n = await conPlazo(p.getTransactionCount(direccion, 'latest'), 12000, 'nonce caliente');
    if (nonceEnDuda != null && n <= nonceEnDuda) {
      console.error(
        `[cadena] el nodo no cuenta pendientes y dice nonce ${n}, pero el envio ${nonceEnDuda} quedo en duda: se salta a ${nonceEnDuda + 1}`
      );
      n = nonceEnDuda + 1;
    }
  }
  return n;
}

async function envioCaliente({ a, activo, cantidadWei }) {
  const llave = normalizarLlave(process.env.ORDENEX_HOT_KEY);
  if (!llave) {
    const e = new Error('ORDENEX_HOT_KEY no esta puesta o no tiene forma de llave.');
    e.codigo = 'SIN_CONFIGURAR';
    throw nuncaSalio(e);
  }
  const p = proveedor();
  const direccion = new Wallet(llave).address;
  if (nonceCaliente == null) {
    // Pedir el nonce es anterior a la firma: si no se puede, no salio nada.
    nonceCaliente = await antesDeFirmar(() => nonceFresco(p, direccion));
  }
  const usado = nonceCaliente;
  try {
    const salida = await emitir(llave, { a, activo, cantidadWei, nonce: usado });
    nonceCaliente += 1;
    nonceEnDuda = null; // salio uno bueno: la duda vieja ya no manda nada
    return salida;
  } catch (e) {
    // El contador local ya no es de fiar y se tira. Lo que cambia segun el
    // fallo es lo que se recuerda: si el nodo lo rechazo con nombre, ese nonce
    // sigue libre y no hay duda que arrastrar; si no, se apunta para que
    // `nonceFresco` no lo reuse a ciegas.
    nonceCaliente = null;
    if (!e.nuncaSalio) nonceEnDuda = usado;
    throw e;
  }
}

/**
 * Envia desde la billetera caliente, en orden estricto de llegada.
 * Devuelve `{ hash, de, nonce }`. Si falla, el error sube tal cual — quien
 * llama (el retiro) es quien sabe reacreditar el ledger.
 */
function enviarDesdeCaliente(args) {
  const tarea = colaCaliente.then(() => envioCaliente(args));
  // La cola nunca queda rota: el fallo de un envio no atasca al siguiente.
  colaCaliente = tarea.then(() => {}, () => {});
  return tarea;
}

/**
 * Envia desde una llave arbitraria (el barrido de las direcciones de
 * deposito). Cada direccion tiene su propio nonce y el barrido va en serie,
 * asi que aqui no hace falta cola: el nonce se pide fresco.
 *
 * Con `todo: true` y activo nativo se envia el saldo entero MENOS el gas —
 * una direccion de deposito no debe quedarse con polvo de ORIGEN sin barrer.
 */
async function enviarDesde(llave, { a, activo, cantidadWei, todo = false }) {
  if (!esLlavePrivada(llave)) {
    const e = new Error('La llave no tiene forma de llave privada.');
    e.codigo = 'LLAVE_INVALIDA';
    throw nuncaSalio(e);
  }
  const t = PORSIMBOLO[activo];
  if (t && t.nativo && todo) {
    const p = proveedor();
    // Mirar el saldo y el gas es anterior a la firma: si truena, no hay nada
    // en vuelo y el barrido puede reintentarse sin miedo.
    const monto = await antesDeFirmar(async () => {
      const quien = new Wallet(llave).address;
      const saldo = await conPlazo(p.getBalance(quien), 12000, 'saldo a barrer');
      const gasPrice = await precioDeGas(p);
      const costo = LIMITE_NATIVO * gasPrice;
      const queda = saldo - costo;
      if (queda <= 0n) {
        const e = new Error('El saldo no alcanza ni para el gas del barrido.');
        e.codigo = 'NO_ALCANZA_GAS';
        throw e;
      }
      return queda;
    });
    const salida = await emitir(llave, { a, activo, cantidadWei: monto.toString() });
    return { ...salida, cantidad: monto.toString() };
  }
  const salida = await emitir(llave, { a, activo, cantidadWei });
  return { ...salida, cantidad: String(cantidadWei) };
}

module.exports = {
  proveedor,
  saldosDe,
  saldoDe,
  direccionCaliente,
  enviarDesdeCaliente,
  enviarDesde,
};
