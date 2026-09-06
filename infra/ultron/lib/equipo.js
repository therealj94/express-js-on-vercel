/* EL EQUIPO: los bots que trabajan para ULTRON cuando nadie está mirando.
 *
 * José pidió «un equipo de bots que ayude al sistema: mantenimiento,
 * seguridad». Un bot aquí es tres cosas: un NOMBRE, una TAREA escrita en
 * markdown (equipo/<nombre>.md, con el mismo encabezado que las habilidades)
 * y un RITMO —cada cuántas horas corre—. Cuando corre, es ULTRON pensando con
 * esa tarea como pregunta y con un miembro especial, «bot:<nombre>», de rol
 * bot. Lo que escribe se guarda como PARTE y lo lee la junta en el panel.
 *
 * ── LO QUE UN BOT PUEDE Y NO PUEDE ──────────────────────────────────────────
 * Lee todo lo que ULTRON lee. Escribe DOS cosas: memorias y pendientes. No
 * corre la terminal, no propone cambios de código, no manda mensajes, no se
 * despliega: si cree que hace falta algo de eso, lo anota como pendiente y
 * una persona decide. Un bot con las mismas manos que el dueño, corriendo
 * solo a las tres de la mañana, es exactamente lo que nadie quiere. Además
 * cada bot lleva su lista de herramientas en el encabezado, y no ve las que
 * no están en ella: el cronista no necesita `nube_estado` y no la tiene.
 *
 * ── EL EQUIPO ARRANCA APAGADO ───────────────────────────────────────────────
 * Cada vuelta de un bot son fichas de modelo, y un equipo de cuatro con sus
 * ritmos son unas ocho vueltas al día. Se enciende con ULTRON_EQUIPO=on y
 * tiene tope diario (ULTRON_EQUIPO_TOPE, 12 por omisión). Sin la variable, los
 * bots existen, se pueden correr a mano desde el panel, y no gastan nada.
 */

const { readdirSync, readFileSync, existsSync } = require('node:fs');
const { join } = require('node:path');
const mongoose = require('mongoose');
const { Schema } = mongoose;

const CARPETA = join(__dirname, '..', 'equipo');
const ENCENDIDO = () => /^(on|1|si|sí|true)$/i.test(String(process.env.ULTRON_EQUIPO || ''));
const TOPE_DIA = () => Number(process.env.ULTRON_EQUIPO_TOPE || 12);

const parteSchema = new Schema({
  bot: { type: String, required: true, index: true },
  texto: { type: String, required: true },
  herramientas: [String],
  pedidoPor: String,                       // 'reloj' o el correo de quien lo corrió a mano
  fichas: { entrada: Number, salida: Number },
  dolares: Number,
  ms: Number,
  fallo: String,
}, { timestamps: { createdAt: 'en', updatedAt: 'tocado' } });

const Parte = mongoose.models.Parte || mongoose.model('Parte', parteSchema);
const provisional = [];
const conMongo = () => mongoose.connection.readyState === 1;
const idNuevo = () => new mongoose.Types.ObjectId().toString();

function parsear(md, nombreArchivo) {
  const m = /^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/.exec(md);
  const cab = {}; let cuerpo = md;
  if (m) { cuerpo = m[2]; for (const l of m[1].split('\n')) { const i = l.indexOf(':'); if (i > 0) cab[l.slice(0, i).trim()] = l.slice(i + 1).trim(); } }
  return {
    nombre: String(cab.nombre || nombreArchivo).trim().toLowerCase(),
    cada: Number(cab.cada) > 0 ? Number(cab.cada) : null,     // horas; null = solo a mano
    descripcion: cab.descripcion || '',
    herramientas: String(cab.herramientas || '').split(',').map((s) => s.trim()).filter(Boolean),
    tarea: cuerpo.trim(),
  };
}

function bots() {
  if (!existsSync(CARPETA)) return [];
  return readdirSync(CARPETA).filter((f) => f.endsWith('.md')).map((f) => parsear(readFileSync(join(CARPETA, f), 'utf8'), f.replace(/\.md$/, ''))).filter((b) => b.nombre && b.tarea);
}

const bot = (nombre) => bots().find((b) => b.nombre === String(nombre || '').toLowerCase()) || null;

// ── Correr uno ──────────────────────────────────────────────────────────────

let enMarcha = new Set();
const hoy = () => new Date().toISOString().slice(0, 10);
let contadorDia = { dia: hoy(), vueltas: 0 };

/**
 * Corre un bot. `pensar` se inyecta (es cerebro.pensar) para que este archivo
 * no dependa del cerebro al cargarse y se pueda probar con un cerebro falso.
 */
