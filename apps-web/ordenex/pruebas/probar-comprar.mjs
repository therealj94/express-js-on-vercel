/* LA COMPRA DE ORIGEN CON USDT, contra un API fingido y en un navegador.
 *
 *   node apps-web/ordenex/pruebas/probar-comprar.mjs
 *
 * ══ POR QUÉ EXISTE ═════════════════════════════════════════════════════════
 *
 * `comprar.js` es la puerta por la que entra el dinero: alguien pone dólares
 * en USDT y le sale ORIGEN. Habla con el servidor por cuatro rutas —congelar
 * el precio, mirar cómo va, confirmar un recálculo y cancelar— y NINGUNA
 * estaba probada. La suite entera de la web pasaba en verde con el botón de
 * comprar reventado.
 *
 * Y estaba reventado: `comprar.js` llamaba a `DATOS.post(...)` y `DATOS.get(...)`
 * y `datos.js` no exportaba ni uno de los dos. El primer clic tiraba
 * «DATOS.post is not a function» y no pasaba nada más. Ninguna prueba lo vio
 * porque ninguna llegó a pulsar el botón.
 *
 * LA LECCIÓN, que es la que hay que dejar escrita: probar los módulos por
 * separado no encuentra los huecos ENTRE módulos. `comprar.js` estaba bien,
 * `datos.js` estaba bien, y el par no encajaba. Lo único que lo encuentra es
 * recorrer el camino entero, con el navegador y con un servidor al otro lado.
 *
 * QUÉ SE COMPRUEBA
 *
 *   1. Que las cuatro rutas se llamen DE VERDAD, con el método y el cuerpo que
 *      el API espera. No que existan las funciones: que lleguen las peticiones.
 *   2. Que la dirección de depósito que devuelve el servidor se PINTE. Una
 *      dirección que no se ve es dinero que nadie puede mandar.
 *   3. Que cancelar avise al servidor. Sin eso queda una orden abierta
 *      reservando precio para alguien que ya se fue.
 *   4. Que un error del servidor se enseñe en vez de tragarse.
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
/* ONX_RAIZ apunta a otra copia de la web —por ejemplo la DESCARGADA DEL SITIO
   PUBLICADO— para poder correr esta misma prueba contra los bytes que de
   verdad recibe la gente. Es la misma convención que probar-movil.mjs, y sirve
   para lo mismo: comprobar que lo desplegado se comporta como lo probado, sin
   tener que creerselo. */
const RAIZ = process.env.ONX_RAIZ ? resolve(process.env.ONX_RAIZ) : join(AQUI, '..');
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
                '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
                '.woff2': 'font/woff2' };

const U = 10n ** 18n;
const wei = (n) => (BigInt(n) * U).toString();
const TOKEN_SSO = 'sso-fingido';
const JWT = 'jwt-fingido';
const DIRECCION = '0x' + 'b7c3'.repeat(10);

/* El precio del ORIGEN el 4 de septiembre: la onza de oro a $4.389,89 entre
   31,1035 gramos y entre 55. Se escribe con los números de verdad para que el
   decorado no invente un mundo que no existe. */
const PRECIO_WEI = '2566148000000000000';   // $2,566148

let llamadas = [];
let ordenes = new Map();
let siguienteFalla = null;   // para probar que un error del API se enseña
let entregaEncendida = true; // el COMPRAS=1 del servidor, fingido
// Las redes que la casa recibe hoy (ORDENEX_REDES del servidor), fingidas.
let REDES_ABIERTAS = [{ id: 137, nombre: 'Polygon', minimoUsd: 2 },
                      { id: 56, nombre: 'BNB Smart Chain', minimoUsd: 2 },
                      { id: 1, nombre: 'Ethereum', minimoUsd: 25 }];

const json = (r, codigo, obj) => {
  r.writeHead(codigo, { 'Content-Type': 'application/json; charset=utf-8' });
  r.end(JSON.stringify(obj));
};
const cuerpoDe = (q) => new Promise((res) => {
  let t = '';
  q.on('data', (d) => { t += d; });
  q.on('end', () => { try { res(JSON.parse(t || '{}')); } catch { res({}); } });
});

