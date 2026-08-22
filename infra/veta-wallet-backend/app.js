var createError = require("http-errors");
var express = require("express");
var path = require("path");
var cookieParser = require("cookie-parser");
var logger = require("morgan");
var cors = require("cors");
const bodyParser = require("body-parser");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

var indexRouter = require("./routes/index");
var usersRouter = require("./routes/users");
var authRouter = require("./routes/auth");
var chainsRouter = require("./routes/chains");
var txRouter = require("./routes/tx");
var tokensRouter = require("./routes/tokens");
var transactionRouter = require("./routes/transaction");
var kycRouter = require("./routes/kyc");
var cardsRouter = require("./routes/cards");
var walletRouter = require("./routes/wallet");
// La baja de los correos de aviso. Se abre desde el cliente de correo:
// contesta HTML y no pide sesion — quien la abre viene de su bandeja.
var avisosRouter = require("./routes/avisos");
const { routerGenesis, parserRostro } = require("./lib/genesisPuente");
const sesionGenesis = require("./middleware/sesionGenesis");

require("./db");

// ── Los secretos, revisados al arrancar ─────────────────────────────────────
//
// PASS_TOKEN firma TODAS las sesiones. La clave de cifrado --PASS_ADM_NUEVA, y
// PASS_ADM la vieja mientras dure la rotacion en dos etapas de lib/cripto.js--
// protege la llave privada y la frase semilla de cada usuario. Los dos han
// sido, en algun momento de este proyecto, cadenas de siete caracteres, que se
// prueban por fuerza bruta en un rato.
//
// Que PASS_ADM ya no este puesta es lo NORMAL: es la tercera etapa de la
// rotacion. Lo que se vigila es que haya al menos una clave de cifrado y que
// la que mande sea larga.
//
// No bloquea el arranque a proposito: dejar el servicio caido no protege a
// nadie. Lo que hace es que el problema deje de ser invisible.
(function revisarSecretos() {
  const MINIMO = 32;
  const cifrado = process.env.PASS_ADM_NUEVA || process.env.PASS_ADM;
  const revisar = (nombre, valor) => {
    if (!valor) console.error(`[secretos] ${nombre} NO ESTA PUESTO`);
    else if (valor.length < MINIMO)
      console.error(
        `[secretos] ${nombre} tiene ${valor.length} caracteres; el minimo son ${MINIMO}`
      );
  };
  revisar("PASS_TOKEN", process.env.PASS_TOKEN);
  revisar("la clave de cifrado (PASS_ADM_NUEVA)", cifrado);
  if (process.env.PASS_ADM) {
    console.warn(
      "[secretos] PASS_ADM (la vieja) sigue configurada: la rotacion no ha " +
        "terminado. Borrarla cuando no quede ningun registro cifrado con ella."
    );
  }
  // Igual que con la clave de cifrado, PASS_TOKEN se rota en tres etapas
  // (ver lib/sesion.js). Mientras PASS_TOKEN_VIEJO siga puesta, las sesiones
  // firmadas con el secreto corto todavia valen: la rotacion no ha terminado.
  // El token de refresco dura 30 dias, asi que ese es el plazo minimo de
  // espera antes de borrarla.
  if (process.env.PASS_TOKEN_VIEJO) {
    console.warn(
      "[secretos] PASS_TOKEN_VIEJO sigue configurada: aun se aceptan sesiones " +
        "firmadas con el secreto anterior. Borrarla 30 dias despues de poner " +
        "el nuevo, que es lo que dura el token de refresco."
    );
  }
})();

var app = express();

// ── CORS debe ir PRIMERO — antes de helmet y todo lo demás ───────────────────
const allowedOrigins = [
  "https://www.vetawallet.com",
  "https://vetawallet.com",
  // app.vetawallet.com va directo a Amplify y es la que se usa en las tiendas y
  // en los enlaces que tienen que durar (ver apps-web/README.md), pero faltaba
  // en esta lista: el preflight desde ahi respondia sin Access-Control-Allow-
  // Origin, o sea que el navegador bloqueaba TODAS las llamadas, incluido el
  // login y la consulta del estado de Genesis ID. Desde ese dominio la web no
  // servia para nada, y por fuera parecia un fallo de Genesis.
  "https://app.vetawallet.com",
  ...(process.env.CORS_ALLOW_LOCALHOST === "true" ? ["http://localhost:3000"] : []),
];

