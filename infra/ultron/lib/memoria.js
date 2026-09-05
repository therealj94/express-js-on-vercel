// LA MEMORIA: lo que ULTRON recuerda de una vez a la otra.
//
// ── TRES COSAS DISTINTAS, TRES COLECCIONES ──────────────────────────────────
//
//   Memoria      un hecho que alguien de la junta le dijo, o que él decidió
//                que valía la pena guardar: «la reunión es los martes», «José
//                prefiere los números en lempiras». Corto, con fecha y con
//                quién lo dijo. Es lo que hace que la tercera conversación no
//                empiece de cero.
//   Conversacion los turnos de un hilo, para poder retomarlo y para poder
//                releer qué se decidió.
//   Documento    lo que ULTRON escribió: un memo, un borrador de acta, un
//                análisis. Se guarda entero y se baja desde el panel.
//
// ── QUÉ ES DE QUIÉN ─────────────────────────────────────────────────────────
//
// Una memoria puede ser de UN miembro («José prefiere…») o de TODA la junta
// («se aprobó abrir Ordenex el 15»). El campo `alcance` lo dice, y al armar el
// contexto cada miembro recibe las suyas y las de todos, nunca las de otro.
// Una junta es un grupo de personas, no una sola cuenta.
//
// ── SIN MONGO ───────────────────────────────────────────────────────────────
//
// Si MONGODB_URI no está o no contesta, todo esto funciona EN MEMORIA y lo
// dice al arrancar: ULTRON conversa igual, pero olvida al reiniciar. Es mejor
// que no arrancar — y el panel enseña «memoria: provisional» para que nadie
// se crea que está guardando lo que no guarda.

const mongoose = require('mongoose');

const { Schema } = mongoose;

const memoriaSchema = new Schema({
  texto: { type: String, required: true, maxlength: 600 },
  alcance: { type: String, enum: ['miembro', 'junta'], default: 'miembro', index: true },
  miembro: { type: String, index: true },       // correo del miembro; vacío si alcance=junta
  dichoPor: { type: String },                   // quién lo dijo o pidió
  tema: { type: String, maxlength: 60 },
  origen: { type: String, enum: ['pedido', 'deducido'], default: 'pedido' },
  vigente: { type: Boolean, default: true, index: true },
}, { timestamps: { createdAt: 'en', updatedAt: 'tocado' } });

const turnoSchema = new Schema({
  rol: { type: String, enum: ['miembro', 'ultron'], required: true },
  texto: { type: String, required: true },
  herramientas: [{ nombre: String, entrada: Schema.Types.Mixed, salida: Schema.Types.Mixed }],
  fuentes: [{ id: String, titulo: String, fuente: String }],
  en: { type: Date, default: Date.now },
}, { _id: false });

const conversacionSchema = new Schema({
  miembro: { type: String, required: true, index: true },
  titulo: { type: String, maxlength: 120 },
  canal: { type: String, enum: ['panel', 'whatsapp', 'correo'], default: 'panel' },
  turnos: [turnoSchema],
}, { timestamps: { createdAt: 'en', updatedAt: 'tocado' } });

const documentoSchema = new Schema({
  titulo: { type: String, required: true, maxlength: 160 },
  tipo: { type: String, enum: ['memo', 'acta', 'analisis', 'carta', 'plan', 'otro'], default: 'otro' },
  markdown: { type: String, required: true },
  miembro: { type: String, index: true },       // quién lo pidió
  conversacion: { type: Schema.Types.ObjectId },
  para: { type: String, enum: ['junta', 'fuera'], default: 'junta' },
}, { timestamps: { createdAt: 'en', updatedAt: 'tocado' } });

/* LOS PENDIENTES. Una memoria dice cómo son las cosas; un pendiente dice qué
   falta hacer y se puede cerrar. Mezclarlos en la misma lista fue lo primero
   que se hizo, y la lista se volvió ilegible en diez líneas: lo que hay que
   hacer se perdía entre lo que hay que saber. */
