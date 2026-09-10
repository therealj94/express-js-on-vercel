/* EL ECOSISTEMA SIN QUITARSE EL VISOR.
 *
 *   node pruebas/visor-casas.mjs      (sirve la carpeta en 8886 él solo)
 *
 * ══ QUÉ SE ROMPÍA ══════════════════════════════════════════════════════════
 *
 * Se podía recorrer la galaxia con el visor puesto, pero ABRIR un mundo sacaba
 * del visor: las casas son HTML, y el HTML dentro de un visor se pinta una vez
 * encima de las dos mitades de la pantalla — al cerebro le llega una mancha
 * doble. Así que la wallet salía limpio y enseñaba la casa en la pantalla. En
 * un Quest eso quiere decir que la galaxia se apaga y uno cae en un panel
 * flotante del navegador. Se podía mirar el ecosistema; usarlo, no.
 *
 * Ahora la casa es un OBJETO DE LA ESCENA con botones de verdad, igual que la
 * historia del Génesis. Esta prueba comprueba el recorrido entero: entrar a un
 * mundo, que el panel aparezca DELANTE de la cara con sus datos, que el
 * gatillo apriete sus botones, que volver devuelva la galaxia — y que en todo
 * eso no se haya salido del visor ni una vez, que es el punto.
 *
 * ══ CÓMO SE COMPRUEBA SIN UN QUEST ═════════════════════════════════════════
 *
 * El mando se pone a mano por `__AE_DIAG_APUNTAR`, igual que en
 * visor-quest.mjs, y por la misma razón: dentro de un visor no hay captura de
 * pantalla que distinga un fallo de un acierto. Esa puerta escribe hacia dónde
 * apunta el mando y nada más; el resto es el código de verdad.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUERTO = 8886;

spawn('fuser', ['-k', `${PUERTO}/tcp`]).on('close', () => {});
await new Promise((r) => setTimeout(r, 400));
const sv = spawn('python3', ['-m', 'http.server', String(PUERTO), '--bind', '127.0.0.1',
  '--directory', RAIZ], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 900));

let f = 0;
const ok = (q, c, x = '') => {
  console.log(`${c ? '  ok  ' : ' FALLA'}  ${q}${x ? '  · ' + x : ''}`);
  if (!c) f++;
};

const b = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows'],
});

const JWT = () => 'x.' + Buffer.from(JSON.stringify({
  sub: 'c1', userId: 'c1', address: '0x' + 'd'.repeat(40),
  exp: Math.floor(Date.now() / 1000) + 9999,
})).toString('base64url') + '.y';

const ctx = await b.newContext({ viewport: { width: 1100, height: 620 }, locale: 'es' });
const pag = await ctx.newPage();
const errores = [];
pag.on('pageerror', (e) => errores.push(String(e)));
await pag.addInitScript(`
  localStorage.setItem('veta.idioma','es');
  localStorage.setItem('veta.musica','no');
  Element.prototype.requestFullscreen = function(){ return Promise.resolve(); };
`);
await pag.route(/herokuapp\.com/, (r) => r.fulfill({ status: 200, json: {} }));
await pag.route(/coingecko\.com/, (r) => r.fulfill({ json: {} }));
await pag.route('**/auth/login', (r) => r.fulfill({ json: {
  token: JWT(), user: { email: 'c@x.com', name: 'José' } } }));

await pag.goto(`http://127.0.0.1:${PUERTO}/index.html`, { waitUntil: 'domcontentloaded' });
await pag.waitForFunction(() => !document.getElementById('velo-og'), null, { timeout: 20000 })
  .catch(() => {});
const puerta = await pag.$('#bienvenida .btn-oro');
if (puerta && await puerta.isVisible()) await puerta.click();
await pag.waitForSelector('#i-correo', { state: 'visible', timeout: 20000 });
await pag.fill('#i-correo', 'c@x.com');
await pag.fill('#i-clave', 'clave');
await pag.click('#btn-acceso');
await pag.waitForFunction(() => !document.getElementById('app').classList.contains('oculto'),
  null, { timeout: 30000 });
await pag.waitForFunction(() => !!window.__AE_VISOR && !!window.__AE_CASA
  && !!window.__AE_DIAG_APUNTAR, null, { timeout: 45000 });
ok('el motor trae la casa de la escena', true);

