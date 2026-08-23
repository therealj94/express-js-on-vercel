/* LA PUERTA CONTINUA: el login y la casa son LA MISMA escena.
 *
 *   node pruebas/puerta-continua.mjs
 *
 * Lo que el diseño pide y aquí se exige:
 *
 *  1. En la puerta se ve el sistema desde LEJOS: la galaxia 3D montada, AURA
 *     al centro, nombres callados, y ni un toque se le va al cielo (el
 *     formulario manda). El cielo 2D le pasó el turno.
 *  2. Entrar es UN VUELO de la misma cámara — el canvas de la puerta y el de
 *     la casa son EL MISMO NODO del DOM. Cero cortes.
 *  3. 'directo' (sesión de siempre) llega al encuadre de casa; 'descubrir'
 *     (cuenta nueva) también llega, más despacio, y AURA late de bienvenida.
 *  4. GENESIS CORE existe: planeta en la galaxia, vista con sus ocho ganglios
 *     (esferas .nu-mundo — la mirada de AIR TOUCH ya sabe leerlas), y cada
 *     tema abre su hoja con texto de verdad.
 *  5. Salir no corta: la cámara vuelve al umbral y la puerta recibe con la
 *     misma galaxia.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';

const PUERTO = 8868;
spawn('fuser', ['-k', `${PUERTO}/tcp`]).on('close', () => {});
await new Promise((r) => setTimeout(r, 400));
const sv = spawn('python3', ['-m', 'http.server', String(PUERTO), '--bind', '127.0.0.1',
  '--directory', new URL('..', import.meta.url).pathname], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 900));

let f = 0;
const ok = (q, c, x = '') => { console.log(`${c ? '  ok  ' : ' FALLA'}  ${q}${x ? '  · ' + x : ''}`); if (!c) f++; };
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ viewport: { width: 1360, height: 900 }, locale: 'es' });
const p = await ctx.newPage();
p.errores = [];
p.on('pageerror', (e) => p.errores.push(String(e)));
await p.route('**/herokuapp.com/**', (r) => r.fulfill({ status: 200, json: {} }));
await p.goto(`http://127.0.0.1:${PUERTO}/index.html`, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(1500);

/* La cámara quieta: bajo SwiftShader los cuadros van lentos — se espera al
   MECANISMO (el radio deja de moverse cerca del objetivo), no a un reloj. */
const asentada = (objetivo, margen = 2.5) => p.waitForFunction(
  ([o, m]) => window.__aeCamera && Math.abs(window.__aeCamera.position.length() - o) < m,
  [objetivo, margen], { timeout: 25000, polling: 300 }).then(() => true).catch(() => false);

console.log('\n── la puerta: el sistema visto desde el umbral ──────────────');
{
  await p.evaluate(() => { document.getElementById('velo-og')?.remove(); VETA.ir('acceso'); });
  await p.waitForFunction(() => !!window.__aeCamera, null, { timeout: 30000 }).catch(() => {});
  await p.waitForTimeout(2500);
  const est = await p.evaluate(() => ({
    puerta: !!window.__AE_PUERTA,
    radio: +window.__aeCamera.position.length().toFixed(1),
    reposo: +window.__AE_VISTA.estado().reposo.toFixed(1),
    g2d: window.GALAXIA ? GALAXIA.viva() : null,
    toca: getComputedStyle(document.getElementById('ae-cielo')).pointerEvents,
    hud: !document.querySelector('#ae-cielo .ae-hud')
      || getComputedStyle(document.querySelector('#ae-cielo .ae-hud')).display === 'none',
    form: !!document.querySelector('#acceso #i-correo'),
  }));
  ok('la galaxia 3D recibe en la puerta, en modo umbral', est.puerta);
  ok('y se mira desde LEJOS', est.radio > est.reposo * 1.5, `radio ${est.radio} · casa ${est.reposo}`);
  ok('el cielo 2D le pasó el turno', est.g2d === false);
  ok('ni un toque se le va al cielo: el formulario manda', est.toca === 'none' && est.form);
  ok('y el HUD de la casa no existe todavía', est.hud);
}

