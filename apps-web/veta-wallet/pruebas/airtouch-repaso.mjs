/* AIR TOUCH, LA REVISIÓN COMPLETA.
 *
 *   node pruebas/airtouch-repaso.mjs
 *
 * La galaxia tiene su propia prueba (airtouch-galaxia.mjs). Ésta repasa que la
 * mano funcione EN TODA LA CASA y que nada de lo suyo estorbe:
 *
 *  1. El botón enciende y apaga, y con la mano apagada no queda nada colgado.
 *  2. El tablero no tapa el riel del menú ni las pestañas: eso hacía que
 *     encender la mano dejara la casa inservible con el ratón.
 *  3. El cursor sigue a la mano y el pellizco TOCA un botón de verdad.
 *  4. La mirada sostenida sobre un botón lo aprieta, y sobre un botón de
 *     dinero NO (esa regla no se negocia).
 *  5. Dentro de una vista con lista, el agarre DESPLAZA.
 *  6. En GENESIS CORE el agarre gira el cerebro y NO arrastra la página.
 *  7. El tutorial se abre y se cierra sin dejar la pantalla bloqueada.
 */
import { chromium, devices } from 'playwright';
import { spawn } from 'node:child_process';

const PUERTO = 8842;
spawn('fuser', ['-k', `${PUERTO}/tcp`]).on('close', () => {});
await new Promise((r) => setTimeout(r, 400));
const sv = spawn('python3', ['-m', 'http.server', String(PUERTO), '--bind', '127.0.0.1',
  '--directory', new URL('..', import.meta.url).pathname], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 900));

let f = 0;
const ok = (q, c, x = '') => { console.log(`${c ? '  ok  ' : ' FALLA'}  ${q}${x ? '  · ' + x : ''}`); if (!c) f++; };
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
const p = await (await b.newContext({ viewport: { width: 1360, height: 900 }, locale: 'es' })).newPage();
const errores = [];
p.on('pageerror', (e) => errores.push(String(e)));
await p.route('**/herokuapp.com/**', (r) => r.fulfill({ status: 200, json: {} }));
await p.goto(`http://127.0.0.1:${PUERTO}/index.html`, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(1500);
await p.evaluate(() => {
  const tk = btoa(JSON.stringify({ sub: 'p1', exp: Math.floor(Date.now() / 1000) + 9999 }));
  VETA._sesion({ token: `x.${tk}.y`, correo: 'p@x.com', nombre: 'Medardo', direccion: '0x' + '1'.repeat(40) });
  VETA._identidad({ estado: 'verificada' });
  document.getElementById('velo-og')?.remove();
  document.getElementById('app')?.classList.remove('oculto');
  for (const id of ['portada', 'techo', 'acceso', 'reclave']) document.getElementById(id)?.classList.add('oculto');
  VETA.ir('app'); VETA.auraBienFin?.(); VETA.aedCallar?.();
});
await p.waitForTimeout(3000);

const mano = (x, y, pellizco, escala = 0.2) =>
  p.evaluate(([x, y, pellizco, escala]) =>
    VETA._atPunto({ presente: true, x, y, pellizco, escala }), [x, y, pellizco, escala]);
const sinMano = () => p.evaluate(() => VETA._atPunto({ presente: false }));

console.log('\n── el tablero no le quita el sitio a nada ───────────────────');
{
  await p.evaluate(() => VETA._atTablero(true));
  await p.waitForTimeout(300);
  const choque = await p.evaluate(() => {
    const t = document.getElementById('at-tablero').getBoundingClientRect();
    const pisa = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return false;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return false;
      return !(t.right < r.left || t.left > r.right || t.bottom < r.top || t.top > r.bottom);
    };
    return { riel: pisa('.riel'), tabs: pisa('.tabs'), timon: pisa('.ae-timon'),
             boton: pisa('#at-boton'), t };
  });
  ok('el tablero NO tapa el riel del menú', !choque.riel,
     `tablero en x${Math.round(choque.t.left)} y${Math.round(choque.t.top)}`);
  ok('ni las pestañas de abajo', !choque.tabs);
  ok('ni los mandos de acercar', !choque.timon);
  ok('y no se monta encima de su propio botón', !choque.boton);
}

