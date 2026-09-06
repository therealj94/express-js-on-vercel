/* QUIÉN PUEDE QUÉ, Y LO QUE SE AUTORIZA.
 *
 * José lo pidió con estas palabras: «una AI libre para pensar y ayudarme, que
 * busque constantemente mejorarse, pero siempre yo siendo el dueño y nadie
 * más: solo que yo autorice que así sea, o con diferentes roles».
 *
 * Eso son dos ideas distintas y aquí van separadas a propósito:
 *
 *   · LIBRE PARA PENSAR. Ninguna herramienta está prohibida. ULTRON puede
 *     proponer cualquier cosa: correr un comando, cambiar su propio código,
 *     poner una variable en producción, desplegarse.
 *   · EL DUEÑO AUTORIZA. Lo que puede romper algo o salir hacia fuera no se
 *     EJECUTA hasta que el dueño lo aprueba con un clic en el panel, viendo
 *     exactamente qué se va a correr. No es una lista de cosas que ULTRON no
 *     sabe hacer: es una lista de cosas que hace CON el dueño delante.
 *
 * ── CUATRO NIVELES ──────────────────────────────────────────────────────────
 *
 *   leer       mirar: el estado, el saber, una página, el repositorio.
 *   escribir   dejar rastro dentro de la casa: una memoria, un pendiente,
 *              un documento. Reversible y de puertas adentro.
 *   peligroso  puede romper algo o cuesta dinero: un comando en la terminal,
 *              un cambio propuesto al repositorio, desplegarse, aplicar un
 *              secreto en producción. SIEMPRE con autorización del dueño,
 *              aunque lo pida el propio dueño —el clic en el panel es la
 *              segunda firma, y protege contra un modelo que actúe «en su
 *              nombre» por una instrucción colada en un documento—.
 *   fuera      sale de la casa: un mensaje a un teléfono, un correo. Igual.
 *
 * ── TRES ROLES ──────────────────────────────────────────────────────────────
 *
 *   dueño   José. ULTRON_DUENO, o el miembro con rol «presidente», o el
 *           primero de la junta. Es el único que aprueba.
 *   junta   los demás miembros: leen y escriben; lo peligroso lo piden.
 *   bot     los del equipo: leen, y solo escriben memorias y pendientes.
 *           Nunca piden nada peligroso —si un bot cree que hace falta, lo
 *           anota como pendiente y una persona decide—.
 *
 * ── UN PEDIDO ES UNA SOLA COSA, UNA SOLA VEZ ────────────────────────────────
 *
 * La autorización va atada a la HUELLA exacta de lo que se pidió: la
 * herramienta y su entrada, byte por byte. Aprobar «terminal: npm audit» no
 * aprueba «terminal: rm -rf». Se usa una vez y vence a la media hora: una
 * aprobación que queda viva para siempre es una puerta abierta.
 */

const { createHash } = require('node:crypto');
const mongoose = require('mongoose');
const { Schema } = mongoose;

const NIVELES = ['leer', 'escribir', 'peligroso', 'fuera'];

/* El nivel de cada herramienta. Lo que no está aquí es de lectura, que es lo
   más frecuente y lo menos delicado. Cuando se añade una herramienta que
   escribe o rompe, SU NIVEL SE DECLARA AQUÍ o no se ejecuta: la omisión da
   lectura, y una herramienta peligrosa con nivel de lectura es exactamente el
   fallo que esta tabla existe para impedir. Por eso la lista de peligrosas se
   comprueba también al arrancar, contra el catálogo. */
const NIVEL_DE = {
  // escribir
  recordar: 'escribir', olvidar: 'escribir', anotar_pendiente: 'escribir', cerrar_pendiente: 'escribir',
  crear_documento: 'escribir', aprender: 'escribir', habilidad_crear: 'escribir',
  /* El médico se cura solo: reconectar la base, relevar el cerebro, rearrancar el
     vigía. Todo interno y reversible — pedirle permiso al dueño para que ULTRON
     no se quede mudo sería justo la manera de que se quede mudo. */
  salud_reparar: 'escribir',
  // peligroso
  terminal: 'peligroso', repo_proponer_cambio: 'peligroso', desplegarse: 'peligroso',
  boveda_aplicar: 'peligroso', habilidad_publicar: 'peligroso', equipo_correr: 'peligroso',
  heroku_reiniciar: 'peligroso', nodo_comando: 'peligroso',
  /* fuera: un aviso a la junta pedido por una persona sale de la casa y pasa
     por el clic del dueño. Los avisos AUTOMÁTICOS (casa caída, salud) no son
     una herramienta: salen por lib/avisos.js según ULTRON_AVISOS. */
  avisar_junta: 'fuera',
  /* `proponer_envio` no es «fuera»: `proponer_envio` no manda: PREPARA el mensaje y
     la persona lo confirma en el panel, que ya es la autorización — ponerle
     un segundo clic encima era pedir permiso dos veces para lo mismo, y rompía
     el flujo que la consola tenía desde el principio. El nivel queda definido
     para el día que exista una herramienta que mande sola. */
};