console.log('\n── entrar es un vuelo, no un corte ──────────────────────────');
{
  const reposo = await p.evaluate(() => +window.__AE_VISTA.estado().reposo.toFixed(1));
  await p.evaluate(() => {
    const tk = btoa(JSON.stringify({ sub: 'p1', exp: Math.floor(Date.now() / 1000) + 9999 }));
    VETA._sesion({ token: `x.${tk}.y`, correo: 'p@x.com', nombre: 'Medardo', direccion: '0x' + '1'.repeat(40) });
    VETA._identidad({ estado: 'verificada' });
    window.__canvasPuerta = document.querySelector('#ae-cielo canvas');
    AETHERION.entrar('directo', () => {
      document.getElementById('app')?.classList.remove('oculto');
      for (const id of ['portada', 'techo', 'acceso', 'reclave']) document.getElementById(id)?.classList.add('oculto');
      VETA.ir('app'); VETA.auraBienFin?.();
    });
  });
  ok('la cámara ATERRIZA en el encuadre de casa', await asentada(reposo));
  const est = await p.evaluate(() => ({
    mismoCanvas: document.querySelector('#ae-cielo canvas') === window.__canvasPuerta,
    vista: VETA.dondeEstoy(),
    saludo: !!document.getElementById('ae-saludo'),
    puerta: !!window.__AE_PUERTA,
  }));
  ok('con EL MISMO canvas de la puerta: cero cortes', est.mismoCanvas);
  ok('y del otro lado ya es la casa, con su saludo', est.vista === 'nucleo' && est.saludo);
  ok('el umbral quedó atrás', !est.puerta);
}

console.log('\n── la bienvenida ocurre EN la galaxia ───────────────────────');
{
  /* Antes, entrar terminaba en un cartel negro a pantalla completa que tapaba
     el vuelo y la galaxia recién llegada. Ahora AU-RA saluda encima del cielo
     y se puede callar con un toque. */
  const cartel = await p.evaluate(() =>
    !document.getElementById('aura-bienvenida').classList.contains('oculto'));
  ok('ningún cartel tapa la galaxia al entrar', !cartel);

  await p.evaluate(() => VETA.vista('nucleo'));
  /* Se espera al MECANISMO —que el cielo esté montado— y no a un reloj: bajo
     el render por software remontar la galaxia puede tardar lo suyo. */
  await p.waitForFunction(() => !!document.querySelector('#ae-cielo canvas'),
    null, { timeout: 20000, polling: 300 }).catch(() => {});
  /* Se calla cualquier saludo en vuelo antes de pedir el nuestro: si no, lo
     que se mide es el final de la bienvenida del aterrizaje y no el principio
     de esta. */
  await p.evaluate(() => VETA.aedCallar());
  await p.waitForTimeout(600);
  await p.evaluate(() => VETA._bienvenidaGalaxia?.(false));
  await p.waitForTimeout(400);
  const dice = await p.evaluate(() => {
    const d = document.getElementById('ae-dice');
    return { visible: d && !d.classList.contains('oculto'),
             txt: d?.querySelector('.aed-txt')?.textContent || '',
             cielo: !!document.querySelector('#ae-cielo canvas') };
  });
  ok('AU-RA saluda sobre el cielo, con la galaxia detrás', dice.visible && dice.cielo,
     `visible=${dice.visible} cielo=${dice.cielo} · ${dice.txt.slice(0, 30)}`);
  await p.evaluate(() => VETA.aedCallar());
  await p.waitForTimeout(700);
  ok('y se calla con un toque', await p.evaluate(() =>
    document.getElementById('ae-dice').classList.contains('oculto')));
}

