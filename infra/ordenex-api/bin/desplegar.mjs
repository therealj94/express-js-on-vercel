/* Despliega Ordenex a Heroku por la API de la plataforma, SIN llave en la mano.
 *
 *   node infra/ordenex-api/bin/desplegar.mjs [--probar-solo]
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * POR QUÉ ESTE Y NO `git push heroku`
 *
 * `git push heroku` necesita la llave metida en la URL, o sea DENTRO de esta
 * sesión: en una variable de entorno que cualquier comando puede leer y que
 * acaba en el historial de un shell. Ya se quemaron dos llaves de Heroku así.
 *
 * La API de la plataforma se puede usar de otra forma. En Claude Code se
 * añade la llave al ENTORNO como «API credential» para el host
 * `api.heroku.com`, y el proxy de Anthropic se la pega a la petición DESPUÉS
 * de que salga de esta máquina. La llave no llega nunca ni a mí, ni a los
 * comandos que corro, ni a las variables de entorno de la sesión. Yo escribo
 * `fetch('https://api.heroku.com/...')` sin ninguna credencial y sale
 * autenticada.
 *
 * Los tres pasos del despliegue van todos a `api.heroku.com` menos uno: la
 * subida del paquete, que va a una URL firmada de S3 y por eso no necesita
 * autenticación ninguna. Encaja entero.
 *
 * Si no hay credencial en el entorno, se usa HEROKU_API_KEY. Funciona igual,
 * pero entonces la llave sí está en la sesión.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * LO QUE NO HACE
 *
 * NO enciende BARRIDO ni COMPRAS. El vigía solo mira; esos dos firman con
 * llaves y gastan gas, y se encienden a mano, en otro momento y sabiendo lo
 * que se hace. Ver la página 15 del PDF del depósito provisional.
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
const PREFIJO = 'infra/ordenex-api';
const APP = process.env.HEROKU_APP || 'ordenex-api';
const API = process.env.ORDENEX_API_URL || 'https://ordenex-api-ba4b27b8b51a.herokuapp.com';
const SOLO_PROBAR = process.argv.includes('--probar-solo');

const rojo = (s) => console.log(`\x1b[31m${s}\x1b[0m`);
const verde = (s) => console.log(`\x1b[32m${s}\x1b[0m`);
const paso = (s) => console.log(`\n\x1b[1m── ${s}\x1b[0m`);
const morir = (s) => { rojo(s); process.exit(1); };

/* La llave, si la hay. Si NO la hay no es un error: puede estar puesta como
   credencial del entorno, y entonces el proxy la pega sola y aquí no se ve
   nada. Por eso no se exige — se prueba con una llamada y se ve qué pasa. */
const LLAVE = (process.env.HEROKU_API_KEY || '').trim();

