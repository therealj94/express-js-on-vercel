/* CON LA CABEZA GIRADA. Que es como se usa un visor.
 *
 *   node pruebas/visor-cabeza.mjs      (sirve la carpeta en 8883 él solo)
 *
 * ══ POR QUÉ EXISTE ESTA PRUEBA ═════════════════════════════════════════════
 *
 * Todas las demás pruebas del visor miran con la cabeza QUIETA, y con la cabeza
 * quieta el modo visor tenía un fallo invisible.
 *
 * Dentro del visor hay dos orientaciones: la de la cámara de la escena, que la
 * mueve el timón, y la de la cabeza, que la mueve el giroscopio. Lo que la
 * persona ve es la composición de las dos. Pero las letras de la historia, el
 * botón del pórtico y la retícula se colocaban usando SOLO la de la cámara.
 *
 * Con la cabeza quieta las dos coinciden y todo parece perfecto. En cuanto
 * alguien gira la cabeza —o sea, siempre, porque para eso es un visor— las
 * letras se quedaban clavadas donde apuntaba el timón. No es que no se
 * dibujaran: estaban fuera de la vista. Eso era «me lo puse y no salían las
 * letras», y también la retícula señalando un planeta y abriendo otro.
 *
 * Así que esta prueba GIRA LA CABEZA de verdad —manda los eventos del
 * giroscopio que manda un teléfono— y comprueba que todo la siga. Es la única
 * forma de ver este fallo sin un visor puesto en la cara.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUERTO = 8883;

spawn('fuser', ['-k', `${PUERTO}/tcp`]).on('close', () => {});
await new Promise((r) => setTimeout(r, 400));
const sv = spawn('python3', ['-m', 'http.server', String(PUERTO), '--bind', '127.0.0.1',
  '--directory', RAIZ], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 900));

let f = 0;
const ok = (q, c, x = '') => { console.log(`${c ? '  ok  ' : ' FALLA'}  ${q}${x ? '  · ' + x : ''}`); if (!c) f++; };
/* SIN ESTRANGULAR LOS CUADROS. Una pestaña que el navegador cree que nadie
   está mirando baja a UN cuadro por segundo, y entonces todo lo que persigue a
   la cabeza se mide a medio vuelo: da fallos que no existen y esconde los que
   sí. Con esto la prueba corre a velocidad de verdad, que es la única a la que
   este recorrido significa algo. */
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

const ctx = await b.newContext({ viewport: { width: 900, height: 500 }, locale: 'es',
  hasTouch: true, isMobile: true });
const pag = await ctx.newPage();
pag.errores = [];
pag.on('pageerror', (e) => pag.errores.push(String(e)));
await pag.addInitScript(`localStorage.setItem('veta.idioma','es');
  localStorage.setItem('veta.musica','no');
  Element.prototype.requestFullscreen = function(){ return Promise.resolve(); };`);
await pag.route(/herokuapp\.com/, (r) => r.fulfill({ status: 200, json: {} }));
await pag.route(/coingecko\.com/, (r) => r.fulfill({ json: {} }));
await pag.route('**/auth/login', (r) => r.fulfill({ json: {
  token: JWT(), user: { email: 'c@x.com', name: 'José' } } }));
await pag.goto(`http://127.0.0.1:${PUERTO}/index.html`, { waitUntil: 'domcontentloaded' });
await pag.waitForFunction(() => !document.getElementById('velo-og'), null, { timeout: 20000 }).catch(() => {});
const puerta = await pag.$('#bienvenida .btn-oro');
if (puerta && await puerta.isVisible()) await puerta.click();
await pag.waitForSelector('#i-correo', { state: 'visible', timeout: 20000 });
await pag.fill('#i-correo', 'c@x.com');
await pag.fill('#i-clave', 'clave');
await pag.click('#btn-acceso');
await pag.waitForFunction(() => !document.getElementById('app').classList.contains('oculto'),
  null, { timeout: 30000 });
await pag.waitForFunction(() => !!window.__AE_VISOR && !!window.__AE_PORTICO,
  null, { timeout: 45000 });
await pag.waitForTimeout(2500);

/* EL GIROSCOPIO DE UN TELÉFONO DE VERDAD.
 *
 * Ojo con los números, que es fácil escribir una prueba que miente: `beta` es
 * la inclinación, y CERO significa el teléfono acostado boca arriba — o sea,
 * mirando al suelo. Un teléfono metido en un visor va VERTICAL, y eso es
 * beta ≈ 90. Con beta 0 la cabeza mira al piso, donde no hay ni letras ni
 * planetas, y la prueba «encuentra» un fallo que no existe.
 *
 * Se mandan varios eventos seguidos porque es lo que hace un aparato real
 * —sesenta por segundo— y porque el primero solo enciende la cabeza; los que
 * la mueven son los de después. */
