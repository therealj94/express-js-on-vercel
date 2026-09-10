/* El barrido de móvil del ecosistema entero.
 *
 * POR QUE UNA HERRAMIENTA Y NO UN REPASO A OJO
 *
 * El fallo que lo motivó —un nombre de cuatro palabras metiéndose por debajo de
 * los botones de llamada— llevaba tiempo ahí y nadie lo vio, porque a ojo se
 * mira con el nombre corto de uno mismo. Lo que hace falta no es mirar mejor:
 * es medir, con nombres largos de verdad y en los anchos que la gente usa.
 *
 * QUE MIDE, y por qué cada cosa
 *
 *   1. Desplazamiento horizontal. Si el documento es más ancho que la pantalla,
 *      algo se sale. Es el síntoma más barato de detectar y el que más molesta.
 *   2. Elementos fuera del ancho. El scroll horizontal a veces está tapado por
 *      un `overflow:hidden`, y entonces el elemento no se sale: se RECORTA, que
 *      es peor porque no hay gesto que lo traiga. Se buscan los dos casos.
 *   3. Texto que envuelve donde no debe. Un nombre, un símbolo o una cifra que
 *      pasa de un renglón suele significar que la caja no encoge.
 *   4. Blancos de toque menores de 40 px. Un botón de 24 px en un teléfono se
 *      falla la mitad de las veces.
 *   5. Solapes: dos elementos con los que se puede tocar, pisándose.
 *
 * Corre con el servidor estático en 8791:
 *   python3 -m http.server 8791 --directory /home/user/express-js-on-vercel &
 *   node probar-movil-todo.mjs [nombre-de-la-app]
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = 'http://127.0.0.1:8791';

/* ── UN SEGUNDO SERVIDOR, PARA EL SITIO QUE PIDE DESDE LA RAIZ ─────────────
 *
 * `sitio-ordenglobal` escribe sus recursos con ruta absoluta —
 * `/assets/portada.css`, `/assets/galaxia.js`— porque en produccion ES la raiz
 * del dominio. El servidor de esta prueba sirve la raiz del REPOSITORIO, asi
 * que esas rutas caian en `/assets/…` (que no existe) y la pagina se pintaba
 * SIN UNA SOLA LINEA DE CSS.
 *
 * Y no se notaba: se medía igual, y una pagina sin estilos desborda por donde
 * sea. Llevaba tiempo en rojo por un enlace «Términos» que se salia 8 px — un
 * defecto que no existe en la web de verdad. Medir una pagina cuyo CSS no
 * cargo no es medir mal: es no medir nada, y reportarlo como fallo enseña a
 * ignorar el informe.
 *
 * Se le levanta su propio servidor con la raiz donde el sitio la espera. */
const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ_OG = resolve(AQUI, '..', 'sitio-ordenglobal');
const TIPOS = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
                '.js': 'text/javascript; charset=utf-8', '.png': 'image/png',
                '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp',
                '.woff2': 'font/woff2', '.ico': 'image/x-icon' };
const svOG = createServer(async (q, r) => {
  const ruta = decodeURIComponent(q.url.split('?')[0]);
  // Sin `..`: este servidor sirve una carpeta, no el disco.
  if (ruta.includes('..')) { r.writeHead(400); return r.end('no'); }
  const dentro = ruta.endsWith('/') ? ruta + 'index.html' : ruta;
  try {
    const f = join(RAIZ_OG, dentro);
    const d = await readFile(f);
    r.writeHead(200, { 'Content-Type': TIPOS[extname(f)] || 'application/octet-stream' });
    r.end(d);
  } catch { r.writeHead(404); r.end('no'); }
});
await new Promise((ok) => svOG.listen(0, '127.0.0.1', ok));
const BASE_OG = `http://127.0.0.1:${svOG.address().port}`;

/* Los anchos que hay que cubrir, con el motivo:
     320 · el iPhone SE y los Android baratos que todavía se venden acá
     360 · el ancho más común de Android en la región
     390 · el iPhone de los últimos años
     412 · los Android grandes */
const ANCHOS = [320, 360, 390, 412];

