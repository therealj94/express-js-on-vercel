/* LA SALUD DE ULTRON — el que se mira a sí mismo.
 *
 * ── LA PREGUNTA QUE ESTO CONTESTA ───────────────────────────────────────────
 * El vigía mira las seis casas. Nadie miraba a ULTRON. Si el nodo de la tarjeta
 * se apaga, si la memoria se llena, si Mongo se cae, si el bucle de eventos se
 * atasca: ULTRON deja de servir y el primero en enterarse es José, escribiendo
 * y sin respuesta. Eso es exactamente al revés de como tiene que ser.
 *
 * Aquí se mide a sí mismo cada pocos minutos, se pone una nota, y —esto es lo
 * importante— ARREGLA SOLO lo que se puede arreglar sin riesgo.
 *
 * ── QUÉ SE ARREGLA SOLO Y QUÉ NO ────────────────────────────────────────────
 * La regla: se repara solo lo que es reversible, interno y no toca ni dinero ni
 * nada fuera de la casa. Volver a conectar Mongo, relevar el cerebro cuando el
 * nodo no contesta, rearrancar el vigía o el equipo, soltar cachés, cerrar
 * pedidos vencidos. Todo eso se hace sin preguntar, porque no hacerlo deja a
 * ULTRON mudo y preguntar tarda horas.
 *
 * Lo que NO se hace solo: reiniciar el dyno (corta lo que esté en marcha),
 * borrar archivos, rotar secretos, tocar variables de producción. Eso se anota
 * como pendiente y lo decide una persona.
 *
 * ── EL RELEVO DEL CEREBRO ───────────────────────────────────────────────────
 * El fallo más caro que tenía la casa: `cerebro.cual()` elegía el nodo con solo
 * mirar si las variables estaban puestas —no si el nodo CONTESTABA—. Con la
 * tarjeta apagada, ULTRON quedaba mudo aunque la llave de Anthropic estuviera
 * ahí al lado, sin usar. Ahora el propio cerebro se releva (ver cerebro.js) y
 * aquí se vigila ese relevo: cuánto lleva, por qué, y cuándo se vuelve al nodo.
 *
 * ── LA NOTA ─────────────────────────────────────────────────────────────────
 * Cada signo vale un peso. La nota es 0-100 y NO es decorativa: por debajo de
 * 60 el médico interviene. Un signo en «mal» que se puede arreglar solo nunca
 * dura más de una ronda.
 */

const mongoose = require('mongoose');
const { Schema } = mongoose;

const memoria = require('./memoria');
const permisos = require('./permisos');
const vigia = require('./vigia');
const equipo = require('./equipo');

/* ── LO QUE SE GUARDA ────────────────────────────────────────────────────────
   Una ronda por registro, con la nota y los hallazgos. Va a Mongo porque el
   dyno de Heroku se recicla todos los días: lo que viva en memoria del proceso
   se pierde cada 24 h, y entonces «lleva tres días con la memoria subiendo» no
   se puede decir nunca. */
const rondaSchema = new Schema({
  cuando: { type: Date, default: Date.now, index: true },
  puntaje: Number,
  estado: String,                       // bien | ojo | mal
  signos: { type: Schema.Types.Mixed, default: [] },
  reparado: { type: [String], default: [] },
  arranque: Date,                       // desde cuándo vive este proceso
}, { versionKey: false });
rondaSchema.index({ cuando: -1 });
const Ronda = mongoose.models.Ronda || mongoose.model('Ronda', rondaSchema);

const conMongo = () => mongoose.connection.readyState === 1;
const rondasProvisionales = [];         // sin Mongo, las últimas 40 en el aire

/* ── EL MEDIDOR DEL BUCLE DE EVENTOS ─────────────────────────────────────────
   Node es de un solo hilo: si algo lo bloquea —un JSON gigante, un bucle, una
   librería sincrónica— TODO se para, incluidas las respuestas a José. El
   síntoma que ve él es «ULTRON va lentísimo» y en el registro no aparece nada,
   porque no es un error: es el hilo ocupado.
   Se mide el retraso de un temporizador de 500 ms. Si el hilo está libre, el
   retraso es de un par de milisegundos. Si pasa de 200 ms hay algo que bloquea. */