const HORIZONTE = 90;
const girar = async (alpha, beta = HORIZONTE, gamma = 0) => {
  await pag.evaluate(({ a, b: bb, g }) => {
    for (let i = 0; i < 4; i++) {
      const ev = new Event('deviceorientation');
      Object.defineProperties(ev, {
        alpha: { value: a }, beta: { value: bb }, gamma: { value: g },
        absolute: { value: true },
      });
      dispatchEvent(ev);
    }
  }, { a: alpha, b: beta, g: gamma });
  await pag.evaluate(() => new Promise((r) =>
    requestAnimationFrame(() => requestAnimationFrame(r))));
};

/* ESPERAR A QUE SE ASIENTE, no contar milisegundos.
 *
 * El cartel y el botón persiguen la cabeza CON RETRASO, y es a propósito: si
 * fueran pegados a la cara se leerían como suciedad en el cristal en vez de
 * como algo colgado en el mundo. Medir a los cuatrocientos milisegundos es
 * medirlos en pleno vuelo, y da un fallo que no existe.
 *
 * Así que se lee hasta que la lectura deje de moverse. Es además lo que hace
 * una persona: gira la cabeza, y MIRA. */
/* ¿ALCANZA A PONERSE DELANTE Y SE QUEDA?
 *
 * Durante la historia la cámara VUELA —el guion la lleva de un planeta a
 * otro— así que el cartel nunca está del todo quieto: persigue a la cabeza
 * mientras el suelo se mueve debajo. Preguntar «¿está quieto?» ahí no tiene
 * respuesta. La pregunta que sí importa, y que es la que se hace una persona,
 * es si al girar la cabeza el cartel LLEGA a ponerse delante y se queda: eso
 * es poder leerlo. Se le da su tiempo de alcance y se exige que aguante unas
 * cuantas lecturas seguidas, no un instante suelto. */
const alcanzar = async (leer, veces = 45) => {
  let ultima = null;
  let seguidas = 0;
  for (let i = 0; i < veces; i++) {
    const v = await pag.evaluate(leer);
    ultima = v || ultima;
    if (v?.delante) { if (++seguidas >= 4) return v; } else { seguidas = 0; }
    await pag.waitForTimeout(70);
  }
  return ultima;
};

const asentar = async (leer, veces = 40, cada = null) => {
  let antes = null;
  let quietas = 0;
  for (let i = 0; i < veces; i++) {
    if (cada) await pag.evaluate(cada);
    const v = await pag.evaluate(leer);
    if (v && antes && Math.abs(v.grados - antes.grados) <= 1
        && Math.abs(v.dist - antes.dist) <= 0.05) {
      if (++quietas >= 3) return v;
    } else { quietas = 0; }
    antes = v;
    await pag.waitForTimeout(70);
  }
  return antes;
};

console.log('\n── la cabeza mueve algo ─────────────────────────────────────');
{
  await pag.evaluate(() => VETA.vsEntrar('trescientos60'));
  await pag.waitForFunction(() => window.VISOR.activo(), null, { timeout: 30000 });
  ok('el modo visor entra', true);
  /* El pórtico se desarma ANTES de nada: la espera de aquí abajo puede durar
     varios segundos y la mirada quieta lo apretaría en el camino. */
  await pag.evaluate(() => window.__AE_PORTICO?.(null));
  /* Y se espera a que el timón ATERRICE. La galaxia entra desde lejos y la
     cámara viene amortiguando; medir mientras vuela mide el vuelo, no el
     sitio donde quedan las cosas. */
  await pag.waitForFunction(() => {
    const d = window.__AE_DIAG_MIRA?.();
    return !!d && Math.hypot(...d.desde) < 26;
  }, null, { timeout: 25000 }).catch(() => {});
  await pag.evaluate(() => window.__AE_PORTICO?.(null));

  const quieta = await pag.evaluate(() => window.__AE_VISOR.cabezaQ());
  await girar(95, 8, 0);
  const movida = await pag.evaluate(() => window.__AE_VISOR.cabezaQ());
  const cambio = quieta.some((v, i) => Math.abs(v - movida[i]) > 0.02);
  ok('el giroscopio mueve la cabeza', cambio,
     `${quieta.map((n) => n.toFixed(2))} → ${movida.map((n) => n.toFixed(2))}`);
  ok('y la casa se entera', await pag.evaluate(() => window.__AE_VISOR.estado().cabeza === true));
}