/* Lo que un bot puede hacer por su cuenta: leer, y dejar dos rastros de
   puertas adentro. Nada más. */
const BOT_ESCRIBE = new Set(['recordar', 'anotar_pendiente']);

const VENCE_MS = 30 * 60 * 1000;

const nivelDe = (herramienta) => NIVEL_DE[herramienta] || 'leer';

function dueñoDe(junta = []) {
  const fijo = (process.env.ULTRON_DUENO || '').trim().toLowerCase();
  if (fijo) return fijo;
  const pres = junta.find((m) => /presidente|dueñ|owner/i.test(String(m.rol || '')));
  return (pres || junta[0] || {}).correo || null;
}

function rolDe(actor, junta = []) {
  if (!actor) return 'nadie';
  if (actor.rol === 'bot' || String(actor.correo || '').startsWith('bot:')) return 'bot';
  const d = dueñoDe(junta);
  if (d && String(actor.correo || '').toLowerCase() === d) return 'dueño';
  return 'junta';
}

/**
 * ¿Puede este actor correr esta herramienta AHORA, sin más?
 * Devuelve { ok } o { ok:false, nivel, rol, motivo, autorizable }.
 * `autorizable` dice si un pedido al dueño lo destrabaría.
 */
function puede(actor, herramienta, junta = []) {
  const nivel = nivelDe(herramienta);
  const rol = rolDe(actor, junta);
  if (nivel === 'leer') return { ok: true, nivel, rol };
  if (rol === 'bot') {
    if (nivel === 'escribir' && BOT_ESCRIBE.has(herramienta)) return { ok: true, nivel, rol };
    return { ok: false, nivel, rol, autorizable: false,
      motivo: `Un bot del equipo no ${nivel === 'escribir' ? 'escribe' : 'hace'} eso por su cuenta: lo anota como pendiente y una persona decide.` };
  }
  if (nivel === 'escribir') return { ok: true, nivel, rol };
  // peligroso o fuera: hace falta un pedido aprobado por el dueño, sea quien sea quien lo pide.
  return { ok: false, nivel, rol, autorizable: true,
    motivo: `«${herramienta}» es ${nivel === 'fuera' ? 'una acción hacia fuera' : 'una acción peligrosa'}: la aprueba el dueño en el panel antes de correr.` };
}

// ── Los pedidos ─────────────────────────────────────────────────────────────

const pedidoSchema = new Schema({
  herramienta: { type: String, required: true, index: true },
  entrada: { type: Schema.Types.Mixed, default: {} },
  huella: { type: String, required: true, index: true },
  resumen: { type: String, maxlength: 400 },      // lo que se va a hacer, para leerlo de un vistazo
  motivo: { type: String, maxlength: 600 },       // por qué ULTRON lo pide
  pedidoPor: { type: String, index: true },
  estado: { type: String, enum: ['pendiente', 'aprobado', 'negado', 'usado', 'vencido'], default: 'pendiente', index: true },
  resueltoPor: String, resueltoEn: Date, venceEn: Date, usadoEn: Date,
}, { timestamps: { createdAt: 'en', updatedAt: 'tocado' } });

const Pedido = mongoose.models.Pedido || mongoose.model('Pedido', pedidoSchema);
const provisional = [];
const conMongo = () => mongoose.connection.readyState === 1;
const idNuevo = () => new mongoose.Types.ObjectId().toString();

/* La huella: la herramienta y la entrada con las claves ORDENADAS, para que
   {a:1,b:2} y {b:2,a:1} sean el mismo pedido y no dos. */
function huellaDe(herramienta, entrada) {
  const ordenar = (x) => (x && typeof x === 'object' && !Array.isArray(x))
    ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, ordenar(x[k])]))
    : Array.isArray(x) ? x.map(ordenar) : x;
  return createHash('sha256').update(`${herramienta}\n${JSON.stringify(ordenar(entrada || {}))}`).digest('hex');
}

function resumir(herramienta, entrada) {
  const e = entrada || {};
  switch (herramienta) {
    case 'terminal': return `Correr en la terminal: ${e.comando || e.cmd || '?'}`;
    case 'repo_proponer_cambio': return `Proponer un cambio en ${e.repo || 'el repositorio'}: ${e.titulo || (e.archivos || []).map((a) => a.ruta).join(', ') || '?'}`;
    case 'desplegarse': return `Desplegar ULTRON desde la rama ${e.rama || '(la actual)'}`;
    case 'boveda_aplicar': return `Poner el secreto «${e.nombre}» en la app ${e.app || '?'} como ${e.variable || e.nombre}`;
    case 'habilidad_publicar': return `Publicar la habilidad «${e.nombre}» en el repositorio`;
    case 'equipo_correr': return `Correr al bot «${e.bot}» ahora`;
    case 'proponer_envio': return `Mandar un mensaje a ${e.a || e.destino || '?'}`;
    case 'heroku_reiniciar': return `Reiniciar los dynos de ${e.app || '?'} en Heroku`;
    case 'nodo_comando': return `Correr en el nodo ${e.nodo || '?'}: ${e.comando || '?'}`;
    default: return `${herramienta} ${JSON.stringify(e).slice(0, 200)}`;
  }
}