const RETRASOS = [];
const RETRASOS_MAX = 120;               // una hora de muestras
let relojBucle = null, arranque = new Date();

function medirBucle() {
  let esperado = Date.now() + 500;
  relojBucle = setInterval(() => {
    const ahora = Date.now();
    const retraso = Math.max(0, ahora - esperado);
    esperado = ahora + 500;
    RETRASOS.push(retraso);
    if (RETRASOS.length > RETRASOS_MAX) RETRASOS.shift();
  }, 500);
  relojBucle.unref?.();
}
function retrasoP95() {
  if (!RETRASOS.length) return 0;
  const o = [...RETRASOS].sort((a, b) => a - b);
  return o[Math.min(o.length - 1, Math.floor(o.length * 0.95))];
}

/* ── EL LIBRO DE FALLOS ──────────────────────────────────────────────────────
   Los errores que hasta hoy solo salían por `console.error` y se perdían en el
   registro de Heroku a los siete días. Aquí se cuentan y se agrupan: veinte
   veces el mismo error es un problema; una vez es la vida. */
const FALLOS = [];
const FALLOS_MAX = 60;
function anotarFallo(e, donde = 'sin sitio') {
  const mensaje = String(e?.message || e || '').slice(0, 200);
  const previo = FALLOS.find((f) => f.mensaje === mensaje && f.donde === donde);
  if (previo) { previo.veces++; previo.ultimo = new Date(); return; }
  FALLOS.push({ mensaje, donde, veces: 1, primero: new Date(), ultimo: new Date() });
  if (FALLOS.length > FALLOS_MAX) FALLOS.shift();
}
function fallosRecientes(minutos = 60) {
  const desde = Date.now() - minutos * 60_000;
  return FALLOS.filter((f) => +f.ultimo >= desde);
}

/* ── LOS LÍMITES ─────────────────────────────────────────────────────────────
   El dyno Basic de Heroku da 512 MB. Pasando de 512 el dyno empieza a tirar a
   disco (R14) y todo se arrastra; pasando mucho, Heroku lo mata (R15). Por eso
   el aviso empieza en el 72 %: hay que enterarse ANTES de que duela. */
const RAM_MB = Number(process.env.ULTRON_RAM_MB || 512);
const LIMITES = {
  ramOjo: 0.72, ramMal: 0.88,
  bucleOjo: 120, bucleMal: 400,          // ms de retraso p95
  mongoOjo: 400, mongoMal: 1500,         // ms de ping
  cerebroOjo: 6000,                      // ms en contestar la salud del nodo
};

const mb = (b) => Math.round(b / 1048576);
const pesos = { proceso: 18, bucle: 14, base: 18, cerebro: 26, vigia: 6, equipo: 6, puerta: 4, pedidos: 4, fallos: 4 };

const CORTO = { proceso: 'Memoria', bucle: 'Bucle', base: 'Base', cerebro: 'Cerebro', vigia: 'Vigía',
  equipo: 'Equipo', puerta: 'Puerta', pedidos: 'Permisos', fallos: 'Fallos (1 h)' };

/* `que` es el nombre entero, que va al parte del médico y a la herramienta;
   `corto` es el que cabe en la columna del tablero. Son dos sitios con dos
   anchos, y forzar uno solo estropea el otro. */
function signo(clave, que, estado, dato, detalle, arreglo = null) {
  return { clave, que, corto: CORTO[clave] || que, estado, dato, detalle, arreglo };
}

/* ── LA REVISIÓN ─────────────────────────────────────────────────────────────
   Todo lo que se puede medir sin molestar a nadie. Las lecturas que salen de la
   casa (el nodo) llevan su propio plazo: una revisión de salud que se cuelga es
   peor que no revisar. */
