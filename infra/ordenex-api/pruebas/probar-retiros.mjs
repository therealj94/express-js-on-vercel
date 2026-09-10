/* El retiro: la unica operacion donde el dinero SALE, y la regla que la
 * gobierna. Un tiempo agotado NO es un fallo, es una DUDA.
 *
 *   node pruebas/probar-retiros.mjs
 *
 * El plazo de lib/cadena5550.js corta la ESPERA, no la transaccion. Si el nodo
 * acepta el envio y tarda mas de la cuenta en contestar, la transaccion esta en
 * el mempool y se va a minar igual. Tratar eso como "no salio", reacreditar y
 * decirle al usuario que su saldo no se movio es pagar el retiro dos veces.
 *
 * Se prueba en dos mitades:
 *
 *  1. LA CADENA, contra un nodo fingido de verdad (un servidor JSON-RPC local,
 *     no un doble): que solo se marca `nuncaSalio` cuando se sabe que no hay
 *     transaccion en vuelo, y que tras una duda el nonce se vuelve a pedir con
 *     'pending' (que cuenta el mempool) y NO con 'latest' (que no lo cuenta y
 *     por eso reusaba el nonce de la dudosa).
 *  2. EL RETIRO, contra un Mongo de verdad: que una duda deja el retiro en
 *     `revision` SIN reacreditar, que un rechazo conocido del nodo si
 *     reacredita, y que reintentar la clave de un retiro en duda no vuelve a
 *     firmar nada.
 *
 * Corre contra mongodb-memory-server (devDependencies). Si no esta instalado
 * se dice y se sale, sin fingir un verde que no se gano.
 */

let MongoMemoryServer;
try {
  ({ MongoMemoryServer } = await import('mongodb-memory-server'));
} catch {
  console.log('mongodb-memory-server no esta instalado (falta npm install): esta prueba NO corrio y NO probo nada.');
  process.exit(0);
}

const { createServer } = await import('node:http');
const { keccak256 } = await import('ethers');

