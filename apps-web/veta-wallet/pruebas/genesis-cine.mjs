/* LA PELÍCULA DEL GÉNESIS, comprobada por dentro.
 *
 *   node pruebas/genesis-cine.mjs      (sirve la carpeta en 8886 él solo)
 *
 * Lo que se comprueba no es que «hay texto en pantalla»: es que la película
 * es una película.
 *
 *  1. NO ARRANCA SOLA. Llegar al Inicio no la dispara — quien viene a mandar
 *     plata viene a eso. Solo la piden el visor, AIR TOUCH o el botón.
 *  2. LA TINIEBLA ESTÁ OSCURA DE VERDAD: la noche llega a uno, y con ella se
 *     callan el nombre del sol, los rótulos de las casas y sus ciudades.
 *  3. LA CÁMARA SE MUEVE SIEMPRE. Dentro de un mismo acto la cámara viaja —
 *     eso es lo que separa el cine de las diapositivas.
 *  4. LA PALABRA Y LA LUZ llegan en su orden, y la luz apaga la noche.
 *  5. EL RETROCESO GRANDE enseña el universo: la cámara termina mucho más
 *     lejos que en cualquier momento anterior.
 *  6. EL PROPÓSITO SE DICE: el ecosistema construido, que no es casualidad
 *     estar acá, y la invitación a expandirlo.
 *  7. LA SALA SE APAGA mientras rueda y se enciende al terminar.
 *  8. SALTAR devuelve todo a su sitio en cualquier momento.
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
const ok = (q, c, x = '') => { console.log(`${c ? '  ok  ' : ' FALLA'}  ${q}${x ? '  · ' + x : ''}`); if (!c) f++; };
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });

const JWT = () => 'x.' + Buffer.from(JSON.stringify({
  sub: 'k1', userId: 'k1', address: '0x' + '8'.repeat(40),
  exp: Math.floor(Date.now() / 1000) + 9999,
})).toString('base64url') + '.y';

const ctx = await b.newContext({ viewport: { width: 1360, height: 860 }, locale: 'es' });
const pag = await ctx.newPage();
pag.errores = [];
pag.on('pageerror', (e) => pag.errores.push(String(e)));
/* La música apagada: esta prueba mira la imagen, y un <audio> en streaming
   dentro del arnés solo añade ruido al diagnóstico. */
await pag.addInitScript(`localStorage.setItem('veta.idioma','es');
  localStorage.setItem('veta.musica','no');`);
await pag.route(/herokuapp\.com/, (r) => r.fulfill({ status: 200, json: {} }));
await pag.route(/coingecko\.com/, (r) => r.fulfill({ json: {} }));
await pag.route('**/auth/login', (r) => r.fulfill({ json: {
  token: JWT(), user: { email: 'k@x.com', name: 'José' } } }));
await pag.goto(`http://127.0.0.1:${PUERTO}/index.html`, { waitUntil: 'domcontentloaded' });
await pag.waitForSelector('#i-correo', { state: 'visible', timeout: 20000 });
await pag.fill('#i-correo', 'k@x.com');
await pag.fill('#i-clave', 'clave');
await pag.click('#btn-acceso');
await pag.waitForFunction(() => !document.getElementById('app').classList.contains('oculto'),
  null, { timeout: 30000 });
await pag.waitForFunction(() => !!window.__AE_GENESIS, null, { timeout: 45000 });

console.log('\n── llegar al Inicio NO es pedir la película ─────────────────');
{
  await pag.waitForTimeout(6000);
  ok('nadie interrumpe a quien acaba de entrar', await pag.evaluate(() =>
    !window.__AE_GENESIS.vivo() && !document.getElementById('gen-letra')));
  ok('y la casa sigue entera', await pag.evaluate(() =>
    !document.body.classList.contains('en-cine')));
}