async function revisar({ hondo = true } = {}) {
  const cerebro = require('./cerebro');     // tarde, para no enredar los requires
  const signos = [];

  /* 1 · el proceso */
  const m = process.memoryUsage();
  const usoRam = m.rss / (RAM_MB * 1048576);
  signos.push(signo('proceso', 'Memoria del proceso',
    usoRam >= LIMITES.ramMal ? 'mal' : usoRam >= LIMITES.ramOjo ? 'ojo' : 'bien',
    `${mb(m.rss)}/${RAM_MB} MB · ${Math.round(usoRam * 100)} %`,
    `montón ${mb(m.heapUsed)}/${mb(m.heapTotal)} MB · en pie desde hace ${duracion(Date.now() - +arranque)}`,
    usoRam >= LIMITES.ramOjo ? 'soltar_cache' : null));

  /* 2 · el bucle de eventos */
  const p95 = retrasoP95();
  signos.push(signo('bucle', 'Bucle de eventos',
    p95 >= LIMITES.bucleMal ? 'mal' : p95 >= LIMITES.bucleOjo ? 'ojo' : 'bien',
    `${p95} ms`,
    p95 >= LIMITES.bucleOjo ? 'Algo bloquea el hilo: todo el sistema responde tarde.' : 'El hilo va libre.'));

  /* 3 · la base */
  let base;
  if (mongoose.connection.readyState === 1) {
    const t0 = Date.now();
    try {
      await Promise.race([
        mongoose.connection.db.admin().ping(),
        new Promise((_, no) => setTimeout(() => no(new Error('el ping no volvió en 4 s')), 4000)),
      ]);
      const ms = Date.now() - t0;
      base = signo('base', 'Base de datos (Mongo)', ms >= LIMITES.mongoMal ? 'mal' : ms >= LIMITES.mongoOjo ? 'ojo' : 'bien',
        `${ms} ms`, `base «${mongoose.connection.name}» · el ping tardó ${ms} ms`);
    } catch (e) {
      base = signo('base', 'Base de datos (Mongo)', 'mal', 'conectada pero no contesta', e.message, 'reconectar_base');
    }
  } else {
    base = signo('base', 'Base de datos (Mongo)', 'mal', 'sin conexión',
      'Todo lo que se recuerda vive solo en el aire: memorias, pendientes, partes y pedidos se pierden al reiniciar.', 'reconectar_base');
  }
  signos.push(base);

  /* 4 · el cerebro — el signo que más pesa, porque sin cerebro no hay ULTRON */
  const cual = cerebro.cual();
  const relevo = cerebro.relevo ? cerebro.relevo() : null;
  const hayRespaldo = !!(process.env.ANTHROPIC_API_KEY || '').trim();
  if (cual === 'nodo' && hondo) {
    const t0 = Date.now();
    const s = await Promise.race([
      cerebro.nodo.salud().catch((e) => ({ vivo: false, porQue: e.message })),
      new Promise((ok) => setTimeout(() => ok({ vivo: false, porQue: 'no contestó en 9 s' }), 9000)),
    ]);
    const ms = Date.now() - t0;
    signos.push(s.vivo
      ? signo('cerebro', 'Cerebro (nodo propio)', ms >= LIMITES.cerebroOjo ? 'ojo' : 'bien',
        `nodo · ${ms} ms`,
        hayRespaldo ? 'Con relevo a Claude si el nodo cae.' : 'SIN RELEVO: si el nodo cae, ULTRON queda mudo. Falta ANTHROPIC_API_KEY.')
      : signo('cerebro', 'Cerebro (nodo propio)', hayRespaldo ? 'ojo' : 'mal',
        `el nodo no contesta — ${s.porQue || 'sin motivo'}`,
        hayRespaldo ? 'Claude toma el relevo automáticamente; ULTRON sigue contestando.' : 'ULTRON está MUDO: no hay nodo y no hay llave de Anthropic.',
        hayRespaldo ? 'relevar_cerebro' : null));
  } else {
    signos.push(signo('cerebro', `Cerebro (${cual})`, cerebro.encendido() ? 'bien' : 'mal',
      cerebro.modelo(),
      relevo?.activo ? `De relevo desde hace ${duracion(Date.now() - relevo.desde)} porque ${relevo.motivo}. Vuelve al nodo en ${duracion(relevo.hasta - Date.now())}.`
        : cerebro.encendido() ? 'En pie.' : 'Sin llave: ULTRON no puede pensar.'));
  }

  /* 5 · el vigía */
  const v = vigia.estado();
  const caidas = Object.entries(v.casas || {}).filter(([, c]) => c && c.viva === false).map(([k]) => k);
  const vueltaVieja = v.ultimaVuelta && (Date.now() - +new Date(v.ultimaVuelta)) > 5 * 60_000;
  signos.push(signo('vigia', 'Vigía de las casas',
    !v.encendido || vueltaVieja ? 'mal' : caidas.length ? 'ojo' : 'bien',
    !v.encendido ? 'parado' : vueltaVieja ? `sin vuelta hace ${duracion(Date.now() - +new Date(v.ultimaVuelta))}` : `${6 - caidas.length}/6 casas`,
    caidas.length ? `Caídas: ${caidas.join(', ')}.` : 'Todas las casas contestan.',
    (!v.encendido || vueltaVieja) ? 'rearrancar_vigia' : null));

  /* 6 · el equipo */
  const eq = equipo.estado();
  const atrasados = eq.bots.filter((b) => b.cada && b.ultimaVuelta && (Date.now() - +new Date(b.ultimaVuelta)) > b.cada * 3600_000 * 2).map((b) => b.nombre);
  signos.push(signo('equipo', 'Equipo de bots',
    !eq.encendido ? 'ojo' : atrasados.length ? 'ojo' : 'bien',
    eq.encendido ? `${eq.bots.length} bots · ${eq.vueltasHoy}/${eq.tope} hoy` : 'apagado',
    atrasados.length ? `Atrasados: ${atrasados.join(', ')}.` : eq.encendido ? 'Al día.' : 'ULTRON_EQUIPO no está en «on»: los bots solo corren a mano desde el panel.',
    atrasados.length ? 'rearrancar_equipo' : null));

  /* 7 · la puerta */
  const junta = (() => { try { return JSON.parse(process.env.ULTRON_JUNTA || '[]'); } catch { return []; } })();
  const conGid = junta.filter((j) => j.gid).length;
  signos.push(signo('puerta', 'La puerta',
    junta.length === 0 ? 'mal' : junta.length === 1 ? 'ojo' : 'bien',
    `${junta.length} en la junta · ${conGid} con GID`,
    junta.length === 1 ? 'Una junta de una persona es un punto único de fallo: si José pierde la clave, nadie entra.' : 'Con más de una llave.'));

  /* 8 · autorizaciones que nadie contestó
     Un pedido pendiente no caduca solo: el turno que lo pidió ya terminó hace
     rato, así que aprobarlo dos horas después no reanuda nada — solo deja una
     puerta abierta en el panel. Pasadas dos horas se dan por caídos. */
  const pend = await permisos.pendientes().catch(() => []);
  const OLVIDO_MS = permisos.VENCE_MS * 4;
  const olvidados = pend.filter((p) => Date.now() - +new Date(p.en || p.cuando || Date.now()) > OLVIDO_MS);
  signos.push(signo('pedidos', 'Autorizaciones esperando',
    olvidados.length ? 'ojo' : 'bien',
    `${pend.length} esperando${olvidados.length ? ` · ${olvidados.length} olvidada(s)` : ''}`,
    olvidados.length ? 'El turno que las pidió ya terminó: aprobarlas ahora no reanuda nada y dejan la puerta abierta.' : 'Ninguna olvidada.',
    olvidados.length ? 'cerrar_vencidos' : null));

  /* 9 · fallos repetidos */
  const fall = fallosRecientes(60);
  const peor = fall.slice().sort((a, b) => b.veces - a.veces)[0];
  signos.push(signo('fallos', 'Fallos de la última hora',
    peor && peor.veces >= 10 ? 'mal' : fall.length ? 'ojo' : 'bien',
    `${fall.reduce((s, f) => s + f.veces, 0)}`,
    peor ? `El que más se repite: «${peor.mensaje}» en ${peor.donde} (${peor.veces} veces).` : 'Sin fallos anotados.'));

  /* la nota */
  const nota = (e) => (e === 'bien' ? 1 : e === 'ojo' ? 0.5 : 0);
  const total = signos.reduce((s, g) => s + (pesos[g.clave] || 0), 0);
  const suma = signos.reduce((s, g) => s + (pesos[g.clave] || 0) * nota(g.estado), 0);
  const puntaje = Math.round((suma / total) * 100);
  const estado = puntaje >= 85 ? 'bien' : puntaje >= 60 ? 'ojo' : 'mal';

  return {
    cuando: new Date(), puntaje, estado, arranque,
    signos,
    arreglos: [...new Set(signos.filter((s) => s.arreglo).map((s) => s.arreglo))],
    resumen: resumir(puntaje, estado, signos),
  };
}

