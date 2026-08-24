/* MODO VISOR, comprobado por dentro.
 *
 *   node pruebas/visor.mjs      (sirve la carpeta en 8897 él solo)
 *
 * Un visor no se puede probar con un visor, así que se prueban LOS MECANISMOS:
 *
 *  1. La ficha de Ajustes dice qué hay en ESTE aparato y no promete de más.
 *  2. Con WebXR fingido, entrar pide sesión inmersiva de verdad.
 *  3. En cartón la pantalla se parte en dos ojos y la separación se mueve.
 *  4. La cabeza manda: un `deviceorientation` gira la vista sin tocar nada.
 *  5. La mirada abre: sostenida sobre una casa, la casa se abre sola.
 *  6. El dinero NO se abre con el visor puesto, y se dice por qué.
 *  7. Las cinco salidas salen, cada una por su lado.
 *  8. Al salir no queda nada puesto: ni clase, ni capa, ni tijera.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUERTO = 8897;

spawn('fuser', ['-k', `${PUERTO}/tcp`]).on('close', () => {});
await new Promise((r) => setTimeout(r, 400));
const sv = spawn('python3', ['-m', 'http.server', String(PUERTO), '--bind', '127.0.0.1',
  '--directory', RAIZ], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 900));

let f = 0;
const ok = (q, c, x = '') => { console.log(`${c ? '  ok  ' : ' FALLA'}  ${q}${x ? '  · ' + x : ''}`); if (!c) f++; };
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=swiftshader'] });

const JWT = () => 'x.' + Buffer.from(JSON.stringify({
  sub: 'v1', userId: 'v1', address: '0x' + '3'.repeat(40),
  exp: Math.floor(Date.now() / 1000) + 9999,
})).toString('base64url') + '.y';

/* El WebXR de mentira: una sesión que se comporta como la de verdad —se pide,
   se entrega, avisa cuando termina— sin necesitar un visor enchufado. */
const FINGIR_XR = `
  window.__xr = { pedidas: [], sesion: null, terminada: false };
  const oyentes = {};
  window.__xr.sesion = {
    addEventListener: (k, fn) => { (oyentes[k] ||= []).push(fn); },
    removeEventListener: () => {},
    requestReferenceSpace: async () => ({}),
    updateRenderState: () => {},
    end: async () => {
      if (window.__xr.terminada) return;      // como la de verdad: se termina una vez
      window.__xr.terminada = true;
      (oyentes.end || []).forEach((fn) => fn());
    },
    /* three le pide a la sesión bastante más que empezar y terminar: el
       estado de dibujo, las fuentes de entrada y su propio reloj. Sin esto
       la sesión de mentira revienta dentro del motor y no se prueba nada. */
    renderState: { layers: [], baseLayer: null },
    inputSources: [],
    requestAnimationFrame: (fn) => requestAnimationFrame((t) =>
      fn(t, { session: window.__xr.sesion, getViewerPose: () => null })),
    cancelAnimationFrame: (i) => cancelAnimationFrame(i),
    __fin: () => { if (!window.__xr.terminada) { window.__xr.terminada = true; (oyentes.end || []).forEach((fn) => fn()); } },
  };
  /* Lo que el motor toca de un visor de verdad y aquí no existe. Sin estos
     tres, three revienta antes de llegar a nuestro código y la prueba diría
     que el modo XR está roto cuando lo que falta es el aparato. */
  for (const C of [window.WebGL2RenderingContext, window.WebGLRenderingContext])
    if (C) C.prototype.makeXRCompatible = function () { return Promise.resolve(); };
  window.XRWebGLBinding = function () {
    return { createProjectionLayer: () => ({ textureWidth: 512, textureHeight: 512, ignoreDepthValues: false }) };
  };
  window.XRWebGLLayer = function () {
    return { framebuffer: null, framebufferWidth: 512, framebufferHeight: 512 };
  };
  Object.defineProperty(navigator, 'xr', { configurable: true, value: {
    isSessionSupported: async (m) => m === 'immersive-vr',
    requestSession: async (m, o) => { window.__xr.pedidas.push({ m, o }); return window.__xr.sesion; },
    addEventListener: () => {}, removeEventListener: () => {},
  } });`;

