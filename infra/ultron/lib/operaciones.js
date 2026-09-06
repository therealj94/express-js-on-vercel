/* OPERACIONES: las manos de ULTRON sobre la infraestructura de la casa.
 *
 * José pidió «conectar con mis cosas». Las cosas son ocho apps en Heroku,
 * siete nodos de la cadena en AWS y cuatro bases de Mongo. Hasta hoy ULTRON
 * las miraba desde fuera (por sus rutas públicas). Esto le da la mano por
 * dentro, con la misma regla de siempre: leer pasa; lo que reinicia, ejecuta
 * o cambia, lo aprueba el dueño viendo exactamente qué.
 *
 *   heroku_apps        las apps, sus dynos y su último despliegue      leer
 *   heroku_registro    las últimas líneas del registro de una app       leer
 *   heroku_variables   los NOMBRES de las variables de una app (largo,  leer
 *                      nunca valor)
 *   heroku_reiniciar   reiniciar los dynos de una app                   peligroso
 *   nodo_comando       un comando en un nodo de la cadena, por SSM      peligroso
 *   mongo_consultar    leer una colección de una base de la casa        leer
 *                      (solo lectura, con los campos sensibles tapados)
 *
 * ── LAS LLAVES SALEN DE LA BÓVEDA ───────────────────────────────────────────
 * Heroku: HEROKU_API_KEY. AWS: AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY (del
 * entorno de ULTRON, que ya las tiene para mirar la nube). Mongo: la URI de
 * cada app se guarda en la bóveda como <APP>__MONGODB_URI y se usa sin que
 * ULTRON la vea. Ninguna de estas funciones devuelve una llave ni una URI.
 *
 * ── LOS NODOS SE NOMBRAN POR SU ETIQUETA ────────────────────────────────────
 * «node3», no «i-0d13f09e3fcce722a». Se resuelve leyendo la etiqueta Name en
 * EC2 en las dos regiones de la casa, y se guarda diez minutos. Si un nodo se
 * reemplaza, el nombre sigue valiendo.
 */

const mongoose = require('mongoose');
const boveda = require('./boveda');

const REGIONES = ['us-east-1', 'us-east-2'];
const APP_PROPIA = () => process.env.ULTRON_APP || 'ultron-fp';

// ── Heroku ──────────────────────────────────────────────────────────────────

async function conHeroku(fn) {
  if (process.env.HEROKU_API_KEY) return fn(process.env.HEROKU_API_KEY);
  try { return await boveda.usar('HEROKU_API_KEY', fn); } catch (e) {
    if (e.codigo === 'NO_EXISTE' || e.codigo === 'BOVEDA_APAGADA') throw Object.assign(new Error('No hay llave de Heroku en la bóveda (HEROKU_API_KEY).'), { codigo: 'SIN_HEROKU' });
    throw e;
  }
}
async function heroku(tk, ruta, { metodo = 'GET', cuerpo = null, rango = null } = {}) {
  const r = await fetch(`https://api.heroku.com${ruta}`, {
    method: metodo,
    headers: { Authorization: `Bearer ${tk}`, Accept: 'application/vnd.heroku+json; version=3', ...(cuerpo ? { 'Content-Type': 'application/json' } : {}), ...(rango ? { Range: rango } : {}) },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined, signal: AbortSignal.timeout(30_000),
  });
  const t = await r.text(); let d = null; try { d = JSON.parse(t); } catch { d = t; }
  if (!r.ok) throw Object.assign(new Error(`Heroku ${r.status} en ${ruta}: ${(d && d.message) || String(t).slice(0, 120)}`), { codigo: 'HEROKU', http: r.status });
  return d;
}
const appValida = (app) => { const a = String(app || '').trim(); if (!/^[a-z0-9-]{3,40}$/.test(a)) throw Object.assign(new Error('Nombre de app inválido.'), { codigo: 'APP' }); return a; };

async function herokuApps() {
  return conHeroku(async (tk) => {
    const apps = await heroku(tk, '/apps');
    const filas = await Promise.all(apps.map(async (a) => {
      let dynos = [], release = null;
      try { dynos = await heroku(tk, `/apps/${a.name}/dynos`); } catch { /* sin permiso o sin dynos */ }
      try { const r = await heroku(tk, `/apps/${a.name}/releases`, { rango: 'version ..; order=desc, max=1' }); release = r?.[0] || null; } catch { /* nada */ }
      const estados = dynos.map((d) => `${d.type}:${d.state}`).join(' ') || 'sin dynos';
      return `- ${a.name} · ${estados} · v${release?.version ?? '?'} ${release?.created_at ? release.created_at.slice(0, 16).replace('T', ' ') : ''}${release?.description ? ' · ' + release.description.slice(0, 50) : ''}`;
    }));
    return filas.join('\n');
  });
}

/* El registro: Heroku abre una sesión de logs y devuelve una URL de logplex
   que se lee una vez. Sin `tail`, es una foto de las últimas N líneas. */