const pendienteSchema = new Schema({
  texto: { type: String, required: true, maxlength: 400 },
  estado: { type: String, enum: ['abierto', 'hecho'], default: 'abierto', index: true },
  quien: { type: String, maxlength: 80 },        // a quién le toca; vacío = a la junta
  tema: { type: String, maxlength: 60 },
  creadoPor: { type: String },                   // correo de quien lo anotó
  cerradoPor: { type: String },
  cerradoEn: { type: Date },
}, { timestamps: { createdAt: 'en', updatedAt: 'tocado' } });

/* EL GASTO. Cada turno cuesta fichas, y las fichas cuestan dinero. El 5-sep la
   cuenta se quedó sin saldo y nadie lo supo hasta que ULTRON dejó de contestar:
   el gasto era invisible, así que no se podía ni prever ni discutir. Se anota
   por turno, con el modelo que lo cobró. */
const gastoSchema = new Schema({
  miembro: { type: String, index: true },
  modelo: { type: String },
  entrada: { type: Number, default: 0 },
  salida: { type: Number, default: 0 },
  lecturaCache: { type: Number, default: 0 },
  escrituraCache: { type: Number, default: 0 },
  dolares: { type: Number, default: null },      // null = no hay precio para ese modelo
  canal: { type: String, default: 'panel' },
}, { timestamps: { createdAt: 'en', updatedAt: 'tocado' } });

const Memoria = mongoose.models.Memoria || mongoose.model('Memoria', memoriaSchema);
const Pendiente = mongoose.models.Pendiente || mongoose.model('Pendiente', pendienteSchema);
const Gasto = mongoose.models.Gasto || mongoose.model('Gasto', gastoSchema);
const Conversacion = mongoose.models.Conversacion || mongoose.model('Conversacion', conversacionSchema);
const Documento = mongoose.models.Documento || mongoose.model('Documento', documentoSchema);

// ── El respaldo en memoria, para cuando no hay Mongo ────────────────────────
const provisional = { memorias: [], conversaciones: new Map(), documentos: [], pendientes: [], gastos: [] };
let conMongo = false;
const idNuevo = () => new mongoose.Types.ObjectId().toString();

async function conectar(uri = process.env.MONGODB_URI) {
  if (!uri) { console.warn('[memoria] sin MONGODB_URI: memoria PROVISIONAL, se olvida al reiniciar'); return false; }
  try {
    await mongoose.connect(uri, { dbName: process.env.ULTRON_DB || 'ultron', serverSelectionTimeoutMS: 8000 });
    conMongo = true;
    console.log(`[memoria] conectado a ${mongoose.connection.name}`);
    return true;
  } catch (e) {
    console.error(`[memoria] Mongo no contestó (${e.message}): memoria PROVISIONAL`);
    return false;
  }
}
function estado() { return conMongo ? 'mongo' : 'provisional'; }

// ── Memorias ────────────────────────────────────────────────────────────────

async function recordar({ texto, alcance = 'miembro', miembro, dichoPor, tema, origen = 'pedido' }) {
  const t = String(texto || '').trim().slice(0, 600);
  if (!t) return null;
  const doc = { texto: t, alcance, miembro: alcance === 'junta' ? null : miembro, dichoPor, tema, origen, vigente: true };
  if (conMongo) return (await Memoria.create(doc)).toObject();
  const m = { _id: idNuevo(), ...doc, en: new Date() };
  provisional.memorias.push(m);
  return m;
}

async function olvidar(id, miembro) {
  if (conMongo) {
    // Solo se puede olvidar lo propio o lo de la junta; nunca lo de otro miembro.
    const r = await Memoria.updateOne({ _id: id, $or: [{ miembro }, { alcance: 'junta' }] }, { vigente: false });
    return r.modifiedCount > 0;
  }
  const m = provisional.memorias.find((x) => x._id === id && (x.miembro === miembro || x.alcance === 'junta'));
  if (m) m.vigente = false;
  return !!m;
}

