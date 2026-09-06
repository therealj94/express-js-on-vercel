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
  /* El lugar del que se da el clima al saludar. Base de operaciones por
     omisión; se cambia en Ajustes porque José viaja a Roatán. */
  lugar: { type: String, default: 'Tegucigalpa' },
  /* Cómo escucha:
       conversacion  al entrar y después de cada respuesta abre el micrófono
                     solo. Es la que hace que esto sea una conversación.
       palabra       solo escucha cuando se dice «hey ULTRON».
       apagado       solo con el botón del micrófono, un turno cada vez. */
  oido: { type: String, enum: ['conversacion', 'palabra', 'apagado'], default: 'conversacion' },
  /* «Solo a mí»: ignora lo que suene lejos y exige la palabra para empezar.
     NO es reconocer una voz —el navegador no puede— y así se dice en Ajustes. */
  soloYo: { type: Boolean, default: true },
  tocado: { type: Date, default: Date.now },
}, { versionKey: false });
const Pref = mongoose.models.Pref || mongoose.model('Pref', prefSchema);

const conMongo = () => mongoose.connection.readyState === 1;
const provisional = new Map();
const POR_OMISION = { idioma: 'es', vozId: null, figura: 'nucleo', conVoz: true, lugar: 'Tegucigalpa', oido: 'conversacion', soloYo: true };

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
  if (typeof cambios.soloYo === 'boolean') limpio.soloYo = cambios.soloYo;
  if (['conversacion', 'palabra', 'apagado'].includes(cambios.oido)) limpio.oido = cambios.oido;
  if (typeof cambios.lugar === 'string' && cambios.lugar.trim().length >= 3 && cambios.lugar.length <= 60) limpio.lugar = cambios.lugar.trim();
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

/* ── LOS AJUSTES DE LA CASA ──────────────────────────────────────────────────
 * Estos NO son de una persona: valen para toda la junta y los cambia solo el
 * dueño. Hoy hay uno, y es el que más pesa: con qué cerebro piensa ULTRON.
 *
 *   nodo    SOLO NOSOTROS. El modelo de la casa, en nuestra tarjeta. Nada sale
 *           hacia Anthropic — ni una palabra de la junta. Si el nodo se apaga,
 *           ULTRON queda mudo, y eso se sabe al elegirlo.
 *   relevo  Nosotros, y Claude SOLO si el nodo no contesta. Es el que no deja
 *           a ULTRON mudo, y el que a cambio manda la conversación afuera
 *           cuando la tarjeta falla.
 *   claude  Solo Claude. Para pensar algo largo con un modelo grande.
 *
 * Por omisión: `nodo`. Lo pidió José con estas palabras —«dejar puro nosotros
 * sin Claude»— y además es lo honesto hoy: la cuenta de Anthropic está sin
 * saldo, así que un relevo por omisión sería un respaldo que no existe.
 */
const CEREBROS = ['nodo', 'relevo', 'claude'];
const casaSchema = new Schema({
  clave: { type: String, required: true, unique: true, index: true },
  cerebro: { type: String, enum: CEREBROS, default: 'nodo' },
  porQuien: String,
  tocado: { type: Date, default: Date.now },
}, { versionKey: false });
const Casa = mongoose.models.Casa || mongoose.model('Casa', casaSchema);

/* Se guarda en memoria además de en la base porque `cerebro.cual()` lo pregunta
   en CADA turno y no puede esperar a una consulta. La base es para que
   sobreviva a un reinicio; la memoria es la que contesta. */
let casaEnMemoria = null;

async function casa() {
  if (casaEnMemoria) return casaEnMemoria;
  /* Por omisión «nodo» —solo nosotros, que es lo que pidió la junta—, pero solo
     si hay nodo configurado. Sin nodo, «nodo» dejaría a ULTRON mudo desde el
     primer minuto sin que nadie lo haya elegido: ahí se cae a «relevo», que
     usa lo que haya. Elegir «solo nosotros» tiene que ser una decisión, no un
     accidente de una variable que falta. */
  const hayNodo = !!(process.env.ULTRON_NODO_URL && process.env.ULTRON_NODO_SECRETO);
  const dicho = (process.env.ULTRON_CEREBRO || '').trim();
  const porOmision = { cerebro: CEREBROS.includes(dicho) ? dicho : (hayNodo ? 'nodo' : 'relevo') };
  if (conMongo()) {
    try { const d = await Casa.findOne({ clave: 'casa' }).lean(); if (d) { casaEnMemoria = { cerebro: d.cerebro, porQuien: d.porQuien, tocado: d.tocado }; return casaEnMemoria; } }
    catch { /* se usa lo de omisión */ }
  }
  casaEnMemoria = porOmision;
  return casaEnMemoria;
}
/** Lo que `cerebro.cual()` puede preguntar sin esperar: null hasta que se cargue. */
const casaYa = () => casaEnMemoria;

async function guardarCasa(cambios = {}, porQuien = '?') {
  if (!CEREBROS.includes(cambios.cerebro)) throw Object.assign(new Error(`El cerebro es ${CEREBROS.join(', ')}.`), { codigo: 'CEREBRO' });
  casaEnMemoria = { cerebro: cambios.cerebro, porQuien, tocado: new Date() };
  if (conMongo()) { try { await Casa.updateOne({ clave: 'casa' }, { $set: { clave: 'casa', cerebro: cambios.cerebro, porQuien, tocado: new Date() } }, { upsert: true }); } catch (e) { console.warn('[casa] no se pudo guardar:', e.message); } }
  console.log(`[casa] cerebro → ${cambios.cerebro} (por ${porQuien})`);
  return casaEnMemoria;
}

module.exports = { de, guardar, ordenDeIdioma, VOCES_SUGERIDAS, POR_OMISION,
  casa, casaYa, guardarCasa, CEREBROS, _adentro: { Pref, Casa, provisional } };