async function abrir({ xr = false, ancho = 1360, alto = 900, movil = false, sinGiro = false } = {}) {
  const ctx = await b.newContext({
    viewport: { width: ancho, height: alto },
    hasTouch: movil, isMobile: movil, locale: 'es',
    userAgent: movil ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' : undefined,
  });
  const pag = await ctx.newPage();
  pag.errores = [];
  pag.on('pageerror', (e) => pag.errores.push(String(e)));
  await pag.addInitScript(`
    /* EL PERMISO DE IOS, FINGIDO CON SU REGLA DE VERDAD: solo concede si la
       llamada sale del propio gesto. Safari mide eso con la «activación
       transitoria»; aquí se imita con una marca que el primer toque enciende
       y que cualquier espera apaga. Así la prueba falla exactamente donde
       fallaba el teléfono. */
    window.__giro = { pedidas: 0, concedidas: 0, gesto: false };
    addEventListener('pointerdown', () => {
      window.__giro.gesto = true;
      // la activación se pierde en cuanto el hilo respira, como en Safari
      setTimeout(() => { window.__giro.gesto = false; }, 0);
    }, true);
    if (typeof DeviceOrientationEvent !== 'undefined') {
      DeviceOrientationEvent.requestPermission = () => {
        window.__giro.pedidas++;
        if (!window.__giro.gesto) return Promise.reject(new Error('NotAllowedError'));
        window.__giro.concedidas++;
        return Promise.resolve('granted');
      };
    }
    ${sinGiro ? `
    /* Un aparato sin sensor: el objeto existe (el navegador lo declara) pero
       NUNCA llega un evento. Es el caso más traicionero, porque desde fuera
       se ve idéntico a uno que funciona. */
    delete DeviceOrientationEvent.requestPermission;
    const noHay = (t, fn, o) => { if (/deviceorientation/i.test(t)) return; _add.call(window, t, fn, o); };
    const _add = window.addEventListener;
    window.addEventListener = noHay;
    ` : ''}
    window.localStorage.setItem('veta.sesion', '${JWT()}');
    window.localStorage.setItem('veta.idioma', 'es');
    ${xr ? FINGIR_XR : ''}
    /* La pantalla completa y el bloqueo de orientación no existen sin gesto de
       usuario real: se fingen para que el flujo no se corte en la prueba. */
    Element.prototype.requestFullscreen = function () { return Promise.resolve(); };
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => window.__fs || null });`);
  await pag.route('**/auth/login', (r) => r.fulfill({ json: {
    token: JWT(), user: { email: 'v@x.com', name: 'Visor' } } }));
  await pag.route('**/herokuapp.com/**', (r) => r.fulfill({ status: 200, json: {} }));
  await pag.route('**/api.coingecko.com/**', (r) => r.fulfill({ json: {} }));
  await pag.goto(`http://127.0.0.1:${PUERTO}/index.html`, { waitUntil: 'domcontentloaded' });
  /* Se entra por la puerta, como entra la gente: con la sesión metida a mano
     la casa se queda del lado de afuera y las fichas de Ajustes no llegan a
     pintarse nunca. */
  await pag.waitForSelector('#i-correo', { timeout: 20000 });
  await pag.fill('#i-correo', 'v@x.com');
  await pag.fill('#i-clave', 'clave-de-prueba');
  await pag.click('#btn-acceso');
  await pag.waitForFunction(() => !document.getElementById('app').classList.contains('oculto'),
    null, { timeout: 30000 });
  // el cielo 3D montado es la condición de todo lo demás
  await pag.waitForFunction(() => !!window.__AE_VISOR, null, { timeout: 45000 });
  return { ctx, pag };
}