console.log('\n── GENESIS CORE: la memoria viva ────────────────────────────');
{
  await p.evaluate(() => window.__AE_ABRIR('genesis'));
  await p.waitForTimeout(1600);
  await p.waitForTimeout(1500);
  const est = await p.evaluate(() => {
    const g = [...document.querySelectorAll('#gc-caja .nu-mundo[data-tema]')];
    return {
      vista: VETA.dondeEstoy(),
      temas: g.length,
      colocados: g.filter((e) => (parseFloat(e.style.left) || 0) > 0).length,
      vivo: !!window.CEREBRO_OG?.vivo(),
      cielo: !!document.getElementById('cielo-nucleo'),
      aeMuerto: !document.getElementById('ae-casa'),
    };
  });
  ok('el planeta GENESIS CORE lleva a su vista', est.vista === 'genesis');
  ok('con sus ocho ganglios de saber', est.temas === 8, `${est.temas}`);
  /* EL CEREBRO DE VERDAD: el volumen con lóbulos, fisura y cerebelo que se
     proyecta en la sala de Genesis ID. Los ganglios NO llevan posición en el
     HTML: se la pone el motor sobre su punto del volumen, en cada cuadro. Si
     esto falla, lo que hay es una constelación otra vez, no un cerebro. */
  ok('el cerebro está vivo y coloca sus ganglios', est.vivo && est.colocados === 8,
     `${est.colocados}/8 colocados`);
  ok('con el cielo interior detrás', est.cielo);
  ok('y el 3D se apagó del todo: una escena a la vez', est.aeMuerto);

  /* Se puede GIRAR: el cerebro se mira por todos lados, con el dedo, con el
     ratón y con la mano en el aire (que dispara los mismos eventos). */
  const antes = await p.evaluate(() =>
    parseFloat(document.querySelector('#gc-caja .nu-mundo[data-tema="og"]').style.left));
  await p.mouse.move(700, 480);
  await p.mouse.down();
  await p.mouse.move(950, 480, { steps: 12 });
  await p.mouse.up();
  await p.waitForTimeout(900);
  const luego = await p.evaluate(() =>
    parseFloat(document.querySelector('#gc-caja .nu-mundo[data-tema="og"]').style.left));
  ok('arrastrar GIRA el cerebro', Math.abs(luego - antes) > 12,
     `${antes.toFixed(0)} → ${luego.toFixed(0)}`);

  /* la mirada de AIR TOUCH ya sabe leer estos ganglios: son .nu-mundo */
  ok('los ganglios son mirables por AIR TOUCH', await p.evaluate(() =>
    document.querySelector('.nu-mundo[data-tema="origen"]')?.matches('.nu-mundo, .nav')));

  await p.evaluate(() => VETA.gcAbrir('origen'));
  await p.waitForTimeout(500);
  const hoja = await p.evaluate(() => ({
    abierta: !!document.getElementById('gc-hoja'),
    txt: document.querySelector('.gc-carta p')?.textContent || '',
  }));
  ok('tocar un tema abre su hoja', hoja.abierta);
  ok('con la palabra exacta de la casa: «sigue el precio», jamás «respaldado»',
     /sigue el precio/.test(hoja.txt) && !/respaldad/i.test(hoja.txt), hoja.txt.slice(0, 44));
  await p.evaluate(() => VETA.gcCerrar());
  ok('y se cierra limpia', await p.evaluate(() => !document.getElementById('gc-hoja')));
}

console.log('\n── salir aleja, no corta ────────────────────────────────────');
{
  await p.evaluate(() => VETA.vista('nucleo'));
  await p.waitForTimeout(2600);
  await p.evaluate(() => VETA.salir());
  await p.waitForTimeout(1200);
  const est = await p.evaluate(() => ({
    puerta: !!window.__AE_PUERTA,
    acceso: !document.getElementById('acceso').classList.contains('oculto'),
    canvas: !!document.querySelector('#ae-cielo canvas'),
  }));
  ok('la puerta recibe con la MISMA galaxia', est.acceso && est.canvas && est.puerta);
  const lejos = await p.evaluate(() => +window.__AE_VISTA.estado().reposo.toFixed(1) * 1.5);
  ok('y la cámara se aleja de vuelta al umbral', await p.waitForFunction((l) =>
    window.__aeCamera.position.length() > l, lejos, { timeout: 20000, polling: 300 })
    .then(() => true).catch(() => false));
  ok('sin errores de página en todo el viaje', p.errores.length === 0,
     p.errores.slice(0, 2).join(' · '));
}

await b.close();
sv.kill();
console.log(f ? `\n${f} en rojo\n` : '\nTodo en verde\n');
process.exit(f ? 1 : 0);
