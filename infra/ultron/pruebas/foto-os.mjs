/* Fotos del OS, para mirarlo como lo mira quien lo usa.
 *   node infra/ultron/pruebas/foto-os.mjs
 * Deja las fotos en el borrador de la sesión. */
import { chromium } from 'playwright';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const SALIDA = process.env.ULTRON_FOTOS || '/tmp/claude-0/-home-user-express-js-on-vercel/0391d4fe-0c9f-53b0-b60e-0030ebf74708/scratchpad';

delete process.env.MONGODB_URI; delete process.env.ANTHROPIC_API_KEY; delete process.env.ELEVENLABS_API_KEY;
process.env.ULTRON_SECRETO = 'p';
process.env.ULTRON_JUNTA = JSON.stringify([{ nombre: 'José Enamorado', correo: 'jose@ordenglobal.org', clave: 'clave-jose', rol: 'presidente' }]);
const fetchReal = globalThis.fetch;
globalThis.fetch = async (u, o) => { if (String(u).startsWith('http://127.0.0.1')) return fetchReal(u, o); throw new Error('sin red'); };

const { app } = require('../app.js');
const sv = await new Promise((ok) => { const s = app.listen(0, '127.0.0.1', () => ok(s)); });
const BASE = `http://127.0.0.1:${sv.address().port}`;
const nav = await chromium.launch({ executablePath: process.env.ULTRON_CHROMIUM || '/opt/pw-browsers/chromium',
  args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });

for (const [nombre, w, h] of [['os-escritorio', 1400, 900], ['os-telefono', 390, 844]]) {
  const p = await nav.newPage({ viewport: { width: w, height: h }, locale: 'es-HN', deviceScaleFactor: 2 });
  await p.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await p.evaluate(async (b) => { await fetch(b + '/entrar', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ correo: 'jose@ordenglobal.org', clave: 'clave-jose' }) }); }, BASE);
  await p.goto(BASE + '/os', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(3400);
  // con una conversación puesta, que es como se ve de verdad
  await p.evaluate(() => {
    window.OS._adentro.pintarDicho(
      'La cadena 8532 está en el bloque **4 812 907** y avanza: 2.1 s por bloque en la última media hora.\n\n'
      + 'En el tesoro quedan **2 411 900 ORIGEN**.\n\n'
      + 'La casa que se ve floja es ORDENSCAN — contesta en 1.9 s cuando el resto está por debajo de 300 ms. '
      + 'No está caída, pero si sigue así conviene mirar el índice de bloques antes que se note en la web.');
  });
  await p.waitForTimeout(500);
  await p.screenshot({ path: `${SALIDA}/${nombre}.png` });
  if (w < 900) { await p.evaluate(() => document.body.classList.add('cajon')); await p.waitForTimeout(400);
    await p.screenshot({ path: `${SALIDA}/${nombre}-cajon.png` }); }
  await p.close();
  console.log(`${SALIDA}/${nombre}.png`);
}
await nav.close(); sv.close(); process.exit(0);
