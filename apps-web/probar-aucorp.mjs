/* El sitio de AuCorp.
 *
 *   node probar-aucorp.mjs
 *
 * Un sitio de presentación no maneja dinero, así que lo que se comprueba aquí
 * es otra cosa: que diga lo que tiene que decir y que no se rompa a la vista.
 *
 *  1. Que la relación con el ecosistema quede DICHA. Es la razón por la que se
 *     rehízo la página: la anterior no la mencionaba en ninguna parte.
 *  2. Que los dos idiomas cubran las mismas claves. Una que falte deja media
 *     pantalla en el otro idioma y solo se descubre cuando alguien la abre.
 *  3. Que en un teléfono no se salga nada de la pantalla.
 *  4. Que el diagrama tenga rótulo accesible: es donde vive el mensaje
 *     principal, y quien no lo ve tiene que enterarse igual.
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), 'aucorp');
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
                '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };

const sv = createServer(async (q, r) => {
  try {
    const p = join(RAIZ, decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/, '/index.html'));
    const d = await readFile(p);
    r.writeHead(200, { 'Content-Type': TIPOS[extname(p)] || 'application/octet-stream' });
    r.end(d);
  } catch { r.writeHead(404); r.end('no'); }
});
await new Promise((r) => sv.listen(0, r));
const BASE = `http://127.0.0.1:${sv.address().port}`;

let malas = 0;
const decir = (ok, que, extra = '') => {
  if (!ok) malas++;
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${que}`);
  if (extra) console.log(`           ${String(extra).replace(/\s+/g, ' ').slice(0, 150)}`);
};

const nav = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const p = await nav.newPage({ viewport: { width: 1440, height: 900 }, locale: 'es-HN' });
const errores = [];
p.on('pageerror', (e) => errores.push(e.message));
p.on('console', (m) => {
  if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errores.push(m.text());
});
await p.goto(BASE, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(1400);

console.log('\n── LO QUE HABÍA QUE DEJAR CLARO ──────────────────────────────');
{
  const txt = await p.evaluate(() => document.body.innerText);
  decir(/aliada de orden global/i.test(txt),
    'la página dice que AuCorp es ALIADA de Orden Global');
  decir(/due[ñn]a de ordenex/i.test(txt) || /propiedad de aucorp/i.test(txt),
    'y que es DUEÑA de Ordenex');
  decir(/ninguna es filial de la otra/i.test(txt),
    'y aclara que ninguna es filial de la otra — que es lo que se confunde solo');

  // El diagrama es donde vive el mensaje. Su rótulo tiene que decir lo mismo.
  const rot = await p.evaluate(() => document.querySelector('.mapa svg')?.getAttribute('aria-label') || '');
  decir(/aliada/i.test(rot) && /due[ñn]a/i.test(rot),
    'el diagrama lo dice también en su rótulo accesible', rot);
}

console.log('\n── los dos idiomas ───────────────────────────────────────────');
{
  const claves = await p.evaluate(() => ({ es: Object.keys(AUCORP.I18N.es), en: Object.keys(AUCORP.I18N.en) }));
  const soloEs = claves.es.filter((k) => !claves.en.includes(k));
  const soloEn = claves.en.filter((k) => !claves.es.includes(k));
  decir(soloEs.length === 0 && soloEn.length === 0,
    `los dos idiomas cubren las mismas ${claves.es.length} claves`,
    [soloEs.length ? 'solo es: ' + soloEs.join(', ') : '',
     soloEn.length ? 'solo en: ' + soloEn.join(', ') : ''].filter(Boolean).join(' · '));

  const huerfanas = await p.evaluate(() =>
    [...document.querySelectorAll('[data-t]')].map((e) => e.dataset.t).filter((k) => !(k in AUCORP.I18N.es)));
  decir(huerfanas.length === 0, 'cada texto de la página tiene su clave', huerfanas.join(', '));

  const vacios = await p.evaluate(() =>
    [...document.querySelectorAll('[data-t]')].filter((e) => !e.textContent.trim()).map((e) => e.dataset.t));
  decir(vacios.length === 0, 'y ninguno se queda en blanco', vacios.join(', '));

  const antes = await p.evaluate(() => document.body.innerText.slice(0, 300));
  await p.click('[data-lang="en"]');
  await p.waitForTimeout(400);
  const despues = await p.evaluate(() => document.body.innerText.slice(0, 300));
  decir(antes !== despues, 'cambiar a inglés cambia la página');

  const enTxt = await p.evaluate(() => document.body.innerText);
  decir(/ally of orden global/i.test(enTxt) && /owner of ordenex/i.test(enTxt),
    'y en inglés también se dice la relación', '');
  decir(await p.evaluate(() => document.documentElement.lang) === 'en', 'el lang del documento cambia');

  await p.reload({ waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(900);
  decir(await p.evaluate(() => document.documentElement.lang) === 'en', 'y al recargar sigue en inglés');
  await p.click('[data-lang="es"]');
  await p.waitForTimeout(300);
}

console.log('\n── se ve entera ──────────────────────────────────────────────');
{
  const antesRev = await p.evaluate(() => document.querySelectorAll('.rev.ve').length);
  await p.evaluate(() => scrollTo(0, document.body.scrollHeight));
  await p.waitForTimeout(1500);
  const tras = await p.evaluate(() => ({
    ve: document.querySelectorAll('.rev.ve').length, total: document.querySelectorAll('.rev').length }));
  decir(tras.ve === tras.total && tras.total > 0,
    'todos los bloques del recorrido aparecen al bajar', `${antesRev} al abrir, ${tras.ve} de ${tras.total} al final`);

  // La cabecera cambia de piel al salir del héroe. Si no lo hiciera, el texto
  // claro quedaría sobre el fondo hueso: ilegible.
  const oscura = await p.evaluate(() => document.getElementById('top').classList.contains('oscura'));
  decir(oscura === false, 'fuera del héroe la cabecera se pasa a tinta sobre hueso');
  // 'instant' y no el scroll suave del CSS: si no, la prueba mide mientras la
  // pagina todavia esta subiendo y acusa de rota una cabecera sana.
  await p.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
  await p.waitForTimeout(500);
  decir(await p.evaluate(() => document.getElementById('top').classList.contains('oscura')),
    'y sobre el héroe vuelve a la clara');

  const trazo = await p.evaluate(() => {
    const c = document.getElementById('trazo');
    return { w: c.width, h: c.height, pintado: c.getContext('2d').getImageData(0, 0, c.width, c.height).data.some((x) => x !== 0) };
  });
  decir(trazo.w > 0 && trazo.pintado, 'el trazo del héroe se dibuja de verdad', `${trazo.w}×${trazo.h}`);
}

console.log('\n── no se parece a las otras casas ────────────────────────────');
{
  // El ecosistema entero usa el pozo verde #021B1C. Si aparece aquí, es que
  // alguien copió la paleta de al lado y AuCorp dejó de tener cara propia.
  const css = await p.evaluate(() => [...document.querySelectorAll('style')].map((s) => s.textContent).join(''));
  decir(!/#021B1C/i.test(css), 'no aparece el pozo verde del ecosistema Orden Global');
  const fondo = await p.evaluate(() => getComputedStyle(document.body).backgroundColor);
  decir(fondo === 'rgb(246, 242, 233)', 'el fondo es claro, al revés que las otras casas', fondo);
  decir(/Fraunces/.test(css) && !/Archivo/.test(css),
    'y la voz tipográfica es propia: Fraunces, no la Archivo de al lado');
}

console.log('\n── en un teléfono ────────────────────────────────────────────');
{
  const tel = await nav.newPage({ viewport: { width: 390, height: 844 }, locale: 'es-HN' });
  tel.on('pageerror', (e) => errores.push('móvil: ' + e.message));
  await tel.goto(BASE, { waitUntil: 'domcontentloaded' });
  await tel.waitForTimeout(1500);
  const sobra = await tel.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  decir(sobra <= 1, 'no hay desplazamiento lateral', `sobra ${sobra} px`);

  // El carril del trazo se retira en pantalla estrecha: un adorno que empuja
  // el contenido deja de ser estructura.
  const sangria = await tel.evaluate(() =>
    parseFloat(getComputedStyle(document.querySelector('.tramo')).paddingLeft));
  decir(sangria < 20, 'el carril del circuito se retira y no come ancho', `${sangria} px`);

  /* El selector de idioma se estrujaba hasta esconder EN: quedaba un circulo
     con «ES» y en un telefono no habia manera de cambiar de idioma. Se mide el
     ancho de verdad del boton, no que exista en el DOM — existia. */
  const en = await tel.evaluate(() => {
    const b = document.querySelector('[data-lang="en"]');
    const r = b.getBoundingClientRect();
    return { w: Math.round(r.width), visible: r.width > 20 && r.right <= innerWidth + 1 };
  });
  decir(en.visible, 'el boton EN se ve entero y se puede pulsar', `${en.w} px de ancho`);
  await tel.click('[data-lang="en"]');
  await tel.waitForTimeout(300);
  decir(await tel.evaluate(() => document.documentElement.lang) === 'en',
    'y pulsarlo cambia el idioma de verdad');

  await tel.close();
}

decir(errores.length === 0, 'sin errores de consola', errores.slice(0, 3).join(' · '));

await p.screenshot({ path: '/tmp/aucorp-inicio.png', fullPage: false });
await nav.close(); sv.close();
console.log(malas ? `\n${malas} comprobación(es) fallaron\n` : '\nTodo en verde\n');
process.exit(malas ? 1 : 0);