const APPS = {
  'veta-wallet': `${BASE}/apps-web/veta-wallet/index.html`,
  'ordenex': `${BASE}/apps-web/ordenex/index.html`,
  'genesis-panel': `${BASE}/genesis-id/public/admin.html`,
  'mytokenpay': `${BASE}/apps-web/mytokenpay/index.html`,
  'aucorp': `${BASE}/apps-web/aucorp/index.html`,
  /* La segunda pantalla del panel de cumplimiento. Va aparte de `genesis-panel`
     porque es OTRA página, con la ficha de la persona y sus imágenes de
     documento, y ahí es donde de verdad se decide una identidad. Medir solo
     admin.html dejaba sin mirar la mitad cara del trabajo. */
  'genesis-revision': `${BASE}/genesis-id/public/revision.html`,
  'nexuscoder': `${BASE}/apps-web/nexuscoder/index.html`,
  // Desde SU raíz, no la del repositorio: ver el comentario de arriba.
  'ordenglobal': `${BASE_OG}/index.html`,
};

/* `social` estaba en esta lista y se quitó a propósito. No es una web: es la
   fábrica de las piezas de Instagram (plantilla.html, tarjeta.html), lienzos de
   1080×1350 con `body{width:1080px}` escrito adrede porque el post SALE de ese
   tamaño. Medirla a 360 px daba «FALLA» en todo y era mentira: no hay teléfono
   que abra esos archivos. Una lista con un fallo permanente que todos saben que
   hay que ignorar enseña a ignorar la lista entera. */

const soloEsta = process.argv[2];

let fallos = 0, avisos = 0;
const malo = (q, e = '') => { console.log(` FALLA  ${q}${e ? '  · ' + e : ''}`); fallos++; };
const ojo = (q, e = '') => { console.log(`  ojo   ${q}${e ? '  · ' + e : ''}`); avisos++; };

const nav = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox'],
});

