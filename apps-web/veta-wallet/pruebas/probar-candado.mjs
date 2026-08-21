/* El candado: ¿de verdad no se puede leer lo que va cerrado?
 *
 * Esta prueba corre en DOS navegadores de verdad, no en uno simulado, porque
 * lo que se está comprobando es justo lo que no se puede comprobar en uno
 * solo: que el aparato A no pueda abrir lo que iba para el aparato B.
 *
 * `abrir()` devuelve ahora `{ texto, verificado, motivo }` y no una cadena:
 * además de abrir, dice si la firma del remitente cuadra. Lo que prueba esa
 * parte es `probar-firma-bulto.mjs`, que monta la suplantación entera. Acá se
 * lee `.texto` y punto.
 *
 * Y comprueba lo que un despiste haría fácil romper:
 *   · que el bulto no lleve el texto en claro por dentro;
 *   · que uno pueda releer lo que él mismo escribió;
 *   · que tocar un solo carácter del bulto lo rompa en vez de dar un texto
 *     distinto — si no fallara, no habría forma de saber que alguien lo tocó;
 *   · que el código de seguridad salga IGUAL en los dos lados, que es lo único
 *     que permite a dos personas comprobar que no hay nadie en medio.
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

/* Cada contexto es un navegador distinto de verdad: su propio IndexedDB, su
   propio par de llaves. Es la única forma de que esto pruebe algo. */
async function aparato(nombre) {
  const ctx = await nav.newContext();
  const pag = await ctx.newPage();
  await pag.route('**/*', r => r.request().url().startsWith('http://127.0.0.1:8791')
    ? r.continue() : r.fulfill({ status: 200, contentType: 'text/html', body: '<html></html>' }));
  await pag.goto('http://127.0.0.1:8791/apps-web/veta-wallet/pruebas/vacio.html',
    { waitUntil: 'domcontentloaded' });
  await pag.addScriptTag({ path: new URL('../candado.js', import.meta.url).pathname });
  await pag.waitForFunction(() => !!window.CANDADO);
  pag._nombre = nombre;
  return pag;
}

const ana = await aparato('Ana');
const beto = await aparato('Beto');
const caro = await aparato('Caro');