const corsOptions = {
  origin: allowedOrigins,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "x-api-key", "x-admin-key"],
  credentials: true,
};
app.options("*", cors(corsOptions)); // preflight OPTIONS antes que cualquier middleware
app.use(cors(corsOptions));

// ── Trust proxy — requerido en Heroku (X-Forwarded-For) ──────────────────────
app.set("trust proxy", 1);

// ── Seguridad: headers HTTP seguros (después de CORS) ────────────────────────
app.use(helmet({ crossOriginResourcePolicy: false }));

// ── GET /salud ───────────────────────────────────────────────────────────────
//
// POR QUE HACIA FALTA
//
// Era el unico de los cuatro servicios del ecosistema sin ruta de salud, y es
// el que mueve dinero. Hoy, si Mongo se cae, el primer aviso es un usuario
// quejandose.
//
// Y habia algo peor que no tenerla: la raiz `/` contesta `{ok:true}` SIEMPRE,
// sin comprobar nada. Cualquiera que la pusiera en un monitor —y el propio
// guion de despliegue la vigila— veria verde con la base de datos muerta. Un
// chequeo que no puede fallar no es un chequeo; es un adorno que da confianza
// falsa. La raiz se deja como esta, porque para lo que sirve —saber si el dyno
// arranco— esta bien, pero ahora dice donde esta la de verdad.
//
// SE MONTA ANTES DEL LIMITADOR GLOBAL, Y NO ES UN DESCUIDO
//
// El limitador general corta a 100 peticiones por minuto y por IP. Un monitor
// que consulta cada minuto gasta una, pero si alguna vez comparte salida con
// trafico de usuarios, el corte le llegaria a el tambien — y avisaria de una
// caida que no existe. Una alarma que se dispara sola deja de mirarse.
//
// Aun asi lleva su propio limite, mas ancho: la ruta toca Mongo y el RPC, y sin
// ningun freno cualquiera la usaria para hacerles ruido.
const mongoose = require("mongoose");
const { JsonRpcProvider } = require("ethers");

// Sin plazo, un Mongo que no responde —que es distinto de uno que rechaza— deja
// la peticion colgada, y el monitor marca "tiempo agotado" sin decir de que.
function conPlazo(promesa, ms, que) {
  return Promise.race([
    promesa,
    new Promise((_, rechaza) =>
      setTimeout(() => rechaza(new Error(`${que}: sin respuesta en ${ms}ms`)), ms)
    ),
  ]);
}

const OG_RPC = process.env.OG_CHAIN_PROVIDER || "https://rpc.ordenglobal-rpc.com";

app.get(
  "/salud",
  rateLimit({ windowMs: 60 * 1000, max: 60, standardHeaders: true, legacyHeaders: false }),
  async (req, res) => {
    let mongo = false;
    try {
      // `readyState === 1` dice que el driver CREE estar conectado. El ping es
      // el que lo comprueba de verdad: se puede estar conectado a un servidor
      // que dejo de contestar.
      if (mongoose.connection.readyState === 1) {
        await conPlazo(mongoose.connection.db.admin().command({ ping: 1 }), 4000, "mongo");
        mongo = true;
      }
    } catch (e) {
      console.error(`[salud] mongo: ${e.message}`);
    }

    let cadena = false;
    let bloque = null;
    let proveedor = null;
    try {
      proveedor = new JsonRpcProvider(OG_RPC, undefined, { staticNetwork: true });
      bloque = Number(await conPlazo(proveedor.getBlockNumber(), 5000, "eth_blockNumber"));
      cadena = true;
    } catch (e) {
      console.error(`[salud] cadena: ${e.message}`);
    } finally {
      try { proveedor?.destroy(); } catch {}
    }

    // El HTTP tambien lo canta, no solo el JSON: asi un monitor sirve sin
    // saber leer el cuerpo. `bloque` va en null cuando no se pudo leer la
    // cadena — nunca un cero de consuelo, que se confunde con una cadena
    // parada en el bloque cero.
    const ok = mongo && cadena;
    res.status(ok ? 200 : 503).json({ ok, mongo, cadena, bloque });
  }
);

// ── Rate limiting global: 100 req/min por IP ──────────────────────────────────
app.use(rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests, please try again later" },
}));

// ── Rate limiting estricto para operaciones financieras ───────────────────────
const financialLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 10,                   // máx 10 intentos de fondeo cada 15 min
  message: { message: "Too many fund attempts, please wait 15 minutes" },
});
app.use("/cards/fund", financialLimiter);

