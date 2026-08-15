/* La sesión muerta se dice, y el estado verificado no se pierde por un tropiezo.
 *
 * Dos fallos que salían por el MISMO sitio —una tarjeta de Genesis ID con
 * «Reintentar» delante de alguien verificado desde hace meses— y que no se
 * parecían en nada a su causa:
 *
 *  1. Bastaba TENER refresco para no cerrar sesión; nadie miraba si el refresco
 *     SERVÍA. El día que se rota la clave que firma las sesiones, eso le pasa a
 *     todo el mundo a la vez: el refresco viejo tampoco vale, nadie sale de la
 *     sesión muerta, y cada tarjeta se llena de errores con botones que no
 *     pueden funcionar nunca.
 *  2. Un fallo al REFRESCAR el estado borraba el estado que ya se conocía. Un
 *     parpadeo de red convertía a alguien verificado en alguien sin verificar
 *     —y de paso le cerraba el chat, que mira lo mismo— hasta recargar.
 *
 * Se levanta un backend de mentira que se puede romper a voluntad y se conduce
 * la web de verdad en el navegador.
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';

const RAIZ = '/home/user/express-js-on-vercel/apps-web/veta-wallet';
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
                '.png': 'image/png', '.jpg': 'image/jpeg' };

// ── el backend de mentira ───────────────────────────────────────────────────
// `modo` decide qué contesta: 'bien', 'sesionMuerta' (401 en todo, incluido el
// refresco) o 'genesisCaido' (solo /genesis/estado se rompe).
let modo = 'bien';
const VERIFICADA = {
  identidad: { id: 'i1', email: 'jose@ordenglobal.org', estado: 'verificada',
               gid: 'OG-4K7P-21', nombreLegal: 'José Enamorado',
               documentoAceptable: true, faltanDatos: [] },
};

const api = createServer((q, r) => {
  const responder = (codigo, cuerpo) => {
    r.writeHead(codigo, { 'Content-Type': 'application/json',
                          'Access-Control-Allow-Origin': '*',
                          'Access-Control-Allow-Headers': '*',
                          'Access-Control-Allow-Methods': '*' });
    r.end(JSON.stringify(cuerpo));
  };
  if (q.method === 'OPTIONS') return responder(204, {});
  const ruta = q.url.split('?')[0];

  if (modo === 'sesionMuerta') return responder(401, { message: 'invalid token' });

  if (ruta === '/genesis/estado') {
    if (modo === 'genesisCaido') return responder(503, { error: 'Genesis ID no respondió' });
    return responder(200, VERIFICADA);
  }
  if (ruta === '/auth/refresh') return responder(200, { token: 'x.' + Buffer.from(JSON.stringify({
    address: '0xaaaa', exp: Math.floor(Date.now() / 1e3) + 9999 })).toString('base64') + '.y' });
  return responder(200, {});
});
await new Promise((ok) => api.listen(0, ok));
const API = `http://127.0.0.1:${api.address().port}`;

const sv = createServer(async (q, r) => {
  try {
    const p = join(RAIZ, decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/, '/index.html'));
    const d = await readFile(p);
    r.writeHead(200, { 'Content-Type': TIPOS[extname(p)] || 'application/octet-stream' });
    r.end(d);
  } catch { r.writeHead(404); r.end('no'); }
});
await new Promise((ok) => sv.listen(0, ok));
const BASE = `http://127.0.0.1:${sv.address().port}/index.html`;

const nav = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'],
});

let fallos = 0;
const comprobar = (ok, que, detalle = '') => {
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${que}${detalle ? '\n           ' + detalle : ''}`);
  if (!ok) fallos++;
};

async function abrir({ conRefresco }) {
  const p = await nav.newPage({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce', bypassCSP: true });
  await p.addInitScript((u) => { window.OG_API = u; }, API);
  await p.goto(BASE);
  await p.waitForTimeout(600);
  await p.evaluate(([refresco]) => {
    localStorage.setItem('veta.bienvenida.v1', '1');
    localStorage.setItem('veta.aura.presentada', '1');
    const token = 'x.' + btoa(JSON.stringify({ address: '0xaaaa', exp: Math.floor(Date.now() / 1e3) + 9999 })) + '.y';
    localStorage.setItem('veta.sesion', JSON.stringify({
      token, correo: 'jose@ordenglobal.org', nombre: 'José Enamorado', direccion: '0xaaaa',
      ...(refresco ? { refresco: 'refresco-viejo' } : {}),
    }));
  }, [conRefresco]);
  await p.goto(BASE);
  await p.waitForTimeout(600);
  // el idioma lo decide el navegador; aquí se fija para que las
  // comprobaciones miren un texto y no dos
  await p.evaluate(() => VETA.idioma('es')).catch(() => {});
  await p.waitForTimeout(1800);
  return p;
}

// ── 1 · con todo bien, la tarjeta dice Verificada ───────────────────────────
modo = 'bien';
let p = await abrir({ conRefresco: true });
await p.evaluate(() => VETA.vista('identidad'));
await p.waitForTimeout(900);
let vista = await p.evaluate(() => document.getElementById('lienzo').innerText);
comprobar(await p.evaluate(() => VETA._esVerificada()),
  'de entrada, la identidad consta verificada');
comprobar(/verificad|verified/i.test(vista), 'y la tarjeta lo dice');
comprobar(!/reintentar/i.test(vista), 'y no ofrece reintentar nada');

// ── 2 · Genesis tropieza al REFRESCAR: no se pierde lo que ya se sabía ──────
modo = 'genesisCaido';
await p.evaluate(() => VETA.reintentar());
await p.waitForTimeout(6500);          // los dos intentos + el respiro de 2,5s
const sigue = await p.evaluate(() => VETA._esVerificada?.() ?? null);
vista = await p.evaluate(() => { VETA.vista('identidad'); return document.getElementById('lienzo').innerText; });
comprobar(sigue !== false, 'un tropiezo al refrescar NO desverifica a nadie',
  sigue === false ? 'la persona pasó a contar como sin verificar' : '');
comprobar(!/reintentar/i.test(vista),
  'y la tarjeta sigue sin ofrecer un botón que no arregla nada');
await p.close();

// ── 3 · la sesión muere de verdad: se pide la contraseña, no se disimula ────
modo = 'sesionMuerta';
p = await abrir({ conRefresco: true });
await p.waitForTimeout(3000);
const fuera = await p.evaluate(() => ({
  // lo que importa no es a QUE pantalla va, sino que no se quede DENTRO con
  // una sesion muerta llenando cada tarjeta de errores
  dentro: !document.getElementById('app')?.classList.contains('oculto'),
  pantalla: ['portada', 'acceso', 'app'].filter((id) => !document.getElementById(id)?.classList.contains('oculto')),
  quedaSesion: !!localStorage.getItem('veta.sesion'),
}));
comprobar(!fuera.dentro,
  'con el refresco tambien muerto, no se queda dentro con la sesion muerta',
  fuera.dentro ? 'sigue en la app' : 'sale a: ' + JSON.stringify(fuera.pantalla));
comprobar(!fuera.quedaSesion, 'y la sesión muerta no se queda guardada');
await p.close();

await nav.close(); sv.close(); api.close();
console.log(fallos ? `\n${fallos} comprobación(es) fallaron` : '\nTodo en verde');
process.exit(fallos ? 1 : 0);
