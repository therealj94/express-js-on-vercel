/* LA BÓVEDA: los secretos de la casa, guardados sin que nadie los vea.
 *
 * José pidió «poder guardar variables de entorno seguras». La regla que
 * ordena este archivo es la misma que rige toda la casa desde el día que un
 * token se pegó en un chat y hubo que darlo por quemado:
 *
 *   EL VALOR DE UN SECRETO NO PASA POR EL MODELO. NUNCA.
 *
 * ULTRON puede saber que existe MONGO_PASSWORD, cuántos días tiene, en qué
 * apps está puesto y cuándo se rotó. No puede leerlo, no puede decirlo y no
 * puede recibirlo en una conversación. El valor entra por un formulario del
 * panel que va directo de la pantalla del dueño a esta bóveda, cifrado antes
 * de tocar la base, y sale por un solo camino: hacia la variable de entorno
 * de una app en Heroku, con una autorización del dueño de por medio.
 *
 * ── CIFRADO ─────────────────────────────────────────────────────────────────
 * AES-256-GCM con una llave que vive SOLO en ULTRON_BOVEDA_LLAVE (32 bytes en
 * hex o base64). Sin esa llave la bóveda está apagada y lo dice; no hay llave
 * «por omisión» ni derivada de otra cosa: una bóveda con llave adivinable es
 * peor que ninguna, porque da la sensación de que hay una. Cada secreto lleva
 * su nonce y su etiqueta de autenticidad; cambiar un byte del cifrado se nota.
 *
 * Y la llave de la bóveda NO se guarda en la bóveda. Obvio, pero se dice.
 */

const { createCipheriv, createDecipheriv, randomBytes } = require('node:crypto');
const mongoose = require('mongoose');
const { Schema } = mongoose;

const secretoSchema = new Schema({
  nombre: { type: String, required: true, unique: true, maxlength: 80 },
  cifrado: { type: String, required: true },     // base64
  nonce: { type: String, required: true },       // base64, 12 bytes
  etiqueta: { type: String, required: true },    // base64, 16 bytes
  largo: { type: Number, required: true },       // cuántos caracteres tiene (para juzgar si es corto)
  nota: { type: String, maxlength: 200 },        // para qué es
  aplicadoEn: [{ app: String, variable: String, en: Date }],
  guardadoPor: String,
  rotadoEn: { type: Date, default: Date.now },
}, { timestamps: { createdAt: 'en', updatedAt: 'tocado' } });

const Secreto = mongoose.models.Secreto || mongoose.model('Secreto', secretoSchema);
const provisional = new Map();
const conMongo = () => mongoose.connection.readyState === 1;

function llave() {
  const raw = (process.env.ULTRON_BOVEDA_LLAVE || '').trim();
  if (!raw) return null;
  let b = null;
  if (/^[0-9a-fA-F]{64}$/.test(raw)) b = Buffer.from(raw, 'hex');
  else { try { b = Buffer.from(raw, 'base64'); } catch { b = null; } }
  return b && b.length === 32 ? b : null;
}

const encendida = () => !!llave();

function cifrar(texto) {
  const k = llave(); if (!k) throw Object.assign(new Error('La bóveda está apagada: falta ULTRON_BOVEDA_LLAVE (32 bytes).'), { codigo: 'BOVEDA_APAGADA' });
  const nonce = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', k, nonce);
  const cifrado = Buffer.concat([c.update(String(texto), 'utf8'), c.final()]);
  return { cifrado: cifrado.toString('base64'), nonce: nonce.toString('base64'), etiqueta: c.getAuthTag().toString('base64') };
}

function descifrar({ cifrado, nonce, etiqueta }) {
  const k = llave(); if (!k) throw Object.assign(new Error('La bóveda está apagada.'), { codigo: 'BOVEDA_APAGADA' });
  const d = createDecipheriv('aes-256-gcm', k, Buffer.from(nonce, 'base64'));
  d.setAuthTag(Buffer.from(etiqueta, 'base64'));
  return Buffer.concat([d.update(Buffer.from(cifrado, 'base64')), d.final()]).toString('utf8');
}

const nombreLimpio = (n) => String(n || '').trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_').slice(0, 80);

