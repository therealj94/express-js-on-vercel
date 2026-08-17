// Las colecciones de AuCorp.
//
// Tres piezas y una regla:
//
//   asientos  — el LIBRO. Append-only. Es la verdad.
//   saldos    — un ATAJO derivado de los asientos, con guarda de concurrencia.
//   usuarios  — quién es quién, atado al gid de Genesis ID.
//
// LA REGLA: si `saldos` y `asientos` alguna vez discrepan, gana `asientos` y
// el atajo se reconstruye. `saldos` existe por dos motivos concretos —no tener
// que sumar el libro entero para pintar una pantalla, y tener DÓNDE poner la
// guarda que impide que dos retiros simultáneos saquen el mismo dinero— y no
// porque el saldo sea un dato editable. Nadie escribe `saldos` a mano: la
// única puerta es lib/asientos.js, y `bin/reconciliar.mjs` compara los dos y
// grita si no calzan.
//
// Por qué aquí sí se puede derivar el saldo sumando en la base (y en el ledger
// de Ordenex no): un saldo fiat en unidades mínimas cabe de sobra en los 34
// dígitos de un Decimal128 —un billón de dólares son 10^14 céntimos— mientras
// que un saldo en wei puede tener 78 dígitos y la suma redondearía en silencio.

const mongoose = require('mongoose');

// ── usuarios ────────────────────────────────────────────────────────────────
// No se guarda contraseña: la identidad la pone Genesis ID y aquí solo queda
// el gid. Una contraseña que no existe no se puede filtrar.
const usuarioSchema = new mongoose.Schema({
  gid: { type: String, required: true, unique: true, index: true },
  correo: { type: String, default: '' },
  nombre: { type: String, default: '' },
  pais: { type: String, default: '' },
  // Lo que Genesis afirma HOY. Entrar se puede sin estar verificado —para ver
  // la casa y empezar el KYC—, pero mover dinero fiat no: eso lo pide la
  // norma, y fingir que no cambiaría el problema de sitio, no lo quitaría.
  verificada: { type: Boolean, default: false },
  // La dirección custodiada del mismo dueño en Veta Wallet. Es lo que ata la
  // billetera cripto con la cuenta fiat: mismo gid, los dos lados.
  direccionWallet: { type: String, default: null },
  // El interruptor de revocación: subirlo mata todas las sesiones vivas.
  tokenVersion: { type: Number, default: 0 },
  creado: { type: Date, default: Date.now },
});

// ── cuentas ─────────────────────────────────────────────────────────────────
// Una por (usuario, moneda). Se abre a pedido: nadie nace con veintiuna
// cuentas abiertas. `activa: false` congela la cuenta sin borrar su historia —
// borrar una cuenta con movimientos rompería el libro.
const cuentaFiatSchema = new mongoose.Schema({
  gid: { type: String, required: true, index: true },
  moneda: { type: String, required: true },
  alias: { type: String, default: '' },
  activa: { type: Boolean, default: true },
  creada: { type: Date, default: Date.now },
});
cuentaFiatSchema.index({ gid: 1, moneda: 1 }, { unique: true });

// ── asientos ────────────────────────────────────────────────────────────────
// APPEND-ONLY. Un asiento no se edita ni se borra: si estuvo mal, se corrige
// con OTRO asiento que lo revierte, y los dos quedan a la vista. Un libro con
// tachaduras no es un libro.
//
// `ref` es única y es el sello de idempotencia: si el navegador reintenta un
// depósito porque se le cayó la red, el segundo intento choca con el índice y
// no se duplica el dinero.
const lineaSchema = new mongoose.Schema({
  cuenta: { type: String, required: true },
  tipo: { type: String, required: true },
  moneda: { type: String, required: true },
  debe: { type: String, required: true, default: '0' },
  haber: { type: String, required: true, default: '0' },
}, { _id: false });

const asientoSchema = new mongoose.Schema({
  ref: { type: String, required: true, unique: true },
  glosa: { type: String, required: true },
  fecha: { type: Date, default: Date.now, index: true },
  lineas: { type: [lineaSchema], required: true },
  monedas: { type: [String], default: [] },
  // De dónde vino: 'deposito', 'retiro', 'transferencia', 'cambio', 'ajuste'.
  clase: { type: String, default: 'movimiento', index: true },
});
asientoSchema.index({ 'lineas.cuenta': 1, 'lineas.moneda': 1, fecha: -1 });

// ── saldos ──────────────────────────────────────────────────────────────────
// El atajo. `monto` es un string de unidades mínimas y es SU PROPIA VERSIÓN:
// la guarda del findOneAndUpdate exige que siga siendo exactamente el string
// que se leyó. Dos estados distintos no comparten string porque todo se
// escribe normalizado por BigInt, así que no hace falta un campo `version`
// aparte que alguien pueda olvidarse de subir. (Es la misma guarda que ya
// probó estar bien en el ledger de Ordenex.)
const saldoSchema = new mongoose.Schema({
  cuenta: { type: String, required: true },
  moneda: { type: String, required: true },
  tipo: { type: String, required: true },
  monto: { type: String, required: true, default: '0' },
  actualizado: { type: Date, default: Date.now },
});
saldoSchema.index({ cuenta: 1, moneda: 1 }, { unique: true });

const Usuario = mongoose.model('Usuario', usuarioSchema);
const CuentaFiat = mongoose.model('CuentaFiat', cuentaFiatSchema);
const Asiento = mongoose.model('Asiento', asientoSchema);
const Saldo = mongoose.model('Saldo', saldoSchema);

module.exports = { Usuario, CuentaFiat, Asiento, Saldo };
