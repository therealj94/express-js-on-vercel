/* Despliega ULTRON FP a Heroku por la API de la plataforma, igual que Ordenex.
 *
 *   node infra/ultron/bin/desplegar.mjs [--probar-solo] [--crear]
 *
 * Tres pasos contra `api.heroku.com` (pedir sitio, construir, mirar) y uno
 * contra una URL firmada de S3 (subir el paquete). Con `HEROKU_API_KEY` en el
 * entorno la usa; sin ella confía en la credencial del entorno de Claude Code,
 * que el proxy pega después de que la petición sale de aquí.
 *
 * Lo que va en el paquete es lo que está COMMITEADO en `infra/ultron`
 * (`git archive`), no lo que hay en el disco. Y como el saber viaja dentro del
 * paquete (`saber/`), antes de desplegar se comprueba que esté al día con los
 * documentos: si alguien cambió un dosier y no rearmó, aquí se corta.
 *
 * `--crear`: si la app no existe, la crea (región us, stack por omisión). No
 * pone ninguna variable: las llaves se ponen aparte y a mano.
 *
 * Lo que NO hace: no toca variables de entorno, no manda nada a la junta, no
 * enciende nada. Despliega y mira.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const correr = promisify(execFile);
const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, '..', '..', '..');
const PREFIJO = 'infra/ultron';
const APP = process.env.HEROKU_APP || 'ultron-fp';
const SOLO_PROBAR = process.argv.includes('--probar-solo');
const CREAR = process.argv.includes('--crear');

const rojo = (s) => console.log(`\x1b[31m${s}\x1b[0m`);
const verde = (s) => console.log(`\x1b[32m${s}\x1b[0m`);
const paso = (s) => console.log(`\n\x1b[1m── ${s}\x1b[0m`);
const morir = (s) => { rojo(s); process.exit(1); };

const LLAVE = (process.env.HEROKU_API_KEY || '').trim();

async function heroku(ruta, { metodo = 'GET', cuerpo } = {}) {
  const cabeceras = { Accept: 'application/vnd.heroku+json; version=3' };
  if (cuerpo) cabeceras['Content-Type'] = 'application/json';
  if (LLAVE) cabeceras.Authorization = `Bearer ${LLAVE}`;
  const r = await fetch(`https://api.heroku.com${ruta}`, {
    method: metodo, headers: cabeceras,
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const texto = await r.text();
  let json = null;
  try { json = JSON.parse(texto); } catch { /* no siempre es JSON */ }
  return { ok: r.ok, estado: r.status, json, texto };
}

// ── 1. ¿podemos hablar con Heroku? ──────────────────────────────────────────
paso('¿Se puede hablar con Heroku?');
let urlApp = process.env.ULTRON_URL || '';
const cuenta = await heroku('/account');
if (!cuenta.ok) {
  rojo(`Heroku contestó ${cuenta.estado}.`);
  console.log(LLAVE
    ? '   Hay HEROKU_API_KEY pero no vale: si rotaste la llave, esta es la vieja.'
    : '   No hay HEROKU_API_KEY ni credencial del entorno para api.heroku.com.');
  if (!SOLO_PROBAR) process.exit(1);
  console.log('   (--probar-solo: sigo para comprobar las pruebas y el paquete)');
} else {
  verde(`✓ hablo con Heroku como ${cuenta.json?.email || 'la cuenta'}`);
  let app = await heroku(`/apps/${APP}`);
  if (!app.ok && CREAR) {
    console.log(`  la app «${APP}» no existe: la creo`);
    app = await heroku('/apps', { metodo: 'POST', cuerpo: { name: APP, region: 'us' } });
    if (!app.ok) morir(`no se pudo crear (${app.estado}): ${app.texto.slice(0, 200)}`);
  }
  if (!app.ok) morir(`La app «${APP}» no contesta (${app.estado}). Con --crear la creo.`);
  urlApp = urlApp || String(app.json?.web_url || '').replace(/\/$/, '');
  verde(`✓ la app ${APP} existe · ${urlApp}`);
}

// ── 2. el saber al día, y las pruebas ───────────────────────────────────────
paso('¿El saber está al día con los documentos?');
{
  const { stdout } = await correr('node', ['bin/armar-saber.mjs', '--comprobar'], {
    cwd: join(RAIZ, PREFIJO), maxBuffer: 1 << 24,
  }).catch((e) => ({ stdout: String(e.stdout || e.message), fallo: true }));
  if (/desfasado|cambiaron/i.test(stdout)) {
    rojo('El saber está desfasado respecto a los documentos.');
    console.log('   Corré `node bin/armar-saber.mjs`, commiteá saber/ y volvé.');
    process.exit(1);
  }
  verde('✓ ' + stdout.trim().split('\n').pop());
}

paso('Las pruebas, antes de tocar nada');
try {
  const { stdout } = await correr('npm', ['run', 'probar'], {
    cwd: join(RAIZ, PREFIJO), maxBuffer: 1 << 24,
  });
  const verdes = (stdout.match(/^Todo en verde$/gm) || []).length;
  verde(`✓ ${verdes} suites en verde`);
} catch (e) {
  rojo('Las pruebas fallaron. NO se despliega.');
  console.log(String(e.stdout || e.message).split('\n').slice(-25).join('\n'));
  process.exit(1);
}

