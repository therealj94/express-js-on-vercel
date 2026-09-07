/**
 * EL OJO DE ULTRON — un navegador de verdad, en su propia casa.
 *
 * ── POR QUÉ EXISTE ──────────────────────────────────────────────────────────
 * 7-sep, José: «ULTRON no tiene Playwright para entrar».
 *
 * Y no lo tenía. `leer_pagina` es un `fetch`: trae el HTML que manda el
 * servidor y punto. Todas las casas de Orden Global —Ordenex, Veta Wallet,
 * AuCorp, Genesis, el propio ULTRON— se dibujan ENTERAS con JavaScript en el
 * navegador. Medido el 7-sep: `ordenexchange.link` devuelve 78 caracteres de
 * texto por fetch. Cero mercados, cero precios, cero botones. ULTRON estaba
 * ciego en los productos de su propia casa.
 *
 * ── POR QUÉ APARTE Y NO DENTRO DE ULTRON ────────────────────────────────────
 * El dyno de ULTRON es Basic: 512 MB. Chromium necesita entre 200 y 400 MB por
 * pestaña. Metido ahí adentro, la primera página que se abra pasa el límite de
 * memoria, Heroku mata el dyno y ULTRON SE CAE. O sea que la herramienta para
 * mirar tumbaría al que mira.
 *
 * Aquí el navegador tiene su propia casa y su propia memoria. Si se cae, se
 * cae el ojo: ULTRON contesta «ahora no puedo mirar» y sigue trabajando. Esa
 * es toda la razón de que esto sea un servicio y no una función.
 *
 * ── LO QUE SABE HACER ───────────────────────────────────────────────────────
 *   POST /mirar   la página YA DIBUJADA: texto, título, qué se puede tocar,
 *                 los errores de consola y las peticiones que fallaron.
 *   POST /foto    una imagen de cómo se ve, para mandársela a una persona.
 *   POST /guion   ENTRAR: escribir, tocar, esperar, leer. Es lo que deja
 *                 iniciar sesión y recorrer un flujo como lo haría alguien.
 *   GET  /salud   si el navegador está en pie y cuánta memoria queda.
 *
 * ── LAS TRES COSAS QUE NO SE NEGOCIAN ───────────────────────────────────────
 * 1. UNA PÁGINA A LA VEZ. En 512 MB, dos pestañas es una caída. Todo entra por
 *    una cola de una sola fila, igual que el motor de Ordenex.
 * 2. NI UNA DIRECCIÓN DE ADENTRO. Un navegador en un servidor es la puerta
 *    perfecta para leer lo que solo el servidor ve —la nube guarda sus
 *    credenciales en 169.254.169.254— así que se cierra dos veces: antes de
 *    salir y otra vez dentro del navegador, porque una página puede redirigir.
 * 3. LOS SECRETOS NO SE ESCRIBEN NUNCA. Un guion puede llevar una clave para
 *    entrar. Esa clave se usa y se olvida: no va al registro, no va en la
 *    respuesta, no queda en ninguna traza.
 */

/* ── DÓNDE ESTÁ EL NAVEGADOR, Y POR QUÉ HAY QUE BUSCARLO ─────────────────────
 *
 * Esto va ANTES de `require('playwright')` porque Playwright lee la variable
 * al cargarse: ponerla después no sirve de nada.
 *
 * En Heroku hay tres piezas que no se ponen de acuerdo, y costaron tres
 * construcciones averiguarlo:
 *
 * 1. El buildpack instala las dependencias del SISTEMA —las bibliotecas que
 *    Chromium necesita para arrancar— pero NO el navegador. Eso lo baja
 *    `heroku-postbuild`.
 * 2. Bajarlo a `~/.cache/ms-playwright` no sirve: durante la construcción HOME
 *    es `/app`, así que el navegador cae en `/app/.cache`... y al terminar,
 *    Heroku COPIA la carpeta de construcción ENCIMA de `/app`. El navegador se
 *    borra solo, en el último paso, sin decir nada.
 * 3. Al arrancar el dyno, el buildpack pone `PLAYWRIGHT_BROWSERS_PATH=0` por
 *    encima de lo que diga la configuración de la app.
 *
 * La salida es dejar de pelear con la variable y poner el navegador donde el
 * `0` lo va a buscar: dentro de `node_modules/playwright-core`, que es carpeta
 * de la construcción y por tanto SÍ viaja. Aquí abajo se mira el disco de
 * todas formas: si algún día el buildpack cambia de idea, el ojo lo encuentra
 * igual en vez de quedarse ciego.
 */
