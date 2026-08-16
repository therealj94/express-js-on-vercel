/* La gráfica de velas, mirada por un navegador de verdad.
 *
 *   node apps-web/ordenex/pruebas/probar-velas-web.mjs
 *
 * Un canvas no se puede leer con querySelector: lo que promete solo se
 * comprueba mirando los píxeles. Aquí se sirve una página mínima con velas.js
 * (la pieza bajo prueba, sola — sus vecinas tienen sus propias pruebas), se
 * pintan velas sintéticas deterministas y se muestrea el resultado: que haya
 * jade y coral de verdad, que la ficha aparezca al mover el ratón y se vaya
 * al salir, que el apagador apague, y que cero velas digan «sin tratos
 * todavía» en vez de dejar un lienzo vacío — porque un mercado recién nacido
 * y una gráfica rota tienen que verse distinto.
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
                '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
                '.woff2': 'font/woff2', '.woff': 'font/woff' };

/* La página de ensayo: un canvas con tamaño CSS fijo y velas.js, nada más.
   El fondo es el pozo de la casa para mirar la gráfica sobre su color real,
   pero el canvas queda transparente: todo píxel con alfa es píxel pintado. */
const PAGINA = `<meta charset="utf-8"><title>ensayo velas</title>
<style>body{background:#021B1C;margin:0}#cv{width:640px;height:360px;display:block;margin:20px}</style>
<canvas id="cv"></canvas>
<script src="velas.js"></script>`;

const sv = createServer(async (q, r) => {
  const ruta = decodeURIComponent(q.url.split('?')[0]);
  if (ruta === '/' || ruta === '/prueba-velas.html') {
    r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return r.end(PAGINA);
  }
  try {
    const p = join(RAIZ, ruta);
    const d = await readFile(p);
    r.writeHead(200, { 'Content-Type': TIPOS[extname(p)] || 'application/octet-stream' });
    r.end(d);
  } catch { r.writeHead(404); r.end('no'); }
});
await new Promise((r) => sv.listen(0, r));
const BASE = `http://127.0.0.1:${sv.address().port}/prueba-velas.html`;

