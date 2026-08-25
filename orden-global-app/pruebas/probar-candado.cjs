/* ¿EL SOBRE DEL TELÉFONO SE ABRE EN LA WEB, Y AL REVÉS?
 *
 *   node pruebas/probar-candado.cjs
 *
 * ══ POR QUÉ ESTA PRUEBA MANDA SOBRE LAS DEMÁS ══════════════════════════════
 *
 * PULSE2CHAT cifra de punta a punta, y desde hoy hay DOS implementaciones del
 * mismo esquema: la de la web (`apps-web/veta-wallet/candado.js`, con
 * WebCrypto) y la del teléfono (`src/og/candado.js`, con @noble, porque React
 * Native no trae WebCrypto).
 *
 * Dos implementaciones de un formato son dos cosas que se pueden separar. Y si
 * se separan un milímetro —un `info` distinto, la coordenada Y de más en el
 * secreto, la etiqueta de GCM en otro sitio— los sobres se siguen cerrando y
 * dejan de abrirse del otro lado. El fallo no se ve como un error: se ve como
 * mensajes vacíos, y para cuando alguien lo nota ya hay conversaciones que no
 * se pueden recuperar.
 *
 * Así que aquí no se prueba «cifra y descifra»: se prueba que UNA cierra y LA
 * OTRA abre. Se cargan las dos de verdad, sin copiar ni simular ninguna.
 *
 * ══ CÓMO CORRE LA WEB DENTRO DE NODE ═══════════════════════════════════════
 *
 * `candado.js` es un archivo de navegador: pide `crypto.subtle` (Node lo tiene
 * desde la 16), `btoa`/`atob` (también) e `indexedDB` (no). Se le pone un
 * IndexedDB de mentira que falla al abrirse — y eso es a propósito: el propio
 * candado, cuando el cajón no responde, sigue con un par de llaves en memoria.
 * Ese es justo el camino que hace falta aquí, y de paso se comprueba que ese
 * respaldo funciona.
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

let fallos = 0;
const ok = (q, c, x = '') => {
  console.log(`${c ? '  ok  ' : ' FALLA'}  ${q}${x ? '  · ' + x : ''}`);
  if (!c) fallos++;
};

// ── la web, cargada de verdad ──────────────────────────────────────────────
const RUTA_WEB = path.join(__dirname, '..', '..', 'apps-web', 'veta-wallet', 'candado.js');
const caja = {
  crypto: globalThis.crypto,
  btoa: globalThis.btoa,
  atob: globalThis.atob,
  TextEncoder,
  TextDecoder,
  console,
  // Un cajón que se niega: el candado cae a su par en memoria, que es lo que
  // esta prueba necesita — y de paso se comprueba ese respaldo.
  indexedDB: { open() { throw new Error('sin cajón'); } },
};
caja.globalThis = caja;
caja.window = caja;
vm.createContext(caja);
vm.runInContext(fs.readFileSync(RUTA_WEB, 'utf8'), caja, { filename: 'candado-web.js' });
const WEB = caja.CANDADO;

// ── el teléfono ────────────────────────────────────────────────────────────
// Se carga el módulo TAL CUAL, con lo poco que pide del entorno de Expo puesto
// por delante: el llavero y el azar. Nada del cifrado se sustituye — si se
// sustituyera, esta prueba no probaría nada.
//
// Los ganchos de módulos de Node son la forma de hacerlo: `candado.js` usa
// `import`, y el viejo truco de envolver `Module._load` sólo intercepta
// `require`. Con eso puesto, el import se saltaba el falso y se iba a buscar
// la parte NATIVA de expo-secure-store, que en una computadora no existe.
const { registerHooks } = require('node:module');
const guardado = new Map();
globalThis.__llavero = guardado;
const FALSOS = {
  'expo-secure-store': `
    export async function getItemAsync(k){ return globalThis.__llavero.get(k) ?? null; }
    export async function setItemAsync(k,v){ globalThis.__llavero.set(k,v); }`,
  'expo-crypto': `
    import { randomBytes } from 'node:crypto';
    export function getRandomBytes(n){ return new Uint8Array(randomBytes(n)); }`,
};
registerHooks({
  resolve(pedido, ctx, sig) {
    if (FALSOS[pedido]) return { url: 'falso:' + pedido, shortCircuit: true };
    return sig(pedido, ctx);
  },
  load(url, ctx, sig) {
    const nombre = url.startsWith('falso:') ? url.slice(6) : null;
    if (nombre) return { format: 'module', source: FALSOS[nombre], shortCircuit: true };
    return sig(url, ctx);
  },
});

let APP;
(async () => {
  // El módulo del teléfono es ESM; Node lo carga con import() dinámico.
  APP = await import(path.join(__dirname, '..', 'src', 'og', 'candado.js'));

  console.log('\n── las dos se presentan ─────────────────────────────────────');
  const llaveWeb = await WEB.miLlave();
  const llaveApp = await APP.miLlave();
  ok('la web tiene llave', !!llaveWeb?.pub, llaveWeb?.id);
  ok('el teléfono tiene llave', !!llaveApp?.pub, llaveApp?.id);

  /* La pública SIN COMPRIMIR: 65 bytes que empiezan por 0x04. Es lo que
     exporta WebCrypto en formato `raw`. Si el teléfono publicara la comprimida
     (33 bytes) la web no sabría importarla y no habría cifrado en absoluto. */
  const crudaApp = APP.deB64(llaveApp.pub);
  ok('el teléfono publica la pública sin comprimir, como la web',
    crudaApp.length === 65 && crudaApp[0] === 4, `${crudaApp.length} bytes`);
  ok('y el id se calcula igual en las dos',
    llaveApp.id.length === 22 && llaveWeb.id.length === 22,
    `${llaveApp.id.length} y ${llaveWeb.id.length} letras`);

  console.log('\n── base64url: las dos leen lo que escribe la otra ───────────');
  {
    const bytes = new Uint8Array([0, 1, 2, 250, 251, 252, 253, 254, 255, 62, 63]);
    const porApp = APP.aB64(bytes);
    const porWeb = WEB.aB64(bytes);
    ok('escriben lo mismo', porApp === porWeb, `${porApp} · ${porWeb}`);
    ok('sin `+` ni `/` ni relleno', !/[+/=]/.test(porApp), porApp);
    const vuelta = Array.from(WEB.deB64(porApp));
    ok('y la web lee lo del teléfono, byte por byte',
      JSON.stringify(vuelta) === JSON.stringify(Array.from(bytes)));
  }

  /* Las llaves PUBLICADAS de cada uno, tal como las declararía el servidor.
     `abrir` las exige para juzgar la firma: sin ellas el texto sale igual pero
     marcado «sin-llaves-del-remitente», que es lo correcto — una firma que no
     se puede contrastar contra nada no prueba nada. */
  const pubsApp = [{ id: llaveApp.id, pub: llaveApp.pub, fir: llaveApp.fir }];
  const pubsWeb = [{ id: llaveWeb.id, pub: llaveWeb.pub, fir: llaveWeb.fir }];

  console.log('\n── del TELÉFONO a la WEB ───────────────────────────────────');
  {
    const texto = 'Hola José — con acentos, ñ y un emoji 🌎';
    const bulto = await APP.cerrar(texto, pubsWeb);
    ok('el teléfono cierra el sobre', !!bulto?.ct, `${bulto.s.length} sobres`);
    ok('y va FIRMADO, versión 2', bulto.v === 2 && !!bulto.f && !!bulto.fir);
    const r = await WEB.abrir(bulto, pubsApp);
    ok('LA WEB LO ABRE', r?.texto === texto, r ? r.texto : 'devolvió null');
    /* La firma es la mitad del trabajo de la v2: sin esto, la web abriría el
       texto y diría «no verificado» en cada mensaje del teléfono. */
    ok('Y ACEPTA LA FIRMA DEL TELÉFONO', r?.verificado === true, r?.motivo || '');
  }

  console.log('\n── de la WEB al TELÉFONO ───────────────────────────────────');
  {
    const texto = 'Y de vuelta: 1234567890 ¿todo bien?';
    const bulto = await WEB.cerrar(texto, pubsApp);
    ok('la web cierra el sobre', !!bulto?.ct, `${bulto.s.length} sobres`);
    const r = await APP.abrir(bulto, pubsWeb);
    ok('EL TELÉFONO LO ABRE', r?.texto === texto, r ? r.texto : 'devolvió null');
    ok('Y ACEPTA LA FIRMA DE LA WEB', r?.verificado === true, r?.motivo || '');
  }

  console.log('\n── una firma que no cuadra se rechaza ──────────────────────');
  {
    /* El agujero que la v2 vino a cerrar: quien pudiera escribir en el relevo
       firmaría con una llave suya. La llave del bulto tiene que estar entre las
       PUBLICADAS por el remitente, y las dos implementaciones tienen que
       negarse igual. */
    const bulto = await APP.cerrar('me hago pasar por otro', pubsWeb);
    const conOtro = { ...bulto, fir: llaveWeb.fir };
    const enWeb = await WEB.abrir(conOtro, pubsApp);
    ok('la web rechaza una llave que el remitente no publicó',
      enWeb?.verificado === false, enWeb?.motivo);
    const enApp = await APP.abrir(conOtro, pubsApp);
    ok('y el teléfono la rechaza por lo mismo',
      enApp?.verificado === false, enApp?.motivo);
    ok('las dos dan el MISMO motivo', enWeb?.motivo === enApp?.motivo,
      `${enWeb?.motivo} · ${enApp?.motivo}`);
  }

  console.log('\n── el sobre para uno mismo ─────────────────────────────────');
  {
    /* Sin esto no se puede releer lo que uno escribió. Es un fallo que no se
       nota hasta que alguien vuelve a abrir su propia conversación. */
    const texto = 'lo que yo mismo escribí';
    const bulto = await APP.cerrar(texto, pubsWeb);
    const r = await APP.abrir(bulto, pubsApp);
    ok('el teléfono relee lo suyo', r?.texto === texto);
    ok('y se reconoce su propia firma', r?.verificado === true, r?.motivo || '');
    const bulto2 = await WEB.cerrar(texto, pubsApp);
    const r2 = await WEB.abrir(bulto2, pubsWeb);
    ok('y la web relee lo suyo', r2?.texto === texto);
  }

  console.log('\n── lo que NO es para este aparato ──────────────────────────');
  {
    /* Un mensaje cerrado solo para la web tiene que dar `null` en el teléfono
       —no un error, no basura—: la pantalla lo enseña como «llegó cifrado para
       otro de tus aparatos», que es la verdad. */
    const bulto = await WEB.cerrar('secreto de la web', []);
    const soloWeb = { ...bulto, s: bulto.s.filter((x) => x.a === llaveWeb.id) };
    ok('el teléfono dice que no tiene sobre', (await APP.abrir(soloWeb, pubsWeb)) === null);
  }

  console.log('\n── un sobre manoseado no se abre ───────────────────────────');
  {
    const bulto = await WEB.cerrar('íntegro', pubsApp);
    const roto = { ...bulto, ct: APP.aB64(APP.deB64(bulto.ct).map((b, i) => (i === 0 ? b ^ 1 : b))) };
    ok('cambiar un bit lo invalida', (await APP.abrir(roto, pubsWeb)) === null,
      'GCM tiene que fallar, no devolver texto distinto');
  }

  console.log('\n── archivos: la foto que cierra una y abre la otra ─────────');
  {
    const datos = new Uint8Array(1024).map((_, i) => (i * 7) % 256);
    const c = APP.cerrarBytes(datos);
    const vuelta = await WEB.abrirBytes(c.bytes, c.llave, c.iv);
    ok('el teléfono cierra y la web abre',
      Buffer.compare(Buffer.from(vuelta), Buffer.from(datos)) === 0);
    const c2 = await WEB.cerrarBytes(datos);
    const vuelta2 = APP.abrirBytes(c2.bytes, c2.llave, c2.iv);
    ok('y al revés',
      Buffer.compare(Buffer.from(vuelta2), Buffer.from(datos)) === 0);
  }

  console.log('\n── el código de seguridad se lee igual en los dos ──────────');
  {
    /* Se lee EN VOZ ALTA entre dos personas. Si el teléfono dice un número y
       el navegador otro, las dos creen que hay alguien en medio cuando no lo
       hay — y dejan de mandarse cosas por un fallo nuestro. */
    const mias = [llaveApp.pub];
    const suyas = [llaveWeb.pub];
    const enApp = APP.codigoDeSeguridad(mias, suyas);
    const enWeb = await WEB.codigoDeSeguridad(mias, suyas);
    ok('el mismo número', enApp === enWeb, enApp);
    ok('y no depende del orden en que se pregunte',
      enApp === APP.codigoDeSeguridad(suyas, mias));
  }

  console.log('\n── la llave sobrevive a cerrar la app ──────────────────────');
  {
    /* Si al reabrir naciera otra llave, todo lo recibido antes quedaría
       ilegible para siempre. Se comprueba releyendo el llavero. */
    const antes = (await APP.miLlave()).id;
    /* Dos: la de acuerdo y la de firma. Son dos porque una llave, un uso — y
       porque WebCrypto no deja que la de ECDH sirva también para ECDSA. */
    ok('las dos privadas quedaron en el llavero', guardado.size === 2,
      `${guardado.size} guardadas`);
    ok('y el id no cambia al volver a preguntar', (await APP.miLlave()).id === antes);
  }

  console.log(fallos ? `\n${fallos} fallan\n` : '\nTodo en verde\n');
  process.exit(fallos ? 1 : 0);
})().catch((e) => {
  console.error('\nla prueba se cayó:', e);
  process.exit(1);
});