try {
  ok('el navegador puede con esto', await ana.evaluate(() => CANDADO.hay()));

  const llaveDe = p => p.evaluate(() => CANDADO.miLlave());
  const lAna = await llaveDe(ana);
  const lBeto = await llaveDe(beto);
  const lCaro = await llaveDe(caro);

  ok('cada aparato tiene su propia llave', lAna.id !== lBeto.id && lAna.pub !== lBeto.pub,
    `${lAna.id} · ${lBeto.id}`);
  ok('la llave no es volátil (se guardó en el cajón)', !lAna.volatil);

  /* La llave privada tiene que ser IMPOSIBLE de exportar. Si esto fallara, un
     fallo de seguridad en la web se llevaría las conversaciones de todos, y el
     resto de la prueba daría igual. */
  const seEscapa = await ana.evaluate(async () => {
    const m = await CANDADO.mias();
    if (m.priv.extractable) return 'la marca dice extractable';
    try { await crypto.subtle.exportKey('pkcs8', m.priv); return 'exportKey funcionó'; }
    catch { return null; }
  });
  ok('LA LLAVE PRIVADA NO SE PUEDE EXPORTAR', seEscapa === null, seEscapa || 'ni por marca ni por exportKey');

  const SECRETO = 'La reunión de la Junta es el jueves a las 3. No lo digas.';

  /* Ana cierra para Beto (y para sí misma, que es lo que le deja releerlo). */
  const bulto = await ana.evaluate(
    ([texto, dest]) => CANDADO.cerrar(texto, [dest]), [SECRETO, { id: lBeto.id, pub: lBeto.pub }]);

  const enTexto = JSON.stringify(bulto);
  ok('el bulto NO lleva el texto por dentro', !enTexto.includes('Junta') && !enTexto.includes('jueves'),
    `${enTexto.length} caracteres, todos opacos`);
  ok('el bulto trae dos sobres: el de Beto y el de Ana', bulto.s.length === 2,
    bulto.s.map(x => x.a).join(', '));

  ok('Beto lo abre', (await beto.evaluate(b => CANDADO.abrir(b), bulto))?.texto === SECRETO);
  ok('Ana puede releer lo que ella misma escribió',
    (await ana.evaluate(b => CANDADO.abrir(b), bulto))?.texto === SECRETO);

  /* EL PUNTO DE TODO ESTO. */
  ok('CARO, QUE NO ERA EL DESTINO, NO PUEDE ABRIRLO',
    (await caro.evaluate(b => CANDADO.abrir(b), bulto)) === null);

  /* Un bulto tocado tiene que FALLAR, no dar otra cosa. */
  const tocado = JSON.parse(JSON.stringify(bulto));
  tocado.ct = tocado.ct.slice(0, -4) + (tocado.ct.slice(-4) === 'AAAA' ? 'BBBB' : 'AAAA');
  ok('un bulto tocado no se abre', (await beto.evaluate(b => CANDADO.abrir(b), tocado)) === null);

  /* Y un sobre robado de otro tampoco sirve: Caro no puede ponerse el de Beto,
     porque el sobre está cerrado con un secreto que solo existe entre la llave
     de Ana y la de Beto. */
  const suplantado = JSON.parse(JSON.stringify(bulto));
  const sobreDeBeto = suplantado.s.find(x => x.a === lBeto.id);
  suplantado.s = [{ ...sobreDeBeto, a: lCaro.id }];
  ok('Caro no puede abrirlo poniéndole su nombre al sobre de Beto',
    (await caro.evaluate(b => CANDADO.abrir(b), suplantado)) === null);

  /* Los archivos: la llave viaja aparte, y sin ella los bytes no son nada. */
  const arch = await ana.evaluate(async () => {
    const bytes = new TextEncoder().encode('los bytes de una foto');
    const c = await CANDADO.cerrarBytes(bytes);
    return { cerrado: [...c.bytes], llave: c.llave, iv: c.iv };
  });
  ok('los bytes cerrados no son los originales',
    new TextDecoder().decode(new Uint8Array(arch.cerrado)) !== 'los bytes de una foto');
  const vuelta = await beto.evaluate(async a => {
    const b = await CANDADO.abrirBytes(new Uint8Array(a.cerrado), a.llave, a.iv);
    return new TextDecoder().decode(b);
  }, arch);
  ok('con la llave vuelven enteros', vuelta === 'los bytes de una foto', vuelta);

  /* El código de seguridad: los DOS tienen que ver el mismo número, y les
     tiene que dar igual el orden en que lo calculen. */
  const cod1 = await ana.evaluate(([a, b]) => CANDADO.codigoDeSeguridad(a, b),
    [[lAna.pub], [lBeto.pub]]);
  const cod2 = await beto.evaluate(([a, b]) => CANDADO.codigoDeSeguridad(a, b),
    [[lBeto.pub], [lAna.pub]]);
  ok('el código de seguridad sale igual de los dos lados', cod1 === cod2, cod1);
  ok('y se puede leer en voz alta', /^(\d{5} ){4}\d{5} {2}(\d{5} ){4}\d{5}$/.test(cod1), cod1);

  const cod3 = await caro.evaluate(([a, b]) => CANDADO.codigoDeSeguridad(a, b),
    [[lAna.pub], [lCaro.pub]]);
  ok('con otra persona el código es otro', cod3 !== cod1);

  /* Al recargar, la llave tiene que seguir ahí: si no, cada visita perdería
     todo lo recibido antes. */
  await beto.reload({ waitUntil: 'domcontentloaded' });
  await beto.addScriptTag({ path: new URL('../candado.js', import.meta.url).pathname });
  await beto.waitForFunction(() => !!window.CANDADO);
  const lBeto2 = await llaveDe(beto);
  ok('la llave sobrevive a recargar', lBeto2.id === lBeto.id, `${lBeto.id} → ${lBeto2.id}`);
  ok('y sigue abriendo lo de antes',
    (await beto.evaluate(b => CANDADO.abrir(b), bulto))?.texto === SECRETO);
} finally {
  await nav.close();
}

console.log(fallos ? `\n${fallos} en rojo\n` : '\nEl candado cierra, y solo abre quien debe\n');
process.exit(fallos ? 1 : 0);