console.log('\n── entrar al visor ──────────────────────────────────────────');
await pag.evaluate(() => VETA.vsEntrar('trescientos60'));
await pag.waitForFunction(() => window.VISOR.activo(), null, { timeout: 30000 }).catch(() => {});
if (!await pag.evaluate(() => window.VISOR.activo())) {
  console.log('\nsin visor puesto no hay nada que comprobar\n');
  await b.close(); sv.kill(); process.exit(1);
}
ok('el modo visor entra', true);
// la puerta de bienvenida se retira: aquí se está probando lo de después
await pag.waitForTimeout(1600);
await pag.evaluate(() => { window.__AE_PORTICO_APRETAR?.(); });
await pag.evaluate(() => { window.__AE_PORTICO?.(null); window.__AE_BLINDADO = false; });
try { await pag.evaluate(() => window.__AE_GENESIS?.saltar()); } catch { /* nada */ }
await pag.waitForTimeout(1400);
await pag.evaluate(() => { window.__AE_PORTICO?.(null); window.__AE_BLINDADO = false; });
/* Y se espera a que el timón aterrice: la galaxia entra desde lejos y abrir un
   mundo a media entrada mide el vuelo, no la casa. Ver visor-cabeza.mjs. */
await pag.waitForFunction(() => {
  const d = window.__AE_DIAG_MIRA?.();
  return !!d && Math.hypot(...d.desde) < 26;
}, null, { timeout: 25000 }).catch(() => {});

/* EL RESPIRO DE LA CASA. La casa recién abierta no acepta el gatillo durante
   novecientos milisegundos, y no es un capricho: en un Quest se entra a un
   mundo APRETANDO EL GATILLO, y si el panel aceptara el siguiente tirón al
   instante, quien apretara dos veces —o soltara tarde— cerraría la casa antes
   de haberla visto. Apretar antes de eso tiene que no hacer nada, así que la
   prueba espera como espera una persona. Ver Casa.tsx. */
const RESPIRO = 1100;

/* Abrir un mundo y esperar a que su casa esté puesta y asentada. Se espera a
   la CASA, no a un reloj: el motor vuela hasta el planeta y cuánto tarda
   depende de dónde estaba la cámara. */
const abrirCasa = async (k) => {
  await pag.evaluate((key) => window.__AE_TOCAR?.(key), k);
  await pag.waitForFunction((key) => window.__AE_CASA_ESTADO?.()?.key === key,
    k, { timeout: 30000 }).catch(() => {});
  await pag.waitForTimeout(RESPIRO);
  return pag.evaluate(() => window.__AE_CASA_ESTADO?.());
};

/* Y cerrarla del todo: el panel se va con un fundido y el motor deshace el
   vuelo. Hasta que el mundo no queda cerrado de verdad, tocar el siguiente no
   hace nada — el motor se niega a entrar en dos sitios a la vez. */
const cerrarCasa = async () => {
  await pag.evaluate(() => window.__AE_CASA_APRETAR?.());
  await pag.waitForFunction(() => {
    const d = window.__AE_DIAG_PICK?.();
    return !window.__AE_CASA_ESTADO?.() && !!d && !d.casaAbierta && !d.volando;
  }, null, { timeout: 30000 }).catch(() => {});
};

console.log('\n── abrir la billetera sin salir del visor ───────────────────');
{
  /* Se abre por el camino de verdad —el que usa el gatillo— y no llamando al
     panel a mano: lo que se está comprobando es justo que abrir un mundo YA NO
     saca del visor, y llamando al panel directamente eso no se probaría. */
  const fue = await pag.evaluate(() => {
    if (!window.__AE_TOCAR) return 'sin puente';
    window.__AE_TOCAR('wallet');
    return 'tocado';
  });
  ok('se toca el mundo de la billetera', fue === 'tocado', fue);

  /* El motor vuela hasta el planeta y recién al aterrizar abre la casa. Se
     espera a que el panel ESTÉ, no a un reloj. */
  await pag.waitForFunction(() => !!window.__AE_CASA_ESTADO?.(), null, { timeout: 30000 })
    .catch(() => {});
  /* EL RESPIRO, COMPROBADO EN EL PRIMER INSTANTE. Tiene que ser aquí y no
     después: se está comprobando que el gatillo NO responde todavía, y eso sólo
     se puede ver recién abierta la casa. */
  const pronto = await pag.evaluate(() => window.__AE_CASA_APRETAR?.());
  ok('el gatillo no cierra la casa recién abierta', pronto === false,
    'el mismo tirón que abre el mundo no puede cerrar su casa');
  const est = await pag.evaluate(() => window.__AE_CASA_ESTADO?.());
  ok('la casa se abre dentro de la escena', !!est, est ? est.titulo : 'no apareció ningún panel');
  ok('y NO se salió del visor', await pag.evaluate(() => window.VISOR.activo()));
  ok('y la galaxia sigue montada',
    await pag.evaluate(() => !!document.querySelector('#ae-cielo canvas')));

  if (est) {
    ok('es la billetera', est.key === 'wallet', `${est.key} · «${est.titulo}»`);
    ok('lleva un botón de volver', est.botones.includes('volver'), est.botones.join(', '));
    /* Que el panel esté DELANTE de la cara es lo único que separa leerlo de no
       verlo, y es justo lo que una captura de pantalla no distingue. Se le da
       tiempo de alcance: entra persiguiendo a la cabeza. Ver Teatro.tsx. */
    let delante = null;
    for (let i = 0; i < 40; i++) {
      delante = await pag.evaluate(() => window.__AE_CASA_ESTADO?.());
      if (delante?.delante) break;
      await pag.waitForTimeout(80);
    }
    ok('y se pone delante de la cara, a distancia de lectura', delante?.delante === true,
      `a ${delante?.dist} m y ${delante?.grados}°`);
  }
}

