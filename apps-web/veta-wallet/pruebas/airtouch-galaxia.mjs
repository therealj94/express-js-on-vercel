/* AIR TOUCH SOBRE LA GALAXIA: la mano manda de verdad.
 *
 *   node pruebas/airtouch-galaxia.mjs
 *
 * Esta prueba nació de dos fallos que José encontró usándolo:
 *
 *  1. «Pellizcar para rotar no me funciona». Era verdad y la causa era fea:
 *     setPointerCapture REVIENTA con un puntero sintético (AIR TOUCH manda un
 *     id que el navegador no conoce) y esa excepción se llevaba por delante
 *     el resto del gesto. El cielo no giraba ni un grado.
 *  2. «Con la mirada no me detecta para darle a un icono». También cierto: en
 *     el Inicio los planetas NO son botones del DOM, así que la mirada no
 *     tenía nada que mirar. Ahora le pregunta al motor qué hay bajo el punto.
 *
 * Aquí se exige, con la mano de aire simulada tal como la manda el motor:
 * girar, mirar para abrir, doble pellizco para abrir ya, acercar con la mano
 * abierta, y el tablero que dice si la mano se ve.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';

const PUERTO = 8856;
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
  VETA.ir('app'); VETA.auraBienFin?.();
});
await p.waitForFunction(() => !!window.__aeCamera, null, { timeout: 30000 }).catch(() => {});
await p.waitForTimeout(5500);

/* La mano de aire: exactamente lo que el motor entrega a la casa. */
const mano = (x, y, pellizco, escala = 0.2) =>
  p.evaluate(([x, y, pellizco, escala]) =>
    VETA._atPunto({ presente: true, x, y, pellizco, escala }), [x, y, pellizco, escala]);
const sinMano = () => p.evaluate(() => VETA._atPunto({ presente: false }));
const angulo = () => p.evaluate(() =>
  +Math.atan2(window.__aeCamera.position.x, window.__aeCamera.position.z).toFixed(3));
const radio = () => p.evaluate(() => +window.__aeCamera.position.length().toFixed(2));

console.log('\n── pellizcar, MANTENER y mover: gira el cielo ───────────────');
{
  const antes = await angulo();
  await mano(700, 450, false);
  await p.waitForTimeout(120);
  await mano(700, 450, true);
  for (let i = 1; i <= 14; i++) { await p.waitForTimeout(50); await mano(700 + i * 18, 450, true); }
  await mano(952, 450, false);
  await p.waitForTimeout(1500);
  const luego = await angulo();
  ok('mover a la derecha gira el cielo', Math.abs(luego - antes) > 0.15,
     `${antes} → ${luego}`);

  const arriba = await p.evaluate(() => +window.__aeCamera.position.y.toFixed(2));
  await mano(700, 450, false);
  await p.waitForTimeout(120);
  await mano(700, 450, true);
  for (let i = 1; i <= 12; i++) { await p.waitForTimeout(50); await mano(700, 450 + i * 14, true); }
  await mano(700, 620, false);
  await p.waitForTimeout(1500);
  ok('y mover hacia abajo lo inclina',
     Math.abs((await p.evaluate(() => window.__aeCamera.position.y)) - arriba) > 0.4);
  ok('sin que reviente nada por el puntero de aire',
     !errores.some((e) => /setPointerCapture/.test(e)), errores.slice(0, 1).join(''));
}

console.log('\n── la mirada abre un planeta ────────────────────────────────');
{
  await p.evaluate(() => window.__AE_VISTA.recentrar());
  await p.waitForTimeout(1600);
  /* Se busca en pantalla un planeta DE ADENTRO: los de afuera abren pestaña
     (y el navegador la bloquea sin gesto humano), así que no sirven para
     comprobar que la mirada abrió algo. */
  const donde = await p.evaluate(() => {
    const dentro = ['wallet', 'chat', 'gid', 'pay', 'ajustes', 'genesis'];
    for (let x = 300; x < 1340; x += 30) {
      for (let y = 120; y < 800; y += 30) {
        const c = window.__AE_MIRAR?.(x, y);
        if (c && dentro.includes(c.key)) return { x, y, key: c.key, nombre: c.nombre };
      }
    }
    return null;
  });
  ok('el motor sabe qué planeta hay bajo un punto', !!donde, donde ? donde.nombre : 'ninguno');
  if (donde) {
    // se sostiene la mirada, como una mano quieta apuntando
    for (let i = 0; i < 26; i++) { await mano(donde.x, donde.y, false); await p.waitForTimeout(60); }
    const pastilla = await p.evaluate(() => ({
      visible: !document.getElementById('at-nombre').classList.contains('oculto'),
      txt: document.getElementById('at-nombre').textContent,
    }));
    ok('la pastilla dice a qué planeta se está mirando',
       pastilla.visible || /\w/.test(pastilla.txt), pastilla.txt.slice(0, 30));
    await p.waitForTimeout(2400);
    ok('y sostener la mirada lo ABRE', await p.evaluate(() =>
      VETA.dondeEstoy() !== 'nucleo' || !!document.querySelector('.ae-dim')),
       await p.evaluate(() => VETA.dondeEstoy()));
    await sinMano();
  }
}