// ── Enviar dinero ────────────────────────────────────────────────────────────
//
// EL FRENO DURO ESTABA DONDE EL PREMIO ERA CHICO.
//
// Asi estaban los topes hasta hoy:
//
//   /users/decriptSeed   enseña la frase semilla       5 cada 15 min
//   /cards/fund          mueve hasta 5.000 USD        10 cada 15 min
//   /transaction/send    mueve TODO el saldo         100 por minuto
//
// O sea que la ruta que puede vaciar una cuenta entera era trescientas veces
// mas permisiva que la que enseña la semilla, y no tenia freno propio: caia
// solo en el limite global de 100/min que existe para que nadie tumbe el
// servidor, no para proteger el dinero de nadie.
//
// Y las tres piden la contraseña, asi que las tres son un oraculo para
// adivinarla: se prueba una, el servidor contesta si acerto, se prueba otra.
// Con 100 por minuto se prueban 144.000 contraseñas al dia por esa puerta.
//
// Se iguala al freno mas duro que hay en la casa, el de la semilla, y no al de
// /cards/fund, porque el premio de esta puerta es el de la semilla y no el de
// la tarjeta: quien la fuerce se lleva el saldo entero, no cinco mil dolares.
//
// VA SOBRE /transaction Y NO SOBRE CADA RUTA. Con un limitador por ruta se
// tendria cinco en /send MAS cinco en /sendToken alternando entre las dos, que
// es el doble del tope escrito. El presupuesto es uno y se comparte.
//
// Si algun dia cinco resulta corto para alguien que usa esto de verdad, se
// sube ESTE numero y se dice por que. Lo que no se puede es dejarlo sin freno.
const envioLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: "Demasiados envíos seguidos. Esperá 15 minutos.",
    codigo: "demasiados-envios",
  },
});
app.use("/transaction", envioLimiter);

// La revision de deposito lee el saldo USDT en Polygon en cada llamada. La
// pantalla la sondea cada pocos segundos, asi que el limite es alto, pero
// existe: sin el, un cliente en bucle agota la cuota del RPC para todos.
const depositLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 120,
  message: { message: "Too many deposit checks, please wait a few minutes" },
});
app.use("/wallet/deposit/check", depositLimiter);
app.use("/wallet/deposit-info", depositLimiter);

// ── Endpoints que revelan material criptografico ─────────────────────────────
// decriptSeed y decriptPrivate devuelven la frase de respaldo y la clave
// privada a cambio de la contrasena. Sin limite, un atacante con el token de
// sesion podia probar contrasenas contra ellos a velocidad de red — y estos
// endpoints no estaban en ninguna de las listas de arriba. El que gane esa
// carrera se lleva los fondos, no una sesion.
const secretLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { message: "Demasiados intentos. Esperá 15 minutos." },
});
app.use("/users/decriptSeed", secretLimiter);
app.use("/users/decriptPrivate", secretLimiter);
app.use("/users/changePassword", secretLimiter);
app.use("/users/me", secretLimiter);

// ── Rate limiting para autenticación ─────────────────────────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { message: "Too many login attempts, please wait 15 minutes" },
});
app.use("/auth/login", authLimiter);
// Las DOS rutas de registro. /auth/register se anadio despues como alias —es
// el nombre obvio y la web llama a ese— y se quedo fuera del limitador: el
// registro estuvo sin freno por la puerta que mas se usa. Cada intento crea
// una wallet y manda un correo, o sea que era un buen sitio para abusar.
app.use("/auth/registryWallet", authLimiter);
app.use("/auth/register", authLimiter);
// Traer una billetera es un alta: mismo freno que las demas. Sin esto se
// podrian probar llaves en tanda contra la comprobacion de «ya tiene cuenta».
app.use("/auth/importar", authLimiter);
app.use("/auth/entrar-con-llave", authLimiter);
app.use("/auth/reto-llave", authLimiter);
app.use("/auth/recuperarPassword", authLimiter);
app.use("/auth/resetPassword", authLimiter);
app.use("/auth/refresh", authLimiter);

// Los fotogramas del rostro y la foto de la credencial no caben en el
// limite general, y el cuerpo lo parsea el PRIMER parser que lo alcanza.
app.use("/genesis/biometria", parserRostro);
app.use("/genesis/foto", parserRostro);
// Las dos caras del documento, para quien se verifica desde el navegador: son
// dos fotografias de telefono y tampoco caben en el limite general.
app.use("/genesis/documento-fotos", parserRostro);

