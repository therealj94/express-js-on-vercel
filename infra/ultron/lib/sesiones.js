/* LAS SESIONES: dónde está abierto ULTRON, y poder cerrarlo desde lejos.
 *
 * ── LO QUE FALTABA ──────────────────────────────────────────────────────────
 * La cookie de ULTRON iba firmada con el correo y la fecha de vencimiento, y
 * nada más. Eso tiene dos agujeros que se ven enseguida cuando alguien
 * pregunta lo que preguntó José —«¿dónde he iniciado sesión?»—:
 *
 *   1. NADIE SABÍA. No quedaba registro de una entrada: ni cuándo, ni desde
 *      qué aparato, ni desde qué IP. Si alguien entrara con la clave de José
 *      desde otro país, no habría manera de enterarse ni después.
 *   2. NO SE PODÍA CERRAR. Una cookie firmada vale hasta que vence, doce
 *      horas, y no hay forma de retirarla. Perder el teléfono desbloqueado era
 *      perder ULTRON hasta el día siguiente.
 *
 * Ahora cada entrada abre una SESIÓN con su id, el id viaja dentro de la
 * cookie, y la puerta comprueba en cada petición que esa sesión sigue viva. Se
 * puede cerrar una, o todas las demás, desde Ajustes.
 *
 * ── POR QUÉ UN CONJUNTO EN MEMORIA Y NO UNA CONSULTA ────────────────────────
 * Comprobar la sesión pasa en CADA petición —el tablero hace cinco cada treinta
 * segundos—. Una lectura a Mongo por petición es un viaje de red para decir
 * «sí» el 99,99 % de las veces. Se guarda en Mongo lo que hay que recordar
 * entre reinicios, y en memoria vive solo el conjunto de las CERRADAS, que se
 * carga al arrancar. Comprobar es mirar un `Set`.
 *
 * Esto vale porque ULTRON corre en UN dyno. El día que sean dos, cerrar una
 * sesión en uno no la cerraría en el otro hasta el siguiente reinicio, y
 * entonces esto tiene que pasar a una consulta con caché corta. Queda dicho.
 */

const { randomUUID } = require('node:crypto');
const mongoose = require('mongoose');
const { Schema } = mongoose;

const sesionSchema = new Schema({
  sid: { type: String, required: true, unique: true, index: true },
  correo: { type: String, required: true, index: true },
  abierta: { type: Date, default: Date.now },
  ultimoVisto: { type: Date, default: Date.now },
  vence: Date,
  cerrada: { type: Date, default: null },
  cerradaPor: String,
  como: String,                       // clave | genesis
  ip: String,
  agente: String,                     // el navegador, recortado
  aparato: String,                    // lo que se puede decir del agente en una línea
}, { versionKey: false });
const Sesion = mongoose.models.Sesion || mongoose.model('Sesion', sesionSchema);

const conMongo = () => mongoose.connection.readyState === 1;
const provisional = new Map();        // sid → doc, cuando no hay Mongo
const cerradas = new Set();           // sid de las que ya no valen
let ultimoToque = new Map();          // sid → cuándo se apuntó el «visto» por última vez

/* Del `user-agent`, una línea que una persona reconozca. No se intenta
   adivinar el modelo exacto: «iPad · Safari» es lo que hace falta para decir
   «ese soy yo» o «ese no soy yo». */
function aparatoDe(ua = '') {
  const s = String(ua);
  const so = /iPad/i.test(s) ? 'iPad'
    : /iPhone/i.test(s) ? 'iPhone'
      : /Android/i.test(s) ? 'Android'
        : /Macintosh|Mac OS X/i.test(s) ? 'Mac'
          : /Windows/i.test(s) ? 'Windows'
            : /Linux/i.test(s) ? 'Linux' : 'aparato desconocido';
  const nav = /Edg\//i.test(s) ? 'Edge'
    : /OPR\//i.test(s) ? 'Opera'
      : /Chrome\//i.test(s) ? 'Chrome'
        : /Firefox\//i.test(s) ? 'Firefox'
          : /Safari\//i.test(s) ? 'Safari' : 'navegador desconocido';
  return `${so} · ${nav}`;
}

/* La IP de verdad detrás del enrutador de Heroku. Se guarda SOLO la IP, nunca
   una geolocalización: no se compra un servicio de terceros para decirle a
   José una ciudad aproximada que además suele estar mal. */