/** Las que le tocan a un miembro: las suyas y las de toda la junta. */
async function memoriasDe(miembro, { limite = 80 } = {}) {
  if (conMongo) {
    return Memoria.find({ vigente: true, $or: [{ miembro }, { alcance: 'junta' }] })
      .sort({ en: -1 }).limit(limite).lean();
  }
  return provisional.memorias
    .filter((m) => m.vigente && (m.miembro === miembro || m.alcance === 'junta'))
    .sort((a, b) => b.en - a.en).slice(0, limite);
}

// ── Conversaciones ──────────────────────────────────────────────────────────

async function abrirConversacion(miembro, { canal = 'panel', titulo } = {}) {
  if (conMongo) return (await Conversacion.create({ miembro, canal, titulo, turnos: [] })).toObject();
  const c = { _id: idNuevo(), miembro, canal, titulo, turnos: [], en: new Date(), tocado: new Date() };
  provisional.conversaciones.set(c._id, c);
  return c;
}

async function conversacion(id, miembro) {
  if (conMongo) return Conversacion.findOne({ _id: id, miembro }).lean();
  const c = provisional.conversaciones.get(String(id));
  return c && c.miembro === miembro ? c : null;
}

async function conversacionesDe(miembro, { limite = 30 } = {}) {
  if (conMongo) {
    return Conversacion.find({ miembro }).sort({ tocado: -1 }).limit(limite)
      .select('titulo canal en tocado turnos').lean()
      .then((l) => l.map((c) => ({ _id: c._id, titulo: c.titulo, canal: c.canal, en: c.en, tocado: c.tocado, turnos: c.turnos.length })));
  }
  return [...provisional.conversaciones.values()].filter((c) => c.miembro === miembro)
    .sort((a, b) => b.tocado - a.tocado).slice(0, limite)
    .map((c) => ({ _id: c._id, titulo: c.titulo, canal: c.canal, en: c.en, tocado: c.tocado, turnos: c.turnos.length }));
}

async function anotarTurno(id, miembro, turno) {
  const t = { ...turno, en: new Date() };
  if (conMongo) {
    const r = await Conversacion.updateOne({ _id: id, miembro }, { $push: { turnos: t }, $set: { tocado: new Date() } });
    return r.modifiedCount > 0;
  }
  const c = provisional.conversaciones.get(String(id));
  if (!c || c.miembro !== miembro) return false;
  c.turnos.push(t); c.tocado = new Date();
  return true;
}

async function titular(id, miembro, titulo) {
  if (conMongo) return Conversacion.updateOne({ _id: id, miembro, titulo: { $in: [null, ''] } }, { titulo: String(titulo).slice(0, 120) });
  const c = provisional.conversaciones.get(String(id));
  if (c && c.miembro === miembro && !c.titulo) c.titulo = String(titulo).slice(0, 120);
}

// ── Documentos ──────────────────────────────────────────────────────────────

async function guardarDocumento({ titulo, tipo = 'otro', markdown, miembro, conversacion: conv, para = 'junta' }) {
  const d = { titulo: String(titulo).slice(0, 160), tipo, markdown: String(markdown), miembro, conversacion: conv || null, para };
  if (conMongo) return (await Documento.create(d)).toObject();
  const doc = { _id: idNuevo(), ...d, en: new Date() };
  provisional.documentos.unshift(doc);
  return doc;
}

async function documentos({ limite = 40 } = {}) {
  // Los documentos son de la junta: los ve cualquier miembro.
  if (conMongo) return Documento.find({}).sort({ en: -1 }).limit(limite).select('titulo tipo miembro para en').lean();
  return provisional.documentos.slice(0, limite).map(({ markdown, ...d }) => d);
}

async function documento(id) {
  if (conMongo) return Documento.findById(id).lean();
  return provisional.documentos.find((d) => d._id === String(id)) || null;
}