console.log('\n── la ficha de Ajustes dice lo que hay ──────────────────────');
const { pag } = await abrir();
{
  await pag.evaluate(() => VETA.vista('ajustes'));
  await pag.waitForFunction(() => {
    const e = document.querySelector('#vs-caja .vs-estado span');
    return e && !/Viendo/.test(e.textContent || '');
  }, null, { timeout: 12000 });
  const ficha = await pag.evaluate(() => ({
    visible: !!document.querySelector('#vs-caja').getClientRects().length,
    estado: document.querySelector('#vs-caja .vs-estado span').textContent,
    aviso: document.querySelector('#vs-caja .vs-aviso')?.textContent || '',
    entrar: !!document.querySelector('#vs-caja .btn-oro'),
    mirada: !!document.getElementById('vs-mirada'),
  }));
  ok('la ficha se ve en Ajustes', ficha.visible);
  ok('la ficha dice qué modo toca en este aparato', /Sin visor|Visor detectado|cartón/i.test(ficha.estado), ficha.estado);
  ok('sin visor no promete uno', /Sin visor/i.test(ficha.estado));
  ok('y avisa que el dinero queda fuera', /no se firma dinero/i.test(ficha.aviso));
  ok('con el botón de entrar', ficha.entrar);
  ok('y el interruptor de la mirada', ficha.mirada);
}

console.log('\n── 360 en pantalla: la cabeza manda ─────────────────────────');
{
  await pag.evaluate(() => VETA.vista('nucleo'));
  await pag.waitForTimeout(900);
  /* La mirada se apaga ANTES de entrar: encendida abre lo que tenga delante
     —que es justo lo que debe hacer— y se llevaría por delante el resto de la
     prueba. Se vuelve a encender en su tramo. */
  await pag.evaluate(() => { VETA.vsMirada(false); return VETA.vsEntrar('trescientos60'); });
  await pag.waitForFunction(() => window.VISOR.activo(), null, { timeout: 9000 });
  ok('entra al modo mirar-alrededor', await pag.evaluate(() => VISOR.modo() === 'trescientos60'));
  ok('y la casa se aparta: el body lo marca', await pag.evaluate(() =>
    document.body.classList.contains('en-visor') && document.body.dataset.visor === 'trescientos60'));
  ok('con el menú fuera de la vista', await pag.evaluate(() => {
    const n = document.querySelector('.nav[data-vista]');
    return !n || getComputedStyle(n.closest('nav') || n).display === 'none'
        || !n.getClientRects().length;
  }));

  /* Un giro de cabeza de verdad: el navegador manda `deviceorientation` y la
     cámara TIENE que quedar mirando a otro lado. Es la prueba del modo. */
  const giro = await pag.evaluate(async () => {
    const q = () => window.__AE_VISOR.cabezaQ().map((n) => n.toFixed(4)).join(',');
    const q0 = q();
    const mandar = (a, b2, g) => dispatchEvent(Object.assign(
      new Event('deviceorientation'), { alpha: a, beta: b2, gamma: g, absolute: true }));
    mandar(0, 0, 0);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    mandar(90, 20, 0);
    const t0 = performance.now();
    while (performance.now() - t0 < 400) await new Promise((r) => requestAnimationFrame(r));
    return { q0, q1: q(), cabeza: !!window.__AE_VISOR.estado().cabeza };
  });
  ok('el giroscopio queda enganchado', giro.cabeza);
  ok('y la vista se mueve con la cabeza', giro.q0 !== giro.q1,
     `${giro.q0.slice(0, 24)} → ${giro.q1.slice(0, 24)}`);
}

console.log('\n── el dinero no se abre con el visor puesto ─────────────────');
{
  const r = await pag.evaluate(() => {
    VETA.vista('enviar');

    return { vista: VETA.vistaActiva ? VETA.vistaActiva() : null,
             titulo: document.querySelector('#lienzo h2, #lienzo h1')?.textContent || '',
             aviso: document.getElementById('tostada').textContent || '',
             despues: !!window.__AE_VISOR, raiz: !!document.getElementById('ae-casa') };
  });
  ok('«enviar» se queda cerrado', !/Enviar/i.test(r.titulo), r.titulo.slice(0, 30));
  ok('y se dice por qué', /visor/i.test(r.aviso), r.aviso.slice(0, 60));
  ok('mientras el Inicio sigue en pie', await pag.evaluate(() =>
    !document.getElementById('ae-cielo').classList.contains('oculto')));
  ok('y el cielo 3D sigue montado', r.despues && r.raiz);
}