console.log('\n── el gatillo aprieta los botones de la casa ────────────────');
{
  /* Sin apuntar a nada: la casa de la billetera tiene un solo botón, y con uno
     solo el gatillo lo aprieta igual. Quedarse encerrado dentro de un panel
     con el visor puesto es lo peor que puede pasar aquí, así que la salida no
     puede depender de la puntería. */
  await pag.evaluate(() => window.__AE_DIAG_APUNTAR());
  await pag.waitForTimeout(RESPIRO);
  const antes = await pag.evaluate(() => window.__AE_CASA_ESTADO?.()?.botones?.length);
  const salio = await pag.evaluate(() => new Promise((r) => {
    let vino = null;
    const oir = (e) => { vino = e.detail; };
    addEventListener('ae-casa', oir);
    const dijo = window.__AE_CASA_APRETAR();
    setTimeout(() => { removeEventListener('ae-casa', oir); r({ dijo, vino }); }, 300);
  }));
  ok('con un solo botón, el gatillo lo aprieta sin apuntar',
    antes === 1 && salio.dijo === true, `botones=${antes}`);
  ok('y la acción que llega es volver', salio.vino?.accion === 'volver',
    `llegó «${salio.vino?.accion}»`);

  /* Se espera a que el mundo quede cerrado DE VERDAD: el panel se va con un
     fundido y el motor deshace el vuelo. Hasta entonces, tocar el siguiente no
     hace nada — el motor se niega a entrar en dos sitios a la vez. */
  /* Y hasta que el VUELO DE VUELTA termine, tampoco: el motor se niega a
     entrar en un sitio mientras está saliendo de otro, y esperar sólo a que el
     mundo quede cerrado deja al siguiente toque cayendo en el vacío. */
  await pag.waitForFunction(() => {
    const d = window.__AE_DIAG_PICK?.();
    return !window.__AE_CASA_ESTADO?.() && !!d && !d.casaAbierta && !d.volando;
  }, null, { timeout: 30000 }).catch(() => {});
  ok('la casa se cierra', await pag.evaluate(() => !window.__AE_CASA_ESTADO?.()));
  const libre = await pag.evaluate(() => window.__AE_DIAG_PICK?.());
  ok('y la galaxia queda libre otra vez', !!libre && !libre.casaAbierta && !libre.volando,
    JSON.stringify({ casa: libre?.casaAbierta, volando: libre?.volando }));
  ok('y sigue sin salirse del visor', await pag.evaluate(() => window.VISOR.activo()));
  ok('y la mirada se desblinda: la galaxia vuelve a tocarse',
    await pag.evaluate(() => window.__AE_BLINDADO === false));
}

