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
  /* DÓNDE ESTÁ DE VERDAD, si dio permiso. El navegador da coordenadas y no
     nombres; el nombre lo pone `mundo.js`. Se guarda con la fecha porque una
     ubicación de hace tres semanas es peor que ninguna: José viaja, y dar el
     tiempo de Tegucigalpa cuando está en Roatán es exactamente el fallo que
     esto viene a arreglar. Pasadas 12 horas se vuelve al sitio elegido a mano. */
  coords: { type: { lat: Number, lon: Number, cuando: Date }, default: null },
  /* Cómo escucha:
       conversacion  al entrar y después de cada respuesta abre el micrófono
                     solo. Es la que hace que esto sea una conversación.
       palabra       solo escucha cuando se dice «hey ULTRON».
       apagado       solo con el botón del micrófono, un turno cada vez. */
  oido: { type: String, enum: ['conversacion', 'palabra', 'apagado'], default: 'conversacion' },
  /* «Solo a mí»: ignora lo que suene lejos y exige la palabra para empezar.
     NO es reconocer una voz —el navegador no puede— y así se dice en Ajustes. */
  soloYo: { type: Boolean, default: true },
  /* EL TABLERO, ARMADO POR QUIEN LO MIRA.
     Un panel por entrada: en qué columna va, en qué orden, qué alto ocupa y si
     se enseña. Va aquí y no en el navegador por lo mismo que la voz: quien
     arma su tablero en la computadora quiere encontrarlo armado en el iPad.
     Vacío = el reparto de fábrica, que es el que decidió el diseño. */
  tablero: { type: [{ _id: false, id: String, col: String, peso: Number, oculto: Boolean }], default: [] },
  tocado: { type: Date, default: Date.now },
}, { versionKey: false });
const Pref = mongoose.models.Pref || mongoose.model('Pref', prefSchema);

const conMongo = () => mongoose.connection.readyState === 1;
const provisional = new Map();
const POR_OMISION = { idioma: 'es', vozId: null, figura: 'nucleo', conVoz: true, lugar: 'Tegucigalpa', oido: 'conversacion', soloYo: true, tablero: [], coords: null };

/* Cuánto vale una ubicación antes de quedar vieja. José viaja: el tiempo de
   Tegucigalpa dado en Roatán es justo el fallo que la ubicación viene a
   arreglar, y una medida de anteayer lo repite. */
const COORDS_VALEN_MS = 12 * 60 * 60 * 1000;
const coordsFrescas = (c) => !!c && Number.isFinite(c.lat) && Number.isFinite(c.lon)
  && Date.now() - new Date(c.cuando || 0).getTime() < COORDS_VALEN_MS;
/** El lugar del clima: dónde está, si lo sabemos hace poco; si no, el elegido. */
const lugarDelClima = (p) => (coordsFrescas(p?.coords) ? { lat: p.coords.lat, lon: p.coords.lon } : (p?.lugar || 'Tegucigalpa'));

/* El tablero llega de la pantalla, así que se limpia aquí y no se cree nada:
   un peso de 900 rompería la rejilla y un id inventado dejaría un hueco.
   Se recorta a lo que puede existir; lo que no encaja se descarta callado, que
   es mejor que guardar un tablero que no se puede dibujar. */
const COLUMNAS = ['izq', 'der'];
function limpiarTablero(t) {
  if (!Array.isArray(t)) return null;
  const visto = new Set();
  const salida = [];
  for (const x of t.slice(0, 24)) {
    const id = String(x?.id || '').trim();
    if (!/^[a-z][a-z0-9-]{0,23}$/.test(id) || visto.has(id)) continue;
    visto.add(id);
    const peso = Number(x?.peso);
    salida.push({
      id,
      col: COLUMNAS.includes(x?.col) ? x.col : 'izq',
      peso: Number.isFinite(peso) ? Math.min(3, Math.max(0.4, Math.round(peso * 100) / 100)) : 1,
      oculto: !!x?.oculto,
    });
  }
  return salida;
}

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
  if (cambios.tablero !== undefined) { const t = limpiarTablero(cambios.tablero); if (t) limpio.tablero = t; }
  /* `null` es una orden: «deja de usar mi ubicación». Se distingue de «no
     mandé coordenadas», que es no tocar nada. */
  if (cambios.coords === null) limpio.coords = null;
  else if (cambios.coords && Number.isFinite(Number(cambios.coords.lat)) && Number.isFinite(Number(cambios.coords.lon))
    && Math.abs(Number(cambios.coords.lat)) <= 90 && Math.abs(Number(cambios.coords.lon)) <= 180) {
    /* Tres decimales: unos cien metros. Basta de sobra para el tiempo y no
       guarda en la base en qué habitación de la casa está. */
    const red = (n) => Math.round(Number(n) * 1000) / 1000;
    limpio.coords = { lat: red(cambios.coords.lat), lon: red(cambios.coords.lon), cuando: new Date() };
  }
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

module.exports = { de, guardar, ordenDeIdioma, VOCES_SUGERIDAS, POR_OMISION, limpiarTablero, lugarDelClima, coordsFrescas,
  casa, casaYa, guardarCasa, CEREBROS, _adentro: { Pref, Casa, provisional } };