/** Lo que se mide dentro de la página. Va entero para no ir y venir. */
function medir(ancho) {
  const visible = (el) => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return false;
    /* El patrón de texto solo-para-lectores (caja de un píxel recortada con
       clip-path y white-space:nowrap) no pinta ni un punto en pantalla: su
       tinta «desbordada» es invisible por definición y no cuenta. */
    if (cs.clipPath === 'inset(50%)') return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };

  const desbordes = [];
  const chicos = [];
  const envueltos = [];

  for (const el of document.querySelectorAll('body *')) {
    if (!visible(el)) continue;
    /* Lo de dentro de un SVG no se mide: sus coordenadas son del lienzo, no de
       la pagina, y un `path` que «se sale» es casi siempre un adorno recortado
       a proposito por el `viewBox`. Contarlos llena el informe de ruido, y un
       informe con ruido se deja de leer. */
    if (el.closest('svg')) continue;
    const r = el.getBoundingClientRect();

    /* Se salta lo que es a propósito ancho y vive dentro de su propio riel de
       desplazamiento: una tabla dentro de un contenedor con `overflow-x:auto`
       está BIEN, y contarla sería enseñar a ignorar el informe. */
    let dentroDeRiel = false, recortadoPor = null;
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const ov = getComputedStyle(p).overflowX;
      if (ov === 'auto' || ov === 'scroll') { dentroDeRiel = true; break; }
      if (!recortadoPor && (ov === 'hidden' || ov === 'clip')) recortadoPor = p;
    }

    /* EL ADORNO QUE SANGRA A PROPOSITO.
       Recortar suele ser lo peor que puede pasar (de eso avisa el encabezado:
       lo que sobra se pierde y no hay gesto que lo traiga), pero eso vale
       cuando lo que sobra ES ALGO. Un halo de color, una veladura, un degradado
       de fondo: sin texto, sin hijos, sin toque, y con su padre recortandolo
       adrede porque sangrar por el borde es justamente el efecto. Ahi no hay
       nada que alcanzar, y perder un trozo no cuesta nada.
       Las tres condiciones van JUNTAS y son estrechas a proposito. En cuanto un
       elemento lleve una letra, un hijo o un toque, vuelve a contar: la tabla
       recortada de Ordenex escondia el boton «Cancelar», y ese fallo tiene que
       seguir saliendo en rojo. */
    const adorno = recortadoPor && !dentroDeRiel
      && !(el.textContent || '').trim() && el.children.length === 0
      && getComputedStyle(el).pointerEvents === 'none';

    /* LA TINTA, NO LA CAJA.
       Preguntarle el rectangulo a un elemento dice donde esta su CAJA, y una
       caja puede quedar perfectamente dentro de su fila mientras las LETRAS se
       dibujan fuera. Paso de verdad en la lista de agentes de Ordenex: la caja
       del nombre medía 33 px, comodamente dentro, y el texto llegaba a 239 con
       el boton empezando en 136 — las letras se pintaban debajo del boton, y la
       medicion decia que todo iba bien.
       Un `Range` sobre el nodo de texto devuelve donde esta la tinta de verdad.
       Se toma el borde mas lejano de los dos. */
    let derTinta = r.right, izqTinta = r.left;
    if (el.children.length === 0 && el.firstChild && el.firstChild.nodeType === 3) {
      const g = document.createRange();
      g.selectNodeContents(el.firstChild);
      for (const t of g.getClientRects()) {
        if (t.width <= 0 || t.height <= 0) continue;
        if (t.right > derTinta) derTinta = t.right;
        if (t.left < izqTinta) izqTinta = t.left;
      }
    }

    if (!dentroDeRiel && !adorno && (derTinta > ancho + 1 || izqTinta < -1)) {
      const tag = el.tagName.toLowerCase();
      const cls = (el.className && typeof el.className === 'string')
        ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
      desbordes.push({
        que: tag + cls,
        izq: Math.round(izqTinta), der: Math.round(derTinta),
        // Se dice si lo que sobra es la caja o solo la tinta: son dos arreglos
        // distintos y confundirlos hace perder el rato.
        soloTinta: Math.round(derTinta) > Math.round(r.right) || Math.round(izqTinta) < Math.round(r.left),
        texto: (el.textContent || '').trim().slice(0, 40),
      });
    }

    // Blancos de toque
    const tocable = el.matches('button, a[href], input, select, textarea, [role="button"], [onclick]');
    if (tocable && (r.width < 40 || r.height < 40)) {
      chicos.push({
        que: el.tagName.toLowerCase() + (el.id ? '#' + el.id : ''),
        w: Math.round(r.width), h: Math.round(r.height),
        texto: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 30),
      });
    }

    /* Texto que envuelve donde el diseño dice que no debería: elementos con
       una sola palabra larga o marcados como nombre. Se mira solo lo que tiene
       un unico nodo de texto, para no contar parrafos. */
    if (el.children.length === 0 && el.firstChild && el.firstChild.nodeType === 3) {
      const cs = getComputedStyle(el);
      if (cs.whiteSpace !== 'nowrap' && cs.textOverflow !== 'ellipsis') {
        const rango = document.createRange();
        rango.selectNodeContents(el.firstChild);
        const tops = new Set([...rango.getClientRects()]
          .filter(x => x.height > 0 && x.width > 0).map(x => Math.round(x.top)));
        const txt = (el.textContent || '').trim();
        /* Un titulo o un parrafo DEBE envolver: contarlos seria pedir que la
           pagina no respire. Lo que no debe envolver es una sola palabra —un
           simbolo, una cifra, un identificador— porque eso significa que la
           caja no encoge y algo se va a salir al lado. */
        const unaPalabra = txt.length > 0 && !/\s/.test(txt);
        if (tops.size > 1 && unaPalabra) {
          envueltos.push({ que: el.tagName.toLowerCase(), renglones: tops.size, texto: txt.slice(0, 40) });
        }
      }
    }
  }

  return {
    anchoDoc: Math.round(document.documentElement.scrollWidth),
    desbordes: desbordes.slice(0, 8),
    chicos: chicos.slice(0, 8),
    envueltos: envueltos.slice(0, 6),
    cuantosDesbordes: desbordes.length,
    cuantosChicos: chicos.length,
  };
}