const { existsSync, readdirSync } = require('node:fs');
const DONDE_MIRAR = [
  require('node:path').join(__dirname, 'node_modules', 'playwright-core', '.local-browsers'),
  '/app/.cache/ms-playwright',
  `${process.env.HOME || ''}/.cache/ms-playwright`,
];
for (const donde of DONDE_MIRAR) {
  try {
    if (!existsSync(donde) || !readdirSync(donde).some((d) => d.startsWith('chromium'))) continue;
    /* `0` es el valor que Playwright entiende como «dentro de node_modules»;
       para cualquier otro sitio se pone la ruta. */
    process.env.PLAYWRIGHT_BROWSERS_PATH = donde === DONDE_MIRAR[0] ? '0' : donde;
    console.log(`[ojo] el navegador está en ${donde}`);
    break;
  } catch { /* si no se puede mirar, que Playwright se arregle con lo que tenga */ }
}

const express = require('express');
const { chromium } = require('playwright');

const app = express();
app.use(express.json({ limit: '256kb' }));
app.disable('x-powered-by');

const PUERTO = process.env.PORT || 4020;
const CLAVE = (process.env.OJO_CLAVE || '').trim();
const PLAZO_MS = Number(process.env.OJO_PLAZO_MS || 30_000);
const TOPE_TEXTO = Number(process.env.OJO_TOPE_TEXTO || 24_000);
const PAGINAS_POR_NAVEGADOR = Number(process.env.OJO_PAGINAS_POR_NAVEGADOR || 40);

// ── La puerta ───────────────────────────────────────────────────────────────
// Sin clave puesta el ojo NO abre. Es a propósito: un navegador abierto a
// internet es un proxy para cualquiera que lo encuentre, y «todavía no le puse
// la clave» no puede ser un estado en el que funcione.
app.use((req, res, siguiente) => {
  if (req.path === '/salud') return siguiente();
  if (!CLAVE) return res.status(503).json({ error: 'El ojo no tiene clave puesta: no atiende a nadie.', codigo: 'SIN_CLAVE' });
  const dada = req.get('X-Ojo-Clave') || '';
  /* Comparación de largo fijo: comparar strings con === se sale en la primera
     letra distinta, y eso deja adivinar la clave letra por letra midiendo el
     tiempo. Con un solo cliente es teórico; escribirlo bien cuesta lo mismo. */
  if (dada.length !== CLAVE.length || !require('node:crypto').timingSafeEqual(Buffer.from(dada), Buffer.from(CLAVE))) {
    return res.status(403).json({ error: 'Clave del ojo incorrecta.', codigo: 'CLAVE' });
  }
  siguiente();
});

// ── Ni una dirección de adentro ─────────────────────────────────────────────
//
// Esto es lo más importante del archivo. Un navegador que corre en un servidor
// puede pedir lo que solo el servidor alcanza: la red privada, y sobre todo
// 169.254.169.254, que es donde las nubes guardan las credenciales de la
// máquina. Quien pudiera pedirle al ojo que abra esa dirección se llevaría las
// llaves de la casa.
//
// Se cierra DOS veces y no una, porque no es lo mismo la dirección que se pide
// que la que se acaba abriendo: una página puede redirigir, y puede pedir
// imágenes, tipografías y datos a donde quiera. La primera comprobación mira
// lo que entra por el API; la segunda vive dentro del navegador y mira CADA
// petición que la página hace, redirecciones incluidas.
const PROHIBIDO = [
  /^localhost$/i, /^127\./, /^0\./, /^10\./, /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./, /^169\.254\./, /^::1$/, /^\[?::1\]?$/,
  /\.internal$/i, /\.local$/i, /^metadata/i,
];

