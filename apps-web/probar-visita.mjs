/* La primera pantalla, vista por quien no tiene cuenta.
 *
 *   node apps-web/probar-visita.mjs
 *
 * Lo que se comprueba aquí no es que la página pinte: es que AU-RA atienda a un
 * desconocido SIN inventarle nada y sin contarle nada de nadie. Un asistente
 * que delante de alguien sin cuenta improvisa un saldo de ejemplo es peor que
 * no tener asistente, porque el ejemplo se recuerda como si fuera un dato.
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), 'veta-wallet');
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
                '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
                '.woff2': 'font/woff2', '.woff': 'font/woff' };

const sv = createServer(async (q, r) => {
  try {
    const p = join(RAIZ, decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/, '/index.html'));
    const d = await readFile(p);
    r.writeHead(200, { 'Content-Type': TIPOS[extname(p)] || 'application/octet-stream' });
    r.end(d);
  } catch { r.writeHead(404); r.end('no'); }
});
await new Promise((r) => sv.listen(0, r));
const BASE = `http://127.0.0.1:${sv.address().port}/index.html`;

let malas = 0;
const decir = (ok, que, extra = '') => {
  if (!ok) malas++;
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${que}`);
  if (extra) console.log(`           ${String(extra).replace(/\s+/g, ' ').slice(0, 120)}`);
};

const nav = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const p = await nav.newPage({ viewport: { width: 1280, height: 900 } });
const errores = [];
p.on('pageerror', (e) => errores.push(e.message));
await p.goto(BASE);
await p.waitForTimeout(1400);
await p.evaluate(() => VETA.idioma('es'));
await p.waitForTimeout(400);

// ── 1 · la bienvenida ──────────────────────────────────────────────────────
console.log('\n── la primera pantalla ───────────────────────────────────────');
{
  const t = await p.evaluate(() => document.querySelector('#bienvenida').textContent);
  decir(/BIENVENIDO AL ECOSISTEMA/i.test(t), 'da la bienvenida al ecosistema');
  decir(/Abrir mi cuenta/.test(t), 'ofrece abrir cuenta');
  decir(/Ya tengo cuenta/.test(t), 'y entrar a quien ya la tiene');

  const og = await p.evaluate(() => {
    const a = document.querySelector('#bienvenida .bv-og');
    return a && { href: a.href, txt: a.textContent.trim(), blanco: a.target };
  });
  decir(!!og && /ordenglobal\.org/.test(og.href), 'y una salida a ordenglobal.org', og?.href);
  decir(og?.blanco === '_blank', 'que abre aparte y no se lleva a nadie de la página');

  // La afirmación vieja no puede haber sobrevivido en la fila de hechos.
  decir(!/oro físico certificado|1:1/.test(t), 'la fila de hechos ya no dice respaldo uno a uno',
        (t.match(/.{0,30}(1:1|físico certificado).{0,30}/) || [''])[0]);
  decir(/÷55/.test(t), 'sino la referencia de verdad');
}

// ── 2 · AU-RA está antes de la cuenta ──────────────────────────────────────
console.log('\n── AU-RA, antes de tener cuenta ──────────────────────────────');
const orbeVisible = () => p.evaluate(() => !document.querySelector('#aura-orbe').hasAttribute('data-oculto'));
decir(await orbeVisible(), 'el orbe está en la portada, sin haber entrado');

const preguntar = async (q) => {
  await p.evaluate((t) => VETA.auraChip(t), q);
  await p.waitForTimeout(500);
  const b = await p.evaluate(() => [...document.querySelectorAll('#aura-hilo .aura-b:not(.mio)')].pop()?.textContent || '');
  return b;
};

await p.evaluate(() => VETA.auraToca());
await p.waitForTimeout(400);
{
  const hilo = await p.evaluate(() => document.querySelector('#aura-hilo')?.textContent || '');
  decir(/Bienvenido a Orden Global/.test(hilo), 'y saluda como a alguien que acaba de llegar', hilo);
  decir(!/recorrido|tu Núcleo/i.test(hilo), 'sin ofrecerle el recorrido de una cuenta que no tiene');

  const chips = await p.evaluate(() => [...document.querySelectorAll('.aura-chip')].map(c => c.textContent));
  decir(chips.length === 4 && chips.some(c => /Abrir mi cuenta/.test(c)),
        'los chips son del ecosistema, y uno es la puerta', chips.join(' · '));
  decir(!chips.some(c => /cobrar|Genesis ID\?/.test(c)), 'ninguno lleva a una pantalla que exige sesión');
}

// ── 3 · contesta del ecosistema ────────────────────────────────────────────
console.log('\n── lo que sí sabe contestar ──────────────────────────────────');
{
  let r = await preguntar('que es origen');
  decir(/gramin/.test(r) && /referenciad/i.test(r), 'explica ORIGEN, y con la palabra correcta', r);
  decir(!/bóveda|43-101/i.test(r), 'sin bóveda ni norma que no toca');

  r = await preguntar('que es la cadena');
  decir(/5550/.test(r), 'explica la cadena', r);

  r = await preguntar('que es orden global');
  decir(/ecosistema/i.test(r), 'y el ecosistema entero', r);
}

// ── 4 · lo que NO puede contestar, no se lo inventa ────────────────────────
console.log('\n── y lo que no ──────────────────────────────────────────────');
{
  const r = await preguntar('cuanto tengo');
  decir(/todavía no tenés una|no hay saldo/i.test(r), 'no hay cuenta: lo dice, no improvisa un saldo', r);
  decir(!/[0-9]+[.,][0-9]{2}/.test(r), 'y no aparece ni una cifra de ejemplo');
  const bot = await p.evaluate(() =>
    [...document.querySelectorAll('#aura-hilo .aura-b:not(.mio)')].pop()?.querySelectorAll('button').length || 0);
  decir(bot >= 1, 'pero deja la puerta a mano en vez de dejar a nadie sin salida');

  const r2 = await preguntar('envia 500 a pedro');
  decir(!/preparado|listo/i.test(r2), 'un envío dictado sin sesión no prepara nada', r2);
}

// ── 5 · la puerta ──────────────────────────────────────────────────────────
console.log('\n── de AU-RA al formulario ────────────────────────────────────');
{
  const antes = await p.evaluate(() => document.querySelectorAll('#aura-hilo .aura-b').length);
  await p.evaluate(() => VETA.auraChip('Abrir mi cuenta'));
  await p.waitForTimeout(700);
  const enAcceso = await p.evaluate(() => !document.querySelector('#acceso').classList.contains('oculto'));
  decir(enAcceso, 'el chip «abrir mi cuenta» lleva al formulario');
  const crear = await p.evaluate(() => document.querySelector('#tab-crear')?.getAttribute('aria-selected'));
  decir(crear === 'true', 'y llega con la pestaña de crear ya elegida');

  decir(await orbeVisible(), 'AU-RA sigue ahí, en la pantalla de acceso');
  const lado = await p.evaluate(() => document.querySelector('#acceso .acc-lado').textContent);
  decir(/AU-RA te contesta/.test(lado), 'y está invitada donde se duda: junto al formulario');

  await p.evaluate(() => VETA.auraToca());
  await p.waitForTimeout(300);
  const desp = await p.evaluate(() => document.querySelectorAll('#aura-hilo .aura-b').length);
  decir(desp >= antes, 'la conversación no se tira al cambiar de pantalla', `${antes} → ${desp}`);
}

// ── 6 · cambiar de idioma a media conversación ─────────────────────────────
// El hilo NO se reescribe: lo que la persona ya leyó se queda como lo leyó.
// Lo que sí tiene que cambiar es todo lo que aún no ha leído.
console.log('\n── cambiar de idioma con la charla empezada ──────────────────');
{
  const antes = await p.evaluate(() => document.querySelectorAll('#aura-hilo .aura-b').length);
  await p.evaluate(() => VETA.idioma('en'));
  await p.waitForTimeout(400);
  const desp = await p.evaluate(() => document.querySelectorAll('#aura-hilo .aura-b').length);
  decir(desp === antes, 'la conversación ya leída se respeta, no se reescribe', `${antes} → ${desp}`);
  const chips = await p.evaluate(() => [...document.querySelectorAll('.aura-chip')].map(c => c.textContent));
  decir(chips.some(c => /Open my account/.test(c)), 'pero lo que aún no se leyó, sí cambia', chips.join(' · '));
}

// ── 7 · un visitante que llega en inglés ───────────────────────────────────
console.log('\n── quien llega de cero, en inglés ────────────────────────────');
{
  await p.goto(BASE);
  await p.waitForTimeout(1400);
  await p.evaluate(() => VETA.idioma('en'));
  await p.waitForTimeout(500);
  const t = await p.evaluate(() => document.querySelector('#bienvenida').textContent);
  decir(/WELCOME TO THE ORDEN GLOBAL/i.test(t), 'la bienvenida está traducida');
  decir(/Open my account/.test(t) && /Discover Orden Global/.test(t), 'y las tres salidas también');
  await p.evaluate(() => VETA.auraToca());
  await p.waitForTimeout(400);
  const hilo = await p.evaluate(() => document.querySelector('#aura-hilo')?.textContent || '');
  decir(/Welcome to Orden Global/.test(hilo), 'AU-RA saluda en inglés', hilo);

  await p.evaluate(() => VETA.auraChip('what is origen'));
  await p.waitForTimeout(500);
  const r = await p.evaluate(() => [...document.querySelectorAll('#aura-hilo .aura-b:not(.mio)')].pop()?.textContent || '');
  decir(/gramin/.test(r) && !/vault|43-101/i.test(r), 'y contesta en inglés, sin bóveda', r);
}

decir(errores.length === 0, 'sin errores de consola', errores.join(' | '));

await nav.close(); sv.close();
console.log(malas ? `\n${malas} comprobación(es) fallaron\n` : '\nTodo en verde\n');
process.exit(malas ? 1 : 0);