// ── Pendientes ──────────────────────────────────────────────────────────────

async function anotarPendiente({ texto, quien, tema, creadoPor }) {
  const t = String(texto || '').trim().slice(0, 400);
  if (!t) return null;
  const doc = { texto: t, estado: 'abierto', quien: quien ? String(quien).slice(0, 80) : null,
    tema: tema ? String(tema).slice(0, 60) : null, creadoPor: creadoPor || null };
  if (conMongo) return (await Pendiente.create(doc)).toObject();
  const p = { _id: idNuevo(), ...doc, en: new Date() };
  provisional.pendientes.unshift(p);
  return p;
}

/** Los abiertos primero y por fecha; los hechos solo si se piden. */
async function pendientes({ conHechos = false, limite = 60 } = {}) {
  if (conMongo) {
    const q = conHechos ? {} : { estado: 'abierto' };
    return Pendiente.find(q).sort({ estado: 1, en: -1 }).limit(limite).lean();
  }
  return provisional.pendientes
    .filter((p) => conHechos || p.estado === 'abierto')
    .slice(0, limite);
}

async function cerrarPendiente(id, quien, { reabrir = false } = {}) {
  const cambio = reabrir
    ? { estado: 'abierto', cerradoPor: null, cerradoEn: null }
    : { estado: 'hecho', cerradoPor: quien || null, cerradoEn: new Date() };
  if (conMongo) return Pendiente.findByIdAndUpdate(id, cambio, { new: true }).lean();
  const p = provisional.pendientes.find((x) => x._id === id);
  if (p) Object.assign(p, cambio);
  return p || null;
}

async function borrarPendiente(id) {
  if (conMongo) return !!(await Pendiente.findByIdAndDelete(id));
  const i = provisional.pendientes.findIndex((x) => x._id === id);
  if (i < 0) return false;
  provisional.pendientes.splice(i, 1);
  return true;
}

// ── Gasto ───────────────────────────────────────────────────────────────────

async function anotarGasto(g) {
  if (!g || (!g.entrada && !g.salida)) return null;
  if (conMongo) return (await Gasto.create(g)).toObject();
  const x = { _id: idNuevo(), ...g, en: new Date() };
  provisional.gastos.unshift(x);
  return x;
}

/** Lo gastado hoy y en los últimos treinta días, en fichas y en dólares. */
async function gasto() {
  const arranqueHoy = new Date(); arranqueHoy.setHours(0, 0, 0, 0);
  const hace30 = new Date(Date.now() - 30 * 24 * 3600 * 1000);
  const filas = conMongo
    ? await Gasto.find({ en: { $gte: hace30 } }).lean()
    : provisional.gastos.filter((g) => new Date(g.en) >= hace30);
  const cero = () => ({ turnos: 0, entrada: 0, salida: 0, dolares: 0, conPrecio: true });
  const hoy = cero(); const mes = cero();
  for (const f of filas) {
    for (const c of [mes, ...(new Date(f.en) >= arranqueHoy ? [hoy] : [])]) {
      c.turnos += 1; c.entrada += f.entrada || 0; c.salida += f.salida || 0;
      // Un modelo sin precio conocido NO se cuenta como cero dólares: se dice
      // que el total está incompleto. Un total que miente por lo bajo es peor
      // que no tener total.
      if (f.dolares == null) c.conPrecio = false; else c.dolares += f.dolares;
    }
  }
  return { hoy, mes };
}

module.exports = {
  conectar, estado,
  anotarPendiente, pendientes, cerrarPendiente, borrarPendiente,
  anotarGasto, gasto,
  recordar, olvidar, memoriasDe,
  abrirConversacion, conversacion, conversacionesDe, anotarTurno, titular,
  guardarDocumento, documentos, documento,
  Memoria, Conversacion, Documento, Pendiente, Gasto,
  _adentro: { provisional },
};