console.log('\n── pero vive en Ajustes, para quien la quiera ───────────────');
{
  /* Que no arranque sola no puede significar que no se encuentre: si la
     película no tiene puerta, es como si no existiera. */
  await pag.evaluate(() => VETA.vista('ajustes'));
  await pag.waitForTimeout(500);
  ok('su fila está en Ajustes', await pag.evaluate(() =>
    [...document.querySelectorAll('#lienzo [onclick]')]
      .some((el) => (el.getAttribute('onclick') || '').includes('tourGenesis'))));
  ok('y la de la música, al lado', await pag.evaluate(() =>
    [...document.querySelectorAll('#lienzo [onclick]')]
      .some((el) => (el.getAttribute('onclick') || '').includes('musicaAlterna'))));
  await pag.evaluate(() => VETA.vista('nucleo'));
  await pag.waitForTimeout(1600);
}

console.log('\n── la tiniebla: oscura de verdad ────────────────────────────');
{
  await pag.evaluate(() => VETA.tourGenesis('prueba'));
  await pag.waitForFunction(() => window.__AE_GENESIS.vivo(), null, { timeout: 9000 });
  ok('la película arranca cuando se la pide', true);
  ok('y la sala se apaga', await pag.evaluate(() =>
    document.body.classList.contains('en-cine')));
  /* Las barras ENTRAN animadas: se espera a que estén, no se mira en el
     instante cero, que es justo cuando todavía miden nada. */
  const barras = await pag.waitForFunction(() => {
    const el = document.getElementById('gen-letra');
    if (!el) return false;
    const h = parseFloat(getComputedStyle(el, '::before').height);
    return h > 4;
  }, null, { timeout: 6000 }).then(() => true).catch(() => false);
  ok('con las barras de cine puestas', barras);

  // la noche tiene que LLEGAR a uno, no quedarse a medias
  await pag.waitForFunction(() => window.__AE_NOCHE() > 0.95, null, { timeout: 9000 });
  ok('la tiniebla es tiniebla', true);
  const callados = await pag.evaluate(() => window.__AE_ROTULOS?.() ?? null);
  ok('y con ella se callan los nombres de las casas',
     callados === null || callados.every((o) => o < 0.02),
     callados === null ? 'sin sonda' : `máx ${Math.max(...callados).toFixed(3)}`);
}

console.log('\n── la palabra, y con ella la luz ────────────────────────────');
{
  await pag.waitForFunction(() =>
    /Sea la luz/.test(document.querySelector('#gen-letra .gen-centro')?.textContent || ''),
    null, { timeout: 14000 });
  ok('«Y dijo: Sea la luz» — en letra grande', await pag.evaluate(() =>
    document.querySelector('#gen-letra .gen-centro').classList.contains('grande')));
  ok('y todavía es de noche', await pag.evaluate(() => window.__AE_NOCHE() > 0.9));

  /* LA CÁMARA NO SE QUEDA QUIETA. Dentro del mismo acto tiene que viajar: es
     la diferencia entre una película y una presentación con transiciones. */
  const r0 = await pag.evaluate(() => window.__aeCamera.position.length());
  await pag.waitForTimeout(2600);
  const r1 = await pag.evaluate(() => window.__aeCamera.position.length());
  ok('la cámara viaja DENTRO del acto', Math.abs(r1 - r0) > 1.4,
     `${r0.toFixed(1)} → ${r1.toFixed(1)}`);

  await pag.waitForFunction(() => window.__AE_NOCHE() < 0.05, null, { timeout: 14000 });
  ok('y fue la luz: la noche se acaba', true);
}

