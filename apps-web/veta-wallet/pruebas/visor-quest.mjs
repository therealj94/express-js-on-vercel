/* CON UN MANDO EN LA MANO. O sea, con un Quest.
 *
 *   node pruebas/visor-quest.mjs      (sirve la carpeta en 8887 él solo)
 *
 * ══ QUÉ SE ROMPÍA ══════════════════════════════════════════════════════════
 *
 * El modo visor estaba escrito para un visor de CARTÓN: la cabeza es el
 * puntero y se selecciona sosteniendo la mirada. En un Quest eso deja tres
 * cosas rotas, y las tres se ven idénticas a «todo bien» desde fuera:
 *
 *  1. EL BOTÓN NO SE PODÍA APRETAR. El gatillo estaba escuchado, pero abría
 *     «lo que la retícula tuviera apuntado» — y mientras hay pórtico puesto la
 *     retícula está blindada a propósito, o sea que apuntaba a nada. Se miraba
 *     INICIAR, se apretaba el gatillo, y no pasaba absolutamente nada. Había
 *     que sostener la mirada segundo y medio, con un mando en la mano.
 *  2. LA PUNTERÍA NO MIRABA EL RAYO. Con un visor de verdad la puntería
 *     preguntaba por el CENTRO DE LA PANTALLA, proyectado por la cámara de la
 *     escena — que en una sesión inmersiva lleva el frustum combinado de los
 *     dos ojos y no apunta a donde mira nadie. Y aunque hubiera apuntado bien,
 *     habría abierto lo que tuviera de frente la CABEZA: quien señalaba DBNX
 *     con el mando y apretaba, entraba en otro mundo.
 *  3. NO HABÍA MANDO. Ni rayo que ver, ni joystick para recorrer: dentro de un
 *     visor no hay rueda, ni dedo, ni teclas.
 *
 * ══ CÓMO SE COMPRUEBA SIN UN QUEST ═════════════════════════════════════════
 *
 * Una sesión inmersiva de verdad no existe en un navegador sin visor, así que
 * el mando se pone a mano por `__AE_DIAG_APUNTAR` — la misma puerta que
 * `__AE_DIAG_PICK` y `__AE_DIAG_MIRA`, y por la misma razón: dentro de un
 * visor no hay captura de pantalla que distinga un fallo de un acierto. Esa
 * puerta escribe hacia dónde apunta el mando y NADA MÁS. Todo lo que viene
 * después —la puntería, la retícula que se retira, el pórtico apuntado, el
 * gatillo— es el código de verdad.
 *
 * Lo que esta prueba NO puede comprobar, y conviene decirlo: que la sesión
 * inmersiva arranque. Eso pide un visor puesto.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUERTO = 8887;

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

/* Sin estrangular los cuadros: una pestaña que el navegador cree que nadie
   mira baja a un cuadro por segundo, y todo lo que persigue a la cabeza se
   mide entonces a medio vuelo. Ver visor-cabeza.mjs. */
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

/* UN NAVEGADOR QUE DICE TENER UN VISOR. Sólo se contesta la pregunta —«¿podés
   inmersivo?»— que es lo único que la casa mira para decidir si enseña el
   botón. Fabricar además una sesión entera sería fabricar el resultado. */