console.log('\n── una casa de dos botones, apuntando ───────────────────────');
{
  /* Ajustes lleva dos: quitarse el visor y volver. Con dos, el gatillo YA NO
     puede adivinar — tiene que abrir el que señala el rayo. Es el mismo fallo
     de fondo que la puntería de los mundos: apuntar a uno y que responda otro. */
  const est = await abrirCasa('ajustes');
  ok('ajustes abre dentro del visor', est?.key === 'ajustes', est?.key || 'no abrió');

  if (est?.key === 'ajustes') {
    ok('y trae sus dos botones', est.botones.length === 2, est.botones.join(', '));
    /* Se apunta el rayo DESDE el ojo HACIA cada botón, usando dónde está cada
       uno de verdad. Nada de barrer el aire a ciegas: el panel cuelga del marco
       de la cabeza, y un barrido en el marco del mundo pasa por otro lado. */
    const vistos = await pag.evaluate(async () => {
      const cuadro = () => new Promise((r) => requestAnimationFrame(r));
      /* SE REAPUNTA EN CADA CUADRO, y no una vez. Estando dentro de un mundo la
         cámara DERIVA despacio alrededor de él, así que un rayo calculado en un
         cuadro y leído en el siguiente ya apunta a otro sitio: el botón mide
         cinco grados de alto a esa distancia, y la deriva se los come. Se apunta
         a donde el botón está AHORA y se lee en el mismo cuadro — que es lo que
         hace una mano de verdad, porque se mueve con la persona. */
      const salida = {};
      for (const id of window.__AE_CASA_ESTADO().botones) {
        let dio = null;
        let dir = null;
        for (let i = 0; i < 12 && dio !== id; i++) {
          const est2 = window.__AE_CASA_ESTADO();
          const s = est2?.sitios?.find((x) => x.id === id);
          if (!s) break;
          const o = window.__AE_DIAG_MIRA().desde;
          dir = [s.pos[0] - o[0], s.pos[1] - o[1], s.pos[2] - o[2]];
          window.__AE_DIAG_APUNTAR(o, dir);
          await cuadro();
          dio = window.__AE_CASA_ESTADO()?.apuntado || null;
        }
        salida[id] = { dir, dio };
      }
      return salida;
    });
    const aciertan = Object.entries(vistos).filter(([id, v]) => v.dio === id);
    ok('el rayo señala cada botón, uno por uno', aciertan.length === est.botones.length,
      Object.entries(vistos).map(([id, v]) => `${id}→${v.dio}`).join(' · '));

    if (vistos.volver) {
      /* Y ahora sí: apuntando a VOLVER y apretando tiene que llegar volver, no
         el otro. Apuntar a un botón y que responda su vecino es exactamente el
         fallo que esto existe para impedir. */
      const res = await pag.evaluate(async () => {
        /* Se vuelve a apuntar a donde VOLVER está ahora y se aprieta en cuanto
           el motor confirma que lo tiene apuntado: apretar a ciegas mediría la
           deriva de la cámara, no la puntería. */
        const cuadro = () => new Promise((r) => requestAnimationFrame(r));
        for (let i = 0; i < 12; i++) {
          const e2 = window.__AE_CASA_ESTADO();
          const s = e2?.sitios?.find((x) => x.id === 'volver');
          const o = window.__AE_DIAG_MIRA().desde;
          if (!s) break;
          window.__AE_DIAG_APUNTAR(o, [s.pos[0] - o[0], s.pos[1] - o[1], s.pos[2] - o[2]]);
          await cuadro();
          if (window.__AE_CASA_ESTADO()?.apuntado === 'volver') break;
        }
        return new Promise((r) => {
          let vino = null;
          const oir = (e) => { vino = e.detail; };
          addEventListener('ae-casa', oir);
          const dijo = window.__AE_CASA_APRETAR();
          setTimeout(() => { removeEventListener('ae-casa', oir); r({ dijo, vino }); }, 300);
        });
      });
      ok('apuntar a volver y apretar devuelve volver',
        res.dijo === true && res.vino?.accion === 'volver',
        `llegó «${res.vino?.accion}»`);
      ok('y NO apretó el de quitarse el visor', res.vino?.accion !== 'salir');
      ok('sigue sin salirse del visor', await pag.evaluate(() => window.VISOR.activo()));
    }
  }
}

console.log('\n── salir del visor limpia el panel ──────────────────────────');
{
  await cerrarCasa();
  await pag.evaluate(() => window.__AE_DIAG_APUNTAR());
  const gid = await abrirCasa('gid');
  const habia = gid?.key === 'gid';
  ok('genesis id abre dentro del visor', habia, gid?.key || 'no abrió');
  await pag.evaluate(() => window.VISOR.salir());
  await pag.waitForTimeout(700);
  ok('se sale del visor', await pag.evaluate(() => !window.VISOR.activo()));
  ok('y el panel no queda flotando en la pantalla',
    await pag.evaluate(() => !window.__AE_CASA_ESTADO?.()),
    habia ? '' : 'ojo: no había panel abierto, la comprobación no dice nada');
}

const rotos = errores.filter((e) => !/ResizeObserver|AbortError/.test(e));
ok('ningún error en la página', rotos.length === 0, rotos.slice(0, 2).join(' | '));

await b.close();
sv.kill();
console.log(f ? `\n${f} fallan\n` : '\nTodo en verde\n');
process.exit(f ? 1 : 0);