function direccionValida(url) {
  let u;
  try { u = new URL(String(url || '')); } catch { return { ok: false, motivo: 'La dirección no se entiende.' }; }
  if (!/^https?:$/.test(u.protocol)) return { ok: false, motivo: 'Solo http o https.' };
  const h = u.hostname.replace(/^\[|\]$/g, '');
  if (PROHIBIDO.some((p) => p.test(h))) return { ok: false, motivo: 'Esa dirección es de adentro y no se abre.' };
  return { ok: true, url: u };
}

// ── El navegador, uno solo y con relevo ─────────────────────────────────────
//
// Arrancar Chromium tarda entre uno y dos segundos, así que se deja vivo entre
// peticiones. Pero un navegador vivo va acumulando memoria, y en 512 MB eso
// termina en una caída: cada tantas páginas se cierra y se abre otro. Se
// prefiere una espera de dos segundos cada cuarenta páginas a una caída.
let navegador = null;
let usadas = 0;

async function elNavegador() {
  if (navegador && navegador.isConnected() && usadas < PAGINAS_POR_NAVEGADOR) return navegador;
  if (navegador) { try { await navegador.close(); } catch { /* ya estaba */ } }
  usadas = 0;
  navegador = await chromium.launch({
    args: [
      '--no-sandbox',                  // en un dyno no hay con qué aislar; el aislamiento es el dyno
      '--disable-dev-shm-usage',       // /dev/shm en Heroku es diminuto: sin esto Chromium se cae solo
      '--disable-gpu',
      '--no-zygote',
      '--disable-background-networking',
      '--disable-extensions',
    ],
  });
  return navegador;
}

/* ── LA COLA DE UNA SOLA FILA ────────────────────────────────────────────────
   Dos pestañas a la vez en 512 MB es una caída, no una lentitud. Las
   peticiones se encadenan en una promesa, igual que el motor de calce de
   Ordenex: un dyno, cero carreras. Lo que espera, espera. */
let cola = Promise.resolve();
function enFila(tarea) {
  const mio = cola.then(tarea, tarea);
  cola = mio.catch(() => {});
  return mio;
}

/** Abre una pestaña, hace lo que se le diga, y la cierra pase lo que pase. */
async function conPagina(fn, { ancho = 1280, alto = 900 } = {}) {
  const nav = await elNavegador();
  usadas += 1;
  const contexto = await nav.newContext({
    viewport: { width: ancho, height: alto },
    locale: 'es-HN',
    timezoneId: 'America/Tegucigalpa',
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 UltronOjo/1',
  });
  const consola = [];
  const fallos = [];
  try {
    /* LA SEGUNDA CERRADURA. Cada petición que la página intenta —la propia, y
       las imágenes, los datos, las redirecciones— pasa por aquí. Sin esto, la
       comprobación de la dirección de entrada no sirve de nada: bastaría una
       página que redirija a la dirección de la nube. */
    await contexto.route('**/*', (ruta) => {
      const v = direccionValida(ruta.request().url());
      if (!v.ok) return ruta.abort('blockedbyclient');
      ruta.continue();
    });
    const pagina = await contexto.newPage();
    pagina.on('console', (m) => {
      if (!['error', 'warning'].includes(m.type())) return;
      if (consola.length < 30) consola.push({ tipo: m.type(), texto: String(m.text()).slice(0, 300) });
    });
    pagina.on('pageerror', (e) => { if (consola.length < 30) consola.push({ tipo: 'error', texto: String(e?.message || e).slice(0, 300) }); });
    pagina.on('requestfailed', (r) => {
      if (fallos.length < 20) fallos.push({ url: String(r.url()).slice(0, 200), porQue: r.failure()?.errorText || '?' });
    });
    pagina.setDefaultTimeout(PLAZO_MS);
    pagina.setDefaultNavigationTimeout(PLAZO_MS);
    return await fn(pagina, { consola, fallos });
  } finally {
    try { await contexto.close(); } catch { /* daba igual */ }
  }
}

