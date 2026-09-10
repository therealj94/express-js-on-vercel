
// El nodo de la cadena sale de OG_RPC. Estaba escrito a fuego en cinco
// archivos, asi que apuntar el explorador a otra red obligaba a editar
// codigo. Sin la variable puesta se comporta igual que siempre.
const RPC_CADENA = process.env.OG_RPC || "https://ordenglobal-rpc.com/";

var createError = require("http-errors");
var express = require("express");
var path = require("path");
var cookieParser = require("cookie-parser");
var logger = require("morgan");
var cors = require("cors");
const bodyParser = require("body-parser");

const addressRouter = require("./routes/address");
const blockRouter = require("./routes/blocks");
const transactionRouter = require("./routes/transactions");
// EventBlockchain.js exporta con `module.exports` PERO tiene `import` dentro, y
// el arranque es con babel-node: segun como transpile, este require puede
// devolver la funcion o el objeto del modulo con la funcion en `.default`. Si
// llega el objeto, setInterval programa algo que no es funcion: no indexa nada
// y no da ni un error. Eso paso de verdad —el explorador se quedo sin indexar
// la primera transaccion de la 5550—, asi que se aceptan las dos formas.
const _modIndexador = require("./controller/EventBlockchain");
const revisarNuevosBloques =
  typeof _modIndexador === "function" ? _modIndexador : _modIndexador.default;

require("../db");

var app = express();

app.use(bodyParser.json({ limit: "5mb" }));

app.set("views", path.join(__dirname, "views"));
app.set("view engine", "jade");

app.use(logger("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "https://www.ordenscan.com/",
      "https://veta-wallet-cefaa50507d7.herokuapp.com/",
      "https://www.vetawallet.com/",
    ],
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "*");
  next();
});

// Raiz y salud. El servicio no tenia ninguna de las dos: la raiz caia en el
// manejador de 404 y devolvia una pagina de error, lo que hace imposible
// distinguir "el servidor esta caido" de "esa ruta no existe" desde fuera.
app.get("/", (req, res) => {
  res.status(200).json({ ok: true, service: "ogscan-backend" });
});

app.get("/health", async (req, res) => {
  // Reporta el estado de las dos dependencias de las que depende todo:
  // la base de datos indexada y el nodo de la cadena.
  const salud = { ok: true, mongo: "desconocido", rpc: "desconocido" };
  try {
    const mongoose = require("mongoose");
    salud.mongo = ["desconectado", "conectado", "conectando", "desconectando"][
      mongoose.connection.readyState
    ] || "desconocido";
  } catch (e) { salud.mongo = "error"; }
  try {
    const { Web3 } = require("web3");

    const w = new Web3(RPC_CADENA);
    const n = await w.eth.getBlockNumber();
    salud.rpc = "ok";
    salud.ultimoBloque = n.toString();
  } catch (e) { salud.rpc = "error"; salud.ok = false; }
  if (salud.mongo !== "conectado") salud.ok = false;
  res.status(salud.ok ? 200 : 503).json(salud);
});

app.use("/address", addressRouter);
app.use("/block", blockRouter);
app.use("/transaction", transactionRouter);

// catch 404 and forward to error handler
app.use(function (req, res, next) {
  next(createError(404));
});
if (typeof revisarNuevosBloques !== "function") {
  // Ruidoso a proposito: sin esto el fallo es invisible.
  console.error("[indexador] NO se pudo cargar revisarNuevosBloques:", typeof _modIndexador);
} else {
  console.log("[indexador] cargado; primera vuelta ya");
  revisarNuevosBloques();                       // sin esperar los 15s
  setInterval(revisarNuevosBloques, 15000);
}

// error handler
app.use(function (err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get("env") === "development" ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render("error");
});
const port = process.env.PORT || 4000;

app.listen(port, () => {
  console.log(`Servidor escuchando en el puerto ${port}`);
});