/** Pide autorización. Si ya hay un pedido pendiente idéntico, devuelve ese. */
async function pedir({ actor, herramienta, entrada = {}, motivo = '' }) {
  const huella = huellaDe(herramienta, entrada);
  const ya = await buscar({ huella, estados: ['pendiente', 'aprobado'] });
  if (ya) return { ...ya, repetido: true };
  const doc = {
    herramienta, entrada, huella, resumen: resumir(herramienta, entrada).slice(0, 400),
    motivo: String(motivo || '').slice(0, 600), pedidoPor: actor?.correo || 'desconocido', estado: 'pendiente',
  };
  if (conMongo()) return (await Pedido.create(doc)).toObject();
  const p = { _id: idNuevo(), ...doc, en: new Date() };
  provisional.unshift(p);
  return p;
}

async function buscar({ huella, estados }) {
  const ahora = Date.now();
  const vale = (p) => estados.includes(p.estado) && !(p.estado === 'aprobado' && p.venceEn && new Date(p.venceEn).getTime() < ahora);
  if (conMongo()) {
    const l = await Pedido.find({ huella, estado: { $in: estados } }).sort({ en: -1 }).limit(5).lean();
    return l.find(vale) || null;
  }
  return provisional.find((p) => p.huella === huella && vale(p)) || null;
}

/**
 * ¿Hay una aprobación vigente para correr exactamente esto? Si la hay, se
 * CONSUME —una sola vez— y se devuelve. Si no, null.
 */
async function consumirAprobacion(herramienta, entrada = {}) {
  const huella = huellaDe(herramienta, entrada);
  const p = await buscar({ huella, estados: ['aprobado'] });
  if (!p) return null;
  const cambio = { estado: 'usado', usadoEn: new Date() };
  if (conMongo()) await Pedido.updateOne({ _id: p._id, estado: 'aprobado' }, cambio);
  else Object.assign(p, cambio);
  return { ...p, ...cambio };
}

/** El dueño decide. `decision`: 'aprobado' | 'negado'. */
async function resolver(id, { por, decision }) {
  if (!['aprobado', 'negado'].includes(decision)) throw Object.assign(new Error('La decisión es aprobado o negado.'), { codigo: 'DECISION' });
  const cambio = { estado: decision, resueltoPor: por, resueltoEn: new Date(), venceEn: decision === 'aprobado' ? new Date(Date.now() + VENCE_MS) : null };
  if (conMongo()) {
    const r = await Pedido.findOneAndUpdate({ _id: id, estado: 'pendiente' }, cambio, { new: true }).lean();
    return r ? { ...r, _id: String(r._id) } : null;
  }
  const p = provisional.find((x) => String(x._id) === String(id) && x.estado === 'pendiente');
  if (!p) return null;
  Object.assign(p, cambio);
  return p;
}

async function lista({ estado = null, limite = 40 } = {}) {
  const q = estado ? { estado } : {};
  if (conMongo()) return (await Pedido.find(q).sort({ en: -1 }).limit(limite).lean()).map((p) => ({ ...p, _id: String(p._id) }));
  return provisional.filter((p) => !estado || p.estado === estado).slice(0, limite);
}

const pendientes = () => lista({ estado: 'pendiente' });

/* Al arrancar: cada herramienta del catálogo que suene a peligrosa tiene que
   estar declarada. Se comprueba por nombre —terminal, desplegar, aplicar,
   publicar, correr— porque la omisión aquí es silenciosa y la más cara. */
function comprobarCatalogo(nombres = []) {
  const sospechosas = nombres.filter((n) => /terminal|desplegar|aplicar|publicar|proponer_cambio|equipo_correr|borrar|rotar|reiniciar|_comando|avisar_/.test(n) && nivelDe(n) === 'leer');
  if (sospechosas.length) throw new Error(`[permisos] herramientas sin nivel declarado: ${sospechosas.join(', ')}`);
  return true;
}

module.exports = {
  NIVELES, NIVEL_DE, nivelDe, dueñoDe, rolDe, puede, pedir, consumirAprobacion, resolver, lista, pendientes,
  huellaDe, resumir, comprobarCatalogo, VENCE_MS, _adentro: { provisional, Pedido },
};