function resumir(puntaje, estado, signos) {
  const malos = signos.filter((s) => s.estado === 'mal');
  const ojo = signos.filter((s) => s.estado === 'ojo');
  if (!malos.length && !ojo.length) return `ULTRON ${puntaje}/100 · todo en orden.`;
  const partes = [];
  if (malos.length) partes.push(`mal: ${malos.map((s) => `${s.que} (${s.dato})`).join('; ')}`);
  if (ojo.length) partes.push(`ojo: ${ojo.map((s) => s.que).join(', ')}`);
  return `ULTRON ${puntaje}/100 — ${partes.join(' · ')}.`;
}

function duracion(ms) {
  if (ms < 0) ms = 0;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  const mn = Math.round(s / 60);
  if (mn < 60) return `${mn} min`;
  const h = Math.floor(mn / 60);
  return h < 48 ? `${h} h ${mn % 60} min` : `${Math.floor(h / 24)} días`;
}

/* ── LAS REPARACIONES ────────────────────────────────────────────────────────
   Cada arreglo dice qué hizo, en una línea que se pueda leer en el parte. Si un
   arreglo falla, se dice: una reparación que se cree hecha y no lo está es peor
   que no repararla. */
const ARREGLOS = {
  async soltar_cache() {
    const antes = process.memoryUsage().rss;
    try { require('./operaciones')._adentro?.olvidarNodos?.(); } catch { /* sin caché que soltar */ }
    try { require('./saber').soltarCache?.(); } catch { /* idem */ }
    if (typeof global.gc === 'function') global.gc();
    const despues = process.memoryUsage().rss;
    return `cachés soltadas · ${mb(antes)} → ${mb(despues)} MB`;
  },
  async reconectar_base() {
    if (mongoose.connection.readyState === 1) return 'la base ya estaba conectada';
    await memoria.conectar();
    return mongoose.connection.readyState === 1 ? 'base reconectada' : 'la base sigue sin conectar';
  },
  async relevar_cerebro() {
    const cerebro = require('./cerebro');
    if (!cerebro.relevar) return 'este cerebro no sabe relevarse';
    const r = cerebro.relevar('el médico vio el nodo mudo');
    return r ? 'cerebro relevado a Claude; se vuelve al nodo solo cuando conteste' : 'no hay a quién relevar (falta ANTHROPIC_API_KEY)';
  },
  async rearrancar_vigia() {
    vigia.parar(); vigia.arrancar();
    return 'vigía rearrancado';
  },
  async rearrancar_equipo() {
    const cerebro = require('./cerebro');
    const junta = (() => { try { return JSON.parse(process.env.ULTRON_JUNTA || '[]'); } catch { return []; } })();
    equipo.parar();
    const ok = equipo.arrancar({ pensar: cerebro.pensar, junta });
    return ok ? 'equipo rearrancado' : 'el equipo está apagado a propósito (ULTRON_EQUIPO)';
  },
  async cerrar_vencidos() {
    const pend = await permisos.pendientes().catch(() => []);
    const olvidados = pend.filter((p) => Date.now() - +new Date(p.en || p.cuando || Date.now()) > permisos.VENCE_MS * 4);
    let n = 0;
    for (const p of olvidados) {
      try { if (await permisos.resolver(String(p._id), { por: 'el médico (sin contestar en 2 h)', decision: 'negado' })) n++; }
      catch { /* alguien la contestó entre medias */ }
    }
    return `${n} autorización(es) olvidada(s) cerrada(s)`;
  },
};