async function correr(nombre, { pensar, junta = [], pedidoPor = 'reloj' }) {
  const b = bot(nombre);
  if (!b) throw Object.assign(new Error(`No hay ningún bot llamado «${nombre}». Hay: ${bots().map((x) => x.nombre).join(', ') || 'ninguno'}.`), { codigo: 'NO_EXISTE' });
  if (enMarcha.has(b.nombre)) throw Object.assign(new Error(`El bot «${b.nombre}» ya está corriendo.`), { codigo: 'EN_MARCHA' });
  if (contadorDia.dia !== hoy()) contadorDia = { dia: hoy(), vueltas: 0 };
  if (pedidoPor === 'reloj' && contadorDia.vueltas >= TOPE_DIA()) throw Object.assign(new Error(`Tope diario del equipo alcanzado (${TOPE_DIA()} vueltas).`), { codigo: 'TOPE' });

  enMarcha.add(b.nombre);
  const t0 = Date.now();
  const miembro = { correo: `bot:${b.nombre}`, nombre: `${b.nombre} (bot de ULTRON)`, rol: 'bot', herramientas: b.herramientas };
  const usadas = [];
  let parte;
  try {
    const r = await pensar({
      miembro, junta, conversacionId: null, texto: b.tarea,
      emitir: (ev, d) => { if (ev === 'herramienta' && d?.nombre) usadas.push(d.nombre); },
    });
    parte = { bot: b.nombre, texto: String(r?.texto || '').trim() || '(el bot no escribió nada)', herramientas: [...new Set(usadas)], pedidoPor,
      fichas: { entrada: r?.uso?.entrada || 0, salida: r?.uso?.salida || 0 }, dolares: r?.uso?.dolares || 0, ms: Date.now() - t0 };
  } catch (e) {
    parte = { bot: b.nombre, texto: `El bot falló: ${e?.message || e}`, herramientas: [...new Set(usadas)], pedidoPor, ms: Date.now() - t0, fallo: String(e?.codigo || e?.message || e).slice(0, 200) };
  } finally {
    enMarcha.delete(b.nombre);
    contadorDia.vueltas++;
  }
  if (conMongo()) { const d = (await Parte.create(parte)).toObject(); return { ...d, _id: String(d._id) }; }
  const p = { _id: idNuevo(), ...parte, en: new Date() };
  provisional.unshift(p);
  if (provisional.length > 200) provisional.length = 200;
  return p;
}

async function partes({ bot: nombre = null, limite = 20, desde = null } = {}) {
  const q = {}; if (nombre) q.bot = String(nombre).toLowerCase(); if (desde) q.en = { $gte: new Date(desde) };
  if (conMongo()) return (await Parte.find(q).sort({ en: -1 }).limit(limite).lean()).map((p) => ({ ...p, _id: String(p._id) }));
  return provisional.filter((p) => (!nombre || p.bot === q.bot) && (!desde || new Date(p.en) >= new Date(desde))).slice(0, limite);
}

// ── El reloj ────────────────────────────────────────────────────────────────

const relojes = [];
let ultimaVuelta = new Map();

function arrancar({ pensar, junta = [] }) {
  parar();
  if (!ENCENDIDO()) { console.log(`[equipo] ${bots().length} bot(s) definidos · apagados (ULTRON_EQUIPO no está en «on»); se corren a mano desde el panel`); return false; }
  for (const b of bots()) {
    if (!b.cada) continue;
    const cadaMs = b.cada * 3600_000;
    /* Primera vuelta a los dos minutos del arranque —no todos a la vez— y
       después a su ritmo. Cada uno va desfasado por su posición para que no
       se pisen. */
    const t = setTimeout(() => {
      correr(b.nombre, { pensar, junta }).then((p) => console.log(`[equipo] ${b.nombre}: parte de ${p.texto.length} letras`)).catch((e) => console.warn(`[equipo] ${b.nombre} no corrió: ${e.message}`));
      const iv = setInterval(() => {
        correr(b.nombre, { pensar, junta }).then((p) => { ultimaVuelta.set(b.nombre, new Date()); console.log(`[equipo] ${b.nombre}: parte de ${p.texto.length} letras`); })
          .catch((e) => console.warn(`[equipo] ${b.nombre} no corrió: ${e.message}`));
      }, cadaMs);
      iv.unref?.(); relojes.push(iv);
    }, 120_000 + relojes.length * 30_000);
    t.unref?.(); relojes.push(t);
  }
  console.log(`[equipo] encendido: ${bots().filter((b) => b.cada).map((b) => `${b.nombre} cada ${b.cada} h`).join(', ')} · tope ${TOPE_DIA()} vueltas/día`);
  return true;
}

function parar() { for (const r of relojes) { clearTimeout(r); clearInterval(r); } relojes.length = 0; }

function estado() {
  return {
    encendido: ENCENDIDO(), tope: TOPE_DIA(), vueltasHoy: contadorDia.dia === hoy() ? contadorDia.vueltas : 0,
    bots: bots().map((b) => ({ nombre: b.nombre, cada: b.cada, descripcion: b.descripcion, herramientas: b.herramientas, corriendo: enMarcha.has(b.nombre), ultimaVuelta: ultimaVuelta.get(b.nombre) || null })),
  };
}

module.exports = { bots, bot, correr, partes, arrancar, parar, estado, _adentro: { parsear, provisional, CARPETA } };