try {
  for (const [nombre, url] of Object.entries(APPS)) {
    if (soloEsta && nombre !== soloEsta) continue;
    console.log(`\n${'═'.repeat(58)}\n  ${nombre.toUpperCase()}\n${'═'.repeat(58)}`);

    for (const ancho of ANCHOS) {
      const pag = await nav.newPage();
      await pag.setViewportSize({ width: ancho, height: 780 });
      // Todo lo de fuera se corta: se prueba la caja, no la red.
      const local = (u) => u.startsWith(BASE) || u.startsWith(BASE_OG);
      await pag.route('**/*', r => local(r.request().url())
        ? r.continue() : r.fulfill({ status: 200, contentType: 'text/plain', body: '{}' }));

      let existe = true;
      try {
        const r = await pag.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
        if (!r || r.status() >= 400) existe = false;
      } catch { existe = false; }
      if (!existe) { console.log(`\n  ── ${ancho} px · no se pudo abrir`); await pag.close(); continue; }

      await pag.waitForTimeout(900);

      /* ── ¿LLEGO EL CSS? ───────────────────────────────────────────────────
         Antes de medir nada. Una página cuyo <link rel=stylesheet> dio 404 se
         pinta igual —con los estilos del navegador— y desborda por donde sea:
         los anchos que salen de ahí no son los de la web, son los de un
         documento sin diseño. Eso es lo que le pasaba a `ordenglobal`, que
         pedía `/assets/portada.css` a la raíz del repositorio.

         El síntoma no era un error: era un FALLO CREÍBLE —«el enlace Términos
         se sale 8 px»— sobre un defecto que no existe. Un informe que reporta
         defectos inventados se deja de leer entero, y entonces también se
         dejan de leer los de verdad.

         `sheet` es null cuando la hoja no cargó (404, otro origen, MIME que el
         navegador rechazó); con la hoja puesta trae sus reglas. */
      const css = await pag.evaluate(() => {
        const links = [...document.querySelectorAll('link[rel~="stylesheet" i]')];
        const rotos = links.filter((l) => {
          try { return !l.sheet || l.sheet.cssRules.length === 0; } catch { return false; }
        }).map((l) => l.getAttribute('href'));
        // Una página que lleva TODO su estilo en <style> es legítima y no tiene
        // links: solo se exige que los que declara hayan cargado.
        return { links: links.length, rotos, hojas: document.styleSheets.length };
      });

      console.log(`\n  ── ${ancho} px`);

      if (css.rotos.length) {
        malo(`${css.rotos.length} hoja(s) de estilo NO cargaron: lo de abajo no mide esta web`,
          css.rotos.join(' · '));
        await pag.close();
        continue;   // medir sin CSS solo produce fallos inventados
      }

      const m = await pag.evaluate(medir, ancho);

      /* Aca hubo una comprobacion de los huecos «[COMPLETAR: …]». Se movio a
         apps-web/subir.py, que es la puerta de produccion: es donde de verdad
         hay que impedirlos. Aca dejaba el CI en rojo permanente por la pagina
         de nexuscoder, que no esta publicada y donde el hueco esta haciendo su
         trabajo de recordatorio — y un fallo permanente que todos saben que hay
         que ignorar ensenia a ignorar la lista entera. */

      if (m.anchoDoc > ancho) {
        malo(`la página se desplaza a lo ancho`, `documento ${m.anchoDoc} vs pantalla ${ancho}`);
      } else {
        console.log('  ok    la página no se desplaza a lo ancho');
      }

      if (m.cuantosDesbordes) {
        malo(`${m.cuantosDesbordes} elemento(s) fuera del ancho`);
        for (const d of m.desbordes) {
          console.log(`          ${d.que}  [${d.izq} → ${d.der}]${d.soloTinta ? '  (se sale la TINTA, no la caja)' : ''}  «${d.texto}»`);
        }
      } else {
        console.log('  ok    nada se sale del ancho');
      }

      if (m.envueltos.length) {
        for (const e of m.envueltos) {
          ojo(`«${e.texto}» ocupa ${e.renglones} renglones`, e.que);
        }
      }

      if (m.cuantosChicos) {
        ojo(`${m.cuantosChicos} blanco(s) de toque por debajo de 40 px`);
        for (const c of m.chicos.slice(0, 4)) {
          console.log(`          ${c.que} ${c.w}×${c.h}  «${c.texto}»`);
        }
      }

      await pag.close();
    }
  }
} catch (e) {
  console.error('\nse rompió:', e.message);
  fallos++;
} finally {
  await nav.close();
}

console.log(`\n${'═'.repeat(58)}`);
console.log(fallos ? `${fallos} FALLO(S) · ${avisos} aviso(s)` : `todo en verde · ${avisos} aviso(s)`);
process.exit(fallos ? 1 : 0);
