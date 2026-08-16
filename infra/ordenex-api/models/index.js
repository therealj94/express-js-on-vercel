// Todos los esquemas de Ordenex, en un solo archivo y a proposito: el ledger,
// el motor y el circuito fiat se tocan entre si, y tener las colecciones una
// debajo de la otra es lo que deja VER que cuadran (que lo que reserva una
// solicitud existe en cuentas, que lo que anota un trato existe en ordenes).
//
// DOS REGLAS QUE NO SE NEGOCIAN
//
// 1. El dinero es SIEMPRE un string de wei. Number pierde enteros pasado
//    2^53 — y 2^53 wei son 0,009 ORIGEN: cualquier saldo real ya esta roto —
//    y BigInt no entra en Mongo. El string entra, sale, y se opera con BigInt
//    en memoria. Igual que en la wallet.
//
// 2. `userId` es un String, no un ObjectId. La cuenta interna `casa` (la que
//    recibe la comision) no es un Usuario y no tiene ObjectId; un esquema
//    estricto la dejaria fuera del ledger o la obligaria a existir como
//    usuario fantasma. Para los usuarios de verdad se guarda String(_id).

const mongoose = require('mongoose');
const { Schema } = mongoose;

// ── Usuario ─────────────────────────────────────────────────────────────────
// Nace del SSO de Genesis: sin contraseña, sin correo obligatorio. El `gid` es
// la identidad; `tokenVersion` es el interruptor de revocacion (subirlo mata
// todas las sesiones emitidas antes). La direccion de deposito es propia de
// Ordenex y su llave viaja SIEMPRE cifrada (AES-256 con ORDENEX_ADM,
// lib/cripto.js) — aqui solo se guarda el blob, jamas la llave en claro.
const usuarioSchema = new Schema(
  {
    gid: { type: String, required: true, unique: true },
    nombre: { type: String, default: '' },
    // La direccion custodiada del usuario en Veta Wallet (perfil.apps[] de
    // Genesis). Se guarda para poder enseñarla y para el tamiz, no para firmar.
    direccionWallet: { type: String, default: null },
    verificada: { type: Boolean, default: false },
    tokenVersion: { type: Number, default: 0 },
    esAgente: { type: Boolean, default: false },
    // La direccion de deposito que genera el vigia para este usuario.
    direccionDeposito: { type: String, default: null },
    llaveDepositoCifrada: { type: String, default: null },
  },
  { timestamps: true }
);

// ── Cuenta ──────────────────────────────────────────────────────────────────
// El ledger. `disponible` es lo que se puede gastar; `reservado` es lo que una
// orden abierta o una solicitud fiat tiene en garantia. Toda mutacion pasa por
// lib/ledger.js con guardas atomicas — nunca se escribe a mano.
const cuentaSchema = new Schema(
  {
    userId: { type: String, required: true },
    activo: { type: String, required: true },
    disponible: { type: String, required: true, default: '0' },
    reservado: { type: String, required: true, default: '0' },
  },
  { timestamps: true }
);
// Una cuenta por usuario y activo: el indice compuesto unico es lo que impide
// que una carrera cree dos documentos y el saldo se parta en dos.
cuentaSchema.index({ userId: 1, activo: 1 }, { unique: true });

// ── Asiento ─────────────────────────────────────────────────────────────────
// El rastro de cada mutacion del ledger. `ref` agrupa las patas de una misma
// operacion (un trato deja varias); la prueba de doble entrada es que la suma
// de montos por activo da cero.
const asientoSchema = new Schema(
  {
    ref: { type: String, required: true, index: true },
    tipo: { type: String, required: true },
    userId: { type: String, required: true },
    activo: { type: String, required: true },
    monto: { type: String, required: true },
    contraparte: { type: String, default: null },
    saldoDespues: { type: String, required: true },
    en: { type: Date, default: Date.now },
  },
  { timestamps: true }
);
// GET /movimientos lee "lo mio, lo mas nuevo primero": este indice es esa consulta.
asientoSchema.index({ userId: 1, en: -1 });