async function herokuRegistro({ app, lineas = 120 }) {
  const a = appValida(app);
  const n = Math.max(20, Math.min(1500, Number(lineas) || 120));
  return conHeroku(async (tk) => {
    const s = await heroku(tk, `/apps/${a}/log-sessions`, { metodo: 'POST', cuerpo: { lines: n, tail: false } });
    const r = await fetch(s.logplex_url, { signal: AbortSignal.timeout(30_000) });
    const t = await r.text();
    /* Por si un registro trae una llave (pasa: alguien imprime el entorno). Se
       tapa lo que parezca un token antes de que llegue al modelo. */
    return tapar(t).split('\n').slice(-n).join('\n') || '(registro vacío)';
  });
}

async function herokuVariables({ app }) {
  const a = appValida(app);
  return conHeroku(async (tk) => {
    const d = await heroku(tk, `/apps/${a}/config-vars`);
    return Object.entries(d).sort().map(([k, v]) => `- ${k}: ${String(v).length} caracteres${String(v).length < 16 && /KEY|SECRET|PASS|TOKEN|CLAVE|SECRETO/i.test(k) ? ' (CORTO para ser un secreto)' : ''}`).join('\n') || '(sin variables)';
  });
}

async function herokuReiniciar({ app }) {
  const a = appValida(app);
  return conHeroku(async (tk) => {
    await heroku(tk, `/apps/${a}/dynos`, { metodo: 'DELETE' });
    return { ok: true, app: a, en: new Date().toISOString() };
  });
}

// ── Los nodos, por SSM ──────────────────────────────────────────────────────

let mapaNodos = { en: 0, nodos: [] };

/** Los nodos de la casa: nombre (etiqueta Name), id, región, estado. */
async function nodos({ fresco = false } = {}) {
  if (!fresco && Date.now() - mapaNodos.en < 10 * 60_000 && mapaNodos.nodos.length) return mapaNodos.nodos;
  const { EC2Client, DescribeInstancesCommand } = require('@aws-sdk/client-ec2');
  const lista = [];
  for (const region of REGIONES) {
    try {
      const r = await new EC2Client({ region }).send(new DescribeInstancesCommand({}));
      for (const res of r.Reservations || []) for (const i of res.Instances || []) {
        const nombre = (i.Tags || []).find((t) => t.Key === 'Name')?.Value || i.InstanceId;
        lista.push({ nombre, id: i.InstanceId, region, estado: i.State?.Name, tipo: i.InstanceType, ip: i.PublicIpAddress || null,
          corto: (/node\s*(\d+)/i.exec(nombre) || [])[1] ? `node${(/node\s*(\d+)/i.exec(nombre))[1]}` : null });
      }
    } catch (e) { lista.push({ nombre: `(${region}: no se pudo leer: ${String(e.message).slice(0, 60)})`, id: null, region, estado: 'desconocido' }); }
  }
  mapaNodos = { en: Date.now(), nodos: lista };
  return lista;
}

function resolverNodo(lista, pedido) {
  const p = String(pedido || '').trim().toLowerCase();
  return lista.find((n) => n.id === p) || lista.find((n) => n.corto === p) || lista.find((n) => n.corto === `node${p}`)
    || lista.find((n) => n.nombre.toLowerCase() === p) || lista.find((n) => n.nombre.toLowerCase().includes(p) && p.length >= 4) || null;
}

/* Un comando en un nodo. Plazo de 90 s; la salida se tapa por si trae una
   llave. SSM exige que el agente esté en línea: si no, se dice. */
async function nodoComando({ nodo, comando }) {
  const cmd = String(comando || '').trim();
  if (!cmd) throw Object.assign(new Error('Hace falta el comando.'), { codigo: 'COMANDO' });
  const lista = await nodos();
  const n = resolverNodo(lista, nodo);
  if (!n?.id) throw Object.assign(new Error(`No hay ningún nodo «${nodo}». Hay: ${lista.filter((x) => x.id).map((x) => x.corto || x.nombre).join(', ')}.`), { codigo: 'NODO' });
  if (n.estado !== 'running') throw Object.assign(new Error(`El nodo ${n.corto || n.nombre} está ${n.estado}: no se le puede mandar nada.`), { codigo: 'APAGADO' });
  const { SSMClient, SendCommandCommand, GetCommandInvocationCommand } = require('@aws-sdk/client-ssm');
  const ssm = new SSMClient({ region: n.region });
  const env = await ssm.send(new SendCommandCommand({
    InstanceIds: [n.id], DocumentName: 'AWS-RunShellScript',
    Parameters: { commands: [cmd], executionTimeout: ['90'] }, TimeoutSeconds: 120, Comment: 'ULTRON',
  }));
  const id = env.Command.CommandId;
  const t0 = Date.now();
  for (;;) {
    await new Promise((ok) => setTimeout(ok, 2000));
    let inv;
    try { inv = await ssm.send(new GetCommandInvocationCommand({ CommandId: id, InstanceId: n.id })); } catch (e) { if (e.name === 'InvocationDoesNotExist') continue; throw e; }
    if (!['Pending', 'InProgress', 'Delayed'].includes(inv.Status)) {
      const out = tapar([inv.StandardOutputContent || '', inv.StandardErrorContent ? '--- stderr ---\n' + inv.StandardErrorContent : ''].filter(Boolean).join('\n'));
      return `$ ${cmd}  @ ${n.corto || n.nombre} (${n.id}, ${n.region})\n(${inv.Status} · código ${inv.ResponseCode} · ${Date.now() - t0} ms)\n${out.slice(0, 12_000)}`;
    }
    if (Date.now() - t0 > 110_000) throw Object.assign(new Error('El comando no terminó en 110 s.'), { codigo: 'PLAZO' });
  }
}