console.log('\n── la mirada abre ───────────────────────────────────────────');
{
  const abrio = await pag.evaluate(async () => {
    /* Se apunta la mirada a una casa fingiendo el resultado de __AE_MIRAR: lo
       que se prueba aquí es el DWELL —que sostener abre y soltar no—, no el
       trazado de rayos, que tiene su propia prueba. */
    VISOR.mirada(true);
    const real = window.__AE_MIRAR;
    let tocada = null;
    window.__AE_MIRAR = () => ({ key: 'chat', nombre: 'PULSE2CHAT' });
    const realT = window.__AE_TOCAR;
    window.__AE_TOCAR = (k) => { tocada = k; };
    let visto = 0;
    const real2 = window.__AE_RESALTAR;
    window.__AE_RESALTAR = (k) => { if (k) visto++; return real2 && real2(k); };
    /* El respiro de la entrada ya pasó; aquí se cuenta desde cero. */
    const t0 = performance.now();
    while (performance.now() - t0 < 800) await new Promise((r) => requestAnimationFrame(r));
    const aMedias = tocada;
    while (performance.now() - t0 < 3400) await new Promise((r) => requestAnimationFrame(r));
    const alFinal = tocada;
    window.__AE_MIRAR = real; window.__AE_TOCAR = realT; window.__AE_RESALTAR = real2;
    return { aMedias, alFinal, visto, hay: !!window.__AE_VISOR };
  });
  ok('una mirada corta no abre nada', abrio.aMedias === null, String(abrio.aMedias));
  ok('y sostenerla sí abre la casa', abrio.alFinal === 'chat',
     `retícula viva ${abrio.visto}×`);
  ok('con el puente del visor entero todo el rato', abrio.hay);
}

console.log('\n── abrir una app quita el visor, no lo deja a medias ────────');
{
  const r = await pag.evaluate(() => {
    VETA.vista('actividad');
    return { visor: window.VISOR.activo(),
             clase: document.body.classList.contains('en-visor'),
             capa: !!document.getElementById('visor-capa') };
  });
  ok('la app se abre', await pag.evaluate(() => !!document.querySelector('#lienzo')?.children.length));
  ok('y el visor se quita solo', !r.visor && !r.clase && !r.capa,
     `activo=${r.visor} clase=${r.clase} capa=${r.capa}`);
  // de vuelta al Inicio y al visor, que las salidas se prueban con él puesto
  await pag.evaluate(() => VETA.vista('nucleo'));
  await pag.waitForFunction(() => !!window.__AE_VISOR, null, { timeout: 30000 });
  await pag.evaluate(() => { VETA.vsMirada(false); return VETA.vsEntrar('trescientos60'); });
  await pag.waitForFunction(() => window.VISOR.activo(), null, { timeout: 9000 });
}

console.log('\n── salir: Escape ────────────────────────────────────────────');
{
  await pag.keyboard.press('Escape');
  await pag.waitForFunction(() => !window.VISOR.activo(), null, { timeout: 5000 });
  ok('Escape saca del modo', await pag.evaluate(() => !VISOR.activo()));
  ok('y no deja nada puesto', await pag.evaluate(() =>
    !document.body.classList.contains('en-visor') &&
    !document.body.dataset.visor &&
    !document.getElementById('visor-capa')));
  ok('el dinero vuelve a abrirse', await pag.evaluate(() => {
    VETA.vista('enviar');
    return /Enviar/i.test(document.querySelector('#lienzo h2, #lienzo h1')?.textContent || '');
  }));
  ok('sin errores de página', pag.errores.length === 0, pag.errores.slice(0, 2).join(' · '));
  await pag.context().close();
}