async function reparar(cuales = null) {
  const revision = await revisar({ hondo: true });
  const pedidos = cuales && cuales.length ? cuales.filter((c) => ARREGLOS[c]) : revision.arreglos;
  const hechos = [];
  for (const c of pedidos) {
    try { hechos.push(`${c}: ${await ARREGLOS[c]()}`); }
    catch (e) { hechos.push(`${c}: NO se pudo — ${e.message}`); anotarFallo(e, `salud/${c}`); }
  }
  const despues = hechos.length ? await revisar({ hondo: true }) : revision;
  await guardar(despues, hechos);
  return { antes: revision.puntaje, despues: despues.puntaje, hechos, estado: despues.estado, resumen: despues.resumen };
}

async function guardar(revision, reparado = []) {
  const doc = { cuando: revision.cuando, puntaje: revision.puntaje, estado: revision.estado, arranque, reparado,
    signos: revision.signos.map((s) => ({ clave: s.clave, estado: s.estado, dato: s.dato })) };
  if (conMongo()) { try { await Ronda.create(doc); } catch (e) { anotarFallo(e, 'salud/guardar'); } }
  rondasProvisionales.unshift(doc);
  if (rondasProvisionales.length > 40) rondasProvisionales.pop();
}

async function historial({ limite = 24 } = {}) {
  if (conMongo()) {
    try { return (await Ronda.find().sort({ cuando: -1 }).limit(limite).lean()).map((r) => ({ ...r, id: String(r._id), _id: undefined })); }
    catch (e) { anotarFallo(e, 'salud/historial'); }
  }
  return rondasProvisionales.slice(0, limite);
}