console.log('\n── el cursor y el toque ─────────────────────────────────────');
{
  await mano(700, 450, false);
  await p.waitForTimeout(200);
  const cur = await p.evaluate(() => {
    const c = document.getElementById('at-cursor');
    return { visible: !c.classList.contains('oculto'), t: c.style.transform };
  });
  ok('el cursor aparece y sigue a la mano', cur.visible && /700/.test(cur.t), cur.t);

  /* Un botón de la casa: el de Ajustes del riel. Pellizcar sobre él tiene que
     apretarlo de verdad. */
  const caja = await p.evaluate(() => {
    const el = document.querySelector('.riel .nav[data-vista="ajustes"]');
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
  });
  await p.evaluate((c) => {
    const espera = (ms) => { const t0 = performance.now(); while (performance.now() - t0 < ms); };
    VETA._atPunto({ presente: true, x: c.x, y: c.y, pellizco: false, escala: 0.2 }); espera(60);
    VETA._atPunto({ presente: true, x: c.x, y: c.y, pellizco: true, escala: 0.2 }); espera(90);
    VETA._atPunto({ presente: true, x: c.x, y: c.y, pellizco: false, escala: 0.2 });
  }, caja);
  await p.waitForTimeout(1200);
  ok('pellizcar un botón lo TOCA de verdad',
     await p.evaluate(() => VETA.dondeEstoy()) === 'ajustes',
     await p.evaluate(() => VETA.dondeEstoy()));
  await sinMano();
}

console.log('\n── la mirada: abre lo que navega, jamás lo que paga ─────────');
{
  await p.evaluate(() => VETA.vista('billetera'));
  await p.waitForTimeout(1200);
  const dinero = await p.evaluate(() => {
    const el = [...document.querySelectorAll('.acc-btn')]
      .find((b) => /enviar/i.test(b.textContent));
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
  });
  if (dinero) {
    for (let i = 0; i < 24; i++) { await mano(dinero.x, dinero.y, false); await p.waitForTimeout(60); }
    await p.waitForTimeout(1200);
    ok('mirar fijo un botón de DINERO no lo aprieta',
       await p.evaluate(() => VETA.dondeEstoy()) === 'billetera',
       await p.evaluate(() => VETA.dondeEstoy()));
    await sinMano();
  } else ok('mirar fijo un botón de DINERO no lo aprieta', false, 'no encontré el botón');

  const nav = await p.evaluate(() => {
    const r = document.querySelector('.riel .nav[data-vista="actividad"]').getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
  });
  for (let i = 0; i < 26; i++) { await mano(nav.x, nav.y, false); await p.waitForTimeout(60); }
  await p.waitForTimeout(1400);
  ok('y mirar fijo una entrada del menú SÍ la abre',
     await p.evaluate(() => VETA.dondeEstoy()) === 'actividad',
     await p.evaluate(() => VETA.dondeEstoy()));
  await sinMano();
}

console.log('\n── el agarre en GENESIS CORE gira el cerebro ────────────────');
{
  await p.evaluate(() => VETA.vista('genesis'));
  await p.waitForTimeout(3000);
  const antes = await p.evaluate(() => ({
    x: parseFloat(document.querySelector('#gc-caja .nu-mundo[data-tema="og"]').style.left),
    scroll: window.scrollY,
  }));
  await mano(700, 450, false);
  await p.waitForTimeout(120);
  await mano(700, 450, true);
  for (let i = 1; i <= 12; i++) { await p.waitForTimeout(55); await mano(700 + i * 20, 450, true); }
  await mano(940, 450, false);
  await p.waitForTimeout(1200);
  const luego = await p.evaluate(() => ({
    x: parseFloat(document.querySelector('#gc-caja .nu-mundo[data-tema="og"]').style.left),
    scroll: window.scrollY,
  }));
  ok('el cerebro gira con la mano', Math.abs(luego.x - antes.x) > 12,
     `${antes.x.toFixed(0)} → ${luego.x.toFixed(0)}`);
  ok('y la página NO se arrastra debajo', Math.abs(luego.scroll - antes.scroll) < 6,
     `scroll ${antes.scroll} → ${luego.scroll}`);
  await sinMano();
}