function ipDe(req) {
  const x = String(req.get('x-forwarded-for') || '').split(',')[0].trim();
  return (x || req.ip || '').replace(/^::ffff:/, '').slice(0, 45);
}

/** Abre una sesión y devuelve su id, que va dentro de la cookie. */
async function abrir({ correo, req, como = 'clave', vence }) {
  const sid = randomUUID();
  const doc = {
    sid, correo, abierta: new Date(), ultimoVisto: new Date(), vence: new Date(vence),
    como, ip: ipDe(req), agente: String(req.get('user-agent') || '').slice(0, 200), aparato: aparatoDe(req.get('user-agent')),
  };
  if (conMongo()) { try { await Sesion.create(doc); } catch (e) { console.warn('[sesiones] no se pudo guardar:', e.message); } }
  provisional.set(sid, doc);
  return sid;
}

/** ¿Sigue viva? Es la comprobación que corre en CADA petición: barata a propósito. */
function vive(sid) { return !!sid && !cerradas.has(sid); }

/** Se apunta que se vio, como mucho una vez cada cinco minutos por sesión. */
function tocar(sid) {
  if (!sid) return;
  const antes = ultimoToque.get(sid) || 0;
  if (Date.now() - antes < 5 * 60_000) return;
  ultimoToque.set(sid, Date.now());
  const p = provisional.get(sid); if (p) p.ultimoVisto = new Date();
  if (conMongo()) Sesion.updateOne({ sid }, { ultimoVisto: new Date() }).catch(() => {});
}

async function listar(correo) {
  let l;
  if (conMongo()) {
    try { l = await Sesion.find({ correo }).sort({ abierta: -1 }).limit(40).lean(); }
    catch { l = [...provisional.values()].filter((s) => s.correo === correo); }
  } else l = [...provisional.values()].filter((s) => s.correo === correo);
  const ahora = Date.now();
  return l.map((s) => ({
    sid: s.sid, abierta: s.abierta, ultimoVisto: s.ultimoVisto, aparato: s.aparato, ip: s.ip, como: s.como,
    /* Una sesión está viva si no se cerró y no venció. Las vencidas se enseñan
       igual —son el historial de entradas, que es justo lo que se pide cuando
       se pregunta «dónde he iniciado sesión»— pero marcadas. */
    viva: !cerradas.has(s.sid) && !s.cerrada && (!s.vence || +new Date(s.vence) > ahora),
    cerrada: s.cerrada || null,
  })).sort((a, b) => (b.viva - a.viva) || (+new Date(b.ultimoVisto) - +new Date(a.ultimoVisto)));
}

async function cerrar(sid, { por = 'la persona' } = {}) {
  if (!sid) return false;
  cerradas.add(sid);
  const p = provisional.get(sid); if (p) { p.cerrada = new Date(); p.cerradaPor = por; }
  if (conMongo()) { try { await Sesion.updateOne({ sid }, { cerrada: new Date(), cerradaPor: por }); } catch { /* queda cerrada en memoria */ } }
  return true;
}

/** Cierra todas las de este correo menos la que se está usando. */
async function cerrarOtras(correo, sidActual, { por = 'la persona' } = {}) {
  const l = await listar(correo);
  let n = 0;
  for (const s of l) if (s.viva && s.sid !== sidActual) { await cerrar(s.sid, { por }); n++; }
  return n;
}

/* Al arrancar se traen las cerradas: sin esto, un reinicio del dyno resucitaba
   todas las sesiones que alguien había cerrado a propósito — que es exactamente
   lo contrario de lo que pidió al cerrarlas. */
async function cargar() {
  if (!conMongo()) return 0;
  try {
    const l = await Sesion.find({ cerrada: { $ne: null } }, { sid: 1 }).lean();
    for (const s of l) cerradas.add(s.sid);
    /* Y las vencidas viejas se limpian: una sesión de hace un mes no le dice
       nada a nadie y engorda la lista. */
    await Sesion.deleteMany({ abierta: { $lt: new Date(Date.now() - 90 * 86400_000) } });
    return cerradas.size;
  } catch (e) { console.warn('[sesiones] no se pudieron cargar las cerradas:', e.message); return 0; }
}

module.exports = { abrir, vive, tocar, listar, cerrar, cerrarOtras, cargar, aparatoDe, _adentro: { Sesion, provisional, cerradas } };