// ── Mongo, solo lectura ─────────────────────────────────────────────────────

const SENSIBLE = /pass|clave|secret|secreto|token|hash|salt|seed|semilla|private|privada|key|llave|pin|otp|cvv|firma|signature/i;
const TAPADO = '[tapado]';

/* Lo que no debe llegar al modelo se tapa ANTES de devolverlo. Es una lista
   de nombres de campo, no de valores: un campo que se llame «clave» se tapa
   aunque tenga un 1. Mejor tapar de más. */
function taparDoc(x, prof = 0) {
  if (prof > 6) return '[…]';
  if (Array.isArray(x)) return x.slice(0, 20).map((v) => taparDoc(v, prof + 1));
  if (x && typeof x === 'object' && !(x instanceof Date)) {
    const o = {};
    for (const [k, v] of Object.entries(x)) o[k] = SENSIBLE.test(k) ? TAPADO : taparDoc(v, prof + 1);
    return o;
  }
  if (typeof x === 'string' && x.length > 400) return x.slice(0, 400) + '…';
  return x;
}
function tapar(texto) {
  return String(texto)
    .replace(/(HRKU-|sk_|sk-ant-|ghp_|gho_|AKIA|xoxb-|gid_live_)[A-Za-z0-9_\-]{8,}/g, '$1[tapado]')
    .replace(/(mongodb(\+srv)?:\/\/)[^\s@]+@/g, '$1[tapado]@')
    .replace(/((?:KEY|SECRET|TOKEN|PASS(?:WORD)?|CLAVE|SECRETO)\s*[=:]\s*)\S{8,}/gi, '$1[tapado]');
}

async function mongoConsultar({ app, coleccion, filtro = {}, limite = 10, orden = null }) {
  const a = appValida(app === 'ultron' ? APP_PROPIA() : app);
  const col = String(coleccion || '').trim();
  if (!/^[\w.-]{1,80}$/.test(col)) throw Object.assign(new Error('Nombre de colección inválido.'), { codigo: 'COLECCION' });
  const n = Math.max(1, Math.min(50, Number(limite) || 10));
  let f = filtro;
  if (typeof f === 'string') { try { f = JSON.parse(f); } catch { throw Object.assign(new Error('El filtro tiene que ser JSON.'), { codigo: 'FILTRO' }); } }
  if (!f || typeof f !== 'object' || Array.isArray(f)) f = {};
  if (JSON.stringify(f).includes('$where')) throw Object.assign(new Error('$where no se admite.'), { codigo: 'FILTRO' });
  const nombreUri = `${a.toUpperCase().replace(/[^A-Z0-9]/g, '_')}__MONGODB_URI`;
  const usarUri = async (uri) => {
    const cx = await mongoose.createConnection(uri, { serverSelectionTimeoutMS: 8000, readPreference: 'secondaryPreferred' }).asPromise();
    try {
      const c = cx.db.collection(col);
      const total = await c.countDocuments(f, { maxTimeMS: 8000 });
      const docs = await c.find(f, { limit: n, sort: orden || { _id: -1 }, maxTimeMS: 8000 }).toArray();
      return { total, docs: docs.map((d) => taparDoc(d)) };
    } finally { await cx.close().catch(() => {}); }
  };
  let r;
  try { r = await boveda.usar(nombreUri, usarUri); } catch (e) {
    if (e.codigo === 'NO_EXISTE') throw Object.assign(new Error(`No hay ${nombreUri} en la bóveda: el dueño la guarda con ese nombre y ULTRON puede leer esa base.`), { codigo: 'SIN_URI' });
    throw e;
  }
  return `${a} · ${col} · ${r.total} documento(s) cumplen el filtro; se muestran ${r.docs.length}:\n${JSON.stringify(r.docs, null, 1).slice(0, 14_000)}`;
}

module.exports = { herokuApps, herokuRegistro, herokuVariables, herokuReiniciar, nodos, nodoComando, mongoConsultar, _adentro: { tapar, taparDoc, resolverNodo, appValida } };
