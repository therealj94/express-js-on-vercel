/* LAS PREFERENCIAS DE CADA MIEMBRO: idioma, voz y figura.
 *
 * Son de la PERSONA, no del navegador. Guardarlas en el `localStorage` habría
 * sido más fácil y habría durado hasta que José abriera ULTRON en el otro
 * aparato: elige la voz en el iPad y en la computadora vuelve a hablar otra.
 * Van a la base con su correo, y así lo elegido lo es en todas partes.
 *
 * ── EL IDIOMA NO ES SOLO LA PANTALLA ────────────────────────────────────────
 * `idioma` cambia tres cosas a la vez, y por eso vive aquí y no en un botón
 * suelto: en qué idioma CONTESTA ULTRON (va al encabezado del modelo), con qué
 * voz lo dice, y en qué idioma escucha el micrófono. Elegir «English» y que
 * siga contestando en español sería un ajuste decorativo.
 */

const mongoose = require('mongoose');
const { Schema } = mongoose;

const prefSchema = new Schema({
  correo: { type: String, required: true, unique: true, index: true },
  idioma: { type: String, enum: ['es', 'en'], default: 'es' },
  vozId: { type: String, default: null },          // null = la de la casa
  figura: { type: String, enum: ['nucleo', 'busto'], default: 'nucleo' },
  conVoz: { type: Boolean, default: true },
  tocado: { type: Date, default: Date.now },
}, { versionKey: false });
const Pref = mongoose.models.Pref || mongoose.model('Pref', prefSchema);

const conMongo = () => mongoose.connection.readyState === 1;
const provisional = new Map();
const POR_OMISION = { idioma: 'es', vozId: null, figura: 'nucleo', conVoz: true };

/* Las dos voces que la casa usa, una por idioma. George es la que José eligió;
   habla los dos idiomas con el modelo multilingüe, con acento inglés en
   español — eso se dice en Ajustes, no se esconde. */
const VOCES_SUGERIDAS = {
  en: { id: 'JBFqnCBsd6RMkjVDRZzb', nombre: 'George' },
  es: { id: 'JBFqnCBsd6RMkjVDRZzb', nombre: 'George' },
};

async function de(correo) {
  const c = String(correo || '').toLowerCase();
  if (conMongo()) {
    try { const p = await Pref.findOne({ correo: c }).lean(); if (p) return { ...POR_OMISION, ...p, _id: undefined }; }
    catch { /* se cae a lo provisional */ }
  }
  return { ...POR_OMISION, ...(provisional.get(c) || {}) };
}

async function guardar(correo, cambios = {}) {
  const c = String(correo || '').toLowerCase();
  const limpio = {};
  if (cambios.idioma === 'es' || cambios.idioma === 'en') limpio.idioma = cambios.idioma;
  if (cambios.figura === 'nucleo' || cambios.figura === 'busto') limpio.figura = cambios.figura;
  if (typeof cambios.conVoz === 'boolean') limpio.conVoz = cambios.conVoz;
  /* El id de una voz de ElevenLabs es alfanumérico de 20: cualquier otra cosa
     no se guarda. Sin esto, un id inventado dejaría a ULTRON mudo hasta que
     alguien mirara la base. */
  if (cambios.vozId === null || cambios.vozId === '') limpio.vozId = null;
  else if (typeof cambios.vozId === 'string' && /^[A-Za-z0-9]{15,32}$/.test(cambios.vozId)) limpio.vozId = cambios.vozId;
  limpio.tocado = new Date();

  const antes = await de(c);
  const nuevo = { ...antes, ...limpio };
  provisional.set(c, nuevo);
  if (conMongo()) { try { await Pref.updateOne({ correo: c }, { $set: { correo: c, ...limpio } }, { upsert: true }); } catch (e) { console.warn('[preferencias] no se pudo guardar:', e.message); } }
  return nuevo;
}

/** La línea que se le pone al modelo cuando el idioma no es el de la casa. */
function ordenDeIdioma(idioma) {
  if (idioma !== 'en') return '';
  return '\nIDIOMA: this member has chosen ENGLISH. Answer in English, always, even if the question arrives in Spanish. '
    + 'Keep the names of the houses, the tools and the people exactly as they are (Orden Global, Ordenex, Veta Wallet, ORIGEN, la Junta Directiva): they are names, not words to translate. '
    + 'Amounts, dates and sources stay in the same format.';
}

module.exports = { de, guardar, ordenDeIdioma, VOCES_SUGERIDAS, POR_OMISION, _adentro: { Pref, provisional } };
