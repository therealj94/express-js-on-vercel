/* LA BITÁCORA — cada cosa que ULTRON hizo, con quién la pidió y por qué.
 *
 * ── POR QUÉ ─────────────────────────────────────────────────────────────────
 * «No podés auditar lo que no quedó escrito.» Hasta hoy una herramienta corría
 * y lo único que quedaba era, a veces, una línea en el registro de Heroku que
 * se borra a los siete días. Si el jueves alguien pregunta «¿quién reinició
 * Ordenex el lunes y por qué?», la respuesta era «no se sabe».
 *
 * Aquí queda todo lo que TOCA algo: qué herramienta, quién la pidió (persona o
 * bot), por qué canal, con qué entrada —resumida y sin secretos—, si salió bien
 * y cuánto tardó. Solo se añade, nunca se edita ni se borra desde ULTRON: una
 * bitácora que se puede corregir no sirve como bitácora.
 *
 * Las de lectura pura (mirar el estado, buscar en el saber) NO se anotan: son
 * cientos al día y no cambian nada. Se anotan las que escriben, las peligrosas,
 * las que salen de la casa, y cualquier fallo.
 */

const mongoose = require('mongoose');
const { Schema } = mongoose;

const accionSchema = new Schema({
  cuando: { type: Date, default: Date.now, index: true },
  herramienta: { type: String, required: true, index: true },
  quien: { type: String, index: true },       // correo, o bot:<nombre>
  rol: String,                                // dueño | junta | bot
  canal: String,                              // panel | whatsapp | reloj | mano
  entrada: String,                            // resumen sin secretos, 300 letras
  ok: { type: Boolean, default: true },
  motivo: String,                             // por qué (si el modelo lo dijo) o el error
  ms: Number,
}, { versionKey: false });
accionSchema.index({ cuando: -1 });
const Accion = mongoose.models.Accion || mongoose.model('Accion', accionSchema);

const conMongo = () => mongoose.connection.readyState === 1;
const provisional = [];

/* Lo que se tapa antes de escribir: cualquier valor con pinta de llave. */
const TAPAR = /(HRKU-[A-Za-z0-9_-]+|sk-ant-[A-Za-z0-9_-]+|github_pat_[A-Za-z0-9_]+|ghp_[A-Za-z0-9]+|mongodb(\+srv)?:\/\/[^\s"']+|AKIA[A-Z0-9]{12,}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,})/g;
const CLAVES_TAPADAS = /pass|clave|secret|token|key|llave|semilla|seed|private|pvt/i;
function resumirEntrada(entrada) {
  if (!entrada || typeof entrada !== 'object') return '';
  const partes = [];
  for (const [k, v] of Object.entries(entrada)) {
    if (k === 'motivo') continue;
    const val = CLAVES_TAPADAS.test(k) ? '•••' : String(typeof v === 'object' ? JSON.stringify(v) : v).replace(TAPAR, '•••');
    partes.push(`${k}=${val.slice(0, 120)}`);
  }
  return partes.join(' · ').slice(0, 300);
}

async function anotar({ herramienta, quien, rol, canal = 'panel', entrada, ok = true, motivo = null, ms = null }) {
  const doc = { cuando: new Date(), herramienta, quien: String(quien || '?'), rol: rol || null, canal,
    entrada: resumirEntrada(entrada), ok: !!ok, motivo: motivo ? String(motivo).replace(TAPAR, '•••').slice(0, 400) : null, ms };
  if (conMongo()) { try { await Accion.create(doc); return doc; } catch (e) { console.warn('[bitacora] no se pudo anotar:', e.message); } }
  provisional.unshift(doc); if (provisional.length > 300) provisional.pop();
  return doc;
}

async function leer({ limite = 40, herramienta = null, quien = null, desde = null } = {}) {
  const q = {}; if (herramienta) q.herramienta = herramienta; if (quien) q.quien = quien; if (desde) q.cuando = { $gte: new Date(desde) };
  if (conMongo()) return (await Accion.find(q).sort({ cuando: -1 }).limit(limite).lean()).map((a) => ({ ...a, _id: String(a._id) }));
  return provisional.filter((a) => (!herramienta || a.herramienta === herramienta) && (!quien || a.quien === quien) && (!desde || a.cuando >= new Date(desde))).slice(0, limite);
}

module.exports = { anotar, leer, resumirEntrada, _adentro: { provisional, Accion, TAPAR } };