async function api(q, r, ruta) {
  const sesion = (q.headers.authorization || '') === 'Bearer ' + JWT;

  if (q.method === 'GET' && ruta === '/mercados') {
    return json(r, 200, [{ mercado: 'AUKA-ORIGEN', ultimo: wei(1711), cambio24h: 0.4,
      vol24h: wei(222), referencia: { usd: 4389.89, origenUsd: 2.566148,
        rotulo: 'onza de oro', fuente: 'fingido', en: new Date().toISOString() } }]);
  }
  if (q.method === 'GET' && ruta === '/tarifas') return json(r, 200, { comisionPpm: 2500, sobre: 'recibido' });
  if (q.method === 'GET' && ruta === '/salud') {
    return json(r, 200, { ok: true, cadena: true, mongo: true, bloque: 1, entrega: entregaEncendida });
  }
  if (q.method === 'GET' && ruta === '/limites') {
    return json(r, 200, { desvio: { avisoPct: 5, bloqueoPct: 20 }, redes: REDES_ABIERTAS });
  }
  if (q.method === 'POST' && ruta === '/auth/sso') {
    const { token } = await cuerpoDe(q);
    if (token !== TOKEN_SSO) return json(r, 401, { error: 'No vale.', codigo: 'SSO_INVALIDO' });
    return json(r, 200, { token: JWT, refreshToken: 'refresco',
      usuario: { gid: 'GID-FINGIDO', nombre: 'Fingido', verificada: true,
                 direccionWallet: '0x' + '11'.repeat(20) } });
  }
  if (q.method === 'GET' && ruta === '/portafolio') {
    if (!sesion) return json(r, 401, { error: 'Sin sesión.', codigo: 'SIN_SESION' });
    return json(r, 200, { cuentas: [{ activo: 'ORIGEN', disponible: wei(0), reservado: '0' }],
                          direccionDeposito: DIRECCION });
  }
  if (q.method === 'GET' && (ruta === '/movimientos' || ruta === '/ordenes' || ruta === '/fiat/solicitudes')) {
    return json(r, 200, []);
  }

  // ── LAS CUATRO RUTAS DE LA COMPRA ────────────────────────────────────────
  const una = ruta.match(/^\/compras\/([^/]+)$/);
  const accion = ruta.match(/^\/compras\/([^/]+)\/(confirmar|cancelar)$/);

  if (q.method === 'POST' && ruta === '/compras') {
    const cuerpo = await cuerpoDe(q);
    llamadas.push({ ruta, metodo: 'POST', cuerpo });
    if (!sesion) return json(r, 401, { error: 'Sin sesión.', codigo: 'SIN_SESION' });
    if (!entregaEncendida) {
      return json(r, 503, { error: 'La compra de ORIGEN con USDT está cerrada en este momento. No mandes nada todavía.',
                            codigo: 'ENTREGA_APAGADA' });
    }
    if (siguienteFalla) {
      const e = siguienteFalla; siguienteFalla = null;
      return json(r, 400, e);
    }
    const micro = BigInt(cuerpo.montoMicro || '0');
    const origenWei = ((micro * 10n ** 12n) * U / BigInt(PRECIO_WEI)).toString();
    const o = { id: 'compra-1', estado: 'esperando', cadena: cuerpo.cadena,
      montoMicro: cuerpo.montoMicro, precioWei: PRECIO_WEI, origenWei,
      direccion: DIRECCION, restanSeg: 900, plazoSeg: 900,
      en: new Date().toISOString() };
    ordenes.set(o.id, o);
    return json(r, 200, o);
  }
  if (q.method === 'GET' && una) {
    llamadas.push({ ruta, metodo: 'GET' });
    const o = ordenes.get(una[1]);
    return o ? json(r, 200, o) : json(r, 404, { error: 'No existe.', codigo: 'NO_EXISTE' });
  }
  if (q.method === 'POST' && accion) {
    const cuerpo = await cuerpoDe(q);
    llamadas.push({ ruta, metodo: 'POST', cuerpo });
    const o = ordenes.get(accion[1]);
    if (!o) return json(r, 404, { error: 'No existe.', codigo: 'NO_EXISTE' });
    if (accion[2] === 'cancelar') { ordenes.delete(o.id); return json(r, 200, { ...o, estado: 'cancelada' }); }
    return json(r, 200, { ...o, estado: 'esperando', recalculoConfirmado: true });
  }
  return null;
}