/** Guarda o rota. Solo desde el formulario del panel; nunca desde una herramienta. */
async function guardar({ nombre, valor, nota = '', por }) {
  const n = nombreLimpio(nombre);
  if (!n) throw Object.assign(new Error('Hace falta el nombre.'), { codigo: 'NOMBRE' });
  const v = String(valor ?? '');
  if (!v) throw Object.assign(new Error('El valor llegó vacío.'), { codigo: 'VACIO' });
  const doc = { nombre: n, ...cifrar(v), largo: v.length, nota: String(nota || '').slice(0, 200), guardadoPor: por, rotadoEn: new Date() };
  if (conMongo()) {
    const r = await Secreto.findOneAndUpdate({ nombre: n }, { $set: doc }, { upsert: true, new: true }).lean();
    return sinValor(r);
  }
  const antes = provisional.get(n);
  const s = { ...(antes || {}), ...doc, aplicadoEn: antes?.aplicadoEn || [], en: antes?.en || new Date() };
  provisional.set(n, s);
  return sinValor(s);
}

const sinValor = (s) => s && ({
  nombre: s.nombre, largo: s.largo, nota: s.nota || '', guardadoPor: s.guardadoPor || null,
  en: s.en, rotadoEn: s.rotadoEn, dias: s.rotadoEn ? Math.floor((Date.now() - new Date(s.rotadoEn).getTime()) / 86_400_000) : null,
  aplicadoEn: (s.aplicadoEn || []).map((a) => ({ app: a.app, variable: a.variable, en: a.en })),
  corto: s.largo < 24,
});

/** Lo que ULTRON puede saber: nombres, edades, dónde están. Sin valores. */
async function listar() {
  if (conMongo()) return (await Secreto.find({}).sort({ nombre: 1 }).lean()).map(sinValor);
  return [...provisional.values()].sort((a, b) => a.nombre.localeCompare(b.nombre)).map(sinValor);
}

async function borrar(nombre) {
  const n = nombreLimpio(nombre);
  if (conMongo()) return (await Secreto.deleteOne({ nombre: n })).deletedCount > 0;
  return provisional.delete(n);
}

/* El único camino de salida del valor: hacia una función que lo usa y no lo
   devuelve. `usar(nombre, fn)` le pasa el valor a `fn` y devuelve lo que `fn`
   devuelva, que NUNCA debe ser el valor. Quien llame a esto lo sabe. */
async function usar(nombre, fn) {
  const n = nombreLimpio(nombre);
  const s = conMongo() ? await Secreto.findOne({ nombre: n }).lean() : provisional.get(n);
  if (!s) throw Object.assign(new Error(`No hay ningún secreto llamado ${n} en la bóveda.`), { codigo: 'NO_EXISTE' });
  const valor = descifrar(s);
  return fn(valor);
}

/* ── APLICAR EN HEROKU ───────────────────────────────────────────────────────
   Pone un secreto de la bóveda como variable de una app. La llave de Heroku
   sale también de la bóveda (HEROKU_API_KEY) —o del entorno, si está—, y el
   valor viaja de aquí a api.heroku.com sin pasar por ningún sitio más. Lo que
   se devuelve es un hecho: app, variable, cuándo. */
async function aplicarEnHeroku({ nombre, app, variable = null }) {
  const n = nombreLimpio(nombre); const v = nombreLimpio(variable || n);
  if (!/^[a-z0-9-]{3,40}$/.test(String(app || ''))) throw Object.assign(new Error('Nombre de app inválido.'), { codigo: 'APP' });
  const conLlave = async (llaveHeroku) => usar(n, async (valor) => {
    const r = await fetch(`https://api.heroku.com/apps/${app}/config-vars`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${llaveHeroku}`, Accept: 'application/vnd.heroku+json; version=3', 'Content-Type': 'application/json' },
      body: JSON.stringify({ [v]: valor }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!r.ok) throw Object.assign(new Error(`Heroku contestó ${r.status} al poner ${v} en ${app}.`), { codigo: 'HEROKU' });
    return true;
  });
  if (process.env.HEROKU_API_KEY) await conLlave(process.env.HEROKU_API_KEY);
  else await usar('HEROKU_API_KEY', conLlave);
  const marca = { app, variable: v, en: new Date() };
  if (conMongo()) await Secreto.updateOne({ nombre: n }, { $push: { aplicadoEn: marca } });
  else provisional.get(n)?.aplicadoEn.push(marca);
  return { ok: true, ...marca };
}

/** Para el panel y el cerrajero: lo que preocupa, sin valores. */
async function juicio() {
  const l = await listar();
  return {
    encendida: encendida(), cuantos: l.length,
    cortos: l.filter((s) => s.corto).map((s) => s.nombre),
    viejos: l.filter((s) => s.dias != null && s.dias > 90).map((s) => `${s.nombre} (${s.dias} días)`),
    sinAplicar: l.filter((s) => !s.aplicadoEn.length).map((s) => s.nombre),
  };
}

module.exports = { encendida, guardar, listar, borrar, usar, aplicarEnHeroku, juicio, nombreLimpio, _adentro: { cifrar, descifrar, provisional } };
