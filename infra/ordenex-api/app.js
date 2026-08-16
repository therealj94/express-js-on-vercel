// ordenex-api — la casa de cambio de Orden Global.
//
// Este archivo es solo el andamio: CORS, JSON, Mongo, las rutas, /salud y el
// manejo de errores. El dinero vive en lib/ (ledger, motor, vigia) y en los
// controllers; aqui no se toca un wei.
//
// El principio que gobierna el arranque: el API se levanta AUNQUE la cadena o
// Mongo no contesten. Un exchange caido porque el RPC tardo en responder al
// arrancar no protege a nadie; lo que si se hace es que /salud lo cante y que
// cada operacion con dinero falle sola y cerrada cuando le falte su pieza.

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const { JsonRpcProvider } = require('ethers');

const app = express();

// ── CORS ────────────────────────────────────────────────────────────────────
// La lista viene de CORS_ORIGENES (separada por comas), no del codigo: la web
// va a mudarse de CloudFront a Amplify y despues al dominio propio, y cada
// mudanza seria un deploy si los origenes vivieran aqui (la leccion de
// app.vetawallet.com: un origen que falta bloquea TODO desde ese dominio y por
// fuera parece un fallo de otro). Sin la variable no se permite ningun origen
// de navegador — fail-closed tambien aqui — y se avisa por consola.
const ORIGENES = (process.env.CORS_ORIGENES || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
if (ORIGENES.length === 0) {
  console.error('[cors] CORS_ORIGENES no esta puesta: ningun navegador va a poder llamar al API');
}
app.use(
  cors({
    origin: ORIGENES,
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Admin-Key'],
  })
);

// Heroku pone la IP real en X-Forwarded-For; sin esto, todo el mundo parece
// venir del router del dyno.
app.set('trust proxy', 1);

// 100kb alcanzan de sobra: la peticion mas gorda de esta casa es una orden con
// cinco campos. Un cuerpo mayor no es un cliente nuestro.
app.use(express.json({ limit: '100kb' }));

// ── Mongo ───────────────────────────────────────────────────────────────────
// La base se llama `ordenex` y se fija aqui, no en la URI: asi el mismo
// cluster puede prestar la URI sin que un descuido escriba en la base de otra
// app. Si la conexion falla, el proceso NO muere — mongoose reintenta por
// detras, /salud dice `mongo: false`, y mientras tanto toda ruta que necesite
// la base contesta su propio error.
(async () => {
  try {
    mongoose.set('strictQuery', true);
    await mongoose.connect(process.env.MONGODB_URI, { dbName: 'ordenex' });
    console.log(`[mongo] conectado a ${mongoose.connection.name}`);
  } catch (e) {
    console.error(`[mongo] no se pudo conectar: ${e.message}`);
  }
})();

// ── Salud ───────────────────────────────────────────────────────────────────
// Un plazo para cada comprobacion: un nodo colgado no puede colgar tambien el
// endpoint que existe para contar que el nodo esta colgado.
function conPlazo(promesa, ms, que) {
  return Promise.race([
    promesa,
    new Promise((_, rechaza) =>
      setTimeout(() => rechaza(new Error(`${que}: sin respuesta en ${ms}ms`)), ms)
    ),
  ]);
}

const OG_RPC = process.env.OG_CHAIN_PROVIDER || 'https://rpc.ordenglobal-rpc.com';

// GET /salud → { ok, cadena, mongo, bloque }. Fail-closed hasta en el estado:
// si una pata no contesta, ok es false y el HTTP es 503 — asi el chequeo de
// Heroku o un uptime robot no necesitan leer el JSON para enterarse. `bloque`
// va en null cuando la cadena no se pudo leer: nunca un cero de consuelo.
app.get('/salud', async (req, res) => {
  let mongoOk = false;
  try {
    if (mongoose.connection.readyState === 1) {
      await conPlazo(mongoose.connection.db.admin().command({ ping: 1 }), 4000, 'mongo');
      mongoOk = true;
    }
  } catch (e) {
    console.error(`[salud] mongo: ${e.message}`);
  }

  let cadenaOk = false;
  let bloque = null;
  let proveedor = null;
  try {
    proveedor = new JsonRpcProvider(OG_RPC, undefined, { staticNetwork: true });
    bloque = Number(await conPlazo(proveedor.getBlockNumber(), 5000, 'eth_blockNumber'));
    cadenaOk = true;
  } catch (e) {
    console.error(`[salud] cadena: ${e.message}`);
  } finally {
    try { proveedor?.destroy(); } catch {}
  }

  const ok = mongoOk && cadenaOk;
  res.status(ok ? 200 : 503).json({ ok, cadena: cadenaOk, mongo: mongoOk, bloque });
});

// ── Rutas ───────────────────────────────────────────────────────────────────
// Todas cuelgan de la raiz, como en el contrato. portafolio.js se monta en '/'
// porque sirve tres rutas de primer nivel (/portafolio, /retiros,
// /movimientos) que son la misma cosa: lo mio.
app.use('/auth', require('./routes/auth'));
app.use('/mercados', require('./routes/mercados'));
// Aparte de /mercados a proposito: lo que sirve no es un mercado. Un precio
// declarado por la Junta no tiene libro, ni volumen, ni contraparte, y
// colgarlo de /mercados/:par lo habria disfrazado de uno.
app.use('/precio-declarado', require('./routes/precios'));
app.use('/ordenes', require('./routes/ordenes'));
app.use('/', require('./routes/portafolio'));
app.use('/fiat', require('./routes/fiat'));
app.use('/admin', require('./routes/admin'));

// ── Errores: siempre { error, codigo } ──────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'No existe esa ruta.', codigo: 'NO_EXISTE' });
});

