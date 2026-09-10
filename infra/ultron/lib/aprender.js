/* APRENDER: lo que ULTRON se lleva de una conversación a la siguiente.
 *
 * José pidió «que pueda aprender, que se pueda mejorar». Un modelo no cambia
 * sus pesos por hablar con uno; lo que sí puede hacer es lo que hace una
 * persona nueva en la casa: anotar lo que le corrigen y escribir el
 * procedimiento de lo que le salió bien, para hacerlo igual la próxima vez.
 * Aquí hay exactamente esas dos cosas, con nombre propio:
 *
 *   LECCIÓN     una corrección de la junta. «No es la 8532, es la 5550».
 *               Va a la memoria con el tema «lección» y se pone en la cabeza
 *               de ULTRON POR ENCIMA de las fichas: una ficha vieja dice una
 *               cosa, la junta dijo otra, y manda la junta. Es lo que hace que
 *               el mismo error no vuelva a ocurrir dos veces.
 *
 *   HABILIDAD   un procedimiento escrito: cómo se revisa la seguridad, cómo
 *               se investiga un tema a fondo, cómo se propone un cambio de
 *               código. Son archivos markdown —como las «skills» de Claude—
 *               con un encabezado que dice CUÁNDO usarla. ULTRON ve la lista
 *               (nombre y cuándo), y carga el texto entero solo cuando la
 *               tarea lo pide. Las que vienen en el repositorio son las de
 *               fábrica; las que ULTRON escribe se guardan en la base y, si
 *               el dueño aprueba, se publican al repositorio como un PR para
 *               que queden versionadas y las lea alguien.
 *
 * Ninguna de las dos cosas es magia. Son memoria con disciplina.
 */

const { readdirSync, readFileSync, existsSync } = require('node:fs');
const { join } = require('node:path');
const mongoose = require('mongoose');
const { Schema } = mongoose;
const memoria = require('./memoria');

const TEMA_LECCION = 'lección';
const CARPETA = join(__dirname, '..', 'habilidades');

// ── Lecciones ───────────────────────────────────────────────────────────────

async function aprender({ texto, dichoPor, miembro }) {
  const t = String(texto || '').trim();
  if (t.length < 8) throw Object.assign(new Error('Una lección tiene que decir algo.'), { codigo: 'CORTA' });
  return memoria.recordar({ texto: t, alcance: 'junta', miembro, dichoPor, tema: TEMA_LECCION, origen: 'pedido' });
}

/** Las lecciones vigentes, separadas de las memorias corrientes. */
function partir(memorias = []) {
  const lecciones = memorias.filter((m) => m.tema === TEMA_LECCION);
  const otras = memorias.filter((m) => m.tema !== TEMA_LECCION);
  return { lecciones, otras };
}

// ── Habilidades ─────────────────────────────────────────────────────────────

const habilidadSchema = new Schema({
  nombre: { type: String, required: true, unique: true, maxlength: 60 },
  cuando: { type: String, required: true, maxlength: 300 },
  contenido: { type: String, required: true, maxlength: 20_000 },
  creadaPor: String,
  version: { type: Number, default: 1 },
  publicada: { type: Boolean, default: false },
}, { timestamps: { createdAt: 'en', updatedAt: 'tocado' } });

const Habilidad = mongoose.models.Habilidad || mongoose.model('Habilidad', habilidadSchema);
const provisional = new Map();
const conMongo = () => mongoose.connection.readyState === 1;

