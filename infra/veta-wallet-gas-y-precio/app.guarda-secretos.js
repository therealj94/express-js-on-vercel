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
})();

var app = express();

// ── CORS debe ir PRIMERO — antes de helmet y todo lo demás ───────────────────
const allowedOrigins = [
  "https://www.vetawallet.com",
  "https://vetawallet.com",
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
// La ruta real es /auth/registryWallet — "/auth/register" no existe, asi que
// el registro estuvo sin limite todo este tiempo. Cada intento crea una
// wallet y manda un correo, o sea que era un buen sitio para abusar.
app.use("/auth/registryWallet", authLimiter);
app.use("/auth/recuperarPassword", authLimiter);
app.use("/auth/resetPassword", authLimiter);
app.use("/auth/refresh", authLimiter);

// Los fotogramas del rostro y la foto de la credencial no caben en el
// limite general, y el cuerpo lo parsea el PRIMER parser que lo alcanza.
app.use("/genesis/biometria", parserRostro);
app.use("/genesis/foto", parserRostro);

app.use(bodyParser.json({ limit: "100kb" })); // reducido de 5mb — no hay razón para aceptar más
// view engine setup
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "jade");

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

// error handler
app.use(function (err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get("env") === "development" ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render("error");
});
// Padrón para el panel de analítica de Genesis ID.
import { arrancarCenso } from "./lib/censoGenesis";
arrancarCenso();

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Servidor escuchando en el puerto ${port}`);
});

module.exports = app;
