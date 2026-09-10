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
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
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
// venir del router del dyno — y un limite por IP que ve una sola IP no es un
// limite, es un interruptor general. Va ANTES de los limitadores a proposito.
app.set('trust proxy', 1);

// ── Cabeceras seguras (despues de CORS, como en la billetera) ───────────────
// Esta casa no devolvia UNA sola cabecera de seguridad y anunciaba su Express
// por X-Powered-By. helmet apaga eso y pone el resto (nosniff, frameguard,
// HSTS, referrer). `crossOriginResourcePolicy: false` es el mismo ajuste que
// infra/veta-wallet-backend: la web vive en otro dominio y el CORP por
// defecto (`same-origin`) le rebotaria las respuestas.
app.use(helmet({ crossOriginResourcePolicy: false }));

// ── El freno ────────────────────────────────────────────────────────────────
// El patron es el de infra/veta-wallet-backend/app.js y NO otro: un techo
// general para todo el mundo y limitadores con nombre para las puertas que
// cuestan dinero o abren sesion. Dos maneras de frenar en el mismo ecosistema
// se contradicen el dia que hay que subir un numero.
//
// Que ninguna de estas rutas tuviera freno era el fallo mas caro de la casa:
// la clave de /admin se compara en tiempo constante —bien pensado— y eso no
// sirve de nada si se puede probar una clave por milisegundo hasta acertar.

// El techo de todos: 100 por minuto y por IP. Nadie que use la web lo roza;
// un bucle lo toca a los tres segundos.
app.use(rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas peticiones. Probá en un minuto.', codigo: 'DEMASIADAS' },
}));

// El mas duro de la casa, y va donde esta la llave maestra. Con /admin se
// crean agentes, se resuelven solicitudes de dinero y se declara el precio de
// un instrumento: quien acierte la clave no se lleva una sesion, se lleva la
// casa. Cinco intentos cada cuarto de hora es lo que convierte la comparacion
// en tiempo constante en una defensa de verdad.
const limiteAdmin = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos. Esperá 15 minutos.', codigo: 'DEMASIADAS' },
});
app.use('/admin', limiteAdmin);

// La autenticacion, igual de dura que en la billetera. /auth/sso canjea un
// token de Genesis y /auth/refresh rota el par: los dos entregan una sesion a
// quien traiga la cadena correcta, asi que los dos se prueban a ciegas.
const limiteAuth = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos de entrada. Esperá 15 minutos.', codigo: 'DEMASIADAS' },
});
app.use('/auth/sso', limiteAuth);
app.use('/auth/refresh', limiteAuth);

/* Las puertas que mueven dinero.
 *
 * Aqui el limite NO se monta sobre la ruta entera sino sobre los metodos que
 * escriben, y es a proposito: la pantalla SONDEA `GET /ordenes` y
 * `GET /fiat/solicitudes` cada pocos segundos. Un limitador que contara esos
 * sondeos le cerraria la puerta al cliente honesto antes que al abusador, que
 * es justo al reves de para lo que existe.
 *
 * El numero es mas alto que el de la billetera porque esto es una mesa de
 * operaciones: colocar y cancelar treinta veces en un cuarto de hora es un
 * martes cualquiera de alguien que opera, no un ataque. Lo que corta es el
 * bucle: colocar ordenes en tanda reserva saldo en cada una, y una reserva es
 * dinero quieto que no es de la casa.
 */
const soloEscritura = (limitador) => (req, res, next) =>
  req.method === 'GET' || req.method === 'OPTIONS' ? next() : limitador(req, res, next);

const limiteDinero = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas operaciones seguidas. Esperá unos minutos.', codigo: 'DEMASIADAS' },
});
app.use('/ordenes', soloEscritura(limiteDinero));
// Comprar mueve dinero de verdad: el mismo limite que una orden.
app.use('/compras', soloEscritura(limiteDinero));
// Vender saca dinero de la casa hacia fuera: el mismo limite, y por mas motivo.
app.use('/ventas', soloEscritura(limiteDinero));
app.use('/fiat', soloEscritura(limiteDinero));
app.use('/p2p', soloEscritura(limiteDinero));