// ── Orden ───────────────────────────────────────────────────────────────────
// `precio` en wei de ORIGEN por unidad ENTERA del activo; `cantidad` y `resta`
// en wei del activo. `precio` va en null cuando la orden es de mercado — una
// orden de mercado no tiene precio, y ponerle uno inventado seria mentirle al
// libro. `estado` queda como String libre: los estados los gobierna el motor y
// clavarlos aqui con un enum obligaria a tocar dos archivos por cada cambio.
const ordenSchema = new Schema(
  {
    userId: { type: String, required: true, index: true },
    mercado: { type: String, required: true },
    lado: { type: String, enum: ['compra', 'venta'], required: true },
    tipo: { type: String, enum: ['limite', 'mercado'], required: true },
    precio: { type: String, default: null },
    cantidad: { type: String, required: true },
    resta: { type: String, required: true },
    estado: { type: String, required: true, default: 'abierta' },
    ordenKey: { type: String, default: null },
    en: { type: Date, default: Date.now },
  },
  { timestamps: true }
);
// La consulta del motor y de GET /ordenes?estado=abierta: por mercado y estado.
ordenSchema.index({ mercado: 1, estado: 1 });
// Idempotencia: un reintento del cliente con la misma ordenKey no puede colocar
// la orden dos veces. Parcial y no sparse: en un indice compuesto, sparse
// incluye el documento con que UN campo exista, y userId existe siempre — dos
// ordenes sin ordenKey del mismo usuario chocarian entre si.
ordenSchema.index(
  { userId: 1, ordenKey: 1 },
  { unique: true, partialFilterExpression: { ordenKey: { $type: 'string' } } }
);

// ── Trato ───────────────────────────────────────────────────────────────────
// Un calce consumado. `lado` es el de la orden agresora (la que llego y barrio):
// es lo que pinta el tape de compra/venta. De los tratos —y SOLO de ellos—
// salen las velas: principio 2 del contrato.
const tratoSchema = new Schema(
  {
    mercado: { type: String, required: true },
    precio: { type: String, required: true },
    cantidad: { type: String, required: true },
    lado: { type: String, enum: ['compra', 'venta'], required: true },
    compradorId: { type: String, required: true },
    vendedorId: { type: String, required: true },
    ordenCompra: { type: String, default: null },
    ordenVenta: { type: String, default: null },
    en: { type: Date, default: Date.now },
  },
  { timestamps: true }
);
// GET /mercados/:par/tratos — los ultimos 50 de un mercado.
tratoSchema.index({ mercado: 1, en: -1 });

// ── Vela ────────────────────────────────────────────────────────────────────
// OHLC + volumen, agregada del flujo de tratos al confirmar cada calce.
// `t0` es el arranque del marco en epoch ms. El indice unico es el que permite
// al agregador hacer upsert sin miedo a duplicar una vela.
const velaSchema = new Schema(
  {
    mercado: { type: String, required: true },
    marco: { type: String, enum: ['1m', '15m', '1h', '1d'], required: true },
    t0: { type: Number, required: true },
    o: { type: String, required: true },
    h: { type: String, required: true },
    l: { type: String, required: true },
    c: { type: String, required: true },
    v: { type: String, required: true, default: '0' },
  },
  { timestamps: true }
);
velaSchema.index({ mercado: 1, marco: 1, t0: 1 }, { unique: true });