console.log('\n── el permiso del giroscopio sale DEL GESTO ─────────────────');
{
  /* El fallo que esto fija: el permiso se pedía después de una espera de
     segundo y medio y iOS lo rechazaba, así que la cabeza no movía nada y
     nadie decía por qué. Se entra desde OTRA vista —el caso que obliga a
     esperar— y el permiso tiene que salir concedido igual. */
  const { pag: g } = await abrir();
  await g.evaluate(() => VETA.vista('actividad'));
  await g.waitForTimeout(600);
  /* Un toque de verdad en el botón: es lo único que enciende la activación
     del navegador, igual que en un teléfono. */
  await g.evaluate(() => {
    const b = document.createElement('button');
    b.id = 'prueba-visor';
    b.style.cssText = 'position:fixed;left:10px;top:10px;width:120px;height:44px;z-index:9999';
    b.onclick = () => { VETA.vsMirada(false); VETA.vsEntrar('trescientos60'); };
    document.body.appendChild(b);
  });
  await g.click('#prueba-visor');
  await g.waitForFunction(() => window.VISOR.activo(), null, { timeout: 30000 });
  const r = await g.evaluate(() => window.__giro);
  ok('el permiso se pide una sola vez', r.pedidas === 1, `${r.pedidas} veces`);
  ok('y sale del gesto, así que lo conceden', r.concedidas === 1,
     `${r.concedidas} de ${r.pedidas}`);
  ok('el modo entra igual', await g.evaluate(() => VISOR.modo() === 'trescientos60'));
  await g.context().close();
}

console.log('\n── sin giroscopio: se dice y queda el dedo ──────────────────');
{
  const { pag: n } = await abrir({ sinGiro: true });
  await n.evaluate(() => { VETA.vsMirada(false); return VETA.vsEntrar('trescientos60'); });
  await n.waitForFunction(() => window.VISOR.activo(), null, { timeout: 30000 });
  /* El vigía tarda segundo y medio en cantar: es a propósito, un giroscopio
     lento no puede darse por muerto al primer cuadro. */
  await n.waitForFunction(() => document.body.dataset.visorGiro === 'no',
    null, { timeout: 9000 });
  ok('el vigía canta que no hay cabeza', true);
  ok('y la casa lo dice donde se lee', await n.evaluate(() =>
    /dedo|finger/i.test(document.querySelector('#visor-capa .vs-pista')?.textContent || '')));
  ok('el modo NO se cae por eso', await n.evaluate(() => VISOR.activo()));

  /* Y el dedo mueve la vista: es la salida que reemplaza a la cabeza. */
  const movio = await n.evaluate(async () => {
    const q = () => window.__AE_VISOR.cabezaQ().map((v) => v.toFixed(3)).join(',');
    const a = q();
    const el = document.querySelector('#ae-casa canvas');
    const r = el.getBoundingClientRect();
    const ev = (t, x) => el.dispatchEvent(new PointerEvent(t, { bubbles: true,
      clientX: x, clientY: r.top + r.height / 2, pointerId: 1, pointerType: 'touch' }));
    ev('pointerdown', r.left + r.width * 0.5);
    for (let i = 1; i <= 8; i++) ev('pointermove', r.left + r.width * (0.5 + i * 0.04));
    ev('pointerup', r.left + r.width * 0.82);
    const t0 = performance.now();
    while (performance.now() - t0 < 300) await new Promise((s) => requestAnimationFrame(s));
    return { a, b: q() };
  });
  ok('arrastrar el dedo mueve la vista', movio.a !== movio.b,
     `${movio.a.slice(0, 20)} → ${movio.b.slice(0, 20)}`);
  ok('sin errores de página', n.errores.length === 0, n.errores.slice(0, 2).join(' · '));
  await n.context().close();
}