// ── 3. el paquete ───────────────────────────────────────────────────────────
paso('Armando el paquete');
const rama = (await correr('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: RAIZ })).stdout.trim();
const commit = (await correr('git', ['rev-parse', '--short', 'HEAD'], { cwd: RAIZ })).stdout.trim();
const sinCommitear = (await correr('git', ['status', '--porcelain', '--', PREFIJO], { cwd: RAIZ })).stdout.trim();
if (sinCommitear) {
  rojo('Hay cambios en infra/ultron sin commitear. El paquete va del commit, no del disco:');
  console.log(sinCommitear.split('\n').slice(0, 10).map((l) => '   ' + l).join('\n'));
  process.exit(1);
}
const paquete = join(tmpdir(), `ultron-${commit}.tar.gz`);
await correr('bash', ['-c',
  `git archive --format=tar HEAD:${PREFIJO} | gzip -9 > ${JSON.stringify(paquete)}`], { cwd: RAIZ });
const mide = statSync(paquete).size;
const dentro = (await correr('tar', ['-tzf', paquete])).stdout.split('\n');
for (const f of ['Procfile', 'package.json', 'app.js', 'saber/secciones.json', 'saber/indice.json', 'public/index.html']) {
  if (!dentro.includes(f)) morir(`al paquete le falta ${f}`);
}
verde(`✓ ${(mide / 1024).toFixed(0)} KB · ${dentro.length} archivos · rama ${rama} (${commit})`);

if (SOLO_PROBAR) { paso('--probar-solo: hasta aquí'); process.exit(0); }

// ── 4. subir y construir ────────────────────────────────────────────────────
paso('Subiendo');
const fuente = await heroku(`/apps/${APP}/sources`, { metodo: 'POST' });
if (!fuente.ok) morir(`no se pudo pedir el sitio para subir (${fuente.estado}): ${fuente.texto.slice(0, 200)}`);
const { put_url: aDonde, get_url: deDonde } = fuente.json.source_blob;
const subida = await fetch(aDonde, {
  method: 'PUT',
  headers: { 'Content-Type': '', 'Content-Length': String(mide) },
  body: readFileSync(paquete),
});
if (!subida.ok) morir(`la subida falló (${subida.status})`);
verde('✓ subido');

paso('Construyendo');
const build = await heroku(`/apps/${APP}/builds`, {
  metodo: 'POST',
  cuerpo: { source_blob: { url: deDonde, version: commit } },
});
if (!build.ok) morir(`no arrancó la construcción (${build.estado}): ${build.texto.slice(0, 300)}`);
const id = build.json.id;
console.log(`  build ${id} · ${build.json.status}`);
let estado = build.json.status;
for (let i = 0; i < 60 && estado === 'pending'; i++) {
  await new Promise((r) => setTimeout(r, 5000));
  const b = await heroku(`/apps/${APP}/builds/${id}`);
  estado = b.json?.status || estado;
  process.stdout.write('.');
}
console.log('');
if (estado !== 'succeeded') {
  rojo(`La construcción terminó en «${estado}».`);
  console.log(`   El registro: ${build.json.output_stream_url}`);
  process.exit(1);
}
verde('✓ construido');

// ── 5. mirar que quedó vivo, y con qué ──────────────────────────────────────
paso('¿Levantó?');
let salud = null;
for (let i = 0; i < 20 && !salud; i++) {
  await new Promise((r) => setTimeout(r, 5000));
  try {
    const r = await fetch(`${urlApp}/salud`, { signal: AbortSignal.timeout(15000) });
    const j = await r.json();
    if (j && j.ok) salud = j;
  } catch { /* todavía no */ }
  process.stdout.write('.');
}
console.log('');
if (!salud) morir('no levantó en dos minutos. Mirá el registro de la app.');
verde(`✓ /salud: ${JSON.stringify(salud)}`);

// Lo que /salud dice de cada pieza, en claro. Un panel que arranca sin junta
// o sin cerebro ARRANCA igual y lo dice: aquí se repite para que no se lea
// «ok:true» como «todo listo».
const p = salud;
const fila = (k, bien, que) => console.log(`  ${bien ? '✓' : '·'} ${k.padEnd(10)} ${que}`);
fila('junta', p.junta > 0, p.junta ? `${p.junta} miembro(s)` : 'SIN JUNTA — nadie puede entrar (ULTRON_JUNTA)');
fila('cerebro', p.cerebro, p.cerebro ? `encendido · ${p.modelo}` : 'apagado — falta ANTHROPIC_API_KEY');
fila('memoria', p.memoria === 'mongo', p.memoria === 'mongo' ? 'Mongo' : 'provisional (sin MONGODB_URI)');
fila('voz', p.voz, p.voz ? 'ElevenLabs' : 'del navegador');
fila('whatsapp', p.canales?.whatsapp, p.canales?.whatsapp ? 'Zernio' : 'apagado');
fila('correo', p.canales?.correo, p.canales?.correo ? 'SES' : 'apagado');
fila('saber', p.saber > 0, `${p.saber} secciones · armado ${p.saberArmado}`);

paso('Listo');
console.log(`Panel: ${urlApp}/`);