// ── VelaRef ─────────────────────────────────────────────────────────────────
// La OTRA clase de vela, y por eso vive en OTRA coleccion: la referencia del
// metal de verdad (oro y plata) traida de CoinGecko por lib/referenciaVelas.js.
// No se mezcla con `velas` ni por asomo — aquella son tratos reales de Ordenex
// en ORIGEN, esta es el cartel de "la onza va a tanto" en dolares. Confundirlas
// seria decirle al usuario que aqui se opero a un precio al que nadie opero.
// Por eso: coleccion aparte, marcos propios ('30m'|'4h'|'4d', los que devuelve
// el proveedor segun el rango) y ruta propia y rotulada.
//
// POR QUE AQUI SI VA Number Y EN EL LEDGER JAMAS. La regla 1 de arriba manda
// sobre el DINERO: saldos, precios de ordenes, cantidades de tratos — todo lo
// que alguien puede reclamar como suyo va en string de wei, porque un centavo
// perdido al redondear es un centavo robado. Esto no es dinero de nadie: es un
// precio informativo en dolares, con tres o cuatro cifras significativas, que
// solo sirve para dibujar una linea en una pantalla. Nadie va a cobrar 4374,21
// ni le van a deber 0,000001 de diferencia. Un cartel informativo no es un
// saldo, y darle 18 decimales de precision fingida seria fingir tambien que es
// exacto. Si algun dia un numero de esta coleccion tocara un camino de dinero,
// el error no seria el tipo: seria haberlo metido ahi.
const velaRefSchema = new Schema(
  {
    activo: { type: String, required: true },
    marco: { type: String, enum: ['30m', '4h', '4d'], required: true },
    t0: { type: Number, required: true },
    o: { type: Number, required: true },
    h: { type: Number, required: true },
    l: { type: Number, required: true },
    c: { type: Number, required: true },
  },
  { timestamps: true }
);
// Unico igual que en `velas`, y por el mismo motivo: cada refresco vuelve a
// traer la vela en curso con su maximo y su cierre ya movidos, y tiene que
// pisar a la anterior en vez de duplicarla.
velaRefSchema.index({ activo: 1, marco: 1, t0: 1 }, { unique: true });

// ── PrecioDeclarado ─────────────────────────────────────────────────────────
// La TERCERA clase de precio, y la unica que no sale de un mercado: el valor
// que la Junta Directiva le fija por resolucion a un instrumento que todavia
// no cotiza. ONDK es el caso: es un valor negociable, su Licencia de Compañia
// de Inversion no esta emitida y no hay libro donde se forme un precio solo.
//
// Cada fila ES un acta. Por eso `acta` y `firmante` son obligatorios y no
// tienen valor por defecto: un precio sin acta no es un precio declarado, es
// un numero que alguien escribio: exactamente lo que esta coleccion existe
// para hacer imposible. Sin los cuatro campos la fila no entra, y sin fila la
// pantalla enseña un guion.
//
// Es de SOLO AÑADIR. Un precio declarado no se corrige editandolo: la Junta
// declara otro con fecha posterior y el historial guarda los dos, igual que
// un libro de actas. Lo unico que se borra es una fila mal tecleada, por su
// _id y desde el panel, antes de que nadie la haya leido.
const precioDeclaradoSchema = new Schema(
  {
    token: { type: String, required: true, uppercase: true, trim: true },
    // Vigente DESDE. Una resolucion puede firmarse hoy con efecto a fin de
    // mes; lo que manda para el precio de hoy es esta fecha, no createdAt.
    fecha: { type: Date, required: true },
    // Number y no string de wei a proposito: esto no es un saldo que se opera,
    // es una cifra publicada con dos decimales. No entra en el ledger jamas.
    precio: { type: Number, required: true, min: 0 },
    moneda: { type: String, enum: ['USD'], default: 'USD' },
    acta: { type: String, required: true, trim: true },
    firmante: { type: String, required: true, trim: true },
    nota: { type: String, default: null },
  },
  { timestamps: true }
);
// Un solo precio por token y fecha: si la misma resolucion se carga dos veces
// —dos clics, un reintento de red— la segunda choca contra el indice en vez de
// dibujar un escalon fantasma en la grafica.
precioDeclaradoSchema.index({ token: 1, fecha: 1 }, { unique: true });