// El retiro firma una transaccion en la cadena y saca el dinero de la casa:
// es la operacion mas cara que existe aqui y no se hace sesenta veces por
// hora. Va con su propio limite, y no en la lista de arriba, por la misma
// leccion que la billetera dejo escrita — la puerta que se olvida es la que
// se usa. GET /retiros no existe, pero el filtro se mantiene por si nace.
const limiteRetiro = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados retiros seguidos. Esperá 15 minutos.', codigo: 'DEMASIADAS' },
});
app.use('/retiros', soloEscritura(limiteRetiro));

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
  /* `entrega` sale acá porque la pantalla de comprar necesita saberlo ANTES de
     que nadie escriba un monto. La puerta de verdad es lib/compra.js, que se
     niega a abrir una orden con el atendedor apagado; esto es solo para poder
     decirlo a tiempo en vez de después de rellenar el formulario.
     Es una sola variable de entorno y no cuenta nada de nadie: va en la ruta
     pública, como la tarifa, y por el mismo motivo — lo que afecta a quien va
     a pagar es suyo antes de pagar. */
  res.status(ok ? 200 : 503).json({
    ok, cadena: cadenaOk, mongo: mongoOk, bloque,
    entrega: process.env.COMPRAS === '1',
    // La salida es OTRA cosa que la entrada y puede estar cerrada sola: quien
    // vaya a vender tiene que poder saberlo antes de intentarlo.
    venta: require('./lib/venta').encendida(),
  });
});

// ── Tarifas ─────────────────────────────────────────────────────────────────
// GET /tarifas → { comisionPpm, sobre }. Publica y sin sesion, como /salud:
// lo que cobra la casa es de quien va a pagarlo, y pedirle cuenta para
// enterarse seria cobrarselo antes de decirselo.
//
// POR QUE EXISTE ESTA RUTA: la comision se cobra de verdad —lib/motor.js la
// parte en dos patas del ledger en cada trato— y hasta hoy no salia por
// ninguna puerta. La web no podia enseñarla porque no tenia de donde leerla, y
// una tarifa que solo vive en una variable de entorno del motor es una tarifa
// que el cliente descubre en el saldo.
//
// Y sale de `lib/motor.js`, del MISMO sitio que la cobra. Habia dos copias de
// la cuenta, una aqui y otra alla, y dos copias de una regla de dinero es la
// casa cobrando una cifra y anunciando otra en cuanto alguien toque una sola.

app.get('/tarifas', (req, res) => {
  /* `Number(...)` y no el BigInt tal cual: `res.json()` NO SABE serializar un
     BigInt y contesta 500. Se me escapo al hacer que esta ruta usara la funcion
     del motor en vez de su propia copia — el motor devuelve BigInt porque es lo
     que le sirve para su aritmetica, y aqui hace falta un numero.
     La conversion es exacta y no una comodidad: la parte por millon tiene tope
     de 50.000 en el propio motor, muy por debajo de donde un numero de JS
     empieza a perder precision. Y es lo que espera la web, que comprueba
     `Number.isInteger` y hace ella misma el paso a BigInt. */
  const ppm = Number(require('./lib/motor').comisionPpm());
  // `sobre: 'recibido'` no es adorno: la comision se descuenta de lo que cada
  // parte RECIBE (el activo el comprador, el ORIGEN el vendedor), no de lo que
  // paga. Sin ese dato, la web no sabria de que lado restarla.
  res.json({ comisionPpm: ppm, sobre: 'recibido' });
});