/* ── LA RONDA SOLA ───────────────────────────────────────────────────────────
   Cada CADA_MS se revisa y —si la nota bajó de 60 o hay algo con arreglo
   conocido— se repara sin preguntar. Es lo que hace que ULTRON se mantenga en
   pie sin que nadie mire.
   La primera ronda espera 90 s: al arrancar, Mongo puede estar aún conectando y
   el nodo despertando, y un parte de «todo mal» a los dos segundos de vida no
   dice nada. */
const CADA_MS = Number(process.env.SALUD_CADA_MS || 5 * 60_000);
let reloj = null, ultima = null;

async function unaVuelta() {
  try {
    const r = await revisar({ hondo: true });
    if (r.arreglos.length) {
      const rep = await reparar(r.arreglos);
      ultima = { ...r, reparado: rep.hechos };
      console.log(`[salud] ${rep.antes} → ${rep.despues}/100 · reparado: ${rep.hechos.join(' | ')}`);
    } else {
      ultima = r;
      await guardar(r);
      if (r.estado !== 'bien') console.log(`[salud] ${r.resumen}`);
    }
    return ultima;
  } catch (e) { anotarFallo(e, 'salud/vuelta'); return null; }
}

function arrancar() {
  parar();
  arranque = new Date();
  medirBucle();
  const t = setTimeout(() => {
    unaVuelta();
    reloj = setInterval(unaVuelta, CADA_MS);
    reloj.unref?.();
  }, 90_000);
  t.unref?.();
  console.log(`[salud] mirándose a sí mismo cada ${Math.round(CADA_MS / 60000)} min · límite de memoria ${RAM_MB} MB`);
  return true;
}
function parar() {
  if (reloj) { clearInterval(reloj); reloj = null; }
  if (relojBucle) { clearInterval(relojBucle); relojBucle = null; }
}

module.exports = {
  arrancar, parar, revisar, reparar, historial, unaVuelta, anotarFallo,
  ultima: () => ultima,
  _adentro: { ARREGLOS, LIMITES, retrasoP95, fallosRecientes, duracion, resumir, FALLOS, RETRASOS },
};
