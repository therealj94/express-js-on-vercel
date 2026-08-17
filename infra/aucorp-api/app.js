// aucorp-api — las cuentas en moneda local del ecosistema.
//
// Este archivo es solo el andamio: CORS, JSON, Mongo, las rutas, /salud y el
// manejo de errores. El dinero vive en lib/ (monedas, libro, asientos, cambio)
// y en los controllers; aquí no se mueve un céntimo.
//
// AuCorp es una FinTech bajo Regulación A de Próspera, NO un banco con
// licencia: no hay seguro de depósitos ni ventanilla de último recurso. Por
// eso en toda la casa se dice «cuenta en moneda local». Está escrito aquí
// arriba a propósito, donde lo lee cualquiera que abra el proyecto.
//
// El principio del arranque, como en Ordenex: el API se levanta AUNQUE Mongo o
// la fuente de tasas no contesten. Un servicio de cuentas caído porque el
// proveedor de tasas tardó no protege a nadie; lo que sí se hace es que /salud
// lo cante y que cada operación con dinero falle sola y cerrada.

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();

// ── CORS ────────────────────────────────────────────────────────────────────
// La lista viene de CORS_ORIGENES, no del código. Sin la variable no se
// permite ningún origen de navegador —fail-closed también aquí— y se avisa.
const ORIGENES = (process.env.CORS_ORIGENES || '').split(',').map((s) => s.trim()).filter(Boolean);
if (ORIGENES.length === 0) {
  console.error('[cors] CORS_ORIGENES no está puesta: ningún navegador va a poder llamar al API');
}
app.use(cors({
  origin: ORIGENES,
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.set('trust proxy', 1);
// 100kb alcanzan de sobra: la petición más gorda de esta casa es una
// transferencia con cinco campos.
app.use(express.json({ limit: '100kb' }));

// ── Mongo ───────────────────────────────────────────────────────────────────
// La base se llama `aucorp` y se fija aquí, no en la URI: así el mismo clúster
// puede prestar la URI sin que un descuido escriba en la base de otra app.
(async () => {
  try {
    mongoose.set('strictQuery', true);
    await mongoose.connect(process.env.MONGODB_URI, { dbName: 'aucorp' });
    console.log(`[mongo] conectado a ${mongoose.connection.name}`);
  } catch (e) {
    console.error(`[mongo] no se pudo conectar: ${e.message}`);
  }
})();

// ── Rutas ───────────────────────────────────────────────────────────────────
app.use('/auth', require('./routes/auth'));
app.use('/', require('./routes/cuentas'));
app.use('/', require('./routes/movimientos'));
app.use('/', require('./routes/beneficiarios'));
app.use('/', require('./routes/solicitudes'));
app.use('/tesoreria', require('./routes/tesoreria'));

// ── /salud ──────────────────────────────────────────────────────────────────
// Dice la verdad sobre cada pieza por separado. Un /salud que devuelve 200
// pase lo que pase es un /salud que no sirve para nada.
app.get('/salud', async (req, res) => {
  const mongo = mongoose.connection.readyState === 1;
  let tasas = false;
  let tasasCuando = null;
  try {
    const t = await require('./lib/cambio').tasas();
    tasas = !!t;
    tasasCuando = t?.cuando ? t.cuando.toISOString() : null;
  } catch { /* ya se dijo en el log de cambio.js */ }

  const bien = mongo;   // sin Mongo no hay cuentas; sin tasas solo no hay cambio
  res.status(bien ? 200 : 503).json({
    ok: bien,
    mongo,
    tasas,
    tasasCuando,
    genesis: !!(process.env.GENESIS_API_KEY || '').trim(),
    sesiones: !!(process.env.AUCORP_TOKEN || '').trim(),
    // Lo que esta casa ES, dicho por el propio servicio.
    naturaleza: 'FinTech bajo Regulación A de Próspera. No es un banco con licencia bancaria: no hay seguro de depósitos.',
  });
});

app.use((req, res) => res.status(404).json({ error: 'No existe esa ruta.', codigo: 'NO_EXISTE' }));

// El manejador de errores no filtra el mensaje interno al cliente: un stack
// trace en la respuesta le dice a quien sondea exactamente por dónde seguir.
app.use((err, req, res, next) => {   // eslint-disable-line no-unused-vars
  console.error(`[error] ${req.method} ${req.path}: ${err.message}`);
  res.status(500).json({ error: 'Algo salió mal.', codigo: 'ERROR' });
});

const PUERTO = process.env.PORT || 3000;
// El servidor se guarda y se exporta: la prueba de punta a punta necesita
// saber en qué puerto quedó cuando se le pide PORT=0, y adivinarlo hurgando en
// los handles del proceso es la clase de truco que se rompe solo.
const servidor = app.listen(PUERTO, () => console.log(`[aucorp-api] escuchando en ${servidor.address().port}`));

module.exports = app;
module.exports.servidor = servidor;