const sv = createServer(async (q, r) => {
  const ruta = decodeURIComponent(q.url.split('?')[0]);
  if (await api(q, r, ruta) !== null) return;
  try {
    const p = join(RAIZ, ruta.replace(/^\/$/, '/index.html'));
    const d = await readFile(p);
    r.writeHead(200, { 'Content-Type': TIPOS[extname(p)] || 'application/octet-stream' });
    r.end(d);
  } catch { r.writeHead(404); r.end('no'); }
});
await new Promise((ok) => sv.listen(0, '127.0.0.1', ok));
const ORIGEN = `http://127.0.0.1:${sv.address().port}`;

let fallos = 0;
const decir = (ok, que, extra = '') => {
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${que}`);
  if (extra) console.log(`           ${String(extra).replace(/\s+/g, ' ').slice(0, 160)}`);
  if (!ok) fallos++;
};
const titulo = (t) => console.log(`\n── ${t} ${'─'.repeat(Math.max(2, 58 - t.length))}`);

const nav = await chromium.launch({
  executablePath: process.env.ONX_CHROMIUM || '/opt/pw-browsers/chromium',
  args: ['--no-sandbox'],
});
const p = await nav.newPage({ viewport: { width: 1280, height: 900 }, locale: 'es-HN' });
await p.addInitScript((o) => { window.ONX_API = o; window.ONX_WALLET = o; }, ORIGEN);

/* LOS ERRORES DEL NAVEGADOR SE RECOGEN. Es la mitad del valor de esta prueba:
   `DATOS.post is not a function` es un TypeError que muere dentro de un
   `catch` de la propia pantalla, así que sin escuchar la consola el síntoma
   es «el botón no hace nada» y no hay ni un rastro que seguir. */
const errores = [];
p.on('pageerror', (e) => errores.push(String(e.message || e)));
p.on('console', (m) => { if (m.type() === 'error') errores.push(m.text()); });

await p.goto(`${ORIGEN}/index.html#sso=${TOKEN_SSO}`, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(1800);

titulo('la pantalla de comprar abre');
await p.evaluate(() => ONX.vista('comprar'));
await p.waitForTimeout(1200);
decir(await p.evaluate(() => !!document.getElementById('cp-monto')),
  'la calculadora aparece con su campo de monto');
decir(await p.evaluate(() => !!document.getElementById('cp-izq')), 'y su panel izquierdo');

titulo('el contrato entre comprar.js y datos.js');
/* La comprobación que habría ahorrado todo esto. Se pregunta ANTES de pulsar
   nada: si el módulo de datos no tiene los métodos que la pantalla llama, no
   hace falta un navegador para saber que el botón está muerto. */
const faltan = await p.evaluate(() => {
  const necesita = ['post', 'get'];
  return necesita.filter((n) => typeof DATOS[n] !== 'function');
});
decir(faltan.length === 0,
  'DATOS tiene los métodos que comprar.js llama en sus cuatro rutas',
  faltan.length ? `faltan: DATOS.${faltan.join(', DATOS.')}` : 'post y get');

titulo('congelar el precio llama al servidor');
llamadas = [];
await p.fill('#cp-monto', '100');
await p.waitForTimeout(400);
await p.evaluate(() => VCOMPRA.red(137));      // Polygon
await p.waitForTimeout(300);
await p.evaluate(() => VCOMPRA.congelar());
await p.waitForTimeout(1500);

const abrió = llamadas.find((l) => l.ruta === '/compras' && l.metodo === 'POST');
decir(!!abrió, 'POST /compras llegó al servidor', JSON.stringify(abrió || llamadas));
if (abrió) {
  // 100 USDT en micros: el API los cuenta en enteros, nunca en flotantes.
  decir(abrió.cuerpo.montoMicro === '100000000',
    'con el monto en micros y como texto, sin un flotante en el camino', String(abrió.cuerpo.montoMicro));
  decir(Number(abrió.cuerpo.cadena) === 137, 'y con la cadena que se eligió', String(abrió.cuerpo.cadena));
}

titulo('la dirección de depósito se PINTA');
/* Una dirección que el servidor manda y la pantalla no enseña es dinero que
   nadie puede mandar: el síntoma es alguien mirando una pantalla en blanco
   con el precio corriéndole. */
const pantalla = await p.evaluate(() => document.getElementById('cp-izq')?.innerText || '');
decir(pantalla.toLowerCase().includes(DIRECCION.toLowerCase()),
  'la dirección que devolvió el servidor está a la vista', pantalla.slice(0, 140));

titulo('cancelar avisa al servidor');
llamadas = [];
await p.evaluate(() => VCOMPRA.cancelar());
await p.waitForTimeout(1200);
decir(llamadas.some((l) => /\/compras\/[^/]+\/cancelar$/.test(l.ruta) && l.metodo === 'POST'),
  'POST /compras/:id/cancelar llegó',
  JSON.stringify(llamadas.map((l) => l.metodo + ' ' + l.ruta)));
// Sin esto queda una orden abierta reservando un precio para alguien que ya se
// fue, y el plazo la mata sola quince minutos después — quince minutos en los
// que la casa cree que hay un depósito en camino.

/* La foto de los errores ANTES de provocar uno a propósito. Lo de abajo pide
   al servidor que conteste 400, y el navegador anota ese 400 en la consola:
   es la respuesta esperada, no un fallo. Sin separar los dos, la comprobación
   final se pondría roja por hacer su trabajo — y una prueba que falla cuando
   acierta enseña a ignorarla. */
const erroresLimpios = errores.slice();

titulo('un error del servidor se enseña, no se traga');
llamadas = [];
siguienteFalla = { error: 'No hay dirección de depósito para esa cadena.', codigo: 'SIN_DIRECCION_RED' };
await p.evaluate(() => ONX.vista('comprar'));
await p.waitForTimeout(900);
await p.fill('#cp-monto', '50');
await p.waitForTimeout(300);
await p.evaluate(() => { VCOMPRA.red(137); VCOMPRA.congelar(); });
await p.waitForTimeout(1500);
const texto = await p.evaluate(() => document.body.innerText);
decir(/No hay dirección de depósito|no se pudo/i.test(texto),
  'el mensaje del servidor aparece en pantalla',
  texto.split('\n').filter((l) => /direcci|pudo/i.test(l)).slice(0, 2).join(' · '));

titulo('sin errores en el navegador');
/* El último, y el que de verdad cazaba el fallo: un TypeError dentro del
   `catch` de la pantalla se ve igual que «no pasó nada». */
const graves = erroresLimpios.filter((e) => !/favicon|net::ERR_/i.test(e));
decir(graves.length === 0, 'ni un error de consola en el recorrido bueno',
  graves.slice(0, 3).join(' | '));

/* Y del tramo del error a propósito: que lo ÚNICO que se queje sea ese 400.
   Un TypeError escondido ahí se vería igual que el 400 esperado. */
const tras = errores.slice(erroresLimpios.length)
  .filter((e) => !/favicon|net::ERR_|status of 400/i.test(e));
decir(tras.length === 0, 'y del 400 a propósito no cuelga ningún otro error',
  tras.slice(0, 3).join(' | '));

/* ══ CON LA ENTREGA APAGADA NO SE PUEDE EMPEZAR ══════════════════════════════
 *
 * Las rutas de /compras del API se montan SIEMPRE, pero quien entrega el
 * ORIGEN solo corre con COMPRAS=1. Con eso apagado, el circuito era: se
 * congela un precio, se recibe una dirección, se manda el USDT, el vigía lo
 * anota… y nadie entrega nada. La casa cobrando sin entregar, y el síntoma
 * llegando días después en forma de persona preguntando por su dinero.
 *
 * Se comprueban las DOS mitades, porque hacen falta las dos: que el servidor
 * se niegue —es la puerta de verdad, y una pantalla puede estar vieja o no ser
 * la nuestra— y que la pantalla lo diga a tiempo, que enterarse después de
 * escribir el monto y elegir la red es enterarse tarde.
 */
/* LAS REDES QUE LA CASA RECIBE HOY.
 *
 * Conocer una red y tenerla abierta no es lo mismo: el 5-sep Ethereum tenía
 * cero gas —cero barridos posibles— y la pantalla la ofrecía igual que a las
 * otras dos. Quien mandara USDT por ahí habría depositado de verdad y el
 * barrido no habría podido moverlo: dinero llegado y quieto. Cuando el
 * servidor dice cuáles atiende, la pantalla ofrece ESAS y ninguna más.
 */
titulo('solo se ofrecen las redes que el servidor tiene abiertas');
{
  REDES_ABIERTAS = [{ id: 56, nombre: 'BNB Smart Chain', minimoUsd: 2 }];
  await p.evaluate(() => ONX.vista('mercado', 'AUKA-ORIGEN'));
  await p.waitForTimeout(300);
  await p.evaluate(() => ONX.vista('comprar'));
  await p.waitForTimeout(1600);

  const r = await p.evaluate(() => ({
    botones: [...document.querySelectorAll('.cp-red')].map((b) => b.textContent.replace(/\s+/g, ' ').trim()),
    elegida: [...document.querySelectorAll('.cp-red')].filter((b) => b.getAttribute('aria-checked') === 'true').length,
  }));
  decir(r.botones.length === 1 && /BNB/.test(r.botones[0]),
    'con una sola red abierta, se ofrece una sola', r.botones.join(' | '));
  decir(!r.botones.some((b) => /Ethereum|Polygon/.test(b)),
    'y las cerradas no aparecen ni apagadas: lo que no se puede usar no se enseña', r.botones.join(' | '));
  decir(r.elegida === 1, 'y la que queda está elegida, no hay que tocarla', String(r.elegida));

  REDES_ABIERTAS = [{ id: 137, nombre: 'Polygon', minimoUsd: 2 },
                    { id: 56, nombre: 'BNB Smart Chain', minimoUsd: 2 },
                    { id: 1, nombre: 'Ethereum', minimoUsd: 25 }];
  await p.evaluate(() => ONX.vista('mercado', 'AUKA-ORIGEN'));
  await p.waitForTimeout(300);
  await p.evaluate(() => ONX.vista('comprar'));
  await p.waitForTimeout(1600);
  const tres = await p.evaluate(() => document.querySelectorAll('.cp-red').length);
  decir(tres === 3, 'y con las tres abiertas vuelven las tres', String(tres));
}

titulo('con la entrega apagada, la pantalla no deja empezar');
{
  entregaEncendida = false;
  llamadas = [];
  await p.evaluate(() => ONX.vista('mercado', 'AUKA-ORIGEN'));
  await p.waitForTimeout(400);
  await p.evaluate(() => ONX.vista('comprar'));
  await p.waitForTimeout(1500);

  const v = await p.evaluate(() => {
    const b = [...document.querySelectorAll('#cp-izq button')]
      .find((x) => /congelar|lock/i.test(x.textContent || ''));
    return { texto: document.getElementById('cp-izq')?.innerText || '', apagado: b ? b.disabled : null };
  });
  decir(/cerrada|closed/i.test(v.texto), 'lo dice antes de que nadie escriba un monto',
    v.texto.split('\n').filter((l) => /cerrad|closed/i.test(l))[0] || v.texto.slice(0, 100));
  decir(v.apagado === true, 'y el botón de congelar está apagado', `disabled=${v.apagado}`);

  // Y aunque alguien lo fuerce, el que manda es el servidor.
  await p.fill('#cp-monto', '100');
  await p.waitForTimeout(300);
  await p.evaluate(() => { VCOMPRA.red(137); VCOMPRA.congelar(); });
  await p.waitForTimeout(1200);
  const intento = llamadas.find((l) => l.ruta === '/compras' && l.metodo === 'POST');
  const abrio = await p.evaluate(() => !!document.getElementById('cp-reloj'));
  decir(!abrio, 'y forzándolo tampoco nace la orden: manda el servidor',
    intento ? 'la petición salió y el API la rechazó' : 'la pantalla ni la mandó');

  entregaEncendida = true;
}

/* ══ Y EL MISMO HUECO, BUSCADO EN TODA LA CASA ═══════════════════════════════
 *
 * Lo de arriba prueba el camino de la compra. Esto busca el MISMO tipo de
 * fallo en el resto: una pantalla que llama a un método que su módulo no
 * exporta. Es barato y no necesita recorrer nada.
 *
 * Las llamadas se buscan con texto —`DATOS.algo(`— y eso se equivoca por
 * exceso, que no importa: quien decide si existe es el OBJETO DE VERDAD ya
 * cargado en la página, no una lectura del código. Un intento anterior sí
 * parseaba el `return {…}` de cada módulo y daba veinte falsos positivos por
 * no saber leer una propiedad abreviada. La página sabe la respuesta; solo
 * hay que preguntársela.
 */
titulo('nadie llama a un método que su módulo no exporta');
{
  const { readdir } = await import('node:fs/promises');
  const nombres = (await readdir(RAIZ)).filter((n) => n.endsWith('.js'));
  const fuentes = await Promise.all(nombres.map(async (n) =>
    [n, await readFile(join(RAIZ, n), 'utf8')]));

  const OBJETOS = ['DATOS', 'ONX', 'VCOMPRA', 'VMERCADO', 'VPORTAFOLIO', 'VFIAT'];
  const llamados = {};
  for (const [n, bruto] of fuentes) {
    // Sin comentarios: la mitad de estos nombres aparecen explicados en prosa.
    const src = bruto.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/[^\n]*/gm, '');
    for (const o of OBJETOS) {
      for (const m of src.matchAll(new RegExp(`\\b${o}\\.([A-Za-z_$][\\w$]*)\\s*\\(`, 'g'))) {
        (llamados[o] ||= new Map()).set(m[1], n);
      }
    }
  }

  // La pantalla de mercado y la de fiat se abren para que sus objetos existan.
  await p.evaluate(() => { try { ONX.vista('mercado', 'AUKA-ORIGEN'); } catch {} });
  await p.waitForTimeout(900);

  const pedido = Object.fromEntries(Object.entries(llamados)
    .map(([o, m]) => [o, [...m.keys()]]));
  const r = await p.evaluate((pedido) => {
    const fuera = [], sinResolver = [];
    let mirados = 0;
    for (const [o, metodos] of Object.entries(pedido)) {
      /* `window[o]` NO SIRVE, y por poco se queda así. Estos módulos se
         declaran `const DATOS = (() => {…})()` en el nivel superior de un
         script, y un `const` de nivel superior crea un enlace global pero NO
         una propiedad de `window`. La primera versión de esta comprobación
         leía `window[o]`, encontraba `undefined`, y se saltaba TODOS los
         módulos en silencio — mientras el mensaje presumía de 72 llamadas
         comprobadas. Se descubrió mutando: se le quitó `post` a datos.js y
         esto siguió en verde.

         Con `eval` se resuelve el enlace léxico, que es el que existe. Y si
         aun así no se resuelve, se DICE: un módulo que no se puede mirar
         tiene que salir en el informe, no desaparecer de él. */
      let obj = null;
      try { obj = eval(o); } catch { obj = null; }
      if (!obj || typeof obj !== 'object') { sinResolver.push(o); continue; }
      for (const k of metodos) {
        if (k === '_adentro') continue;
        mirados += 1;
        if (typeof obj[k] !== 'function' && !(k in obj)) fuera.push(`${o}.${k}`);
      }
    }
    return { fuera, sinResolver, mirados };
  }, pedido);

  decir(r.fuera.length === 0,
    `las ${r.mirados} llamadas entre módulos apuntan a algo que existe`,
    r.fuera.join(' · '));
  /* Y que se hayan mirado de verdad. Sin esto, el número de arriba puede ser
     cero y la línea sigue diciendo «ok». */
  decir(r.mirados > 40 && r.sinResolver.length === 0,
    'y se pudo mirar cada módulo: ninguno se saltó en silencio',
    `${r.mirados} llamadas · sin resolver: ${r.sinResolver.join(', ') || 'ninguno'}`);
}

await nav.close();
sv.close();
console.log(fallos ? `\n${fallos} comprobación(es) fallaron` : '\nTodo en verde');
process.exit(fallos ? 1 : 0);
