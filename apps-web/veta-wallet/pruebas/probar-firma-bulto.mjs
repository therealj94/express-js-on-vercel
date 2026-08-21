/* ¿Se puede poner palabras en boca de otro?
 *
 * Hasta hoy, sí. `abrir()` derivaba el secreto con la llave pública que venía
 * DENTRO del propio bulto, o sea con una llave que elegía quien lo fabricaba.
 * AES-GCM garantiza que «quien conocía este secreto fabricó esto», y si el
 * secreto sale de una llave del atacante, la garantía se queda en el aire:
 * quien pudiera escribir en el relevo podía fabricar un mensaje y ponerlo en el
 * hilo como si lo hubiera escrito un contacto. Sobre una billetera —«transferime
 * a esta dirección»— eso es dinero.
 *
 * Esta prueba MONTA ese ataque. No lo describe: lo ejecuta, con tres navegadores
 * de verdad, y comprueba que ahora se detecta. Si alguien deshace el arreglo,
 * esto se pone en rojo.
 *
 * Corre con el servidor estático en 8791, igual que `probar-candado.mjs`:
 *   python3 -m http.server 8791 --directory /home/user/express-js-on-vercel &
 *   node probar-firma-bulto.mjs
 */
import { chromium } from 'playwright';

const nav = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox'],
});

let fallos = 0;
const ok = (que, cond, extra = '') => {
  console.log(`${cond ? '  ok  ' : ' FALLA'}  ${que}${extra ? '  · ' + extra : ''}`);
  if (!cond) fallos++;
};

async function aparato() {
  const ctx = await nav.newContext();
  const pag = await ctx.newPage();
  await pag.route('**/*', r => r.request().url().startsWith('http://127.0.0.1:8791')
    ? r.continue() : r.fulfill({ status: 200, contentType: 'text/html', body: '<html></html>' }));
  await pag.goto('http://127.0.0.1:8791/apps-web/veta-wallet/pruebas/vacio.html',
    { waitUntil: 'domcontentloaded' });
  await pag.addScriptTag({ path: new URL('../candado.js', import.meta.url).pathname });
  await pag.waitForFunction(() => !!window.CANDADO);
  return pag;
}

const ana = await aparato();
const beto = await aparato();
const malo = await aparato();          // quien tiene acceso al relevo
const anaPc = await aparato();          // el segundo aparato de Ana