async function heroku(ruta, { metodo = 'GET', cuerpo } = {}) {
  const cabeceras = { Accept: 'application/vnd.heroku+json; version=3' };
  if (cuerpo) cabeceras['Content-Type'] = 'application/json';
  // La cabecera SOLO si tenemos llave a mano. Si viene del proxy, mandar una
  // vacía la pisaría.
  if (LLAVE) cabeceras.Authorization = `Bearer ${LLAVE}`;
  const r = await fetch(`https://api.heroku.com${ruta}`, {
    method: metodo, headers: cabeceras,
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const texto = await r.text();
  let json = null;
  try { json = JSON.parse(texto); } catch { /* algunas respuestas no son JSON */ }
  return { ok: r.ok, estado: r.status, json, texto };
}

// ── 1. ¿podemos hablar con Heroku? ──────────────────────────────────────────
//
// Con `--probar-solo` esto NO corta: no poder autenticarse es justo una de las
// cosas que se quiere ver, y lo demás —las pruebas y el paquete— se comprueba
// igual sin llave ninguna. Cortar aquí dejaría el guion sin poder probarse
// precisamente cuando hace falta probarlo.
paso('¿Se puede hablar con Heroku?');
const cuenta = await heroku('/account');
if (!cuenta.ok) {
  rojo(`Heroku contestó ${cuenta.estado}.`);
  if (LLAVE) {
    console.log('   Hay HEROKU_API_KEY en el entorno pero no vale: si rotaste la llave,');
    console.log('   esta es la vieja. Las variables se copian al ARRANCAR la sesión, así');
    console.log('   que cambiarla en el entorno no cambia una sesión que ya está abierta.');
  } else {
    console.log('   No hay HEROKU_API_KEY ni credencial del entorno para api.heroku.com.');
    console.log('   Para que yo pueda desplegar sin ver la llave, en claude.ai/code:');
    console.log('     · el icono de nube que está encima del cuadro de mensaje');
    console.log('     · pasá el ratón por tu entorno → el engranaje de la derecha');
    console.log('     · «API credentials» → «Add credential»');
    console.log('       Allowed websites: api.heroku.com');
    console.log('       Custom headers:   Authorization · Bearer · (la llave)');
    console.log('     · «Connect», y abrí una sesión NUEVA: las variables se leen al arrancar.');
  }
  if (!SOLO_PROBAR) process.exit(1);
  console.log('   (--probar-solo: sigo para comprobar las pruebas y el paquete)');
} else {
  verde(`✓ hablo con Heroku como ${cuenta.json?.email || 'la cuenta'}${LLAVE ? '' : ' (por credencial del entorno: la llave no está en esta sesión)'}`);

  const app = await heroku(`/apps/${APP}`);
  if (!app.ok) morir(`La app «${APP}» no contesta (${app.estado}).`);
  verde(`✓ la app ${APP} existe · ${app.json?.web_url || ''}`);
}

// ── 2. las pruebas ──────────────────────────────────────────────────────────
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
//
// Heroku quiere un tar.gz con el proyecto EN LA RAÍZ. Este es un monorepo, así
// que se empaqueta el subdirectorio con `tar -C`, que es lo mismo que hace
// `git subtree` pero sin escribir un commit que después hay que limpiar.
//
// Va del ÍNDICE DE GIT (`git archive`) y no del disco: así no se cuela un
// archivo sin commitear ni un `node_modules` que alguien dejó ahí. Lo que se
// despliega es exactamente lo que está en la rama.
paso('Armando el paquete');
const rama = (await correr('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: RAIZ })).stdout.trim();
const commit = (await correr('git', ['rev-parse', '--short', 'HEAD'], { cwd: RAIZ })).stdout.trim();
const paquete = join(tmpdir(), `ordenex-${commit}.tar.gz`);
await correr('bash', ['-c',
  `git archive --format=tar HEAD:${PREFIJO} | gzip -9 > ${JSON.stringify(paquete)}`], { cwd: RAIZ });
const mide = statSync(paquete).size;

// Que lo que va dentro tenga lo que Heroku necesita EN LA RAÍZ. Un prefijo
// equivocado produce un tar perfectamente válido y un dyno muerto con «no
// Procfile», que desde la terminal se ve igual que un despliegue bueno.
const dentro = (await correr('tar', ['-tzf', paquete])).stdout.split('\n');
for (const f of ['Procfile', 'package.json', 'app.js']) {
  if (!dentro.includes(f)) morir(`al paquete le falta ${f} en la raíz`);
}
verde(`✓ ${(mide / 1024).toFixed(0)} KB · ${dentro.length} archivos · rama ${rama} (${commit})`);
verde('  con Procfile, package.json y app.js en la raíz');

if (SOLO_PROBAR) { paso('--probar-solo: hasta aquí'); process.exit(0); }

// ── 4. subir y construir ────────────────────────────────────────────────────
paso('Subiendo');
const fuente = await heroku(`/apps/${APP}/sources`, { metodo: 'POST' });
if (!fuente.ok) morir(`no se pudo pedir el sitio para subir (${fuente.estado}): ${fuente.texto.slice(0, 200)}`);
const { put_url: aDonde, get_url: deDonde } = fuente.json.source_blob;

// La subida va a una URL firmada de S3: no lleva autenticación y por eso el
// proxy no tiene que pegarle nada.
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

// Se espera y se mira. Un despliegue que no se mira no está terminado.
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

// ── 5. mirar que quedó vivo ─────────────────────────────────────────────────
//
// El arranque verifica los decimales contra las tres cadenas y mide los
// tiempos de bloque, así que tarda unos segundos.
paso('¿Levantó?');
let vivo = false;
for (let i = 0; i < 20; i++) {
  await new Promise((r) => setTimeout(r, 6000));
  try {
    const r = await fetch(`${API}/salud`, { signal: AbortSignal.timeout(20000) });
    const t = await r.text();
    if (t.includes('"ok":true')) { verde(`✓ /salud: ${t}`); vivo = true; break; }
  } catch { /* todavía no */ }
  process.stdout.write('.');
}
if (!vivo) morir('no levantó en dos minutos. Mirá el registro de la app.');

paso('¿Están las rutas nuevas?');
// 401 es la respuesta BUENA: la ruta existe y pide sesión. 404 significa que
// quedó una versión vieja, que es justo el fallo que esto existe para no
// dejar pasar en silencio.
let mal = false;
for (const ruta of ['/compras', '/portafolio']) {
  const r = await fetch(`${API}${ruta}`, { signal: AbortSignal.timeout(20000) }).catch(() => null);
  const c = r?.status ?? 0;
  if (c === 404) { rojo(`✗ ${ruta} da 404: quedó una versión vieja`); mal = true; }
  else verde(`✓ ${ruta} responde ${c} (existe)`);
}
if (mal) process.exit(1);

paso('Listo');
console.log('El vigía ya está mirando. El barrido y la entrega siguen APAGADOS:');
console.log(`  BARRIDO=1   cuando hayas visto una semana de depósitos`);
console.log(`  COMPRAS=1   después de probar el barrido con poco dinero`);