// ── Limites ─────────────────────────────────────────────────────────────────
// GET /limites → { desvio: { avisoPct, bloqueoPct }, terminos: { version, … } }
// Publica y sin sesion, por la misma razon que /tarifas: los umbrales de la
// guarda de precio (lib/guardaPrecio.js) son parte de lo que la pantalla de
// confirmacion tiene que ENSEÑAR antes de que alguien coloque nada, y la
// version vigente de los terminos es lo que la web compara para saber si la
// primera orden lleva la casilla. Salen del MISMO sitio que los aplica: una
// copia en el navegador seria un umbral anunciado que no es el que frena.
app.get('/limites', (req, res) => {
  const { umbrales } = require('./lib/guardaPrecio');
  const terminos = require('./lib/terminos');
  const { avisoPct, bloqueoPct } = umbrales();
  // Las redes por las que la casa recibe USDT HOY. La pantalla ofrece estas y
  // no la tabla entera: una red conocida pero cerrada —sin gas para barrer—
  // recibiria el deposito y lo dejaria quieto. Ver lib/redesUsdt.js.
  const redes = require('./lib/redesUsdt');
  res.json({
    desvio: { avisoPct, bloqueoPct, contra: 'referencia del oro (onza / 31,1035 / 55) en ORIGEN' },
    terminos: { version: terminos.TERMINOS_VERSION, terminos: terminos.TERMINOS_RUTA, riesgo: terminos.RIESGO_RUTA },
    redes: redes.abiertas().map((id) => ({
      id, nombre: redes.REDES[id].nombre, minimoUsd: Number(redes.REDES[id].minimoMicro || 0) / 1e6,
    })),
  });
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
app.use('/compras', require('./routes/compras'));
app.use('/ventas', require('./routes/ventas'));
app.use('/', require('./routes/portafolio'));
app.use('/fiat', require('./routes/fiat'));
app.use('/p2p', require('./routes/p2p'));
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
//
// Antes de abrir el puerto se comprueban los DECIMALES de cada contra
// contra su cadena (lib/decimales.js). Va antes y no despues porque todo lo
// que corre despues cuenta dinero, y contar mal desde el principio es lo unico
// de esta casa que no se arregla mirando el log al dia siguiente.
//
// Y se parte en dos, que es la distincion que importa:
//
//   · un DESACUERDO (la cadena dice 18 donde esperabamos 6) mata el proceso;
//     no se arregla esperando y nada de lo que corriera contaria bien.
//   · una DUDA (el RPC no contesto) NO lo mata: eso es una averia de red, y
//     matar el API por una averia de red es justo lo que prohibe el comentario
//     de arriba de este archivo. La cadena queda cerrada —de ella no se mueve
//     un centavo, porque decimalesDe() lanza— y el resto sigue sirviendo.
//
// Medido contra las cuatro cadenas de verdad: 2,6 segundos para 18 contratos.
// Las redes se miran en paralelo, asi que cuatro RPC caidos son UN plazo y no
// cuatro encadenados.
const puerto = process.env.PORT || 3000;

(async () => {
  try {
    const decimales = require('./lib/decimales');
    const { proveedorDe } = require('./lib/proveedores');
    const r = await decimales.verificar({ proveedorDe });
    console.log(`[decimales] ${r.comprobados.length} comprobados, ` +
      `${r.desacuerdos.length} en desacuerdo, ${r.ilegibles.length} sin leer`);
    if (!decimales.puedeSeguir(r)) process.exit(1);
  } catch (e) {
    // Que la comprobacion misma se rompa (un require que falla, un bug aqui)
    // no es un desacuerdo: es que no se pudo preguntar. Se canta y se sigue,
    // porque decimalesDe() sigue lanzando y ninguna cadena queda abierta —
    // el fallo se cierra solo por el lado del dinero.
    console.error(`[decimales] no se pudo comprobar: ${e.message}`);
  }
  arrancar();
})();

function arrancar() {
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
    const p2p = require('./lib/p2p');
    /* ── EL BARREDOR DEL P2P ────────────────────────────────────────────────
       Las órdenes también se vencen al leerlas, así que esto no es la única
       red: es la que se ocupa de las que nadie mira. Una orden abierta que
       nadie abre tiene el ORIGEN de alguien bloqueado, y ese alguien no está
       mirando la pantalla — por eso hace falta que pase alguien igual.
       Es idempotente por la guarda atómica de `transitar`: dos barredores,
       o dos dynos, vencen cada orden UNA vez. */
    const barrerP2P = () => p2p.barrer().then((n) => { if (n) console.log(`[p2p] ${n} orden(es) vencida(s)`); })
      .catch((e) => console.warn('[p2p] el barredor falló:', String(e?.message || e).slice(0, 120)));
    setInterval(barrerP2P, Number(process.env.ORDENEX_P2P_BARREDOR_MS || 20_000)).unref?.();
    barrerP2P();

    Promise.resolve(vigia.arrancar()).catch((e) =>
      console.error(`[vigia] no arranco: ${e.message}`)
    );

    const referenciaVelas = require('./lib/referenciaVelas');
    Promise.resolve(referenciaVelas.arrancar()).catch((e) =>
      console.error(`[referenciaVelas] no arranco: ${e.message}`)
    );

    // El vigia de los depositos de USDT en Polygon, BSC y Ethereum.
    //
    // Arranca en modo SOLO MIRAR: ve, identifica y anota, y no toca el libro.
    // Acreditar exige el tamiz de sanciones, la atribucion a una orden con su
    // precio congelado y el ledger, y esas tres piezas todavia no estan. Se
    // enciende asi a proposito: una semana mirando enseña lo que ninguna prueba
    // puede — que RPC falla de verdad, cuanto tarda cada red de verdad, y que
    // hace la gente que no se puede predecir.
    //
    // Va en ESTE bloque, con su propio .catch, por lo mismo que los otros: un
    // tropiezo suyo no puede tumbar al vigia de la 5550 ni a las velas.
    if (process.env.VIGIA_EXTERNO !== '0') {
      const vigiaExterno = require('./lib/vigiaDepositosExternos');
      Promise.resolve(vigiaExterno.arrancar()).catch((e) =>
        console.error(`[vigia-ext] no arranco: ${e.message}`)
      );
    }

    // El barrido: mueve el USDT de la direccion provisional a la caja unica.
    //
    // Apagado POR OMISION, y esa es la diferencia con el vigia. El vigia solo
    // mira; esto FIRMA con la llave de cada direccion de deposito y gasta gas.
    // Un arranque accidental en un entorno de pruebas apuntando a la base de
    // produccion barreria de verdad. Se enciende poniendo BARRIDO=1, a mano y
    // sabiendo lo que se hace.
    //
    // Tampoco acredita: mueve custodia y nada mas. Ver lib/barridoExterno.js.
    // El atendedor de compras: le busca orden a cada deposito, decide el
    // precio y entrega el ORIGEN. Como el barrido, FIRMA — desde la caliente —
    // asi que tambien se enciende a mano.
    /* LA CALIENTE TIENE QUE SER LA DE AHORA, Y SE DICE AL ARRANCAR.
     *
     * ORDENEX_HOT_KEY estuvo apuntando a una billetera anterior con cero
     * ORIGEN mientras billeteras.ORIGEN era otra: desde fuera las dos firman
     * igual, y el sintoma era una entrega que no se podia hacer. Se veia solo
     * mirando /admin/estado a proposito. Ahora se canta en el arranque, que
     * es donde alguien lo lee sin ir a buscarlo. */
    try {
      const cadena = require('./lib/cadena5550');
      const billeteras = require('./lib/billeteras');
      const caliente = cadena.direccionCaliente();
      if (!caliente) {
        console.error('[caliente] ORDENEX_HOT_KEY no esta puesta: no se puede entregar ORIGEN');
      } else if (caliente !== billeteras.ORIGEN) {
        console.error(`[caliente] LA LLAVE ES DE OTRA BILLETERA: firma desde ${caliente} y se espera ${billeteras.ORIGEN}. `
          + 'Las entregas van a fallar por inventario hasta que se cambie ORDENEX_HOT_KEY.');
      } else {
        console.log(`[caliente] ${caliente} · la de ahora`);
      }
    } catch (e) {
      console.error(`[caliente] no se pudo comprobar: ${e.message}`);
    }

    if (process.env.COMPRAS === '1') {
      const compra = require('./lib/compra');
      Promise.resolve(compra.arrancar()).catch((e) =>
        console.error(`[compra] no arranco: ${e.message}`)
      );
    } else {
      console.log('[compra] apagado (COMPRAS != 1): los depositos se ven pero no se entrega ORIGEN');
    }

    /* La venta paga USDT desde la caja, asi que su llave es la de la caja: la
       unica billetera que hasta hoy podia estar quieta. Se canta al arrancar
       en que estado quedo, porque «la venta no anda» y «la venta esta apagada
       a proposito» se ven igual desde fuera. */
    try {
      const venta = require('./lib/venta');
      if (process.env.VENTAS !== '1') {
        console.log('[venta] apagada (VENTAS != 1): no se paga USDT por ORIGEN');
      } else if (!venta.encendida()) {
        console.error('[venta] ENCENDIDA SIN LLAVE: falta ORDENEX_VENTA_KEY y ninguna venta va a poder pagarse');
      } else {
        console.log(`[venta] paga desde ${venta.ESPERADA}`);
      }
    } catch (e) {
      console.error(`[venta] no se pudo comprobar: ${e.message}`);
    }

    if (process.env.BARRIDO === '1') {
      const barrido = require('./lib/barridoExterno');
      Promise.resolve(barrido.arrancar()).catch((e) =>
        console.error(`[barrido] no arranco: ${e.message}`)
      );
    } else {
      console.log('[barrido] apagado (BARRIDO != 1): el USDT se queda en las direcciones provisionales');
    }
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
}

module.exports = app;