await pag.addInitScript(`
  localStorage.setItem('veta.idioma','es');
  localStorage.setItem('veta.musica','no');
  Element.prototype.requestFullscreen = function(){ return Promise.resolve(); };
  /* Con defineProperty y no con asignación: \`navigator.xr\` es un getter del
     prototipo sin setter, así que \`navigator.xr = ...\` no falla — no hace
     NADA, en silencio, y la prueba mide un navegador sin visor creyendo que
     tiene uno. */
  Object.defineProperty(navigator, 'xr', { configurable: true, value: {
    isSessionSupported: async (m) => m === 'immersive-vr',
    requestSession: async () => { throw new Error('sin-visor-de-verdad'); },
    addEventListener(){}, removeEventListener(){} } });
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
await pag.waitForFunction(() => !!window.__AE_VISOR && !!window.__AE_PORTICO
  && !!window.__AE_DIAG_APUNTAR, null, { timeout: 45000 });

console.log('\n── el botón de entrar en VR ─────────────────────────────────');
{
  const v = await pag.evaluate(() => {
    const b2 = document.getElementById('entrar-vr');
    return { existe: !!b2, oculto: b2?.classList.contains('oculto') };
  });
  ok('el botón existe en la casa', v.existe);
  ok('y se enseña cuando el navegador dice que hay visor', v.existe && !v.oculto,
    v.oculto ? 'salió oculto' : '');

  // en la billetera no: el visor ES la galaxia
  await pag.evaluate(() => VETA.vista('billetera'));
  await pag.waitForTimeout(400);
  const fuera = await pag.evaluate(() =>
    document.getElementById('entrar-vr')?.classList.contains('oculto'));
  ok('y se guarda fuera del Inicio', fuera === true);
  await pag.evaluate(() => VETA.vista('nucleo'));
  /* Volver al Inicio REMONTA la galaxia: hasta que el motor no está de vuelta
     no hay a quién pedirle un visor. Se espera a eso y no a un reloj — que es
     exactamente lo que hace `vsEntrar` ahora. */
  await pag.waitForFunction(() => !!window.__AE_VISOR, null, { timeout: 30000 });
}

console.log('\n── entrar al visor y esperar la puerta ──────────────────────');
/* Se entra en 360 y no en XR: sin un visor de verdad no hay sesión inmersiva
   que pedir. Lo que se está comprobando aquí abajo —el pórtico, la puntería
   por rayo, el gatillo— es el MISMO código en los tres modos; lo único que
   cambia de un Quest a esto es de dónde sale la pose de la cabeza. */
const entro = await pag.evaluate(async () => {
  try { await VETA.vsEntrar('trescientos60'); return 'ok'; }
  catch (e) { return 'reventó: ' + (e?.message || e); }
});
await pag.waitForFunction(() => window.VISOR.activo(), null, { timeout: 30000 })
  .catch(() => {});
ok('el modo visor entra', await pag.evaluate(() => window.VISOR.activo()), entro);
if (!await pag.evaluate(() => window.VISOR.activo())) {
  console.log('\nsin visor puesto no hay nada más que comprobar\n');
  await b.close(); sv.kill(); process.exit(1);
}
await pag.waitForFunction(() => window.__AE_PORTICO_MODO?.() === 'inicio',
  null, { timeout: 15000 }).catch(() => {});
ok('la puerta está puesta y la mirada blindada',
  await pag.evaluate(() => window.__AE_PORTICO_MODO?.() === 'inicio'
    && window.__AE_BLINDADO === true));

console.log('\n── el gatillo aprieta la puerta ─────────────────────────────');
{
  /* EL RESPIRO SE RESPETA. Recién puesto el visor nadie decidió nada todavía:
     alguien acomodándose la correa aprieta cosas sin querer, y ese es justo el
     accidente que el pórtico existe para impedir. Así que un gatillo apretado
     en el primer instante NO tiene que abrir nada. */
  const pronto = await pag.evaluate(() => window.__AE_PORTICO_APRETAR());
  ok('el gatillo no abre durante el respiro de entrada', pronto === false);

  await pag.waitForTimeout(1500);
  const abrio = await pag.evaluate(() => new Promise((r) => {
    let vino = null;
    const oir = (e) => { vino = e.detail?.modo || null; };
    addEventListener('ae-portico', oir);
    const dijo = window.__AE_PORTICO_APRETAR();
    setTimeout(() => { removeEventListener('ae-portico', oir); r({ dijo, vino }); }, 250);
  }));
  ok('pasado el respiro, el gatillo SÍ aprieta', abrio.dijo === true);
  ok('y la puerta avisa que la apretaron', abrio.vino === 'inicio',
    `avisó «${abrio.vino}»`);

  /* Un gatillo nervioso no puede apretar dos veces la misma puerta: la
     historia arrancaría dos veces encima de sí misma. */
  const otra = await pag.evaluate(() => window.__AE_PORTICO_APRETAR());
  ok('y no se puede apretar dos veces', otra === false);
}

console.log('\n── la puntería sigue el rayo, no la cabeza ──────────────────');
{
  /* Se desarma el pórtico y se suelta el blindaje: ahora la galaxia se toca.
     Y se espera a que el timón aterrice — la galaxia entra desde lejos y medir
     mientras vuela mide el vuelo. Ver visor-cabeza.mjs. */
  await pag.evaluate(() => { window.__AE_PORTICO?.(null); window.__AE_BLINDADO = false; });
  try { await pag.evaluate(() => window.__AE_GENESIS?.saltar()); } catch { /* nada */ }
  await pag.waitForTimeout(1200);
  await pag.evaluate(() => { window.__AE_PORTICO?.(null); window.__AE_BLINDADO = false; });
  await pag.waitForFunction(() => {
    const d = window.__AE_DIAG_MIRA?.();
    return !!d && Math.hypot(...d.desde) < 26;
  }, null, { timeout: 25000 }).catch(() => {});

  /* DÓNDE ESTÁ CADA MUNDO. Se pregunta al motor en vez de suponerlo: los
     planetas se acomodan solos y una posición escrita a mano en la prueba
     envejece mal. Se apunta el rayo desde la cámara HACIA un mundo concreto. */
  const mundos = await pag.evaluate(() => {
    const d = window.__AE_DIAG_MIRA();
    const salida = [];
    for (const k of (window.__AE_APPS || []).map((a) => a.key)) {
      const p = window.__AE_SITIO?.(k);
      if (p) salida.push({ k, p });
    }
    return { ojo: d.desde, mundos: salida };
  });

  if (!mundos.mundos.length) {
    /* Sin un puente que diga dónde está cada mundo, se apunta por barrido: se
       gira el rayo alrededor del ojo hasta que la puntería encuentre algo. Es
       más lento pero no supone nada, que es lo que importa. */
    const hallado = await pag.evaluate(() => {
      const d = window.__AE_DIAG_MIRA();
      const [ox, oy, oz] = d.desde;
      for (let yaw = 0; yaw < 360; yaw += 3) {
        for (let pit = -40; pit <= 40; pit += 5) {
          const a = yaw * Math.PI / 180;
          const e = pit * Math.PI / 180;
          const dir = [Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e)];
          window.__AE_DIAG_APUNTAR([ox, oy, oz], dir);
          const casa = window.__AE_MIRAR(0, 0);
          if (casa) return { key: casa.key, dir, origen: [ox, oy, oz] };
        }
      }
      return null;
    });
    ok('el rayo del mando encuentra un mundo', !!hallado,
      hallado ? hallado.key : 'barrió 360° y no encontró ninguno');

    if (hallado) {
      /* LA PRUEBA DE FONDO. Se busca un SEGUNDO mundo en otra dirección y se
         comprueba que el rayo distingue: si la puntería siguiera preguntando
         por el centro de la pantalla, las dos direcciones darían lo mismo —el
         mundo que la cámara tiene de frente— y este error sería invisible. */
      const otro = await pag.evaluate(({ origen, evitar }) => {
        for (let yaw = 0; yaw < 360; yaw += 3) {
          for (let pit = -40; pit <= 40; pit += 5) {
            const a = yaw * Math.PI / 180;
            const e = pit * Math.PI / 180;
            const dir = [Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e)];
            window.__AE_DIAG_APUNTAR(origen, dir);
            const casa = window.__AE_MIRAR(0, 0);
            if (casa && casa.key !== evitar) return { key: casa.key, dir };
          }
        }
        return null;
      }, { origen: hallado.origen, evitar: hallado.key });
      ok('y apuntando a otro lado encuentra otro mundo distinto', !!otro,
        otro ? `${hallado.key} → ${otro.key}` : 'siempre devolvió el mismo');

      if (otro) {
        /* Y lo que importa de verdad: que el rayo mande de vuelta. Volver a la
           primera dirección tiene que devolver el primer mundo — si la
           puntería dependiera de la cabeza (que no se movió), esto devolvería
           lo mismo las dos veces. */
        const vuelta = await pag.evaluate(({ origen, dir }) => {
          window.__AE_DIAG_APUNTAR(origen, dir);
          return window.__AE_MIRAR(0, 0)?.key || null;
        }, { origen: hallado.origen, dir: hallado.dir });
        ok('y el rayo manda: vuelve a dar el primero', vuelta === hallado.key,
          `${otro.key} → ${vuelta}`);

        /* ══ EL GATILLO ABRE LO QUE SEÑALA EL RAYO ═══════════════════════════
           Es el fallo entero en una línea: apuntar a un mundo y que se abra
           otro. Se comprueba leyendo lo que el gatillo TIENE APUNTADO —el
           mismo valor que usa el `select` de la sesión— en vez de apretarlo de
           verdad: abrir un mundo saca del visor y desmonta la galaxia, así que
           una prueba que aprieta se queda sin nada que preguntar a mitad de
           camino, y el resultado depende de si llegó a tiempo. Aquí no hay
           carrera: se apunta, se deja pasar un cuadro y se lee.
           Y se leen las DOS direcciones, porque un valor suelto podría estar
           acertando de casualidad: lo que prueba el arreglo es que cambia con
           el rayo. */
        const cual = async (origen, dir) => pag.evaluate(async ({ o, d }) => {
          window.__AE_DIAG_APUNTAR(o, d);
          await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
          return window.__AE_VISOR.apuntando();
        }, { o: origen, d: dir });
        const g1 = await cual(hallado.origen, hallado.dir);
        const g2 = await cual(hallado.origen, otro.dir);
        ok('el gatillo tiene apuntado el mundo del rayo', g1 === hallado.key,
          `rayo a ${hallado.key}, gatillo abriría ${g1}`);
        ok('y al mover el rayo, el gatillo lo sigue', g2 === otro.key && g2 !== g1,
          `rayo a ${otro.key}, gatillo abriría ${g2}`);
      }
    }
  }
}

console.log('\n── la retícula se retira cuando hay mando ───────────────────');
{
  const con = await pag.evaluate(() => {
    const d = window.__AE_DIAG_MIRA();
    return { mando: d.mando, apunta: !!d.apunta };
  });
  ok('el diagnóstico ve el mando puesto', con.mando !== 'no' && con.apunta,
    `mando=${con.mando}`);
  const sin = await pag.evaluate(() => {
    window.__AE_DIAG_APUNTAR();
    return window.__AE_DIAG_MIRA().mando;
  });
  ok('y soltar el mando devuelve el puntero a la cabeza', sin === 'no', `mando=${sin}`);
}

console.log('\n── salir ────────────────────────────────────────────────────');
{
  await pag.evaluate(() => window.VISOR.salir());
  await pag.waitForTimeout(500);
  ok('se sale del modo visor', await pag.evaluate(() => !window.VISOR.activo()));
  ok('y el mando queda soltado',
    await pag.evaluate(() => window.__AE_DIAG_MIRA().mando === 'no'));
}

const rotos = errores.filter((e) => !/ResizeObserver|AbortError/.test(e));
ok('ningún error en la página', rotos.length === 0, rotos.slice(0, 2).join(' | '));

await b.close();
sv.kill();
console.log(f ? `\n${f} fallan\n` : '\nTodo en verde\n');
process.exit(f ? 1 : 0);