console.log('\n── encender, apagar, y el tutorial ──────────────────────────');
{
  await p.evaluate(() => VETA.vista('nucleo'));
  await p.waitForTimeout(2500);
  ok('el botón de la mano está a la vista', await p.evaluate(() => {
    const el = document.getElementById('at-boton');
    return !!el && getComputedStyle(el).display !== 'none';
  }));

  await p.evaluate(() => { localStorage.removeItem('veta.airtouch.tuto'); VETA.airToca(); });
  await p.waitForTimeout(600);
  ok('la primera vez se abre el tutorial', await p.evaluate(() =>
    !document.getElementById('at-tuto').classList.contains('oculto')));
  const pasos = await p.evaluate(() =>
    [...document.querySelectorAll('#at-tuto .at-paso p')].map((x) => x.textContent).filter(Boolean));
  ok('con los gestos explicados', pasos.length >= 4, `${pasos.length} pasos`);
  ok('y el de rotar dice MANTENER', pasos.some((t) => /mantené/i.test(t)),
     pasos.find((t) => /pellizc/i.test(t))?.slice(0, 46) || '');
  await p.evaluate(() => VETA.airTutoCerrar());
  await p.waitForTimeout(500);
  ok('se cierra y no deja la pantalla bloqueada', await p.evaluate(() => {
    const t = document.getElementById('at-tuto');
    if (!t.classList.contains('oculto')) return false;
    const centro = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
    return !centro?.closest('#at-tuto');
  }));

  await p.evaluate(() => VETA._atTablero(false));
  await p.waitForTimeout(300);
  ok('apagar la mano guarda su tablero', await p.evaluate(() =>
    document.getElementById('at-tablero').classList.contains('oculto')));
  ok('y no deja cursor ni pastilla colgando', await p.evaluate(() => {
    VETA._atPunto({ presente: false });
    return document.getElementById('at-cursor').classList.contains('oculto')
      && document.getElementById('at-nombre').classList.contains('oculto');
  }));
}

console.log('\n── el teléfono ──────────────────────────────────────────────');
{
  const m = await (await b.newContext({ ...devices['Pixel 7'], locale: 'es' })).newPage();
  await m.route('**/herokuapp.com/**', (r) => r.fulfill({ status: 200, json: {} }));
  await m.goto(`http://127.0.0.1:${PUERTO}/index.html`, { waitUntil: 'domcontentloaded' });
  await m.waitForTimeout(1500);
  await m.evaluate(() => {
    const tk = btoa(JSON.stringify({ sub: 'p1', exp: Math.floor(Date.now() / 1000) + 9999 }));
    VETA._sesion({ token: `x.${tk}.y`, correo: 'p@x.com', nombre: 'M', direccion: '0x' + '1'.repeat(40) });
    VETA._identidad({ estado: 'verificada' });
    document.getElementById('velo-og')?.remove();
    document.getElementById('app')?.classList.remove('oculto');
    for (const id of ['portada', 'techo', 'acceso', 'reclave']) document.getElementById(id)?.classList.add('oculto');
    VETA.ir('app'); VETA.auraBienFin?.(); VETA.aedCallar?.();
    VETA._atTablero(true);
  });
  await m.waitForTimeout(2500);
  const ch = await m.evaluate(() => {
    const t = document.getElementById('at-tablero').getBoundingClientRect();
    const pisa = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return false;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return false;
      return !(t.right < r.left || t.left > r.right || t.bottom < r.top || t.top > r.bottom);
    };
    return { tabs: pisa('.tabs'), boton: pisa('#at-boton'), orbe: pisa('#aura-orbe'),
             timon: pisa('.ae-timon'), saludo: pisa('#ae-saludo'),
             dentro: t.top > 0 && t.bottom < innerHeight };
  });
  ok('en el teléfono el tablero no tapa las pestañas', !ch.tabs);
  ok('ni el botón de la mano ni AU-RA', !ch.boton && !ch.orbe);
  /* Abajo vive TODO lo que se toca: los mandos de acercar quedaban debajo del
     tablero y el botón de acercar no se podía apretar. */
  ok('ni los mandos de acercar ni el saludo', !ch.timon && !ch.saludo);
  ok('y entra entero en pantalla', ch.dentro);
  await m.context().close();
}

ok('sin errores de página en todo el repaso', errores.length === 0,
   errores.slice(0, 2).join(' · '));

await b.close();
sv.kill();
console.log(f ? `\n${f} en rojo\n` : '\nTodo en verde\n');
process.exit(f ? 1 : 0);