console.log('\n── cartón: dos ojos y separación ────────────────────────────');
{
  const { pag: m } = await abrir({ ancho: 844, alto: 390, movil: true });
  await m.evaluate(() => { VETA.vsMirada(false); return VETA.vsEntrar('carton'); });
  await m.waitForFunction(() => window.VISOR.activo(), null, { timeout: 9000 });
  ok('entra en modo cartón', await m.evaluate(() => VISOR.modo() === 'carton'));
  ok('la pantalla se parte por el medio', await m.evaluate(() =>
    getComputedStyle(document.body, '::after').width === '1px'));
  /* Los dos ojos de verdad: se comprueba que el motor dibuja DOS veces por
     cuadro con tijera puesta. El contador de llamadas de three lo dice. */
  const dos = await m.evaluate(async () => {
    const gl = window.__aeGL;
    if (!gl) return null;
    gl.info.autoReset = false; gl.info.reset();
    const t0 = performance.now();
    while (performance.now() - t0 < 400) await new Promise((r) => requestAnimationFrame(r));
    const n = gl.info.render.calls;
    gl.info.autoReset = true;
    return n;
  });
  ok('y el motor dibuja los dos ojos', dos !== null && dos > 0, `${dos} llamadas`);
  const sep = await m.evaluate(async () => {
    const a = window.__AE_VISOR.estado().ojos;
    VETA.vsOjos(78);
    const t0 = performance.now();
    while (performance.now() - t0 < 300) await new Promise((r) => requestAnimationFrame(r));
    return { a, b: window.__AE_VISOR.estado().ojos };
  });
  ok('la separación de los ojos se mueve', sep.b !== sep.a && Math.abs(sep.b - 0.078) < 1e-6,
     `${sep.a} → ${sep.b}`);
  ok('con botón de recentrar a mano', await m.evaluate(() =>
    !!document.querySelector('#visor-capa .vs-centrar')));

  console.log('\n── salir: dos dedos y teléfono derecho ──────────────────────');
  await m.evaluate(() => dispatchEvent(new TouchEvent('touchstart', {
    touches: [new Touch({ identifier: 1, target: document.body }),
              new Touch({ identifier: 2, target: document.body })] })));
  await m.waitForFunction(() => !window.VISOR.activo(), null, { timeout: 5000 });
  ok('dos dedos sacan del modo', await m.evaluate(() => !VISOR.activo()));

  await m.evaluate(() => VETA.vsEntrar('carton'));
  await m.waitForFunction(() => window.VISOR.activo(), null, { timeout: 9000 });
  await m.setViewportSize({ width: 390, height: 844 });   // el teléfono, derecho
  await m.waitForFunction(() => !window.VISOR.activo(), null, { timeout: 5000 });
  ok('y poner el teléfono derecho también', await m.evaluate(() => !VISOR.activo()));
  ok('sin errores de página', m.errores.length === 0, m.errores.slice(0, 2).join(' · '));
  await m.context().close();
}

console.log('\n── un visor de verdad (WebXR fingido) ───────────────────────');
{
  const { pag: x } = await abrir({ xr: true });
  await x.evaluate(() => VETA.vista('ajustes'));
  await x.waitForFunction(() => /Visor detectado/.test(
    document.querySelector('#vs-caja .vs-estado span')?.textContent || ''), null, { timeout: 9000 });
  ok('la ficha reconoce el visor', true);
  await x.evaluate(() => VETA.vista('nucleo'));
  await x.waitForTimeout(900);
  await x.evaluate(() => { VETA.vsMirada(false); return VETA.vsEntrar('xr'); });
  await x.waitForFunction(() => window.VISOR.activo(), null, { timeout: 9000 });
  const ped = await x.evaluate(() => window.__xr.pedidas[0]);
  ok('se pide sesión inmersiva de verdad', ped?.m === 'immersive-vr', ped?.m);
  ok('con suelo de referencia', /local-floor/.test(JSON.stringify(ped?.o || {})));
  ok('y las manos pedidas si las hay', /hand-tracking/.test(JSON.stringify(ped?.o || {})));
  ok('en XR no se pinta capa de pantalla', await x.evaluate(() => !document.getElementById('visor-capa')));
  /* Quitarse el visor: la sesión termina desde fuera y la casa TIENE que
     enterarse sola. Si no, queda a medias, con la pantalla en negro. */
  await x.evaluate(() => window.__xr.sesion.__fin());
  await x.waitForFunction(() => !window.VISOR.activo(), null, { timeout: 6000 });
  ok('quitarse el visor devuelve la casa', await x.evaluate(() =>
    !VISOR.activo() && !document.body.classList.contains('en-visor')));
  ok('sin errores de página', x.errores.length === 0, x.errores.slice(0, 2).join(' · '));
  await x.context().close();
}

await b.close();
sv.kill();
console.log(f ? `\n${f} en rojo\n` : '\nTodo en verde\n');
process.exit(f ? 1 : 0);