// ── Lo que se saca de una página ────────────────────────────────────────────
//
// No solo el texto: TAMBIÉN lo que se puede tocar. Un texto suelto le dice a
// ULTRON qué dice la pantalla, pero no qué puede hacer en ella; y sin eso no
// hay forma de escribir el guion del paso siguiente. Los botones y los campos
// salen con el selector que de verdad funciona para tocarlos.
/* OJO CON PASARLA COMO TEXTO. `evaluate('() => {...}')` no corre la función:
   evalúa la CADENA como expresión, y una expresión de función vale... la
   función. Playwright la devuelve como algo que no se puede serializar, o sea
   `undefined`, y el ojo contestaba «no puedo leer titulo de undefined» en cada
   página. Se pasa como función de verdad y Playwright la manda entera. */
function SACAR() {
  const visible = (e) => {
    const r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden';
  };
  const rotulo = (e) => (e.getAttribute('aria-label') || e.getAttribute('placeholder') || e.getAttribute('name')
    || e.getAttribute('title') || e.textContent || e.value || '').replace(/\s+/g, ' ').trim().slice(0, 80);
  const selector = (e) => {
    if (e.id) return '#' + CSS.escape(e.id);
    if (e.getAttribute('name')) return e.tagName.toLowerCase() + '[name="' + e.getAttribute('name') + '"]';
    if (e.getAttribute('data-t')) return '[data-t="' + e.getAttribute('data-t') + '"]';
    const c = (e.className || '').toString().trim().split(/\s+/)[0];
    return c ? e.tagName.toLowerCase() + '.' + CSS.escape(c) : e.tagName.toLowerCase();
  };
  const lista = (q, tope) => [...document.querySelectorAll(q)].filter(visible).slice(0, tope)
    .map((e) => ({ rotulo: rotulo(e), selector: selector(e), tipo: e.type || e.tagName.toLowerCase() }))
    .filter((x) => x.rotulo || x.tipo === 'password');
  return {
    titulo: document.title || '',
    texto: (document.body ? document.body.innerText : '').replace(/\n{3,}/g, '\n\n').trim(),
    titulares: [...document.querySelectorAll('h1,h2,h3')].filter(visible).slice(0, 30)
      .map((e) => e.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean),
    botones: lista('button,[role="button"],a[href]:not([href^="#"])', 40),
    campos: lista('input:not([type="hidden"]),textarea,select', 25),
  };
}

async function esperarQuieta(pagina, esperar) {
  /* «carga terminada» no es lo mismo que «ya se dibujó». En una casa que se
     arma con JavaScript, `load` llega con la pantalla vacía. Se espera a que
     la red se calme, y si quien pide sabe QUÉ tiene que aparecer, a eso. */
  try { await pagina.waitForLoadState('networkidle', { timeout: Math.min(PLAZO_MS, 12_000) }); } catch { /* con lo que haya */ }
  if (esperar) { try { await pagina.waitForSelector(String(esperar), { timeout: Math.min(PLAZO_MS, 12_000) }); } catch { /* se dirá que no salió */ } }
}

// ── MIRAR ───────────────────────────────────────────────────────────────────
app.post('/mirar', async (req, res) => {
  const v = direccionValida(req.body?.url);
  if (!v.ok) return res.status(400).json({ error: v.motivo, codigo: 'URL' });
  try {
    const r = await enFila(() => conPagina(async (pagina, { consola, fallos }) => {
      const t0 = Date.now();
      const resp = await pagina.goto(v.url.toString(), { waitUntil: 'domcontentloaded' });
      await esperarQuieta(pagina, req.body?.esperar);
      const d = await pagina.evaluate(SACAR);
      return {
        ok: true, url: pagina.url(), estado: resp?.status() ?? null,
        titulo: d.titulo, titulares: d.titulares,
        texto: d.texto.slice(0, TOPE_TEXTO), recortado: d.texto.length > TOPE_TEXTO,
        botones: d.botones, campos: d.campos,
        consola, peticionesFallidas: fallos, ms: Date.now() - t0,
      };
    }, { ancho: Number(req.body?.ancho) || 1280, alto: Number(req.body?.alto) || 900 }));
    res.json(r);
  } catch (e) {
    res.status(502).json({ error: String(e?.message || e).slice(0, 300), codigo: 'NAVEGADOR' });
  }
});