console.log('\n── el retroceso que enseña el universo ──────────────────────');
{
  let masLejos = 0;
  let masCerca = 999;
  /* La película creció: el arranque se alargó a propósito —empezaba antes de
     que nadie hubiera terminado de sentarse— y se le sumaron los actos de
     ORIGEN y de la misión. La ventana la acompaña. */
  const hasta = Date.now() + 200000;
  let vioUniverso = false;
  let vioProposito = false;
  let vioInvitacion = false;
  /* LO QUE LA HISTORIA TIENE QUE DECIR SÍ O SÍ. No es adorno: son las cuatro
     ideas por las que existe la película. Si una se cae de la película por un
     cambio de guion, esto lo dice en vez de que se descubra en el escenario. */
  let vioOrigen = false;
  let vioRespaldo = false;
  let vioFondos = false;
  let vioUnion = false;
  let dijoBanca = false;
  while (Date.now() < hasta) {
    const st = await pag.evaluate(() => ({
      r: window.__aeCamera.position.length(),
      txt: document.querySelector('#gen-letra .gen-centro')?.textContent || '',
      vivo: window.__AE_GENESIS.vivo(),
    }));
    masLejos = Math.max(masLejos, st.r);
    if (/universo entero/i.test(st.txt)) vioUniverso = true;
    if (/no es casualidad|casualidad/i.test(st.txt)) vioProposito = true;
    if (/expandirlo|futuro es orden|falta con vos/i.test(st.txt)) vioInvitacion = true;
    if (/en el centro, ORIGEN|referenciada al oro/i.test(st.txt)) vioOrigen = true;
    if (/promesa de un gobierno|se pesa/i.test(st.txt)) vioRespaldo = true;
    if (/llevamos los fondos|nunca los tuvo/i.test(st.txt)) vioFondos = true;
    if (/unir las economías|América Latina/i.test(st.txt)) vioUnion = true;
    /* La palabra que se quitó a propósito: nombrar «banca» algo que no es un
       banco licenciado no es solo impreciso, es un riesgo. */
    if (/\bbanca\b/i.test(st.txt)) dijoBanca = true;
    if (st.r > 0) masCerca = Math.min(masCerca, st.r);
    if (!st.vivo) break;
    await pag.waitForTimeout(700);
  }
  ok('la cámara se va MUY lejos a enseñar el universo', masLejos > 70,
     `${masLejos.toFixed(0)} unidades`);
  ok('y lo dice con todas las letras', vioUniverso);
  ok('«eso no es casualidad» se dice', vioProposito);
  ok('y la invitación a expandirlo, también', vioInvitacion);
  /* ORIGEN es el centro del relato y del sistema: la cámara BAJA hasta el sol
     —que es la moneda— y ahí se para a decir qué es y qué la sostiene. */
  ok('ORIGEN se presenta como lo que es', vioOrigen);
  ok('y se dice qué la respalda', vioRespaldo);
  ok('la cámara baja de verdad hasta el centro', masCerca < 18,
     `lo más cerca: ${masCerca.toFixed(1)} unidades`);
  ok('se dice a quién se le llevan los fondos', vioFondos);
  ok('y con qué se unen las economías', vioUnion);
  ok('y nunca se dice «banca»', !dijoBanca);
}

console.log('\n── al terminar, la casa vuelve entera ───────────────────────');
{
  await pag.waitForFunction(() => !window.__AE_GENESIS.vivo(), null, { timeout: 45000 });
  await pag.waitForFunction(() => !document.getElementById('gen-letra'), null, { timeout: 6000 });
  ok('las palabras se retiran', true);
  ok('la sala se enciende', await pag.evaluate(() =>
    !document.body.classList.contains('en-cine')));
  ok('sin noche colgada', await pag.evaluate(() => window.__AE_NOCHE() < 0.02));
  ok('y el sistema queda en formación', await pag.evaluate(() =>
    window.AETHERION.acomodo() < 0.06));
}

console.log('\n── saltar corta en cualquier momento ────────────────────────');
{
  await pag.evaluate(() => VETA.tourGenesis('prueba'));
  await pag.waitForFunction(() => window.__AE_GENESIS.vivo(), null, { timeout: 9000 });
  await pag.waitForTimeout(2500);
  await pag.click('#gen-letra .gen-saltar');
  await pag.waitForFunction(() => !window.__AE_GENESIS.vivo(), null, { timeout: 6000 });
  ok('saltar apaga la película', true);
  await pag.waitForFunction(() => window.__AE_NOCHE() < 0.05
    && !document.body.classList.contains('en-cine'), null, { timeout: 8000 });
  ok('y devuelve la luz y la casa', true);
}

ok('sin errores de página en toda la proyección', pag.errores.length === 0,
   pag.errores.slice(0, 2).join(' · '));

await b.close();
sv.kill();
console.log(f ? `\n${f} en rojo\n` : '\nTodo en verde\n');
process.exit(f ? 1 : 0);