try {
  const llave = p => p.evaluate(() => CANDADO.miLlave());
  const lAna = await llave(ana);
  const lBeto = await llave(beto);
  const lMalo = await llave(malo);
  const lAnaPc = await llave(anaPc);

  console.log('\n── Lo básico: cada aparato firma con su propia llave');
  ok('cada aparato tiene llave de firma', !!lAna.fir && !!lBeto.fir);
  ok('y no es la misma que la de acuerdo', lAna.fir !== lAna.pub);
  ok('ni la comparte con otro aparato', lAna.fir !== lBeto.fir);

  /* La llave de firma tiene que ser tan inextraíble como la de acuerdo: si se
     pudiera sacar, un fallo en la página permitiría firmar por otro. */
  const escapa = await ana.evaluate(async () => {
    const m = await CANDADO.mias();
    if (!m.privF) return 'no hay llave de firma';
    if (m.privF.extractable) return 'la marca dice extractable';
    try { await crypto.subtle.exportKey('pkcs8', m.privF); return 'exportKey funcionó'; }
    catch { return null; }
  });
  ok('LA LLAVE DE FIRMA NO SE PUEDE EXPORTAR', escapa === null, escapa || 'ni por marca ni por exportKey');

  console.log('\n── Un mensaje de verdad se abre Y se verifica');
  const TEXTO = 'Pasame la dirección de la Junta, la de siempre.';
  const bulto = await ana.evaluate(
    ([t, d]) => CANDADO.cerrar(t, [d]), [TEXTO, { id: lBeto.id, pub: lBeto.pub }]);

  // Lo que el relevo le entregaría a Beto: los aparatos PUBLICADOS de Ana.
  const publicadosDeAna = [{ id: lAna.id, pub: lAna.pub, fir: lAna.fir }];

  const leido = await beto.evaluate(
    ([b, aps]) => CANDADO.abrir(b, aps), [bulto, publicadosDeAna]);
  ok('Beto lo lee', leido?.texto === TEXTO);
  ok('y queda VERIFICADO', leido?.verificado === true, leido?.motivo || '');

  console.log('\n── EL ATAQUE: el relevo fabrica un mensaje y lo firma como si fuera Ana');
  /* Quien controla el relevo cierra un bulto con SU par y lo mete en el hilo
     diciendo que lo escribió Ana. Antes del arreglo, Beto lo abría sin más y no
     había forma de notarlo. */
  const falso = await malo.evaluate(
    ([t, d]) => CANDADO.cerrar(t, [d]),
    ['Cambió la dirección, mandá todo a 0xMALO.', { id: lBeto.id, pub: lBeto.pub }]);

  const juicio = await beto.evaluate(
    ([b, aps]) => CANDADO.abrir(b, aps), [falso, publicadosDeAna]);

  ok('el texto se abre (el atacante puede cifrar, eso no se puede impedir)',
    typeof juicio?.texto === 'string');
  ok('PERO NO PASA COMO DE ANA', juicio?.verificado === false);
  ok('y se dice por qué', juicio?.motivo === 'llave-no-publicada', juicio?.motivo);

  console.log('\n── El truco siguiente: firmar con la llave propia y decir que la de acuerdo es la de Ana');
  const mezclado = { ...falso, de: lAna.pub };
  const juicio2 = await beto.evaluate(
    ([b, aps]) => CANDADO.abrir(b, aps), [mezclado, publicadosDeAna]);
  ok('tampoco cuela', juicio2 === null || juicio2.verificado === false,
    juicio2?.motivo || 'ni siquiera abre');

  console.log('\n── Y tocar un byte del bulto firmado rompe la firma');
  const tocado = { ...bulto, ct: bulto.ct.slice(0, -4) + (bulto.ct.slice(-4) === 'AAAA' ? 'BBBB' : 'AAAA') };
  const juicio3 = await beto.evaluate(
    ([b, aps]) => CANDADO.abrir(b, aps), [tocado, publicadosDeAna]);
  ok('no se da por bueno', juicio3 === null || juicio3.verificado === false,
    juicio3?.motivo || 'ni siquiera abre');

  console.log('\n── Lo viejo sigue leyéndose, y se dice que no se pudo verificar');
  /* En el relevo hay mensajes de antes de que existiera la firma. Negarse a
     leerlos sería borrar el pasado; darlos por verificados sería mentir. */
  const { f, fir, ...sinFirma } = bulto;
  const viejo = await beto.evaluate(
    ([b, aps]) => CANDADO.abrir({ ...b, v: 1 }, aps), [sinFirma, publicadosDeAna]);
  ok('se lee igual', viejo?.texto === TEXTO);
  ok('pero NO se da por verificado', viejo?.verificado === false);
  ok('y el motivo lo distingue de un ataque', viejo?.motivo === 'sin-firma', viejo?.motivo);

  console.log('\n── Sin las llaves del remitente no se puede juzgar, y se dice');
  const aCiegas = await beto.evaluate(b => CANDADO.abrir(b, []), bulto);
  ok('se lee', aCiegas?.texto === TEXTO);
  ok('pero no se afirma nada', aCiegas?.verificado === false);
  ok('y se distingue del ataque', aCiegas?.motivo === 'sin-llaves-del-remitente', aCiegas?.motivo);

  console.log('\n── El código de seguridad, con DOS aparatos por lado');
  /* Es el caso normal: teléfono y computadora. Antes discrepaba siempre, y una
     pantalla de alarma que suena todos los días deja de mirarse. */
  const codigo = (p, mias, suyas) =>
    p.evaluate(([a, b]) => CANDADO.codigoDeSeguridad(a, b), [mias, suyas]);

  const deAna = [lAna.pub, lAnaPc.pub];
  const deBeto = [lBeto.pub, lMalo.pub];   // «el segundo aparato de Beto»

  const veAna = await codigo(ana, deAna, deBeto);
  const veBeto = await codigo(beto, deBeto, deAna);
  ok('COINCIDE con dos aparatos por lado', veAna === veBeto, `${veAna} vs ${veBeto}`);

  const unoYUno = await codigo(ana, [lAna.pub], [lBeto.pub]);
  const unoYUnoB = await codigo(beto, [lBeto.pub], [lAna.pub]);
  ok('y sigue coincidiendo con uno por lado', unoYUno === unoYUnoB);

  ok('y cambia si cambia un aparato', veAna !== unoYUno);
} catch (e) {
  console.error('\nse rompió:', e.message);
  fallos++;
} finally {
  await nav.close();
}

console.log(fallos ? `\n${fallos} FALLO(S)` : '\ntodo en verde');
process.exit(fallos ? 1 : 0);
