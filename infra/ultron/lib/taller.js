/* EL TALLER: donde ULTRON toca su propio código, corre comandos y se despliega.
 *
 * José pidió «herramientas para poder entrar a repositorios, ejecutar
 * comandos también en terminal, que se pueda mejorar, el mismo que se
 * actualice». Esto es eso. Cuatro cosas, y las cuatro con el dueño delante:
 *
 *   LEER el repositorio      nivel leer      · árbol, archivo, búsqueda
 *   PROPONER un cambio       nivel peligroso · rama nueva + commit + PR
 *   la TERMINAL              nivel peligroso · un comando, con plazo y tope
 *   DESPLEGARSE              nivel peligroso · la rama que se diga, a Heroku
 *
 * ── NUNCA SE ESCRIBE EN LA RAMA PRINCIPAL ───────────────────────────────────
 * Un cambio de ULTRON es SIEMPRE una rama `ultron/…` y un pull request. Que
 * el dueño lo lea, lo pruebe y lo mezcle es lo que convierte «se mejora solo»
 * en «se mejora, y alguien lo vio». Un asistente que se mezcla a sí mismo en
 * producción sin que nadie lea el diff no es una mano derecha: es un riesgo
 * con buena prosa.
 *
 * ── LA TERMINAL NO TIENE LISTA NEGRA, Y SE DICE POR QUÉ ─────────────────────
 * Se pensó en prohibir `rm -rf`, `curl | sh` y demás. No sirve: cualquier
 * lista negra se rodea con un alias, un base64 o un `sh -c`. Lo que sí sirve
 * es que el dueño VEA el comando exacto antes de aprobarlo —eso lo hace
 * permisos.js— y que corra con plazo de 60 s, salida acotada, sin ninguna
 * variable de entorno de la casa (ni una llave, ni la de Mongo) y en un
 * directorio de trabajo propio. Lo que un comando puede romper en el dyno de
 * Heroku se arregla reiniciando el dyno; lo que NO puede es leer un secreto,
 * porque no los tiene en su entorno.
 *
 * ── DESPLEGARSE DESDE EL PROPIO DYNO ────────────────────────────────────────
 * bin/desplegar.mjs empaqueta con `git archive` y aquí no hay repositorio: el
 * dyno solo trae infra/ultron. Así que se hace el mismo viaje por otro camino:
 * se pide el tarball de la rama a GitHub, se recorta infra/ultron, se vuelve a
 * empaquetar y se sube a Heroku igual que hace desplegar.mjs. Lo que NO se
 * puede hacer desde aquí es correr las pruebas del navegador antes (no hay
 * Chromium en el dyno): por eso el pedido de autorización lo dice, y por eso
 * el camino serio sigue siendo el PR + desplegar.mjs desde una máquina con
 * pruebas. Esto es para el «arreglá eso y desplegate» de un domingo.
 */