// ── FOTO ────────────────────────────────────────────────────────────────────
// Devuelve la imagen en base64 y no un archivo: quien la pide (ULTRON) la
// guarda como documento suyo, con su dueño y su caducidad. El ojo no guarda
// nada de nadie — no tiene disco que sobreviva al reinicio ni tiene por qué.
app.post('/foto', async (req, res) => {
  const v = direccionValida(req.body?.url);
  if (!v.ok) return res.status(400).json({ error: v.motivo, codigo: 'URL' });
  try {
    const r = await enFila(() => conPagina(async (pagina) => {
      const resp = await pagina.goto(v.url.toString(), { waitUntil: 'domcontentloaded' });
      await esperarQuieta(pagina, req.body?.esperar);
      const png = await pagina.screenshot({ type: 'png', fullPage: !!req.body?.completa });
      return { ok: true, url: pagina.url(), estado: resp?.status() ?? null, titulo: await pagina.title(), png: png.toString('base64'), bytes: png.length };
    }, { ancho: Number(req.body?.ancho) || 1280, alto: Number(req.body?.alto) || 900 }));
    res.json(r);
  } catch (e) {
    res.status(502).json({ error: String(e?.message || e).slice(0, 300), codigo: 'NAVEGADOR' });
  }
});

// ── GUION: entrar de verdad ─────────────────────────────────────────────────
//
// Un idioma diminuto y a propósito. Se pensó en dejar correr JavaScript suelto
// y se descartó: eso convierte al ojo en una consola remota con clave, y el
// día que la clave se filtre, quien la tenga corre lo que quiera dentro de
// nuestra red. Con seis verbos se hace todo lo que hace falta —entrar, llenar
// un formulario, recorrer un flujo— y lo que no está no se puede pedir.
//
//   { tipo:'ir',       url }
//   { tipo:'escribir', selector, texto }      · o `secreto` en vez de `texto`
//   { tipo:'tocar',    selector }             · o `texto` para tocar por rótulo
//   { tipo:'esperar',  selector }             · o `ms`
//   { tipo:'leer' }                           · saca la página entera
//   { tipo:'foto' }
//
// LOS SECRETOS. `secreto` trae el valor de una clave que ULTRON sacó de su
// bóveda. Se escribe en el campo y se acaba ahí: no entra en el registro, no
// vuelve en la respuesta, y en el diario del paso se anota «(un secreto)».
const VERBOS = new Set(['ir', 'escribir', 'tocar', 'esperar', 'leer', 'foto']);