let fallos = 0;
const comprobar = (ok, que, detalle = '') => {
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${que}${!ok && detalle ? '\n           ' + detalle : ''}`);
  if (!ok) fallos++;
};
const decir = (que) => console.log(`\n── ${que} ${'─'.repeat(Math.max(2, 62 - que.length))}`);

const U = 10n ** 18n;
const w = (n) => (BigInt(n) * U).toString();

// ── El nodo fingido ─────────────────────────────────────────────────────────
// Contesta lo justo para que ethers pueda firmar y mandar. `guion` es lo que
// la prueba mueve entre bloque y bloque: cuantas transacciones dice que hay
// minadas ('latest'), cuantas contando el mempool ('pending'), y que hace con
// el envio. `llamadas` guarda todo lo que se le pregunto, que es la mitad de
// lo que hay que comprobar.
const guion = {
  latest: 0,
  pending: 0,
  // Recibe la transaccion firmada en crudo. El hash bueno es su keccak256 y
  // no un numero cualquiera: ethers comprueba que el nodo devuelva ese mismo.
  envio: (crudo) => ({ resultado: keccak256(crudo) }),
  cuentaPending: true, // en false finge un nodo que no sabe contestar 'pending'
};
const llamadas = [];

const nodo = createServer((req, res) => {
  let cuerpo = '';
  req.on('data', (c) => { cuerpo += c; });
  req.on('end', () => {
    let peticion;
    try { peticion = JSON.parse(cuerpo); } catch { peticion = {}; }
    const lote = Array.isArray(peticion) ? peticion : [peticion];
    const respuestas = lote.map((p) => {
      llamadas.push({ metodo: p.method, params: p.params });
      const bien = (resultado) => ({ jsonrpc: '2.0', id: p.id, result: resultado });
      const mal = (codigo, mensaje) => ({ jsonrpc: '2.0', id: p.id, error: { code: codigo, message: mensaje } });
      switch (p.method) {
        case 'eth_chainId': return bien('0x15ae'); // 5550
        case 'net_version': return bien('5550');
        case 'eth_blockNumber': return bien('0x1');
        case 'eth_gasPrice': return bien('0x3b9aca00');
        case 'eth_getBlockByNumber':
          return bien({
            number: '0x1', hash: '0x' + '11'.repeat(32), parentHash: '0x' + '00'.repeat(32),
            timestamp: '0x1', gasLimit: '0x1c9c380', gasUsed: '0x0', difficulty: '0x0',
            nonce: '0x0000000000000000', miner: '0x' + '00'.repeat(20), extraData: '0x',
            baseFeePerGas: null, transactions: [],
          });
        case 'eth_getTransactionCount': {
          const cual = p.params?.[1];
          if (cual === 'pending' && !guion.cuentaPending) {
            return mal(-32601, 'the method eth_getTransactionCount with pending is not available');
          }
          return bien('0x' + (cual === 'pending' ? guion.pending : guion.latest).toString(16));
        }
        case 'eth_sendRawTransaction': {
          const r = guion.envio(p.params?.[0]);
          return r.error ? mal(r.error.code, r.error.message) : bien(r.resultado);
        }
        case 'eth_estimateGas': return bien('0xcb20');
        default: return mal(-32601, `metodo no fingido: ${p.method}`);
      }
    });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(Array.isArray(peticion) ? respuestas : respuestas[0]));
  });
});
await new Promise((listo) => nodo.listen(0, '127.0.0.1', listo));
const puerto = nodo.address().port;

// El entorno se fija ANTES de importar: cadena5550.js lee OG_CHAIN_PROVIDER al
// cargar, y la llave caliente en cada llamada. La llave es de juguete y no
// custodia nada: solo hace falta que tenga forma de llave para poder firmar.
process.env.OG_CHAIN_PROVIDER = `http://127.0.0.1:${puerto}`;
process.env.ORDENEX_HOT_KEY = '0x' + '11'.repeat(32);

const cadena = (await import('../lib/cadena5550.js')).default;

/* Ethers guarda en cache la respuesta a una misma pregunta durante 250ms, y esa
 * cache es privada del proveedor: no hay perilla para apagarla desde fuera.
 * Esta prueba hace la misma pregunta varias veces con el guion cambiado en
 * medio, asi que antes de cada bloque que necesita un conteo FRESCO se deja
 * vencer. Esperar en una prueba se paga en segundos; fingir que la cache no
 * existe se pagaria en una prueba que aprueba lo que no probo. */
const cacheVencida = () => new Promise((r) => setTimeout(r, 300));

// El ultimo `eth_getTransactionCount` que se le pidio al nodo.
const ultimoConteo = () => [...llamadas].reverse().find((l) => l.metodo === 'eth_getTransactionCount');

decir('la cadena: lo anterior a la firma se SABE que no salio');
{
  let e = null;
  try {
    await cadena.enviarDesde(process.env.ORDENEX_HOT_KEY, { a: '0x' + '22'.repeat(20), activo: 'NOEXISTE', cantidadWei: w(1) });
  } catch (x) { e = x; }
  comprobar(e?.nuncaSalio === true && e?.codigo === 'ACTIVO_INVALIDO',
    'un activo desconocido: nuncaSalio, porque no hubo nada que firmar', `${e?.codigo} nuncaSalio=${e?.nuncaSalio}`);

  e = null;
  try {
    await cadena.enviarDesde('no-soy-una-llave', { a: '0x' + '22'.repeat(20), activo: 'ORIGEN', cantidadWei: w(1) });
  } catch (x) { e = x; }
  comprobar(e?.nuncaSalio === true && e?.codigo === 'LLAVE_INVALIDA',
    'una llave que no es llave: tambien');

  e = null;
  try {
    await cadena.enviarDesde(process.env.ORDENEX_HOT_KEY, { a: 'esto-no-es-una-direccion', activo: 'ORIGEN', cantidadWei: w(1) });
  } catch (x) { e = x; }
  comprobar(e?.nuncaSalio === true,
    'una direccion invalida: se cae antes de firmar', `nuncaSalio=${e?.nuncaSalio}`);
}

decir('la cadena: un envio bueno gasta su nonce y el siguiente va detras');
{
  guion.latest = 7;
  guion.pending = 7;
  const r1 = await cadena.enviarDesdeCaliente({ a: '0x' + '22'.repeat(20), activo: 'ORIGEN', cantidadWei: w(1) });
  comprobar(r1.nonce === 7, 'el primero sale con el nonce que dijo el nodo', `nonce=${r1.nonce}`);
  const r2 = await cadena.enviarDesdeCaliente({ a: '0x' + '22'.repeat(20), activo: 'ORIGEN', cantidadWei: w(1) });
  comprobar(r2.nonce === 8, 'y el segundo con el siguiente, sin volver a preguntar', `nonce=${r2.nonce}`);
}

decir('la cadena: el nodo que RECHAZA con nombre deja el nonce libre');
{
  guion.envio = () => ({ error: { code: -32000, message: 'nonce too low' } });
  let e = null;
  try {
    await cadena.enviarDesdeCaliente({ a: '0x' + '22'.repeat(20), activo: 'ORIGEN', cantidadWei: w(1) });
  } catch (x) { e = x; }
  comprobar(e?.nuncaSalio === true && e?.code === 'NONCE_EXPIRED',
    'un rechazo explicito del nodo se marca nuncaSalio', `${e?.code} nuncaSalio=${e?.nuncaSalio}`);

  // Ese nonce sigue libre: no hay duda que arrastrar, asi que el proximo envio
  // se queda con lo que diga el nodo, sin saltar ninguno.
  guion.envio = (crudo) => ({ resultado: keccak256(crudo) });
  guion.latest = 9;
  guion.pending = 9;
  await cacheVencida();
  const r = await cadena.enviarDesdeCaliente({ a: '0x' + '22'.repeat(20), activo: 'ORIGEN', cantidadWei: w(1) });
  comprobar(r.nonce === 9, 'y el siguiente envio usa ese mismo numero, sin hueco', `nonce=${r.nonce}`);
}

decir('la cadena: tras una DUDA el nonce se pide con pending, no con latest');
{
  // El nodo se traga el envio y contesta un error generico: ethers no sabe si
  // lo acepto o no. Es el caso del plazo agotado, sin esperar veinte segundos.
  guion.envio = () => ({ error: { code: -32603, message: 'internal error' } });
  let e = null;
  try {
    await cadena.enviarDesdeCaliente({ a: '0x' + '22'.repeat(20), activo: 'ORIGEN', cantidadWei: w(1) });
  } catch (x) { e = x; }
  comprobar(!e?.nuncaSalio,
    'un error que no es un rechazo con nombre NO se marca: queda la duda',
    `code=${e?.code} nuncaSalio=${e?.nuncaSalio}`);

  // El nodo dice: 10 minadas, 11 contando el mempool. O sea que la dudosa
  // (nonce 10) SI entro y esta esperando. Con 'latest' el siguiente retiro
  // reusaria el 10 y una de las dos transacciones se comeria a la otra.
  guion.envio = (crudo) => ({ resultado: keccak256(crudo) });
  guion.latest = 10;
  guion.pending = 11;
  await cacheVencida();
  const r = await cadena.enviarDesdeCaliente({ a: '0x' + '22'.repeat(20), activo: 'ORIGEN', cantidadWei: w(1) });
  const conteo = ultimoConteo();
  comprobar(conteo?.params?.[1] === 'pending',
    'el nonce se vuelve a pedir con pending, que si cuenta el mempool',
    `se pidio con ${conteo?.params?.[1]}`);
  comprobar(r.nonce === 11,
    'y sale con 11: NO se reusa el 10 de la transaccion dudosa', `nonce=${r.nonce}`);
}

decir('la cadena: si el nodo no sabe contar pendientes, se salta el dudoso');
{
  // Se prepara el escenario: primero un rechazo con nombre, que tira el
  // contador local SIN dejar duda, para que el envio dudoso de despues tenga
  // que pedirle el nonce al nodo y salga con el 20 que dice el guion.
  guion.latest = 20;
  guion.pending = 20;
  guion.envio = () => ({ error: { code: -32000, message: 'nonce too low' } });
  await cacheVencida();
  try {
    await cadena.enviarDesdeCaliente({ a: '0x' + '22'.repeat(20), activo: 'ORIGEN', cantidadWei: w(1) });
  } catch { /* rechazado con nombre: no deja duda */ }

  guion.envio = () => ({ error: { code: -32603, message: 'internal error' } });
  await cacheVencida();
  let dudoso = null;
  try {
    await cadena.enviarDesdeCaliente({ a: '0x' + '22'.repeat(20), activo: 'ORIGEN', cantidadWei: w(1) });
  } catch (x) { dudoso = x; }
  comprobar(dudoso?.nonce === 20 && !dudoso?.nuncaSalio,
    'el envio dudoso se lleva el nonce 20', `nonce=${dudoso?.nonce} nuncaSalio=${dudoso?.nuncaSalio}`);

  // Ahora el nodo se niega a contestar 'pending' y con 'latest' jura que sigue
  // en 20, o sea que la dudosa (nonce 20) no la ve. Reusar el 20 seria
  // reemplazar en silencio un retiro que quiza ya salio: se prefiere el hueco,
  // que se ve y lo arregla un humano.
  guion.cuentaPending = false;
  guion.envio = (crudo) => ({ resultado: keccak256(crudo) });
  await cacheVencida();
  const r = await cadena.enviarDesdeCaliente({ a: '0x' + '22'.repeat(20), activo: 'ORIGEN', cantidadWei: w(1) });
  comprobar(r.nonce === 21,
    'con latest diciendo 20 y el 20 en duda, se salta al 21', `nonce=${r.nonce}`);
  guion.cuentaPending = true;
}

// ── La segunda mitad: el retiro contra Mongo ────────────────────────────────
const { default: mongoose } = await import('mongoose');
const servidor = await MongoMemoryServer.create();
await mongoose.connect(servidor.getUri(), { dbName: 'ordenex_prueba' });

const { Usuario, Cuenta, Retiro } = (await import('../models/index.js')).default;
const ledger = (await import('../lib/ledger.js')).default;
const genesis = (await import('../lib/genesis.js')).default;
const portafolio = (await import('../controllers/portafolioController.js')).default;

// Genesis fingido: el tamiz deja pasar y el AML calla. Se pisan los exports del
// modulo ya cargado, que es el mismo objeto que el controller tiene en la mano.
genesis.tamizDireccion = async () => ({ sancionada: false });
genesis.reportarMovimiento = async () => ({ ok: true });

// Y la cadena se pisa aqui a proposito: lo que se prueba en esta mitad es la
// DECISION del controller ante cada clase de fallo, no la cadena (esa ya se
// castigo arriba contra el nodo fingido).
const enviarDeVerdad = cadena.enviarDesdeCaliente;
let proximoEnvio = null;
let firmas = 0;
cadena.enviarDesdeCaliente = async () => {
  firmas++;
  const r = proximoEnvio();
  if (r instanceof Error) throw r;
  return r;
};

const llamar = (fn, { usuario = null, cuerpo = {}, params = {}, query = {} } = {}) =>
  new Promise((resolve) => {
    const req = { usuario, body: cuerpo, params, query, headers: {} };
    const res = {
      _status: 200,
      status(codigo) { this._status = codigo; return this; },
      json(objeto) { resolve({ status: this._status, cuerpo: objeto }); },
    };
    Promise.resolve(fn(req, res)).catch((e) =>
      resolve({ status: 500, cuerpo: { error: String(e && e.message), codigo: 'EXCEPCION_SIN_ATRAPAR' } })
    );
  });

const anaDoc = await Usuario.create({ gid: 'G-ANA', nombre: 'Ana', verificada: true });
const anaId = String(anaDoc._id);
const ana = { id: anaId, gid: 'G-ANA' };
const DESTINO = '0x' + '22'.repeat(20);
await ledger.acreditar(anaId, 'ORIGEN', w(100), 'semilla:ana');
const saldoDe = async () => {
  const c = await Cuenta.findOne({ userId: anaId, activo: 'ORIGEN' }).lean();
  return BigInt(c.disponible);
};

decir('el retiro que sale: se debita y se anota su hash');
{
  proximoEnvio = () => ({ hash: '0x' + 'aa'.repeat(32), de: DESTINO, nonce: 1 });
  const r = await llamar(portafolio.retirar, {
    usuario: ana,
    cuerpo: { activo: 'ORIGEN', cantidad: w(10), direccion: DESTINO, retiroKey: 'clave-buena-1' },
  });
  comprobar(r.status === 200 && r.cuerpo.estado === 'enviado' && r.cuerpo.hash,
    'contesta enviado con su hash', JSON.stringify(r.cuerpo));
  comprobar(await saldoDe() === 90n * U, 'y el saldo bajo los 10', String(await saldoDe()));
}

decir('EL FALLO QUE ES DUDA: no se reacredita y queda en revision');
{
  const antes = await saldoDe();
  // Un plazo agotado sale de lib/cadena5550.js SIN la marca `nuncaSalio`.
  proximoEnvio = () => {
    const e = new Error('envio nativo: sin respuesta en 20000ms');
    e.codigo = 'SIN_RESPUESTA';
    return e;
  };
  const r = await llamar(portafolio.retirar, {
    usuario: ana,
    cuerpo: { activo: 'ORIGEN', cantidad: w(10), direccion: DESTINO, retiroKey: 'clave-en-duda' },
  });

  comprobar(r.status === 503 && r.cuerpo.codigo === 'RETIRO_EN_REVISION',
    'se contesta RETIRO_EN_REVISION, no FIRMA_FALLO', JSON.stringify(r.cuerpo));
  comprobar(!/no se movio/i.test(r.cuerpo.error || ''),
    'y NO se le dice al usuario que su saldo no se movio: no se sabe', r.cuerpo.error);
  comprobar(await saldoDe() === antes - 10n * U,
    'el saldo sigue debitado: reacreditar aqui seria pagar el retiro dos veces',
    `antes=${antes} despues=${await saldoDe()}`);

  const doc = await Retiro.findOne({ retiroKey: 'clave-en-duda' }).lean();
  comprobar(doc.estado === 'revision' && /duda/.test(doc.fallo || ''),
    'el retiro queda en `revision` con el porque anotado', `${doc.estado} · ${doc.fallo}`);
  comprobar(doc.hash === null, 'sin hash que enseñar, porque no lo hay');

  // Y reintentar la misma clave no vuelve a firmar ni promete nada.
  const firmasAntes = firmas;
  const r2 = await llamar(portafolio.retirar, {
    usuario: ana,
    cuerpo: { activo: 'ORIGEN', cantidad: w(10), direccion: DESTINO, retiroKey: 'clave-en-duda' },
  });
  comprobar(r2.status === 409 && r2.cuerpo.codigo === 'RETIRO_EN_REVISION',
    'el reintento con la misma clave dice que esta en revision', JSON.stringify(r2.cuerpo));
  comprobar(firmas === firmasAntes, 'y NO se firma una segunda vez');
}

decir('EL FALLO QUE ES FALLO: el nodo lo rechazo, y ahi si se devuelve');
{
  const antes = await saldoDe();
  proximoEnvio = () => {
    const e = new Error('insufficient funds for gas * price + value');
    e.code = 'INSUFFICIENT_FUNDS';
    e.nuncaSalio = true; // lo que pone lib/cadena5550.js ante un rechazo con nombre
    return e;
  };
  const r = await llamar(portafolio.retirar, {
    usuario: ana,
    cuerpo: { activo: 'ORIGEN', cantidad: w(10), direccion: DESTINO, retiroKey: 'clave-rechazada' },
  });
  comprobar(r.status === 503 && r.cuerpo.codigo === 'FIRMA_FALLO',
    'se contesta FIRMA_FALLO', JSON.stringify(r.cuerpo));
  comprobar(await saldoDe() === antes,
    'y el saldo vuelve entero: aqui SI se sabe que no salio nada',
    `antes=${antes} despues=${await saldoDe()}`);
  const doc = await Retiro.findOne({ retiroKey: 'clave-rechazada' }).lean();
  comprobar(doc.estado === 'fallido', 'el retiro queda `fallido`, que es otra cosa que `revision`', doc.estado);
}

decir('un fallo SIN marcar cae del lado de la duda');
{
  // La regla del default prudente: si mañana alguien añade un camino de error
  // y se olvida de marcarlo, el retiro tiene que quedar en revision, no
  // reacreditado. Se comprueba con un error pelado, sin codigo ni marca.
  const antes = await saldoDe();
  proximoEnvio = () => new Error('algo raro que nadie clasifico');
  const r = await llamar(portafolio.retirar, {
    usuario: ana,
    cuerpo: { activo: 'ORIGEN', cantidad: w(5), direccion: DESTINO, retiroKey: 'clave-sin-clasificar' },
  });
  comprobar(r.cuerpo.codigo === 'RETIRO_EN_REVISION',
    'un error sin clasificar no reacredita', JSON.stringify(r.cuerpo));
  comprobar(await saldoDe() === antes - 5n * U, 'y el debito se queda en pie hasta que un humano mire');
}

cadena.enviarDesdeCaliente = enviarDeVerdad;
await mongoose.disconnect();
await servidor.stop();
await new Promise((listo) => nodo.close(listo));

console.log(fallos ? `\n${fallos} comprobación(es) fallaron` : '\nTodo en verde');
process.exit(fallos ? 1 : 0);