let malas = 0;
const decir = (ok, que, extra = '') => {
  if (!ok) malas++;
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${que}`);
  if (extra) console.log(`           ${String(extra).replace(/\s+/g, ' ').slice(0, 120)}`);
};

const nav = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
// deviceScaleFactor 2 a propósito: si el devicePixelRatio está mal manejado,
// el lienzo interno no mide el doble y la primera comprobación lo delata.
const p = await nav.newPage({ viewport: { width: 1024, height: 760 }, deviceScaleFactor: 2 });
const errores = [];
p.on('pageerror', (e) => errores.push(e.message));
await p.goto(BASE);
await p.waitForTimeout(300);

/* Los ayudantes viven en la página porque los píxeles viven allá.
   - hacerVelas: sintéticas y DETERMINISTAS (nada de Math.random: una prueba
     que falla a veces no prueba nada), con subidas, bajadas y algún doji.
   - contar: muestrea el lienzo entero y clasifica por color con tolerancia,
     porque el des-premultiplicado del canvas mueve los canales un pelo. */
await p.evaluate(() => {
  window.hacerVelas = (n) => {
    const U = 10n ** 18n;
    const velas = [];
    let precio = (26n * U) / 10n;                       // arranca en 2.6 ORIGEN
    const t0 = Date.UTC(2026, 7, 14, 0, 0, 0);
    for (let i = 0; i < n; i++) {
      const delta = (U / 50n) * BigInt(((i * 7919) % 11) - 5);   // -5..5, con ceros
      const o = precio, c = precio + delta;
      const h = (o > c ? o : c) + U / 40n;
      const l = (o < c ? o : c) - U / 40n;
      velas.push([t0 + i * 3600000, o.toString(), h.toString(), l.toString(), c.toString(),
                  ((3n + BigInt(i % 7)) * U).toString()]);
      precio = c;
    }
    return velas;
  };
  window.contar = () => {
    const c = document.querySelector('#cv');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    const cerca = (a, b) => Math.abs(a - b) <= 8;
    let pintados = 0, jade = 0, coral = 0, oro = 0, ficha = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 40) continue;
      pintados++;
      if (cerca(d[i], 62) && cerca(d[i + 1], 217) && cerca(d[i + 2], 160)) jade++;
      else if (cerca(d[i], 240) && cerca(d[i + 1], 119) && cerca(d[i + 2], 107)) coral++;
      else if (cerca(d[i], 201) && cerca(d[i + 1], 169) && cerca(d[i + 2], 97)) oro++;
      else if (d[i + 3] > 240 && cerca(d[i], 5) && cerca(d[i + 1], 42) && cerca(d[i + 2], 44)) ficha++;
    }
    return { pintados, jade, coral, oro, ficha };
  };
});

// ── 1 · la pieza y sus promesas de precisión ───────────────────────────────
console.log('\n── la pieza ─────────────────────────────────────────────────');
{
  const api = await p.evaluate(() => typeof VELAS === 'object'
    && typeof VELAS.dibujar === 'function' && typeof VELAS.enganchar === 'function');
  decir(api, 'VELAS expone dibujar y enganchar');

  // La promesa de no redondear: 2.999… se CORTA a 2.9999, jamás sube a 3.
  const fmt = await p.evaluate(() => [
    VELAS._piezas.formatear(BigInt('2999999999999999999'), 4),
    VELAS._piezas.formatear(BigInt('1000000000000000000'), 4),
    VELAS._piezas.formatear(1234567n * 10n ** 18n, 0),
  ]);
  decir(fmt[0] === '2.9999', 'el dinero se corta, no se redondea', fmt[0]);
  decir(fmt[1] === '1', 'los ceros de la cola no se enseñan', fmt[1]);
  decir(fmt[2] === '1,234,567', 'los miles llevan su coma', fmt[2]);
}

// ── 2 · velas sintéticas: el canvas pinta de verdad ────────────────────────
console.log('\n── 48 velas sintéticas ──────────────────────────────────────');
{
  await p.evaluate(() => {
    // La referencia por ENCIMA del rango de tratos a propósito: si la escala
    // no la incluyera, la línea quedaría fuera del encuadre y no se vería.
    VELAS.dibujar(document.querySelector('#cv'), window.hacerVelas(48),
      { referencia: (3n * 10n ** 18n).toString() });
  });
  const c = await p.evaluate(() => window.contar());
  decir(c.pintados > 2000, 'el lienzo no está en blanco', `${c.pintados} px pintados`);
  decir(c.jade > 100, 'hay velas jade (suben)', `${c.jade} px`);
  decir(c.coral > 100, 'hay velas coral (bajan)', `${c.coral} px`);
  decir(c.oro > 40, 'la línea de referencia está a la vista, punteada y en oro', `${c.oro} px`);

  const rotulo = await p.evaluate(() => document.querySelector('#cv').getAttribute('aria-label') || '');
  decir(/48/.test(rotulo), 'el rótulo accesible cuenta las velas', rotulo);

  const medidas = await p.evaluate(() => {
    const c = document.querySelector('#cv');
    return { w: c.width, h: c.height, cw: c.clientWidth, ch: c.clientHeight, dpr: devicePixelRatio };
  });
  decir(medidas.w === medidas.cw * 2 && medidas.h === medidas.ch * 2,
        'el lienzo interno respeta el devicePixelRatio (×2)', JSON.stringify(medidas));
}

// ── 3 · la ficha aparece al mover el ratón, y se va al salir ───────────────
console.log('\n── la cruz y su ficha ───────────────────────────────────────');
{
  await p.evaluate(() => {
    window.__apagar = VELAS.enganchar(document.querySelector('#cv'),
      () => ({ velas: window.hacerVelas(48), opciones: { referencia: (3n * 10n ** 18n).toString() } }));
  });
  await p.waitForTimeout(200);
  const antes = await p.evaluate(() => window.contar());
  decir(antes.ficha < 30, 'sin ratón encima no hay ficha', `${antes.ficha} px`);

  // El canvas vive en (20,20) y mide 640×360: (340,200) cae en plena gráfica.
  await p.mouse.move(340, 200);
  await p.waitForTimeout(150);
  const con = await p.evaluate(() => window.contar());
  decir(con.ficha > 1000, 'al mover el ratón aparece la ficha O H L C V', `${con.ficha} px`);
  decir(con.pintados > antes.pintados, 'y la cruz suma trazo al lienzo',
        `${antes.pintados} → ${con.pintados}`);

  await p.mouse.move(900, 500);            // fuera del canvas: mouseleave
  await p.waitForTimeout(150);
  const fuera = await p.evaluate(() => window.contar());
  decir(fuera.ficha < 30, 'al salir del lienzo la ficha se va', `${fuera.ficha} px`);
}

// ── 4 · el apagador apaga: después de él, el ratón ya no pinta ─────────────
console.log('\n── el apagador ──────────────────────────────────────────────');
{
  await p.evaluate(() => window.__apagar());
  await p.mouse.move(340, 200);
  await p.waitForTimeout(150);
  const c = await p.evaluate(() => window.contar());
  decir(c.ficha < 30, 'tras apagar, mover el ratón ya no dibuja ficha', `${c.ficha} px`);
}

// ── 5 · cero velas: el vacío honesto, no un lienzo en blanco ───────────────
console.log('\n── cero velas ───────────────────────────────────────────────');
{
  await p.evaluate(() => VELAS.dibujar(document.querySelector('#cv'), [], {}));
  const c = await p.evaluate(() => window.contar());
  const rotulo = await p.evaluate(() => document.querySelector('#cv').getAttribute('aria-label') || '');
  decir(/sin tratos todavía/i.test(rotulo), 'el rótulo dice «sin tratos todavía»', rotulo);
  decir(c.pintados > 100, 'y el mensaje está pintado, no solo declarado', `${c.pintados} px`);
  decir(c.jade + c.coral === 0, 'sin una sola vela inventada', `${c.jade + c.coral} px de vela`);

  const en = await p.evaluate(() => {
    VELAS.dibujar(document.querySelector('#cv'), [], { idioma: 'en' });
    return document.querySelector('#cv').getAttribute('aria-label') || '';
  });
  decir(/no trades yet/i.test(en), 'y en inglés también sabe decirlo', en);

  // Velas rotas NO son cero velas: un dato ilegible se confiesa, no se
  // disfraza de mercado recién nacido.
  const roto = await p.evaluate(() => {
    VELAS.dibujar(document.querySelector('#cv'), [['x', 'no', 'es', 'una', 'vela', '!']], {});
    return document.querySelector('#cv').getAttribute('aria-label') || '';
  });
  decir(/no pudimos leer/i.test(roto), 'velas ilegibles se confiesan, no se pintan como vacío', roto);
}

decir(errores.length === 0, 'sin errores de consola', errores.join(' | '));

await nav.close(); sv.close();
console.log(malas ? `\n${malas} comprobación(es) fallaron\n` : '\nTodo en verde\n');
process.exit(malas ? 1 : 0);