app.use((err, req, res, next) => {
  // Los dos errores que fabrica el parser de JSON, traducidos a la forma de la
  // casa antes de que caigan al fondo como un 500 anonimo.
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'El cuerpo pasa de 100kb.', codigo: 'CUERPO_GRANDE' });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'El JSON no se pudo leer.', codigo: 'JSON_INVALIDO' });
  }
  // Un error con `codigo` lo puso alguien de la casa y su mensaje es para el
  // cliente. Uno sin codigo es un accidente: el detalle va al log, no a la
  // respuesta — el mensaje de una excepcion puede llevar dentro una URI o
  // media consulta.
  console.error('[error]', err);
  if (err.codigo) {
    return res.status(err.status || 500).json({ error: err.message, codigo: err.codigo });
  }
  res.status(500).json({ error: 'Fallo interno.', codigo: 'INTERNO' });
});

// ── Arranque ────────────────────────────────────────────────────────────────
const puerto = process.env.PORT || 3000;
app.listen(puerto, () => {
  console.log(`[ordenex-api] escuchando en ${puerto}`);

  // El vigia (depositos) y el motor (libros en memoria) arrancan aparte y
  // cada uno dentro de su try/catch, tambien para el fallo asincrono: si la
  // cadena no contesta hoy, mañana el sondeo del vigia la encuentra — pero un
  // API muerto no se recupera solo. El costo de arrancar sin libros es que
  // las ordenes fallan hasta que cargarLibros() pase; ese es el lado correcto
  // en el que equivocarse.
  //
  // Las velas de referencia (el oro y la plata de CoinGecko) arrancan en este
  // MISMO bloque porque son la misma clase de cosa: un fondo que sondea solo,
  // que puede fallar entero sin que la casa pare, y cuyo fallo se cuenta por
  // el log. Cada uno lleva ademas su propio .catch para el lado asincrono, asi
  // que un tropiezo de uno no se traga el arranque del otro. Si CoinGecko no
  // contesta hoy, GET /mercados/:par/referencia sirve lo ultimo bueno con su
  // hora, o vacio y rotulado — jamas un precio inventado — y ni una operacion
  // con dinero se entera de nada.
  try {
    const vigia = require('./lib/vigia');
    Promise.resolve(vigia.arrancar()).catch((e) =>
      console.error(`[vigia] no arranco: ${e.message}`)
    );

    const referenciaVelas = require('./lib/referenciaVelas');
    Promise.resolve(referenciaVelas.arrancar()).catch((e) =>
      console.error(`[referenciaVelas] no arranco: ${e.message}`)
    );
  } catch (e) {
    console.error(`[fondos] no arrancaron: ${e.message}`);
  }

  try {
    const motor = require('./lib/motor');
    Promise.resolve(motor.cargarLibros()).catch((e) =>
      console.error(`[motor] no cargo los libros: ${e.message}`)
    );
  } catch (e) {
    console.error(`[motor] no cargo los libros: ${e.message}`);
  }
});

module.exports = app;