app.post('/guion', async (req, res) => {
  const pasos = Array.isArray(req.body?.pasos) ? req.body.pasos.slice(0, 25) : null;
  if (!pasos || !pasos.length) return res.status(400).json({ error: 'Hace falta al menos un paso.', codigo: 'PASOS' });
  for (const p of pasos) {
    if (!VERBOS.has(p?.tipo)) return res.status(400).json({ error: `Paso desconocido: ${p?.tipo}. Los que hay: ${[...VERBOS].join(', ')}.`, codigo: 'PASO' });
    if (p.tipo === 'ir') {
      const v = direccionValida(p.url);
      if (!v.ok) return res.status(400).json({ error: v.motivo, codigo: 'URL' });
    }
  }
  try {
    const r = await enFila(() => conPagina(async (pagina, { consola, fallos }) => {
      const diario = [];
      let ultima = null;
      let foto = null;
      for (const [i, p] of pasos.entries()) {
        const t0 = Date.now();
        try {
          if (p.tipo === 'ir') {
            const resp = await pagina.goto(String(p.url), { waitUntil: 'domcontentloaded' });
            await esperarQuieta(pagina, p.esperar);
            diario.push({ paso: i + 1, tipo: 'ir', que: String(p.url), estado: resp?.status() ?? null, ok: true, ms: Date.now() - t0 });
          } else if (p.tipo === 'escribir') {
            const secreto = typeof p.secreto === 'string' && p.secreto.length > 0;
            await pagina.fill(String(p.selector), secreto ? p.secreto : String(p.texto ?? ''));
            /* Aquí está la línea que hace que un secreto siga siendo secreto. */
            diario.push({ paso: i + 1, tipo: 'escribir', que: String(p.selector), valor: secreto ? '(un secreto)' : String(p.texto ?? '').slice(0, 60), ok: true, ms: Date.now() - t0 });
          } else if (p.tipo === 'tocar') {
            if (p.texto) await pagina.getByText(String(p.texto), { exact: false }).first().click();
            else await pagina.click(String(p.selector));
            await esperarQuieta(pagina, p.esperar);
            diario.push({ paso: i + 1, tipo: 'tocar', que: String(p.texto || p.selector), ok: true, ms: Date.now() - t0 });
          } else if (p.tipo === 'esperar') {
            if (p.selector) await pagina.waitForSelector(String(p.selector), { timeout: Math.min(PLAZO_MS, 15_000) });
            else await pagina.waitForTimeout(Math.min(Number(p.ms) || 1000, 10_000));
            diario.push({ paso: i + 1, tipo: 'esperar', que: String(p.selector || `${p.ms} ms`), ok: true, ms: Date.now() - t0 });
          } else if (p.tipo === 'leer') {
            ultima = await pagina.evaluate(SACAR);
            diario.push({ paso: i + 1, tipo: 'leer', que: pagina.url(), ok: true, ms: Date.now() - t0 });
          } else if (p.tipo === 'foto') {
            foto = (await pagina.screenshot({ type: 'png', fullPage: !!p.completa })).toString('base64');
            diario.push({ paso: i + 1, tipo: 'foto', que: pagina.url(), ok: true, ms: Date.now() - t0 });
          }
        } catch (e) {
          /* UN PASO QUE FALLA CORTA EL GUION. Seguir sería hacer los pasos
             siguientes sobre una pantalla que no es la que se creía — tocar a
             ciegas dentro de la casa de alguien. Se devuelve lo hecho hasta
             aquí, que es lo que deja arreglar el guion. */
          diario.push({ paso: i + 1, tipo: p.tipo, que: String(p.texto || p.selector || p.url || ''), ok: false, porQue: String(e?.message || e).slice(0, 200), ms: Date.now() - t0 });
          break;
        }
      }
      if (!ultima) ultima = await pagina.evaluate(SACAR).catch(() => null);
      return {
        ok: diario.every((d) => d.ok), diario, url: pagina.url(),
        titulo: ultima?.titulo || '', texto: (ultima?.texto || '').slice(0, TOPE_TEXTO),
        titulares: ultima?.titulares || [], botones: ultima?.botones || [], campos: ultima?.campos || [],
        png: foto, consola, peticionesFallidas: fallos,
      };
    }, { ancho: Number(req.body?.ancho) || 1280, alto: Number(req.body?.alto) || 900 }));
    res.json(r);
  } catch (e) {
    res.status(502).json({ error: String(e?.message || e).slice(0, 300), codigo: 'NAVEGADOR' });
  }
});

// ── SALUD ───────────────────────────────────────────────────────────────────
// Sin clave: es lo que mira el vigía de ULTRON y lo que dice si el ojo está
// vivo. No enseña nada que no se pueda enseñar.
app.get('/salud', (req, res) => {
  const m = process.memoryUsage();
  res.json({
    ok: true, servicio: 'ultron-ojo',
    navegador: !!(navegador && navegador.isConnected()),
    paginasDeEsteNavegador: usadas, seRelevaA: PAGINAS_POR_NAVEGADOR,
    conClave: !!CLAVE,
    memoriaMb: Math.round(m.rss / 1048576),
    enPieDesdeSegundos: Math.round(process.uptime()),
  });
});

app.use((req, res) => res.status(404).json({ error: 'Aquí no hay nada.', codigo: 'NO_HAY' }));

if (require.main === module) {
  app.listen(PUERTO, () => {
    console.log(`[ojo] mirando en :${PUERTO} · clave ${CLAVE ? 'puesta' : 'SIN PONER (no atiende a nadie)'}`);
  });
  /* Que el navegador se cierre al apagar. Un Chromium huérfano en un dyno que
     se reinicia se queda comiendo memoria hasta que Heroku mata todo. */
  for (const señal of ['SIGTERM', 'SIGINT']) {
    process.on(señal, async () => { try { if (navegador) await navegador.close(); } catch { /* nada */ } process.exit(0); });
  }
}

module.exports = { app, direccionValida, PROHIBIDO, VERBOS };