console.log('\n── el botón del pórtico sigue delante ───────────────────────');
{
  /* El pórtico está puesto desde que se entró. Se gira la cabeza a varios
     lados y tiene que seguir estando donde se lo pueda tocar: si se queda
     atrás, no hay forma de empezar la historia ni de salir.
     OJO: hay que volver a armarlo en cada vuelta. Ahora que el botón queda
     BIEN puesto —justo delante de la cara— la mirada quieta de esta prueba lo
     aprieta sola en segundo y medio, el pórtico se cierra y no habría nada que
     medir. Que se apriete solo es la señal de que está donde tiene que estar;
     antes quedaba a cuarenta grados y no se apretaba nunca. */
  /* OJO CON EL RELOJ. Ahora que el botón queda BIEN puesto —justo delante de
     la cara— la mirada quieta de esta prueba lo aprieta sola en segundo y
     medio, se dispara la historia y no queda nada que medir. Que se apriete
     solo es la señal de que está donde tiene que estar; antes quedaba a
     cuarenta grados y no se apretaba nunca.
     Así que se rearma justo antes de cada vuelta —lo que pone el contador de
     la mirada a cero— y se mide DENTRO de esa ventana, sin llegar a apretarlo.
     La historia se pide después, a propósito y una sola vez. */
  /* El botón vive DIECIOCHO GRADOS por debajo de la línea de los ojos, y esa
     medida es la que hace que se pueda medir sin apretarlo: mirando al frente
     queda fuera del cono de la mirada. Es la misma medida que impide que se
     apriete solo mientras alguien se acomoda la correa. */
  await pag.evaluate(() => window.__AE_PORTICO?.('inicio', 'INICIAR', 'Sostené la mirada'));
  for (const [a, bb] of [[0, 90], [95, 98], [190, 78], [280, 90]]) {
    await girar(a, bb, 0);
    const p = await asentar(() => window.__AE_PORTICO_SITIO?.() || null);
    if (!p) { ok(`a ${a}° · el pórtico dice dónde está`, false, 'sin puente'); continue; }
    ok(`a ${a}° · el botón está al alcance`, p.delante,
       `${p.dist} unidades, ${p.grados}° del centro`);
  }

  /* Y LA REGLA QUE MÁS IMPORTA, que es la que José pidió con todas las letras:
     mirando al frente el botón NO se aprieta solo. Un botón que persigue a la
     cabeza y se queda en el centro es imposible de no mirar, y se dispararía
     segundo y medio después de ponerse el visor sin que nadie decidiera nada.
     Aquí se mira al frente MUCHO más de lo que dura el aro y no tiene que
     pasar nada. */
  {
    await girar(140, HORIZONTE, 0);
    await pag.evaluate(() => window.__AE_PORTICO?.('inicio', 'INICIAR', 'Sostené la mirada'));
    let apretado = false;
    await pag.evaluate(() => { window.__pruebaPortico = null;
      addEventListener('ae-portico', () => { window.__pruebaPortico = 'apretado'; }); });
    await pag.waitForTimeout(4500);      // triple de lo que tarda el aro en llenarse
    apretado = await pag.evaluate(() => window.__pruebaPortico === 'apretado');
    ok('mirando al frente NO se aprieta solo', !apretado);
  }
  await pag.evaluate(() => window.__AE_PORTICO?.(null));
}

console.log('\n── las letras siguen delante ────────────────────────────────');
{
  /* Y AHORA SÍ se aprieta el botón, una sola vez y a propósito: es la puerta
     por la que se entra a la historia. */
  await pag.evaluate(() => dispatchEvent(new CustomEvent('ae-portico', { detail: { modo: 'inicio' } })));
  await pag.waitForFunction(() => window.__AE_GENESIS.vivo(), null, { timeout: 20000 });
  const hayTexto = await pag.waitForFunction(() => !!window.__AE_TEATRO?.()?.texto,
    null, { timeout: 18000 }).then(() => true).catch(() => false);
  /* Si no hay palabras, lo primero es saber POR QUÉ: la película apagada, la
     historia ya terminada y el puente caído se ven todos igual desde fuera. */
  if (!hayTexto) {
    console.log('   diag:', JSON.stringify(await pag.evaluate(() => ({
      pelicula: window.__AE_PELICULA?.(),
      vivo: window.__AE_GENESIS?.vivo(),
      teatro: window.__AE_TEATRO?.(),
      visor: window.VISOR?.activo(),
    }))));
  }
  ok('la historia arranca y hay palabras', hayTexto);

  /* ESTE ES EL FALLO. Con la cabeza girada, el cartel tiene que haberla
     seguido. Antes se quedaba clavado donde apuntaba el timón y el ángulo se
     iba a noventa y pico grados: fuera de la vista por completo. */
  for (const [a, bb] of [[95, 98], [190, 78], [280, 96], [10, 90]]) {
    await girar(a, bb, 0);
    const t = await alcanzar(() => window.__AE_TEATRO());
    ok(`a ${a}° · las letras llegan a estar delante`, t.delante,
       `${t.grados}° del centro, a ${t.dist}`);
  }
}