const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { mkdtemp, writeFile, readdir, rm } = require('node:fs/promises');
const { createReadStream, statSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const boveda = require('./boveda');

const exec = promisify(execFile);

const REPO_POR_OMISION = 'therealj94/express-js-on-vercel';

/* ── LA RAMA QUE ULTRON ESTÁ CORRIENDO ────────────────────────────────────────
 * Sin esto, leer el repositorio leía la rama PRINCIPAL, que no es donde vive
 * este código: `infra/ultron` ni siquiera existe allí todavía. El resultado era
 * un 404 con cara de «la llave no tiene permiso» cuando la llave estaba
 * perfecta y lo que faltaba era la rama.
 *
 * Lo que ULTRON tiene que leer cuando mira su propio código es EL CÓDIGO QUE
 * ESTÁ CORRIENDO. Eso lo dice `version.json`, que `bin/desplegar.mjs` mete en
 * el paquete. Se puede pedir otra rama a mano; ésta es solo la de por omisión.
 */
const ramaCasa = (() => {
  let leida;
  return () => {
    if (leida !== undefined) return leida;
    const dicha = (process.env.ULTRON_RAMA || '').trim();
    if (dicha) { leida = dicha; return leida; }
    try { leida = JSON.parse(require('node:fs').readFileSync(join(__dirname, '..', 'version.json'), 'utf8')).rama || null; }
    catch { leida = null; }
    return leida;
  };
})();
const repos = () => (process.env.ULTRON_REPOS || REPO_POR_OMISION).split(',').map((s) => s.trim()).filter(Boolean);
const APP = () => process.env.ULTRON_APP || 'ultron-fp';
const SUBDIR = 'infra/ultron';
const TOPE_ARCHIVO = 60_000;

function repoValido(repo) {
  const r = String(repo || repos()[0]).trim();
  if (!/^[\w.-]+\/[\w.-]+$/.test(r)) throw Object.assign(new Error('Repositorio inválido.'), { codigo: 'REPO' });
  if (!repos().includes(r)) throw Object.assign(new Error(`El repositorio ${r} no está en la lista de la casa (ULTRON_REPOS).`), { codigo: 'REPO_FUERA' });
  return r;
}

/* La llave de GitHub: del entorno, o de la bóveda. Nunca sale de esta
   función; `fn` la usa y devuelve un resultado que no la contiene. */
async function conGithub(fn) {
  if (process.env.GITHUB_TOKEN) return fn(process.env.GITHUB_TOKEN);
  try { return await boveda.usar('GITHUB_TOKEN', fn); } catch (e) {
    if (e.codigo === 'NO_EXISTE' || e.codigo === 'BOVEDA_APAGADA') {
      throw Object.assign(new Error('No hay llave de GitHub: ponga GITHUB_TOKEN en la bóveda (o en el entorno) para que ULTRON pueda entrar al repositorio.'), { codigo: 'SIN_GITHUB' });
    }
    throw e;
  }
}

async function gh(token, ruta, { metodo = 'GET', cuerpo = null, accept = 'application/vnd.github+json' } = {}) {
  const r = await fetch(`https://api.github.com${ruta}`, {
    method: metodo,
    headers: { Authorization: `Bearer ${token}`, Accept: accept, 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'ULTRON-FP', ...(cuerpo ? { 'Content-Type': 'application/json' } : {}) },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    signal: AbortSignal.timeout(25_000),
  });
  const t = await r.text();
  let d = null; try { d = JSON.parse(t); } catch { d = t; }
  if (!r.ok) {
    /* ── EL 404 QUE NO ES UN 404 ─────────────────────────────────────────
       GitHub contesta 404 —no 403— cuando la llave es buena pero NO puede
       ver un repositorio PRIVADO. Es a propósito: así no confirma que el
       repositorio existe a quien no debería saberlo. Para quien está
       configurando esto, en cambio, «Not Found» manda a buscar un error de
       escritura en el nombre que no existe, y se pierde media hora.
       Aquí se dice lo que de verdad pasa y dónde se arregla. */
    if (r.status === 404 && /^\/repos\//.test(ruta)) {
      const trozos = ruta.replace(/^\//, '').split('/');
      const cual = trozos.slice(1, 3).join('/');
      /* DOS 404 MUY DISTINTOS, Y CONFUNDIRLOS CUESTA MEDIA HORA.
         Sobre el repositorio a secas, un 404 casi siempre es permiso: a un
         repositorio privado que la llave no puede ver, GitHub contesta 404 en
         vez de 403 para no confirmar que existe.
         Sobre una RUTA de dentro, en cambio, el repositorio ya se vio: lo que
         falta es esa ruta en esa rama. Decir «no tiene permiso» ahí manda a
         revisar la llave, que está bien, en vez de la rama, que es lo que
         está mal. */
      if (trozos.length > 3) {
        throw Object.assign(new Error(
          `GitHub no encuentra esa ruta en ${cual}. El repositorio SÍ se ve, así que la llave está bien: lo que no existe es `
          + `la ruta, o no existe en esa rama.${ramaCasa() ? ` La rama que ULTRON está corriendo es ${ramaCasa()}; en la principal este código todavía no está.` : ''}`),
        { codigo: 'GITHUB_NO_ESTA', http: 404 });
      }
      throw Object.assign(new Error(
        `GitHub no encuentra ${cual}. Casi siempre NO es que no exista: es que la llave `
        + 'no tiene permiso para verlo, y a un repositorio privado GitHub contesta 404 en vez de 403. '
        + 'Una llave clásica (ghp_…) necesita el permiso «repo» marcado entero; una fina, acceso a ESE repositorio '
        + 'y permisos de Contents y Pull requests en lectura y escritura. Se cambia en github.com/settings/tokens '
        + 'y se vuelve a guardar en la bóveda desde AJUSTES → LA BÓVEDA. `repo_llave` dice cuál de las dos cosas es.'),
      { codigo: 'GITHUB_SIN_PERMISO', http: 404 });
    }
    if (r.status === 401) {
      throw Object.assign(new Error('GitHub rechaza la llave (401): está vencida o mal copiada. Se hace otra en github.com/settings/tokens y se guarda en la bóveda desde el panel.'), { codigo: 'GITHUB_LLAVE', http: 401 });
    }
    throw Object.assign(new Error(`GitHub ${r.status} en ${ruta}: ${(d && d.message) || String(t).slice(0, 160)}`), { codigo: 'GITHUB', http: r.status });
  }
  return d;
}

// ── Leer ────────────────────────────────────────────────────────────────────

async function arbol({ repo, ruta = '', rama = null }) {
  const r = repoValido(repo);
  const ref = rama || ramaCasa();
  return conGithub(async (tk) => {
    const d = await gh(tk, `/repos/${r}/contents/${encodeURI(String(ruta).replace(/^\/+/, ''))}${ref ? `?ref=${encodeURIComponent(ref)}` : ''}`);
    if (!Array.isArray(d)) return `${ruta} es un archivo, no una carpeta. Use repo_leer.`;
    return d.map((e) => `${e.type === 'dir' ? '📁' : '·'} ${e.path}${e.type === 'file' ? ` (${e.size} B)` : ''}`).join('\n') || '(carpeta vacía)';
  });
}

/* ── LEER UN ARCHIVO GRANDE, POR TROZOS Y CON NÚMERO DE LÍNEA ────────────────
 * 7-sep. A «revisá el código del tablero y decime tres cosas que están mal, con
 * archivo y línea», ULTRON contestó esto:
 *
 *   «repo_leer me devuelve siempre el mismo tramo inicial de os.html aunque le
 *   pida desde:200 o desde:500. El archivo tiene más de 2.000 líneas y no me
 *   deja llegar a la sección del historial.»
 *
 * Y tenía razón: no existía ningún `desde`. Siempre leía del principio y
 * recortaba, así que de un archivo grande solo se veía la cabecera — para
 * siempre, por muchas vueltas que diera. Dos cosas, y las dos las pidió él:
 *   · `desde` y `lineas`, para ir avanzando por el archivo;
 *   · el NÚMERO DE LÍNEA delante de cada renglón, que es lo que hace que pueda
 *     decir «os.html:1512» en vez de «línea 200 aproximadamente».
 */
async function leer({ repo, ruta, rama = null, desde = 1, lineas = 0 }) {
  const r = repoValido(repo);
  if (!ruta) throw Object.assign(new Error('Hace falta la ruta del archivo.'), { codigo: 'RUTA' });
  const ref = rama || ramaCasa();
  return conGithub(async (tk) => {
    const d = await gh(tk, `/repos/${r}/contents/${encodeURI(String(ruta).replace(/^\/+/, ''))}${ref ? `?ref=${encodeURIComponent(ref)}` : ''}`);
    if (Array.isArray(d)) return `${ruta} es una carpeta. Use repo_arbol.`;
    if (d.encoding !== 'base64') return `${ruta}: no se pudo leer (codificación ${d.encoding}).`;
    const buf = Buffer.from(d.content, 'base64');
    const texto = buf.toString('utf8');
    if (/ /.test(texto.slice(0, 2000))) return `${ruta}: es binario (${buf.length} bytes); no se muestra.`;
    const todas = texto.split('\n');
    const desde1 = Math.max(1, Math.floor(Number(desde) || 1));
    /* Cuántas líneas caben: se calcula por el tope de CARACTERES, no por un
       número fijo, porque un archivo de líneas largas y otro de líneas cortas
       no aguantan lo mismo. */
    const pedidas = Math.max(0, Math.floor(Number(lineas) || 0));
    const trozo = [];
    let largo = 0;
    for (let i = desde1 - 1; i < todas.length; i++) {
      if (pedidas && trozo.length >= pedidas) break;
      const l = `${String(i + 1).padStart(5)}  ${todas[i]}`;
      if (largo + l.length > TOPE_ARCHIVO) break;
      trozo.push(l); largo += l.length + 1;
    }
    if (!trozo.length) return `${ruta}: el archivo tiene ${todas.length} líneas y usted pidió desde la ${desde1}.`;
    const ultima = desde1 - 1 + trozo.length;
    const cola = ultima < todas.length
      ? `\n\n[… van ${desde1}-${ultima} de ${todas.length} líneas. Para seguir: repo_leer con desde: ${ultima + 1}]`
      : `\n\n[fin del archivo · ${todas.length} líneas]`;
    return `${ruta} (líneas ${desde1}-${ultima} de ${todas.length})\n${trozo.join('\n')}${cola}`;
  });
}

async function buscar({ repo, consulta }) {
  const r = repoValido(repo);
  const q = String(consulta || '').trim();
  if (!q) throw Object.assign(new Error('Hace falta qué buscar.'), { codigo: 'CONSULTA' });
  return conGithub(async (tk) => {
    const d = await gh(tk, `/search/code?q=${encodeURIComponent(`${q} repo:${r}`)}&per_page=15`, { accept: 'application/vnd.github.text-match+json' });
    if (!d.items?.length) {
      /* Una trampa que cuesta cara: la búsqueda de código de GitHub SOLO mira
         la rama principal. Si el código vive en otra rama —como el de ULTRON—,
         «nada» no quiere decir que no esté: quiere decir que no está en la
         principal. Callarlo hace que ULTRON concluya que algo no existe. */
      return `Nada en ${r} para «${q}».${ramaCasa() ? ` OJO: la búsqueda de código de GitHub solo mira la rama principal, y ULTRON corre en ${ramaCasa()}. Si lo que busca está solo en esa rama, aquí no va a salir: use repo_arbol y repo_leer, que sí leen la rama que corre.` : ''}`;
    }
    return d.items.map((it) => {
      const frag = (it.text_matches || []).slice(0, 2).map((m) => '    ' + String(m.fragment || '').replace(/\s+/g, ' ').slice(0, 160)).join('\n');
      return `${it.path}${frag ? '\n' + frag : ''}`;
    }).join('\n');
  });
}

// ── Proponer un cambio: rama + commit + PR ──────────────────────────────────

const slug = (t) => String(t || 'cambio').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'cambio';

async function proponerCambio({ repo, base = null, titulo, descripcion = '', archivos = [], por = 'ULTRON' }) {
  const r = repoValido(repo);
  if (!titulo) throw Object.assign(new Error('Hace falta un título para el cambio.'), { codigo: 'TITULO' });
  if (!Array.isArray(archivos) || !archivos.length) throw Object.assign(new Error('No hay archivos que cambiar.'), { codigo: 'ARCHIVOS' });
  for (const a of archivos) {
    if (!a?.ruta || typeof a.contenido !== 'string') throw Object.assign(new Error('Cada archivo lleva ruta y contenido.'), { codigo: 'ARCHIVO' });
    if (/\.\.|^\/|^~/.test(a.ruta)) throw Object.assign(new Error(`Ruta inválida: ${a.ruta}`), { codigo: 'RUTA' });
  }
  return conGithub(async (tk) => {
    const info = await gh(tk, `/repos/${r}`);
    /* La base es la rama QUE ESTÁ CORRIENDO, no la principal: un cambio contra
       la principal saldría con un diff de todo lo que la principal no tiene
       todavía, y sería ilegible para quien tiene que aprobarlo. */
    const ramaBase = base || ramaCasa() || info.default_branch;
    const ref = await gh(tk, `/repos/${r}/git/ref/heads/${encodeURIComponent(ramaBase)}`);
    const sha = ref.object.sha;
    const rama = `ultron/${slug(titulo)}-${Date.now().toString(36)}`;
    await gh(tk, `/repos/${r}/git/refs`, { metodo: 'POST', cuerpo: { ref: `refs/heads/${rama}`, sha } });
    for (const a of archivos) {
      let shaAnterior = null;
      try { const ex = await gh(tk, `/repos/${r}/contents/${encodeURI(a.ruta)}?ref=${encodeURIComponent(rama)}`); shaAnterior = ex.sha || null; } catch (e) { if (e.http !== 404) throw e; }
      await gh(tk, `/repos/${r}/contents/${encodeURI(a.ruta)}`, { metodo: 'PUT', cuerpo: {
        message: `${titulo}\n\n${descripcion}\n\nPropuesto por ULTRON a pedido de ${por}.`.trim(),
        content: Buffer.from(a.contenido, 'utf8').toString('base64'), branch: rama, ...(shaAnterior ? { sha: shaAnterior } : {}),
      } });
    }
    const pr = await gh(tk, `/repos/${r}/pulls`, { metodo: 'POST', cuerpo: {
      title: titulo, head: rama, base: ramaBase,
      body: `${descripcion}\n\n---\nPropuesto por ULTRON a pedido de ${por}. Lo mezcla una persona después de leerlo.`,
    } });
    return { ok: true, rama, pr: pr.html_url, numero: pr.number, archivos: archivos.map((a) => a.ruta) };
  });
}

// ── Los cambios que ULTRON propuso ──────────────────────────────────────────
//
// 7-sep, José: «cuando me envía pull request no aparecen en ningún lado».
// Y era cierto dos veces. Primero porque casi nunca llegaba a crearse — el
// permiso no se podía retomar (ver lib/permisos.js) — y segundo porque el
// enlace vivía SOLO en el texto de ese turno: se bajaba la pantalla y se
// perdía. Un cambio propuesto que nadie encuentra es un cambio que nadie
// mezcla, o sea trabajo tirado.
//
// Esto lo lee de donde de verdad está —GitHub— en vez de llevar una lista
// aparte que se desincronizaría el primer día que alguien cierre uno a mano.
async function propuestos({ repo, limite = 20 } = {}) {
  const r = repoValido(repo);
  return conGithub(async (tk) => {
    const l = await gh(tk, `/repos/${r}/pulls?state=open&per_page=50&sort=updated&direction=desc`);
    return (Array.isArray(l) ? l : [])
      .filter((p) => String(p.head?.ref || '').startsWith('ultron/'))
      .slice(0, limite)
      .map((p) => ({
        numero: p.number, titulo: p.title, url: p.html_url, rama: p.head.ref,
        contra: p.base?.ref || null, en: p.created_at, tocado: p.updated_at,
        borrador: !!p.draft, repo: r,
      }));
  });
}

// ── La terminal ─────────────────────────────────────────────────────────────

const PLAZO_TERMINAL_MS = 120_000;
const TOPE_SALIDA = 12_000;
let cwdTaller = null;

async function terminal({ comando }) {
  const cmd = String(comando || '').trim();
  if (!cmd) throw Object.assign(new Error('Hace falta el comando.'), { codigo: 'COMANDO' });
  if (!cwdTaller) cwdTaller = await mkdtemp(join(tmpdir(), 'ultron-taller-'));
  const t0 = Date.now();
  try {
    const { stdout, stderr } = await exec('/bin/sh', ['-c', cmd], {
      cwd: cwdTaller, timeout: PLAZO_TERMINAL_MS, maxBuffer: 2_000_000,
      env: { PATH: process.env.PATH, HOME: cwdTaller, LANG: 'C.UTF-8', TERM: 'dumb' },   // ni una llave de la casa
    });
    return formatear({ codigo: 0, stdout, stderr, ms: Date.now() - t0, cmd });
  } catch (e) {
    return formatear({ codigo: e.code ?? 1, stdout: e.stdout || '', stderr: e.stderr || String(e.message), ms: Date.now() - t0, cmd, plazo: e.killed });
  }
}

function formatear({ codigo, stdout, stderr, ms, cmd, plazo }) {
  const corta = (s) => (s.length > TOPE_SALIDA ? s.slice(0, TOPE_SALIDA) + `\n[… recortado, ${s.length} caracteres]` : s);
  return [`$ ${cmd}`, `(salió con ${codigo}${plazo ? ', cortado por plazo de 120 s' : ''} · ${ms} ms)`,
    stdout ? corta(stdout) : '', stderr ? '--- stderr ---\n' + corta(stderr) : ''].filter(Boolean).join('\n');
}

// ── Desplegarse ─────────────────────────────────────────────────────────────

async function conHeroku(fn) {
  if (process.env.HEROKU_API_KEY) return fn(process.env.HEROKU_API_KEY);
  try { return await boveda.usar('HEROKU_API_KEY', fn); } catch (e) {
    if (e.codigo === 'NO_EXISTE' || e.codigo === 'BOVEDA_APAGADA') throw Object.assign(new Error('No hay llave de Heroku: ponga HEROKU_API_KEY en la bóveda para que ULTRON pueda desplegarse.'), { codigo: 'SIN_HEROKU' });
    throw e;
  }
}

async function heroku(tk, ruta, { metodo = 'GET', cuerpo = null } = {}) {
  const r = await fetch(`https://api.heroku.com${ruta}`, {
    method: metodo,
    headers: { Authorization: `Bearer ${tk}`, Accept: 'application/vnd.heroku+json; version=3', ...(cuerpo ? { 'Content-Type': 'application/json' } : {}) },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined, signal: AbortSignal.timeout(30_000),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(`Heroku ${r.status} en ${ruta}: ${d.message || ''}`), { codigo: 'HEROKU' });
  return d;
}

async function desplegarse({ repo, rama, avisar = () => {} }) {
  const r = repoValido(repo);
  const ref = String(rama || '').trim();
  if (!ref || !/^[\w./-]+$/.test(ref)) throw Object.assign(new Error('Hace falta la rama que se despliega.'), { codigo: 'RAMA' });
  const dir = await mkdtemp(join(tmpdir(), 'ultron-despliegue-'));
  try {
    // 1 · el tarball de la rama, de GitHub
    const sha = await conGithub(async (tk) => {
      const c = await gh(tk, `/repos/${r}/commits/${encodeURIComponent(ref)}`);
      const res = await fetch(`https://api.github.com/repos/${r}/tarball/${encodeURIComponent(ref)}`, {
        headers: { Authorization: `Bearer ${tk}`, 'User-Agent': 'ULTRON-FP' }, redirect: 'follow', signal: AbortSignal.timeout(120_000),
      });
      if (!res.ok) throw Object.assign(new Error(`GitHub no dio el tarball (${res.status}).`), { codigo: 'TARBALL' });
      await writeFile(join(dir, 'repo.tgz'), Buffer.from(await res.arrayBuffer()));
      return c.sha;
    });
    avisar(`tarball de ${ref} (${sha.slice(0, 7)}) bajado`);
    // 2 · recortar infra/ultron y volver a empaquetar
    await exec('tar', ['-xzf', 'repo.tgz', '--wildcards', `*/${SUBDIR}/*`], { cwd: dir });
    const raiz = (await readdir(dir)).find((n) => n !== 'repo.tgz');
    if (!raiz) throw Object.assign(new Error('El tarball no traía infra/ultron.'), { codigo: 'SUBDIR' });
    await exec('tar', ['-czf', 'paquete.tgz', '-C', join(dir, raiz, SUBDIR), '.'], { cwd: dir });
    const bytes = statSync(join(dir, 'paquete.tgz')).size;
    avisar(`paquete de ${Math.round(bytes / 1024)} KB`);
    // 3 · subir y construir
    return await conHeroku(async (tk) => {
      const fuente = await heroku(tk, `/apps/${APP()}/sources`, { metodo: 'POST' });
      const put = await fetch(fuente.source_blob.put_url, { method: 'PUT', body: createReadStream(join(dir, 'paquete.tgz')), duplex: 'half', headers: { 'Content-Length': String(bytes) }, signal: AbortSignal.timeout(180_000) });
      if (!put.ok) throw Object.assign(new Error(`No se pudo subir el paquete (${put.status}).`), { codigo: 'SUBIDA' });
      avisar('subido');
      const build = await heroku(tk, `/apps/${APP()}/builds`, { metodo: 'POST', cuerpo: { source_blob: { url: fuente.source_blob.get_url, version: sha.slice(0, 7) } } });
      let estado = build.status;
      for (let i = 0; i < 60 && estado === 'pending'; i++) {
        await new Promise((ok) => setTimeout(ok, 5000));
        estado = (await heroku(tk, `/apps/${APP()}/builds/${build.id}`)).status;
      }
      if (estado !== 'succeeded') throw Object.assign(new Error(`La construcción terminó en ${estado}.`), { codigo: 'BUILD' });
      avisar('construido');
      return { ok: true, app: APP(), rama: ref, commit: sha.slice(0, 7), build: build.id };
    });
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/* ── QUÉ LLAVE ES LA QUE HAY, Y QUÉ LE FALTA ──────────────────────────────────
 * Nace de media hora perdida. La llave estaba guardada, GitHub contestaba 404
 * y el 404 no dice si el repositorio no existe, si la llave venció o si le
 * falta un permiso. Las tres cosas se arreglan en sitios distintos.
 *
 * Esto lo pregunta y lo dice en una línea. NO enseña la llave —nada de lo que
 * devuelve permite reconstruirla—: dice de quién es, de qué clase, qué permisos
 * lleva marcados y si con ellos alcanza para ver el repositorio de la casa.
 * Los permisos de una llave son metadatos; GitHub los manda en una cabecera
 * precisamente para que un programa pueda decirle a su dueño qué le falta.
 */
async function llave({ repo = null } = {}) {
  return conGithub(async (tk) => {
    const clase = /^github_pat_/.test(tk) ? 'fina (github_pat_…)'
      : /^ghp_/.test(tk) ? 'clásica (ghp_…)'
        : /^gh[osur]_/.test(tk) ? 'de aplicación' : 'de clase desconocida';
    const r = await fetch('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${tk}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'ULTRON-FP' },
      signal: AbortSignal.timeout(20_000),
    });
    if (r.status === 401) {
      return `La llave de GitHub que hay guardada es ${clase} y GitHub la RECHAZA (401): está vencida, revocada o mal copiada.\n`
        + 'Se hace otra en github.com/settings/tokens y se guarda en la bóveda desde AJUSTES → LA BÓVEDA. Nadie tiene que escribirla en el chat.';
    }
    if (!r.ok) return `GitHub contestó ${r.status} al preguntar de quién es la llave. Volver a intentar en un rato.`;
    const yo = await r.json();
    /* La cabecera viene vacía en las llaves finas: ahí los permisos son por
       repositorio y no se listan aquí. Se dice, en vez de callarlo. */
    const marcados = (r.headers.get('x-oauth-scopes') || '').split(',').map((s) => s.trim()).filter(Boolean);
    const lineas = [
      `Llave ${clase}, de la cuenta ${yo.login}.`,
      marcados.length ? `Permisos marcados: ${marcados.join(', ')}.`
        : (/^github_pat_/.test(tk)
          ? 'Es una llave fina: sus permisos van por repositorio y GitHub no los lista aquí.'
          : 'NO lleva ningún permiso marcado: así solo sirve para leer lo público.'),
    ];
    const cual = repo ? repoValido(repo) : (process.env.REPO_CASA || 'therealj94/express-js-on-vercel');
    try {
      const d = await gh(tk, `/repos/${cual}`);
      lineas.push(`Ve ${cual}${d.private ? ' (privado)' : ''}, y ${d.permissions?.push ? 'PUEDE escribir' : 'solo puede leer'}.`);
    } catch (e) {
      lineas.push(`NO ve ${cual}: ${e.codigo === 'GITHUB_SIN_PERMISO' ? 'le falta el permiso.' : e.message}`);
      if (!marcados.includes('repo') && /^ghp_/.test(tk)) {
        lineas.push('Lo que falta, exacto: en github.com/settings/tokens, abrir esa llave y marcar la casilla «repo» ENTERA (no solo public_repo). '
          + 'Es lo único que hace falta para un repositorio privado. Después se guarda otra vez en la bóveda desde AJUSTES → LA BÓVEDA.');
      }
    }
    return lineas.join('\n');
  });
}

module.exports = { propuestos, repos, arbol, leer, buscar, proponerCambio, terminal, desplegarse, llave, ramaCasa, _adentro: { slug, repoValido, formatear, gh } };
