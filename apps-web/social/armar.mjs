/* Fotografía las piezas de redes.
 *
 *   node apps-web/social/armar.mjs
 *
 * Cada pieza es un HTML con su tamaño exacto puesto en el `body`, así que el
 * navegador no tiene que decidir nada: se abre a ese tamaño y se dispara. Se
 * renderiza al doble de resolución (deviceScaleFactor 2) porque Instagram
 * recomprime todo lo que sube, y una pieza que ya entra justa sale con los
 * bordes del oro sucios.
 *
 * Por qué en HTML y no en un editor: cuando cambie el eslogan, el precio o el
 * logo, esto se vuelve a correr y salen las dos piezas iguales. Un PNG editado
 * a mano hay que volver a maquetarlo entero, y el día que haya prisa saldrá
 * peor que la vez anterior.
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));

// 1080×1350 es la proporción 4:5, la que más pantalla ocupa en el feed de
// Instagram. La cuadrada deja franjas y la vertical de historia se recorta al
// publicarla como post.
const W = 1080, H = 1350;

// Las dos piezas con maqueta propia. Son objetos dibujados a medida y no
// entran en la plantilla: forzarlas ahí habría dejado la plantilla llena de
// casos especiales para dos usos.
const A_MEDIDA = [
  { archivo: 'tarjeta.html',       salida: '01-veta-tarjeta.png' },
  { archivo: 'dolares-a-oro.html', salida: '02-og-dolares-a-oro.png' },
];

/* El catálogo de piezas se le pregunta AL NAVEGADOR, abriendo la plantilla una
   vez y leyendo su `window.PIEZAS`.
   
   Se podría haber importado piezas.js aquí, pero ese archivo es un script
   clásico —el navegador lo carga con <script src>— y este repositorio es ESM,
   así que un `import` lo lee sin exportaciones y devuelve nada. La alternativa
   era duplicar la lista de ids en este archivo, que es exactamente el tipo de
   copia que se desincroniza el día que alguien agrega una pieza y se olvida. */
async function catalogo(nav, base) {
  const pg = await nav.newPage();
  await pg.goto(`${base}/plantilla.html`, { waitUntil: 'networkidle' });
  const ids = await pg.evaluate(() => window.PIEZAS.map((p) => p.id));
  await pg.close();
  return ids;
}

const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.svg': 'image/svg+xml',
};
const sv = createServer(async (q, r) => {
  try {
    const p = join(AQUI, decodeURIComponent(q.url.split('?')[0]));
    const d = await readFile(p);
    r.writeHead(200, { 'Content-Type': TIPOS[extname(p)] || 'application/octet-stream' });
    r.end(d);
  } catch { r.writeHead(404); r.end('no'); }
});
await new Promise((ok) => sv.listen(0, ok));
const base = `http://127.0.0.1:${sv.address().port}`;

const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });

const PIEZAS = [
  ...A_MEDIDA.map((p) => ({ ...p, w: W, h: H })),
  ...(await catalogo(nav, base)).map((id, i) => ({
    archivo: `plantilla.html?p=${id}`,
    salida: `${String(i + 3).padStart(2, '0')}-${id}.png`,
    w: W, h: H,
  })),
];

for (const p of PIEZAS) {
  const pg = await nav.newPage({
    viewport: { width: p.w, height: p.h },
    deviceScaleFactor: 2,
    reducedMotion: 'reduce',
  });
  const fallos = [];
  pg.on('requestfailed', (r) => fallos.push(r.url()));
  await pg.goto(`${base}/${p.archivo}`, { waitUntil: 'networkidle' });
  // Las fuentes tienen que estar puestas ANTES del disparo: una pieza
  // fotografiada a medio cargar sale con la tipografía del sistema y no se
  // nota hasta que está publicada.
  await pg.evaluate(() => document.fonts.ready);
  await pg.waitForTimeout(400);
  await pg.screenshot({ path: join(AQUI, p.salida) });
  console.log(`  ${p.salida} · ${p.w}x${p.h} @2x${fallos.length ? '  ⚠ no cargó: ' + fallos.join(', ') : ''}`);
  await pg.close();
}

await nav.close();
sv.close();
