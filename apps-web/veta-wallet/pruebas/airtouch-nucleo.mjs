/* AIR TOUCH y el Núcleo galáctico, comprobados por dentro.
 *
 *   node pruebas/airtouch-nucleo.mjs   (sirve la carpeta en 8899 él solo)
 *
 * AIR TOUCH no se puede probar con una cámara de mentira del navegador (los
 * cuadros falsos no traen una mano), así que se prueba el MECANISMO con las
 * dos costuras que el diseño dejó a propósito:
 *
 *  1. `AIRTOUCH.interpretar(puntos)` es pura: con una mano de pellizco tiene
 *     que decir pellizco, y con la mano abierta, no.
 *  2. `VETA._atPunto(p)` es la entrada de la capa de UI: alimentándola a mano
 *     se comprueba el cursor, el toque sintético y el agarre que desplaza —
 *     el camino entero menos la cámara.
 *
 * Del Núcleo: que el cielo interior se monte (transparente, con estrellas),
 * que el viaje a un planeta tenga su tramo visible, y que al salir del
 * Núcleo el cielo se apague sin llevarse nada.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUERTO = 8899;
spawn('fuser', ['-k', `${PUERTO}/tcp`]).on('close', () => {});
await new Promise((r) => setTimeout(r, 400));
const sv = spawn('python3', ['-m', 'http.server', String(PUERTO), '--bind', '127.0.0.1',
  '--directory', RAIZ], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 900));

let f = 0;
const ok = (q, c, x = '') => { console.log(`${c ? '  ok  ' : ' FALLA'}  ${q}${x ? '  · ' + x : ''}`); if (!c) f++; };
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const pag = await (await b.newContext({ viewport: { width: 1280, height: 900 }, locale: 'es' })).newPage();
pag.errores = [];
pag.on('pageerror', (e) => pag.errores.push(String(e)));
await pag.route('**/herokuapp.com/**', (r) => r.fulfill({ status: 200, json: {} }));
await pag.route('**/api.coingecko.com/**', (r) => r.fulfill({ json: {} }));
await pag.goto(`http://127.0.0.1:${PUERTO}/index.html`, { waitUntil: 'domcontentloaded' });
await pag.waitForTimeout(1600);
await pag.evaluate(() => {
  const tk = btoa(JSON.stringify({ sub: 'p1', exp: Math.floor(Date.now() / 1000) + 9999 }));
  VETA._sesion({ token: `x.${tk}.y`, correo: 'p@x.com', nombre: 'Prueba', direccion: '0x' + '1'.repeat(40) });
  VETA._identidad({ estado: 'verificada' });
  document.getElementById('velo-og')?.remove();
  document.getElementById('app')?.classList.remove('oculto');
  for (const id of ['portada', 'techo', 'acceso', 'reclave']) document.getElementById(id)?.classList.add('oculto');
  VETA.ir('app');
  VETA.auraBienFin?.();
});
await pag.waitForTimeout(1200);

console.log('\n── el intérprete de la mano ─────────────────────────────────');
{
  const r = await pag.evaluate(() => {
    // una mano sintética: 21 puntos alrededor de una palma en (0.5, 0.5)
    const base = Array.from({ length: 21 }, (_, i) => ({ x: 0.5 + i * 0.004, y: 0.5 + (i % 5) * 0.01 }));
    base[0] = { x: 0.5, y: 0.62 };      // muñeca
    base[17] = { x: 0.58, y: 0.58 };    // nudillo del meñique: palma ~0.09
    base[5] = { x: 0.46, y: 0.46 };     // nudillo del índice
    const abierta = base.map(p => ({ ...p }));
    abierta[4] = { x: 0.38, y: 0.5 };   // pulgar lejos del índice
    abierta[8] = { x: 0.47, y: 0.38 };
    const pellizco = base.map(p => ({ ...p }));
    pellizco[4] = { x: 0.462, y: 0.44 };  // pulgar TOCANDO el índice
    pellizco[8] = { x: 0.468, y: 0.437 };
    return {
      abierta: AIRTOUCH.interpretar(abierta).pinza,
      pellizco: AIRTOUCH.interpretar(pellizco).pinza,
      corta: AIRTOUCH.interpretar([{ x: 0, y: 0 }]),
    };
  });
  ok('la mano abierta NO es pellizco', r.abierta > 0.46, `pinza ${r.abierta.toFixed(2)}`);
  ok('el pellizco SÍ lo es', r.pellizco < 0.34, `pinza ${r.pellizco.toFixed(2)}`);
  ok('con puntos de menos no inventa nada', r.corta === null);
}

console.log('\n── el cursor, el toque y el agarre ──────────────────────────');
{
  ok('el botón de AIR TOUCH está a la vista', await pag.evaluate(() =>
    !document.getElementById('at-boton').classList.contains('oculto')));
  // el cursor sigue a la mano
  await pag.evaluate(() => VETA._atPunto({ presente: true, x: 240, y: 320, pellizco: false }));
  const cur = await pag.evaluate(() => {
    const c = document.getElementById('at-cursor');
    return { visible: !c.classList.contains('oculto'), tf: c.style.transform };
  });
  ok('el cursor aparece y sigue a la mano', cur.visible && /240px, 320px/.test(cur.tf), cur.tf);

  // el toque: pellizco corto y quieto sobre un botón de prueba
  await pag.evaluate(() => {
    window._toques = 0;
    const btn = document.createElement('button');
    btn.id = 'at-prueba';
    btn.style.cssText = 'position:fixed;left:380px;top:380px;width:80px;height:40px;z-index:5';
    btn.onclick = () => { window._toques++; };
    document.body.appendChild(btn);
  });
  await pag.evaluate(() => VETA._atPunto({ presente: true, x: 400, y: 395, pellizco: false }));
  await pag.evaluate(() => VETA._atPunto({ presente: true, x: 400, y: 395, pellizco: true }));
  await pag.waitForTimeout(120);
  await pag.evaluate(() => VETA._atPunto({ presente: true, x: 401, y: 396, pellizco: false }));
  ok('pellizcar sobre un botón lo toca de verdad', await pag.evaluate(() => window._toques) === 1);

  // el agarre: pellizco sostenido desplaza lo desplazable
  const scroll = await pag.evaluate(async () => {
    const caja = document.createElement('div');
    caja.style.cssText = 'position:fixed;left:100px;top:100px;width:200px;height:150px;overflow-y:auto;z-index:5';
    caja.innerHTML = '<div style="height:900px"></div>';
    document.body.appendChild(caja);
    VETA._atPunto({ presente: true, x: 180, y: 160, pellizco: false });
    VETA._atPunto({ presente: true, x: 180, y: 160, pellizco: true });
    for (let i = 1; i <= 8; i++) {
      await new Promise(r => setTimeout(r, 25));
      VETA._atPunto({ presente: true, x: 180, y: 160 - i * 9, pellizco: true });
    }
    VETA._atPunto({ presente: true, x: 180, y: 88, pellizco: false });
    const st = caja.scrollTop;
    caja.remove(); document.getElementById('at-prueba')?.remove();
    return st;
  });
  ok('el agarre desplaza el contenido con la mano', scroll > 40, `${scroll}px`);
  ok('y un agarre con movimiento NO dispara un toque', await pag.evaluate(() => window._toques) === 1);
}

console.log('\n── el Núcleo es galaxia ─────────────────────────────────────');
{
  await pag.evaluate(() => VETA.vista('nucleo'));
  await pag.waitForTimeout(1500);
  ok('el cielo del Núcleo está montado y vivo', await pag.evaluate(() =>
    !!document.getElementById('cielo-nucleo') && GALAXIA.viva()));
  const estrellas = await pag.evaluate(() => {
    const c = document.getElementById('cielo-nucleo');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let fuertes = 0, max = 0;
    for (let i = 3; i < d.length; i += 4) { if (d[i] > 120) fuertes++; max = Math.max(max, d[i]); }
    return { fuertes, max, total: d.length / 4 };
  });
  /* Velo, no pintura: la nebulosa tenue cubre área con alfa BAJO (eso es un
     velo), así que lo que se exige es (a) que nada llegue a opaco total y
     (b) que las estrellas —los puntos de alfa alto— existan y sean puntos,
     no una plasta. */
  ok('es un velo transparente con estrellas, no una pintura opaca',
     estrellas.max < 250 && estrellas.fuertes > 40 && estrellas.fuertes < estrellas.total * 0.02,
     `${estrellas.fuertes} px de estrella · alfa máx ${estrellas.max}`);

  // el viaje al planeta: hay un tramo visible antes de aterrizar. Directo y
  // no con page.click: las esferas FLOTAN siempre y para Playwright un botón
  // que respira nunca es «estable».
  await pag.evaluate(() => VETA.nuAbrir('wallet'));
  await pag.waitForTimeout(140);
  ok('al elegir un planeta, el viaje se ve (no es un corte)', await pag.evaluate(() =>
    !!document.querySelector('.cerebro.cer-yendo .nu-mundo.nu-yendo')));
  await pag.waitForTimeout(700);
  ok('y se aterriza en su app', await pag.evaluate(() => VETA.dondeEstoy() === 'billetera'));
  ok('al salir del Núcleo el cielo se apaga', await pag.evaluate(() => !GALAXIA.viva()));
  ok('sin errores de página en todo el recorrido', pag.errores.length === 0,
     pag.errores.slice(0, 2).join(' · '));
}

await b.close();
sv.kill();
console.log(f ? `\n${f} en rojo\n` : '\nTodo en verde\n');
process.exit(f ? 1 : 0);