const nombreLimpio = (n) => String(n || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

/* El encabezado: tres rayas, `nombre:` y `cuando:`, tres rayas. Igual que las
   skills de Claude, para que quien ya conoce ese formato no aprenda otro. */
function parsear(md, nombreArchivo = '') {
  const m = /^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/.exec(md);
  const cab = {}; let cuerpo = md;
  if (m) {
    cuerpo = m[2];
    for (const l of m[1].split('\n')) { const i = l.indexOf(':'); if (i > 0) cab[l.slice(0, i).trim()] = l.slice(i + 1).trim(); }
  }
  return { nombre: nombreLimpio(cab.nombre || nombreArchivo), cuando: cab.cuando || '', contenido: cuerpo.trim() };
}

/** Las de fábrica, leídas del repositorio al arrancar. */
function deFabrica() {
  if (!existsSync(CARPETA)) return [];
  return readdirSync(CARPETA).filter((f) => f.endsWith('.md')).map((f) => {
    const h = parsear(readFileSync(join(CARPETA, f), 'utf8'), f.replace(/\.md$/, ''));
    return { ...h, origen: 'repositorio', publicada: true, version: 0 };
  }).filter((h) => h.nombre && h.contenido);
}

async function listar() {
  const fab = deFabrica();
  const propias = conMongo() ? (await Habilidad.find({}).lean()).map((h) => ({ ...h, origen: 'aprendida' })) : [...provisional.values()].map((h) => ({ ...h, origen: 'aprendida' }));
  // Una aprendida con el mismo nombre que una de fábrica la sustituye: así se mejora una de fábrica sin tocar el repositorio.
  const todas = new Map(fab.map((h) => [h.nombre, h]));
  for (const h of propias) todas.set(h.nombre, h);
  return [...todas.values()].sort((a, b) => a.nombre.localeCompare(b.nombre));
}

async function usar(nombre) {
  const n = nombreLimpio(nombre);
  const h = (await listar()).find((x) => x.nombre === n);
  if (!h) throw Object.assign(new Error(`No hay ninguna habilidad llamada «${n}».`), { codigo: 'NO_EXISTE' });
  return h;
}

async function crear({ nombre, cuando, contenido, por }) {
  const n = nombreLimpio(nombre);
  if (!n) throw Object.assign(new Error('Hace falta un nombre.'), { codigo: 'NOMBRE' });
  const c = String(cuando || '').trim(); const t = String(contenido || '').trim();
  if (c.length < 10) throw Object.assign(new Error('Hace falta decir CUÁNDO se usa esta habilidad.'), { codigo: 'CUANDO' });
  if (t.length < 40) throw Object.assign(new Error('El contenido es demasiado corto para ser un procedimiento.'), { codigo: 'CONTENIDO' });
  if (conMongo()) {
    const antes = await Habilidad.findOne({ nombre: n }).lean();
    const r = await Habilidad.findOneAndUpdate({ nombre: n }, { $set: { cuando: c, contenido: t, creadaPor: por, version: (antes?.version || 0) + 1, publicada: false } }, { upsert: true, new: true }).lean();
    return { ...r, _id: String(r._id) };
  }
  const antes = provisional.get(n);
  const h = { nombre: n, cuando: c, contenido: t, creadaPor: por, version: (antes?.version || 0) + 1, publicada: false, en: antes?.en || new Date() };
  provisional.set(n, h);
  return h;
}

/** El archivo tal como iría al repositorio. */
function comoArchivo(h) {
  return `---\nnombre: ${h.nombre}\ncuando: ${h.cuando}\n---\n\n${h.contenido}\n`;
}

async function marcarPublicada(nombre) {
  const n = nombreLimpio(nombre);
  if (conMongo()) await Habilidad.updateOne({ nombre: n }, { publicada: true });
  else if (provisional.has(n)) provisional.get(n).publicada = true;
}

/** Para el prompt: la lista corta, nombre y cuándo. */
async function catalogoParaElModelo() {
  const l = await listar();
  return l.length ? l.map((h) => `- ${h.nombre}: ${h.cuando}${h.origen === 'aprendida' ? ' (aprendida)' : ''}`).join('\n') : '(ninguna todavía)';
}

module.exports = { TEMA_LECCION, aprender, partir, listar, usar, crear, comoArchivo, marcarPublicada, catalogoParaElModelo, nombreLimpio, _adentro: { parsear, deFabrica, provisional, CARPETA } };