// ── Deposito ────────────────────────────────────────────────────────────────
// Lo que el vigia vio caer en la direccion de deposito de un usuario y ya
// acredito en el ledger. Es la memoria del vigia: el ultimo saldo visto se
// reconstruye de aqui, y por eso un deposito jamas se borra.
const depositoSchema = new Schema(
  {
    userId: { type: String, required: true, index: true },
    activo: { type: String, required: true },
    cantidad: { type: String, required: true },
    direccion: { type: String, default: null },
    bloque: { type: Number, default: null },
    en: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// ── Retiro ──────────────────────────────────────────────────────────────────
// El orden del circuito (tamiz → debitar → firmar → anotar → AML) vive en el
// controller; aqui queda el registro. `retiroKey` la manda el cliente y es
// unica: un reintento por timeout no puede firmar dos veces. Si la firma
// fallo, `fallo` cuenta por que y el ledger ya se reacredito.
const retiroSchema = new Schema(
  {
    userId: { type: String, required: true, index: true },
    activo: { type: String, required: true },
    cantidad: { type: String, required: true },
    direccion: { type: String, required: true },
    retiroKey: { type: String, required: true, unique: true },
    hash: { type: String, default: null },
    estado: { type: String, required: true, default: 'pendiente' },
    fallo: { type: String, default: null },
    en: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// ── Agente ──────────────────────────────────────────────────────────────────
// La punta humana del circuito fiat. El alta es de admin, no un formulario:
// un agente maneja dinero de la gente y a la casa le toca saber quien es.
// Los numeros de cuenta bancaria NUNCA salen por GET /fiat/agentes — solo se
// enseñan al usuario con solicitud abierta contra ese agente.
const agenteSchema = new Schema(
  {
    gid: { type: String, required: true, unique: true },
    userId: { type: String, required: true },
    nombre: { type: String, required: true },
    bancos: [
      {
        _id: false,
        banco: { type: String, required: true },
        cuenta: { type: String, required: true },
        titular: { type: String, required: true },
      },
    ],
    monedas: [{ type: String, enum: ['HNL', 'USD'] }],
    activo: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// ── Solicitud ───────────────────────────────────────────────────────────────
// Una operacion fiat entre usuario y agente, con el ORIGEN en garantia en el
// ledger. Los estados son los del contrato y aqui SI van en enum: son la
// maquina de estados del dinero de dos personas y un estado inventado por un
// bug no debe poder guardarse. Todo cambio de estado deja fila en `historia`
// con quien y cuando — es lo que arbitra el admin en una disputa.
const solicitudSchema = new Schema(
  {
    tipo: { type: String, enum: ['entrada', 'salida'], required: true },
    userId: { type: String, required: true, index: true },
    agenteId: { type: String, required: true, index: true },
    activo: { type: String, required: true, default: 'ORIGEN' },
    cantidad: { type: String, required: true },
    moneda: { type: String, enum: ['HNL', 'USD'], required: true },
    montoFiat: { type: String, required: true },
    banco: { type: String, default: null },
    referencia: { type: String, default: null },
    estado: {
      type: String,
      enum: ['abierta', 'tomada', 'fiat-avisado', 'liquidada', 'cancelada', 'disputa'],
      required: true,
      default: 'abierta',
    },
    // Cada fila es la transicion COMPLETA: de que estado a cual, quien la hizo
    // (`usuario:<id>`, `agente:<id>`, `admin:<fallo>` o `casa` cuando es un
    // reverso automatico) y la nota si la hubo (el motivo de una disputa, el
    // porque de un reverso). `de` va en null en la fila del nacimiento. Solo
    // `quien` es obligatorio: una fila coja se prefiere a un arbitraje que no
    // se pudo guardar.
    historia: [
      {
        _id: false,
        de: { type: String, default: null },
        a: { type: String, default: null },
        quien: { type: String, required: true },
        en: { type: Date, default: Date.now },
        nota: { type: String, default: null },
      },
    ],
  },
  { timestamps: true }
);

// Los nombres de coleccion van explicitos: el pluralizador de Mongoose es
// ingles y a 'Orden' le pondria 'ordens'. Las colecciones de esta casa se
// llaman en español.
module.exports = {
  Usuario: mongoose.model('Usuario', usuarioSchema, 'usuarios'),
  Cuenta: mongoose.model('Cuenta', cuentaSchema, 'cuentas'),
  Asiento: mongoose.model('Asiento', asientoSchema, 'asientos'),
  Orden: mongoose.model('Orden', ordenSchema, 'ordenes'),
  Trato: mongoose.model('Trato', tratoSchema, 'tratos'),
  Vela: mongoose.model('Vela', velaSchema, 'velas'),
  VelaRef: mongoose.model('VelaRef', velaRefSchema, 'velasRef'),
  PrecioDeclarado: mongoose.model('PrecioDeclarado', precioDeclaradoSchema, 'preciosDeclarados'),
  Deposito: mongoose.model('Deposito', depositoSchema, 'depositos'),
  Retiro: mongoose.model('Retiro', retiroSchema, 'retiros'),
  Agente: mongoose.model('Agente', agenteSchema, 'agentes'),
  Solicitud: mongoose.model('Solicitud', solicitudSchema, 'solicitudes'),
};
