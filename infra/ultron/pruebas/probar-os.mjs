/* AURA OS, en un navegador de verdad, contra el servidor de verdad.
 *
 *   node infra/ultron/pruebas/probar-os.mjs
 *
 * Sin cerebro y sin red: lo que se prueba es que el OS SEA una puerta, un
 * boot, un ser que saluda por nombre, un arco de voz, y que cuando no hay
 * cerebro lo diga en vez de fingir. La raíz manda al OS; el panel de antes
 * sigue en /clasico. Y a 390 px no se sale nada.
 */
import { chromium } from 'playwright';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const AQUI = dirname(fileURLToPath(import.meta.url));

let fallos = 0;
const decir = (ok, que, extra = '') => { console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${que}${extra ? '\n           ' + String(extra).replace(/\s+/g, ' ').slice(0, 220) : ''}`); if (!ok) fallos++; };
const titulo = (t) => console.log(`\n── ${t} ${'─'.repeat(Math.max(2, 58 - t.length))}`);

if (!existsSync(join(AQUI, '..', 'public', 'os', 'index.html'))) {
  console.log('AURA OS no está construido (infra/ultron/public/os). Corré `npm run entregar` en apps-web/aura-os.');
  process.exit(1);
}

delete process.env.MONGODB_URI; delete process.env.ANTHROPIC_API_KEY; delete process.env.ELEVENLABS_API_KEY; delete process.env.ULTRON_NODO_URL;
process.env.ULTRON_SECRETO = 'p';
process.env.ULTRON_JUNTA = JSON.stringify([{ nombre: 'José', correo: 'jose@ordenglobal.org', clave: 'clave-jose', rol: 'presidente' }]);
const fetchReal = globalThis.fetch;
globalThis.fetch = async (u, o) => { if (String(u).startsWith('http://127.0.0.1')) return fetchReal(u, o); throw new Error('sin red'); };

const { app } = require('../app.js');
const sv = await new Promise((ok) => { const s = app.listen(0, '127.0.0.1', () => ok(s)); });
const BASE = `http://127.0.0.1:${sv.address().port}`;

const nav = await chromium.launch({ executablePath: process.env.ULTRON_CHROMIUM || '/opt/pw-browsers/chromium', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await nav.newPage({ viewport: { width: 1380, height: 900 }, locale: 'es-HN' });
const errores = []; p.on('pageerror', (e) => errores.push(String(e.message).slice(0, 160)));
p.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|401|403|503|Failed to load resource|WebGPU/.test(m.text())) errores.push(m.text().slice(0, 160)); });

titulo('la raíz es el OS; el panel de antes sigue en /clasico');
{
  const r = await p.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  decir(/\/os\/$/.test(p.url()), 'la raíz manda a /os/', p.url());
  decir(r.ok(), 'y el OS carga');
  const c = await fetchReal(BASE + '/clasico/');
  decir(c.ok && /id="puerta"/.test(await c.text()), 'el panel clásico sigue en /clasico/');
}

titulo('la puerta, en el vacío');
{
  await p.waitForSelector('input[type=email]', { timeout: 15000 });
  decir(true, 'sin sesión aparece la puerta');
  decir(await p.evaluate(() => !document.querySelector('input[aria-label="Háblame"]')), 'y el arco de voz todavía no');
  await p.fill('input[type=email]', 'jose@ordenglobal.org'); await p.fill('input[type=password]', 'mala'); await p.click('form button');
  await p.waitForTimeout(700);
  decir(/incorrectos/i.test(await p.textContent('form')), 'con la clave mala lo dice');
  await p.fill('input[type=password]', 'clave-jose'); await p.click('form button');
  await p.waitForSelector('input[type=email]', { state: 'detached', timeout: 8000 });
  decir(true, 'con la buena entra');
}

titulo('el boot y el ser');
{
  const hud = await p.evaluate(() => document.body.innerText);
  decir(/ORDEN GLOBAL/.test(hud) && /CADENA 5550/.test(hud), 'el cromo: ORDEN GLOBAL y CADENA 5550', hud.slice(0, 120));
  decir(await p.evaluate(() => !!document.querySelector('canvas')), 'hay un lienzo');
  await p.waitForSelector('input[aria-label="Háblame"]', { timeout: 12000 });
  decir(true, 'a los 2,8 s termina el boot y aparece el arco');
  decir(await p.evaluate(() => document.querySelector('input[aria-label="Háblame"]').placeholder === 'Háblame…'), 'con «Háblame…» como invitación');
  await p.waitForFunction(() => /Hola, soy Aura/.test(document.body.innerText), null, { timeout: 8000 }).catch(() => {});
  const t = await p.evaluate(() => document.body.innerText);
  decir(/Hola, soy Aura\. Tu asistente de Orden Global\. Dime\./.test(t), 'la primera línea es la de Aura', t.slice(-300));
  await p.waitForFunction(() => /Buen(os|as) (días|tardes|noches), José\./.test(document.body.innerText), null, { timeout: 8000 }).catch(() => {});
  const t2 = await p.evaluate(() => document.body.innerText);
  decir(/Buen(os|as) (días|tardes|noches), José\./.test(t2), 'y después saluda por el nombre de pila', t2.slice(-300));
  decir(/ORIGEN|ninguna casa contesta/.test(t2), 'con el estado de la casa (o que ninguna contesta)');
  const orbes = await p.evaluate(() => document.body.innerText.match(/ORIGEN · ORO|VETA WALLET|ORDENEX|CADENA 5550|AUCORP|GENESIS ID|PENDIENTES/g) || []);
  decir(new Set(orbes).size >= 6, 'las casas orbitan alrededor: al menos seis nombres visibles', [...new Set(orbes)].join(','));
}

titulo('pensar sin cerebro lo dice, no se cuelga');
{
  await p.fill('input[aria-label="Háblame"]', 'hola'); await p.press('input[aria-label="Háblame"]', 'Enter');
  await p.waitForTimeout(2500);
  const t = await p.evaluate(() => document.body.innerText);
  decir(/ANTHROPIC_API_KEY|apagado|nodo/i.test(t), 'aparece el motivo en una burbuja', t.slice(-240));
  decir(await p.evaluate(() => document.querySelector('input[aria-label="Háblame"]').value === ''), 'y el arco queda vacío para seguir');
}

titulo('a 390 px');
{
  await p.setViewportSize({ width: 390, height: 800 }); await p.waitForTimeout(900);
  const d = await p.evaluate(() => ({ doc: document.documentElement.scrollWidth, arco: !!document.querySelector('input[aria-label="Háblame"]') }));
  decir(d.doc <= 390, 'la página no se desplaza a lo ancho', `documento ${d.doc}px`);
  decir(d.arco, 'y el arco sigue ahí');
}

decir(errores.length === 0, 'sin errores de JavaScript en el navegador', errores.join(' | '));
await nav.close(); sv.close();
console.log(fallos ? `\n${fallos} falla(s).` : '\nTodo en orden.');
process.exit(fallos ? 1 : 0);