console.log('\n── leer la historia no la salta ─────────────────────────────');
{
  /* EL ACCIDENTE DISFRAZADO. Mientras la historia se cuenta, el botón que hay
     puesto es SALIR, y el cartel de las letras cuelga muy cerca de él. Si el
     botón cae dentro del cono de la mirada de quien está LEYENDO, quedarse
     leyendo aprieta «salir» y se salta la historia sola — que es el mismo
     accidente que todo esto viene a impedir, con otra ropa.
     Aquí se hace exactamente eso: mirar al cartel, quieto, mucho más de lo que
     tarda el aro en llenarse. La historia tiene que seguir contándose. */
  await pag.evaluate(() => { window.__pruebaSalir = null;
    addEventListener('ae-portico', (e) => { window.__pruebaSalir = e?.detail?.modo || 'algo'; }); });
  const modo = await pag.evaluate(() => window.__AE_PORTICO_MODO?.());
  ok('durante la historia el botón puesto es el de salir', modo === 'salir', String(modo));
  await pag.waitForTimeout(5000);        // más del triple de lo que dura el aro
  ok('quedarse leyendo NO aprieta salir',
     await pag.evaluate(() => !window.__pruebaSalir));
  ok('y la historia sigue viva', await pag.evaluate(() => !!window.__AE_GENESIS?.vivo()));
}

console.log('\n── y la puntería apunta a lo que se mira ────────────────────');
{
  const t0 = Date.now();
  await pag.evaluate(() => window.__AE_GENESIS.saltar());
  await pag.waitForFunction(() => !window.__AE_GENESIS.vivo(), null, { timeout: 9000 });
  await pag.waitForFunction(() => window.__AE_BLINDADO === false, null, { timeout: 9000 });

  /* LA VUELTA A CASA. La historia deja la cámara lejos —el último acto se va
     hacia atrás para enseñar el sistema entero— y el timón la trae de vuelta
     amortiguando. Hasta que no aterriza, la galaxia es una mota: nada que
     tocar y nada que leer. Se espera a que aterrice, y se mide cuánto tarda,
     porque ese rato lo pasa alguien con el aparato en la cara. */
  const cerca = await pag.waitForFunction(() => {
    const d = window.__AE_DIAG_MIRA?.();
    if (!d) return false;
    const r = Math.hypot(...d.desde);
    return r < 24 ? Math.round(r) : false;
  }, null, { timeout: 25000 }).then((h) => h.jsonValue()).catch(() => null);
  ok('la galaxia vuelve a estar al alcance', !!cerca,
     cerca ? `a ${cerca} unidades, ${((Date.now() - t0) / 1000).toFixed(1)} s después` : 'no volvió');

  /* La puntería tiene que salir de LOS OJOS. La prueba: girar la cabeza cambia
     lo que se tiene en la mira. Si la puntería saliera de la cámara —el fallo—
     girar la cabeza no cambiaría absolutamente nada, porque la cámara no se
     movió. */
  /* EN PASOS FINOS. Desde veintitantas unidades el anillo de casas ocupa unos
     veinticuatro grados de la vuelta entera: saltando de sesenta en sesenta se
     pasa de largo por encima y parece que no hay nada. Una persona no busca a
     saltos de sesenta grados; barre. */
  const visto = new Set();
  for (let a = 0; a < 360; a += 10) {
    await girar(a, HORIZONTE, 0);
    await pag.waitForTimeout(120);
    const casa = await pag.evaluate(() => window.__AE_MIRAR?.(innerWidth / 2, innerHeight / 2));
    if (casa?.key) visto.add(casa.key);
  }
  ok('la mirada encuentra casas', visto.size > 0, [...visto].join(' ') || 'ninguna');
  ok('y encuentra varias distintas según adónde mire', visto.size > 1,
     `${visto.size}: ${[...visto].join(' ')}`);
}

console.log('\n── y al salir, la cabeza deja de mandar ─────────────────────');
{
  await pag.evaluate(() => VISOR.salir());
  await pag.waitForFunction(() => !window.VISOR.activo(), null, { timeout: 9000 });
  /* Fuera del visor manda la cámara otra vez. Si la cabeza siguiera mandando,
     la galaxia quedaría torcida en la última postura que tuvo el teléfono. */
  const t = await pag.evaluate(() => window.__AE_TEATRO?.());
  ok('el visor se quita', true);
  ok('sin palabras colgadas', !t?.texto, t?.texto || '');
}

ok('sin errores de página en todo el recorrido', pag.errores.length === 0,
   pag.errores.slice(0, 2).join(' · '));

await b.close();
sv.kill();
console.log(f ? `\n${f} en rojo\n` : '\nTodo en verde\n');
process.exit(f ? 1 : 0);