console.log('\n── doble pellizco: abrir ya ─────────────────────────────────');
{
  await p.evaluate(() => VETA.vista('nucleo'));
  await p.waitForTimeout(3200);
  const donde = await p.evaluate(() => {
    const dentro = ['wallet', 'chat', 'gid', 'pay', 'ajustes', 'genesis'];
    for (let x = 300; x < 1340; x += 30) {
      for (let y = 120; y < 800; y += 30) {
        const c = window.__AE_MIRAR?.(x, y);
        if (c && dentro.includes(c.key)) return { x, y, key: c.key };
      }
    }
    return null;
  });
  if (donde) {
    /* EL GESTO SE MIDE, NO LA CARGA DE LA MÁQUINA. Un doble pellizco depende
       de CUÁNTO TIEMPO pasa entre los dos, y ni un setTimeout del navegador ni
       un viaje de ida y vuelta del arnés respetan ese tiempo cuando el cielo
       3D está dibujando por software: los 90 ms pedidos llegan a ser 600. Se
       mandan los cuatro eventos en una sola visita, con espera de reloj
       exacta, y así lo que se prueba es el gesto de una persona y no lo
       ocupada que estaba la CPU. */
    await p.evaluate((d) => {
      const espera = (ms) => { const t0 = performance.now(); while (performance.now() - t0 < ms); };
      const punto = (pellizco) => VETA._atPunto({ presente: true, x: d.x, y: d.y, pellizco, escala: 0.2 });
      punto(false); espera(60);
      punto(true); espera(90);   // primer pellizco
      punto(false); espera(140); // el hueco entre los dos
      punto(true); espera(90);   // segundo pellizco
      punto(false);
    }, donde);
    await p.waitForTimeout(2200);
    const abrio = await p.evaluate(() =>
      VETA.dondeEstoy() !== 'nucleo' || !!document.querySelector('.ae-dim'));
    ok('dos pellizcos cortos abren el planeta', abrio,
       abrio ? await p.evaluate(() => VETA.dondeEstoy())
             : `quedó en ${await p.evaluate(() => VETA.dondeEstoy())} · planeta ${donde.key}`);
  } else ok('dos pellizcos cortos abren el planeta', false, 'no encontré planeta');
  await sinMano();
}

console.log('\n── la mano abierta acerca y aleja ───────────────────────────');
{
  await p.evaluate(() => VETA.vista('nucleo'));
  await p.waitForTimeout(3200);
  await p.evaluate(() => window.__AE_VISTA.recentrar());
  await p.waitForTimeout(1600);
  const antes = await radio();
  for (let i = 0; i < 10; i++) { await mano(700, 450, false, 0.2 + i * 0.03); await p.waitForTimeout(70); }
  await p.waitForTimeout(1400);
  ok('acercar la mano abierta ACERCA el cielo', (await radio()) < antes - 0.6,
     `${antes} → ${await radio()}`);
  await sinMano();
}

console.log('\n── el tablero: si te veo la mano, y qué podés hacer ─────────');
{
  await p.evaluate(() => {
    document.getElementById('at-tablero').classList.remove('oculto');
    VETA._atTablero?.(true);
  });
  const tab = await p.evaluate(() => {
    const t = document.getElementById('at-tablero');
    return { hay: !!t, gestos: t ? t.querySelectorAll('.at-gestos li').length : 0 };
  });
  ok('el tablero existe', tab.hay);
  ok('con los gestos a la vista', tab.gestos >= 5, `${tab.gestos} gestos`);
  await mano(700, 450, false);
  await p.waitForTimeout(200);
  ok('con la mano puesta dice que la ve', await p.evaluate(() =>
    document.getElementById('at-tablero').classList.contains('ve')));
  await sinMano();
  /* Se espera al MECANISMO —que el tablero deje de decir que la ve— y no a un
     reloj: el aviso tiene medio segundo de respiro a propósito, y con la
     máquina cargada ese medio segundo se estira. */
  const avisó = await p.waitForFunction(() =>
    !document.getElementById('at-tablero').classList.contains('ve'),
    null, { timeout: 6000, polling: 200 }).then(() => true).catch(() => false);
  ok('y al perderla lo avisa', avisó);
}

ok('sin errores de página en todo el recorrido', errores.length === 0,
   errores.slice(0, 2).join(' · '));

await b.close();
sv.kill();
console.log(f ? `\n${f} en rojo\n` : '\nTodo en verde\n');
process.exit(f ? 1 : 0);
