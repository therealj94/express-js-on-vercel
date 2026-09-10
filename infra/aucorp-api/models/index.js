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
  // Hasta dónde puede mover (ver lib/tarifas.js). Arranca en 1 —el más
  // apretado— y se sube a mano cuando hay expediente. Un nivel que arranca
  // alto es una cuenta nueva por la que puede pasar cualquier cosa el primer
  // día, que es justo lo que la norma quiere evitar.
  nivel: { type: Number, default: 1 },
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

// ── corresponsales ──────────────────────────────────────────────────────────
// A DÓNDE manda el dinero quien quiere depositar: la cuenta real de AuCorp en
// cada plaza. Una por moneda.
//
// Estos datos NO viven en el código ni en el repositorio: los carga operaciones
// contra la base. Un número de cuenta bancaria en un commit es un número de
// cuenta bancaria publicado — y a diferencia de una clave, ese no se puede
// rotar sin abrir otra cuenta en otro banco.
const corresponsalSchema = new mongoose.Schema({
  moneda: { type: String, required: true, unique: true },
  banco: { type: String, required: true },
  titular: { type: String, required: true },
  numero: { type: String, required: true },
  swift: { type: String, default: '' },
  ruta: { type: String, default: '' },        // ABA / CLABE / IBAN, según plaza
  instrucciones: { type: String, default: '' },
  activa: { type: Boolean, default: true },
  actualizada: { type: Date, default: Date.now },
});

// ── beneficiarios ───────────────────────────────────────────────────────────
// A quién manda dinero un cliente, guardado para no volver a teclearlo. Es lo
// que convierte una transferencia en algo de dos toques en vez de un formulario
// donde un dígito mal escrito manda el dinero a otra persona.
const beneficiarioSchema = new mongoose.Schema({
  gid: { type: String, required: true, index: true },
  alias: { type: String, required: true },
  tipo: { type: String, required: true },     // 'interno' | 'bancario'
  moneda: { type: String, required: true },
  // interno
  gidDestino: { type: String, default: '' },
  // bancario
  banco: { type: String, default: '' },
  titular: { type: String, default: '' },
  numero: { type: String, default: '' },
  swift: { type: String, default: '' },
  pais: { type: String, default: '' },
  creado: { type: Date, default: Date.now },
});
beneficiarioSchema.index({ gid: 1, alias: 1 }, { unique: true });

// ── solicitudes ─────────────────────────────────────────────────────────────
// Un retiro no lo ejecuta el usuario: lo PIDE. Entre el pedido y la salida del
// dinero hay una persona de operaciones que confirma contra el banco.
//
// Mientras tanto el dinero NO se queda en la cuenta del cliente disponible para
// gastarlo otra vez: en cuanto se pide, un asiento lo mueve a `retiros.en.proceso`
// —que sigue siendo un pasivo, la casa se lo sigue debiendo— y ahí espera. Si
// se rechaza, otro asiento se lo devuelve. Sin ese paso, alguien podría pedir
// tres retiros de todo su saldo y que los tres pasaran.
//
// Un DEPÓSITO también puede ser una solicitud: el cliente AVISA que mandó el
// dinero («transferí 500 USD con la referencia tal») y esa solicitud queda
// `avisada` hasta que operaciones la encuentra en el extracto del banco y la
// acredita por /tesoreria/deposito. El aviso NO mueve un céntimo: sólo le da
// al cliente un lugar donde ver en qué está su depósito, y al barrido una
// forma de detectar el que lleva días sin que nadie lo mire.
//
// Estados por tipo:
//   retiro    → pendiente | ejecutando | ejecutada | rechazando | rechazada
//   deposito  → avisada | acreditada | rechazada
//
// `actualizada` es la fecha del último cambio de estado. Es lo que mira el
// barrido de atascadas (lib/barrido.js): una solicitud cuya `actualizada` está
// a más de N horas es una solicitud que nadie está atendiendo.
const solicitudSchema = new mongoose.Schema({
  gid: { type: String, required: true, index: true },
  tipo: { type: String, required: true },     // 'retiro' | 'deposito'
  moneda: { type: String, required: true },
  monto: { type: String, required: true },    // lo que se le descontó, con comisión dentro
  neto: { type: String, required: true },     // lo que va a recibir de verdad
  comision: { type: String, default: '0' },
  beneficiario: { type: Object, default: null },   // copia CONGELADA, ver abajo
  estado: { type: String, default: 'pendiente', index: true },
  ref: { type: String, required: true, unique: true },
  nota: { type: String, default: '' },        // lo que escribe operaciones al resolver
  comprobante: { type: String, default: '' },
  // Sólo depósitos: la referencia bancaria que el cliente dice haber usado.
  referenciaBancaria: { type: String, default: '' },
  creada: { type: Date, default: Date.now },
  actualizada: { type: Date, default: Date.now, index: true },
  resuelta: { type: Date, default: null },
});

// ── alertas de sanciones ────────────────────────────────────────────────────
// Cuando un beneficiario o un retiro choca FUERTE con la lista de sanciones,
// la operación no sale y aquí queda el motivo, con todas sus coincidencias,
// para que una persona de cumplimiento lo mire. El usuario nunca ve esto:
// avisarle contra qué chocó es justo lo prohibido.
const alertaSancionSchema = new mongoose.Schema({
  gid: { type: String, required: true, index: true },
  contexto: { type: String, required: true },      // 'beneficiario' | 'retiro'
  nombre: { type: String, required: true },        // lo que se tamizó
  detalle: { type: Object, default: null },        // las coincidencias, tal cual
  estado: { type: String, default: 'abierta', index: true },   // abierta | resuelta
  nota: { type: String, default: '' },
  creada: { type: Date, default: Date.now },
  resuelta: { type: Date, default: null },
});

const Usuario = mongoose.model('Usuario', usuarioSchema);
const Corresponsal = mongoose.model('Corresponsal', corresponsalSchema);
const Beneficiario = mongoose.model('Beneficiario', beneficiarioSchema);
const Solicitud = mongoose.model('Solicitud', solicitudSchema);
const AlertaSancion = mongoose.model('AlertaSancion', alertaSancionSchema);
const CuentaFiat = mongoose.model('CuentaFiat', cuentaFiatSchema);
const Asiento = mongoose.model('Asiento', asientoSchema);
const Saldo = mongoose.model('Saldo', saldoSchema);

module.exports = { Usuario, CuentaFiat, Asiento, Saldo, Corresponsal, Beneficiario, Solicitud, AlertaSancion };