/* Reducido de 5mb — no hay razón para aceptar más.
 *
 * Y se guardan los BYTES tal como llegaron. Una firma HMAC se calcula sobre el
 * cuerpo crudo, y una vez parseado ese cuerpo ya no existe: volver a
 * serializarlo con JSON.stringify da otros bytes —otro orden, otros espacios,
 * otros escapes— y por tanto otra firma, así que la comprobación fallaría
 * siempre aunque el remitente hubiera firmado bien. Los usa el webhook de
 * tarjeta (controller/cardController.js) y le sirve igual al de Veriff.
 *
 * El coste es tener el buffer en memoria mientras dure la petición, y está
 * acotado por el mismo límite de 100 kb de aquí al lado. */
app.use(bodyParser.json({
  limit: "100kb",
  verify: (req, res, buf) => { req.rawBody = buf; },
}));
/* Aquí había un motor de plantillas (jade) y lo usaba UNA sola cosa: el
 * manejador de errores del final, para pintar una página de error a un cliente
 * que es una aplicación móvil y una web que hablan JSON. Nadie veía esa página.
 *
 * Jade está abandonado desde 2016 y arrastraba tres de las cuatro
 * vulnerabilidades críticas del proyecto (constantinople, uglify-js y el propio
 * jade, vía transformers). Devolver JSON —que es lo que el cliente entiende—
 * las quita de raíz, sin parche que mantener y con una dependencia menos.
 *
 * Si algún día hace falta servir HTML desde aquí, se elige un motor mantenido y
 * se vuelve a poner. Lo que no hay que hacer es conservar uno abandonado por
 * una página que nadie mira. */

app.use(logger("dev"));

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

// ── Filtro contra inyeccion NoSQL ────────────────────────────────────────────
// Mongoose acepta objetos con operadores donde el codigo espera un texto: un
// {"$ne": null} en lugar de un token convierte "buscame al usuario con ESTE
// token" en "buscame a cualquiera que tenga uno". Aca se eliminan las claves
// que Mongo interpreta como operadores antes de que lleguen a ningun handler.
//
// No reemplaza validar tipos en cada endpoint —eso se hace ademas—, pero
// cubre de una vez las decenas de consultas que arman filtros con datos que
// vienen del cliente.
function limpiarOperadores(obj, profundidad = 0) {
  if (!obj || typeof obj !== "object" || profundidad > 6) return;
  for (const clave of Object.keys(obj)) {
    if (clave.startsWith("$") || clave.includes(".")) {
      delete obj[clave];
      continue;
    }
    const valor = obj[clave];
    if (valor && typeof valor === "object") limpiarOperadores(valor, profundidad + 1);
  }
}

app.use((req, res, next) => {
  limpiarOperadores(req.body);
  limpiarOperadores(req.query);
  limpiarOperadores(req.params);
  next();
});

app.use("/", avisosRouter.router || avisosRouter.default || avisosRouter);
app.use("/", indexRouter);
app.use("/users", usersRouter);
app.use("/auth", authRouter);
app.use("/chains", chainsRouter);
app.use("/token", tokensRouter);
app.use("/tx", txRouter);
app.use("/transaction", transactionRouter);
app.use("/kyc", kycRouter);
app.use("/cards", cardsRouter);
app.use("/wallet", walletRouter);

// Puente con Genesis ID. La clave de API vive SOLO aqui: un APK se
// descomprime y cualquiera la sacaria de la aplicacion movil.
//
//   telefono --JWT--> este servidor (/genesis/*) --X-API-Key--> Genesis ID
//
// Ninguna de estas rutas verifica a nadie: eso lo decide un operador en el
// panel de Genesis ID. Aqui solo se aportan datos.
app.use("/genesis", routerGenesis({ exigirSesion: sesionGenesis }));

// catch 404 and forward to error handler
app.use(function (req, res, next) {
  next(createError(404));
});

/* Manejador de errores. Contesta JSON, que es lo que hablan todos los clientes
 * de este servidor.
 *
 * La pila de la excepción SOLO en desarrollo, igual que antes: en producción una
 * pila dice rutas del disco, nombres de fichero y versiones de biblioteca, que
 * es material de reconocimiento para quien esté probando la puerta. */
app.use(function (err, req, res, next) {
  const estado = err.status || 500;
  res.status(estado).json({
    message: err.message || "Server error",
    ...(req.app.get("env") === "development" ? { stack: err.stack } : {}),
  });
});
// Padrón para el panel de analítica de Genesis ID.
import { arrancarCenso } from "./lib/censoGenesis";
arrancarCenso();

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Servidor escuchando en el puerto ${port}`);
});

module.exports = app;
