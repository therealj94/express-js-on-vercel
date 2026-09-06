/* LA CONSOLA de la Junta, en un navegador de verdad, contra el servidor de verdad.
 *
 *   node infra/ultron/pruebas/probar-consola.mjs
 *
 * Sin cerebro, sin voz y sin red: lo que se comprueba es que la consola sea
 * una puerta, un despacho que saluda por el nombre y en registro
 * institucional, un tablero que dice qué no pudo leer y jamás un cero, el catálogo
 * entero de instrumentos —cada uno ejecutable a mano por el mismo camino que
 * usa ULTRON—, los pendientes y la memoria por el API, y que cuando no hay
 * cerebro lo diga en vez de fingir. Y a 390 px, que no se salga nada.
 */
import { chromium } from 'playwright';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

let fallos = 0;
const decir = (ok, que, extra = '') => { console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${que}${extra && !ok ? '\n           ' + String(extra).replace(/\s+/g, ' ').slice(0, 220) : ''}`); if (!ok) fallos++; };
const titulo = (t) => console.log(`\n── ${t} ${'─'.repeat(Math.max(2, 58 - t.length))}`);

delete process.env.MONGODB_URI; delete process.env.ANTHROPIC_API_KEY; delete process.env.ELEVENLABS_API_KEY; delete process.env.ULTRON_NODO_URL; delete process.env.AWS_ACCESS_KEY_ID;
process.env.ULTRON_SECRETO = 'p';
process.env.ULTRON_JUNTA = JSON.stringify([{ nombre: 'José Enamorado', correo: 'jose@ordenglobal.org', clave: 'clave-jose', rol: 'presidente' }]);
const fetchReal = globalThis.fetch;
globalThis.fetch = async (u, o) => { if (String(u).startsWith('http://127.0.0.1')) return fetchReal(u, o); throw new Error('sin red'); };

const { app } = require('../app.js');
const sv = await new Promise((ok) => { const s = app.listen(0, '127.0.0.1', () => ok(s)); });
const BASE = `http://127.0.0.1:${sv.address().port}`;

const nav = await chromium.launch({ executablePath: process.env.ULTRON_CHROMIUM || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const p = await nav.newPage({ viewport: { width: 1400, height: 900 }, locale: 'es-HN' });
const errores = []; p.on('pageerror', (e) => errores.push(String(e.message).slice(0, 160)));
p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|fonts\.g/.test(m.text())) errores.push(m.text().slice(0, 160)); });
const texto = (sel) => p.evaluate((s) => document.querySelector(s)?.innerText || '', sel);

titulo('la puerta');
/* `/consola`, no `/`. Desde que hay UN SOLO ENLACE, la raíz es ULTRON OS con
   su arranque y su puerta; la consola de siempre —la que la junta ya conocía y
   que funciona en cualquier navegador viejo— quedó en `/consola`. Se sigue
   probando entera: no se borró, se movió. */
await p.goto(BASE + '/consola', { waitUntil: 'domcontentloaded' });
await p.waitForSelector('#puerta:not([hidden])', { timeout: 10000 });
decir(await p.evaluate(() => document.getElementById('consola').hidden), 'sin sesión se ve la puerta y no la consola');
decir(/Junta Directiva/.test(await texto('#puerta')), 'y la puerta dice a quién está reservada');
/* Este servidor de prueba NO tiene GENESIS_API_KEY. Un botón «Entrar con mi
   Veta Wallet» que no puede funcionar es peor que no tenerlo: la persona lo
   toca, da la vuelta entera por la wallet y vuelve a un 503 creyendo que la
   puerta está rota. Se esconde, y la clave vuelve a ser el camino de oro. */
decir(await p.evaluate(() => document.getElementById('puertaGenesis').hidden),
  'sin Genesis configurado, el botón de la wallet no se enseña');
decir(await p.evaluate(() => {
  const b = document.querySelector('#formPuerta button[type=submit]');
  return getComputedStyle(b).backgroundColor === getComputedStyle(document.documentElement).getPropertyValue('--oro').trim()
    || /201, 169, 97/.test(getComputedStyle(b).backgroundColor);
}), 'y entonces «Ingresar» es el botón principal, en oro');
await p.fill('input[name=correo]', 'jose@ordenglobal.org'); await p.fill('input[name=clave]', 'mala'); await p.click('#formPuerta button[type=submit]');
await p.waitForTimeout(600);
decir(/incorrectos/i.test(await texto('#puertaError')), 'con la clave mala lo dice');
await p.fill('input[name=clave]', 'clave-jose'); await p.click('#formPuerta button[type=submit]');
await p.waitForSelector('#consola:not([hidden])', { timeout: 8000 });
decir(true, 'con la buena entra');

titulo('la portada: la figura de ULTRON y el saludo por el nombre');
await p.waitForFunction(() => /Buen(os|as) (días|tardes|noches), José\./.test(document.getElementById('portada').innerText), null, { timeout: 8000 }).catch(() => {});
{
  decir(await p.evaluate(() => !document.getElementById('portada').hidden && document.getElementById('hilo').hidden),
    'sin conversación se ve la portada, no un hilo vacío');
  /* La figura es una imagen, y una imagen que no llegó no da error: deja un
     hueco y la consola sigue como si nada. Así que se comprueba que cargó de
     verdad —con ancho propio— y que va compuesta en modo pantalla, que es lo
     que hace desaparecer su negro contra el grafito de la casa. */
  decir(await p.evaluate(() => {
    const f = document.getElementById('figura');
    return !!f && f.complete && f.naturalWidth > 300;
  }), 'la figura de ULTRON cargó: la imagen está, no es un hueco');
  decir(await p.evaluate(() => getComputedStyle(document.getElementById('figura')).mixBlendMode === 'screen'),
    'y va en modo pantalla, para que su negro no sea un rectángulo sobre la consola');
  // El lienzo de al lado tiene que tener TINTA: es el aura y el latido que la
  // hacen estar viva, y un lienzo en blanco no da error.
  decir(await p.evaluate(() => {
    const c = document.getElementById('presencia');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let n = 0; for (let i = 3; i < d.length; i += 4 * 131) if (d[i] > 12) n++;
    return n > 150;
  }), 'el aura está pintada: el lienzo tiene tinta');

  /* ── LAS MOLÉCULAS ────────────────────────────────────────────────────────
     Lo que la Junta pidió es que la figura se MUEVA. Una captura no puede
     enseñar movimiento y una imagen quieta no da error, así que se comprueban
     las tres cosas que lo hacen cierto:

       1. que las moléculas salgan DE LA IMAGEN, no de un molde aparte —si
          getImageData fallara por procedencia, la lista quedaría vacía y la
          figura volvería a ser una foto sin que nadie se entere;
       2. que caigan SOBRE el cuerpo: el encuadre rehace la cuenta de
          object-fit, y si se equivoca las partículas aterrizan corridas;
       3. que entre dos cuadros separados por medio segundo el lienzo haya
          CAMBIADO de verdad. */
  decir(await p.evaluate(() => PRESENCIA._adentro.moleculas().length > 800),
    'las moléculas salieron de los píxeles de la imagen',
    await p.evaluate(() => PRESENCIA._adentro.moleculas().length + ' moléculas'));
  decir(await p.evaluate(() => {
    const m = PRESENCIA._adentro.moleculas();
    // Con su color: una del pecho es del azul del pecho. Si todas fueran
    // iguales, serían un molde pintado encima y no la imagen viva.
    const colores = new Set(m.slice(0, 400).map((x) => `${x.r >> 4},${x.g >> 4},${x.b >> 4}`));
    return colores.size > 6;
  }), 'y cada una con el color de su píxel, no todas del mismo azul');
  decir(await p.evaluate(() => {
    const e = PRESENCIA._adentro.encuadre(), c = document.getElementById('presencia');
    return !!e && e.w > 100 && e.h > 100 && e.x > -1 && e.x + e.w <= c.clientWidth + 1;
  }), 'el encuadre cae dentro del lienzo: aterrizan sobre el cuerpo', await p.evaluate(() => JSON.stringify(PRESENCIA._adentro.encuadre())));
  {
    const foto = () => p.evaluate(() => {
      const c = document.getElementById('presencia');
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      const out = []; for (let i = 3; i < d.length; i += 4 * 37) out.push(d[i]);
      return out;
    });
    const a1 = await foto();
    await p.waitForTimeout(600);
    const a2 = await foto();
    let cambiaron = 0;
    for (let i = 0; i < a1.length; i++) if (Math.abs(a1[i] - a2[i]) > 8) cambiaron++;
    decir(cambiaron > a1.length * 0.01, 'y se MUEVEN: entre dos cuadros el lienzo cambió',
      `${cambiaron} de ${a1.length} muestras`);
  }
  decir(await p.evaluate(() => {
    // Y está donde tiene que estar: el aura envuelve a la figura, en el centro.
    const c = document.getElementById('presencia'); const x = c.getContext('2d');
    const centro = x.getImageData(c.width * 0.42, c.height * 0.3, c.width * 0.16, c.height * 0.3).data;
    let n = 0; for (let i = 3; i < centro.length; i += 4 * 37) if (centro[i] > 20) n++;
    return n > 40;
  }), 'y cae sobre la figura, en el centro, no en una esquina');
  const h = await texto('#portada');
  decir(/Buen(os|as) (días|tardes|noches), José\./.test(h), 'saluda por el nombre de pila', h);
  decir(/Quedo a su disposición\./.test(h), 'y cede la palabra en registro institucional', h);
  /* CON LÍMITES DE PALABRA, y no es quisquillosidad: `che` a secas casa dentro
     de «Buenas noCHEs», así que esta comprobación se ponía roja sola a partir
     de las siete de la tarde y verde otra vez por la mañana. Una prueba que
     depende de la hora del día no prueba nada — solo enseña a desconfiar de
     las rojas, que es lo peor que le puede pasar a una suite. */
  decir(!/¿Por dónde empezamos\?|\bvos\b|\bche\b|\btenés\b|\bpodés\b/.test(h), 'sin coloquialismos', h);
  decir(/ninguna casa contesta|no hay pendientes/.test(h), 'y dice la verdad sobre la casa (sin red, ninguna contesta)', h);
  decir((await p.$$('#sugerencias .sug')).length >= 4, 'con sugerencias de consulta para la Junta');
  decir(/ULTRON/.test(h), 'la portada lleva el nombre');
  decir(/José Enamorado/.test(await texto('#cabecera')) && /presidente/.test(await texto('#cabecera')), 'la cabecera dice quién está y con qué cargo');
}

titulo('el tablero dice la verdad');
{
  await p.waitForFunction(() => /no se pudo leer/.test(document.getElementById('tabCasas').innerText), null, { timeout: 8000 }).catch(() => {});
  const t = await texto('#tablero');
  /* SIN RED, EL PROBLEMA ES DE QUIEN MIRA, Y SE DICE ASÍ. Antes las cinco
     casas se pintaban de rojo con «no responde»: un tablero gritando que el
     ecosistema está caído cuando lo único que pasa es que este servidor no
     pudo salir. Ahora se dice una vez, arriba, y las filas quedan neutras —
     el rojo se guarda para cuando una casa CONTESTA mal, que es lo único que
     de verdad es una avería suya. */
  decir(/Ninguna casa se pudo leer desde este servidor/.test(t),
    'sin red se dice UNA vez que el ciego es el servidor, no las cinco casas', t.slice(0, 200));
  decir(await p.evaluate(() => document.querySelectorAll('#tabCasas .casa-fila.mal').length === 0),
    'y ninguna fila se pinta de rojo: no llegar no es un fallo de la casa');
  decir(/La referencia del oro no se pudo leer/.test(t) && !/\bsin precio\b/.test(t),
    'el ORIGEN no sale con un cero ni con cinco guiones: se explica el hueco', t.slice(0, 240));
  decir(/José Enamorado/.test(t), 'la Junta aparece con sus miembros');
  decir(/sin configurar|nodo propio|Claude/.test(t), 'y el sistema dice con qué piensa');
}

titulo('pensar sin cerebro lo dice, no se cuelga');
{
  await p.fill('#entrada', 'Presente el parte del día.'); await p.press('#entrada', 'Enter');
  await p.waitForTimeout(1500);
  const h = await texto('#hilo');
  decir(/ANTHROPIC_API_KEY|cerebro/i.test(h), 'aparece el motivo en el hilo', h.slice(-200));
  decir(await p.evaluate(() => !document.getElementById('btnEnviar').disabled), 'y el compositor vuelve a quedar usable');
  decir(await p.evaluate(() => document.getElementById('portada').hidden && !document.getElementById('hilo').hidden),
    'con conversación, la portada deja paso al hilo');
  decir(await p.evaluate(() => document.getElementById('presencia').classList.contains('fondo')
    && document.getElementById('figura').classList.contains('fondo')
    && parseFloat(getComputedStyle(document.getElementById('figura')).opacity) < 0.5),
    'y la figura se atenúa para no competir con el texto');
  decir(/Buen(os|as) (días|tardes|noches), José\./.test(h), 'el saludo pasó al hilo: queda en el registro', h.slice(0, 120));
}

titulo('la voz: suena, y si no puede sonar NO se calla');
{
  /* Esto es lo que estuvo roto y no se veía: el pie decía «ULTRON está
     hablando» y no salía sonido. La causa era enrutar el `<audio>` por Web
     Audio con un contexto suspendido. Aquí se comprueba el camino entero:
     que se pida el audio, que se reproduzca, y que si NO se puede reproducir
     se diga con la voz del navegador en vez de quedarse mudo. */
  await p.evaluate(() => {
    window.__voz = { pedidas: 0, reproducidos: 0, dichoPorNavegador: [], fallos: [] };
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      if (this.volume === 0) return play.call(this);      // el desbloqueo mudo
      window.__voz.reproducidos++;
      if (window.__negarAudio) return Promise.reject(new DOMException('bloqueado', 'NotAllowedError'));
      return play.call(this);
    };
    speechSynthesis.speak = (u) => { window.__voz.dichoPorNavegador.push(u.text); setTimeout(() => u.onend?.(), 10); };
  });
  // Un WAV de verdad, corto, en lugar del mp3 de ElevenLabs.
  await p.route('**/voz', (ruta) => {
    const n = 1600;                                         // 0,2 s a 8 kHz
    const b = Buffer.alloc(44 + n); b.write('RIFF', 0); b.writeUInt32LE(36 + n, 4); b.write('WAVEfmt ', 8);
    b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(8000, 24);
    b.writeUInt32LE(8000, 28); b.writeUInt16LE(1, 32); b.writeUInt16LE(8, 34); b.write('data', 36); b.writeUInt32LE(n, 40);
    b.fill(128, 44);
    ruta.fulfill({ status: 200, contentType: 'audio/wav', body: b });
  });

  // Con audio disponible: se pide y se reproduce.
  await p.evaluate(async () => {
    const L = new VOZ.Locutor({ conElevenLabs: true, alNivel: () => {}, alEmpezar: () => {}, alTerminar: () => {} });
    L.despertar(); L.decir('Buenos días, señor presidente.'); L.cerrar();
    await new Promise((r) => setTimeout(r, 900));
  });
  decir(await p.evaluate(() => window.__voz.reproducidos >= 1), 'el audio de la casa se reproduce', String(await p.evaluate(() => window.__voz.reproducidos)));
  decir(await p.evaluate(() => window.__voz.dichoPorNavegador.length === 0), 'y no hace falta la voz del navegador');

  // Con el audio negado por el navegador: se dice igual, y se avisa.
  await p.evaluate(async () => {
    window.__negarAudio = true;
    const L = new VOZ.Locutor({ conElevenLabs: true, alNivel: () => {}, alEmpezar: () => {}, alTerminar: () => {}, alFallo: (x) => window.__voz.fallos.push(x) });
    L.decir('La compra con USDT está abierta.'); L.cerrar();
    await new Promise((r) => setTimeout(r, 900));
    window.__negarAudio = false;
  });
  decir(await p.evaluate(() => window.__voz.dichoPorNavegador.some((t) => /USDT/.test(t))),
    'si el navegador no deja reproducir, la frase se dice con su voz: nunca silencio',
    await p.evaluate(() => JSON.stringify(window.__voz.dichoPorNavegador)));
  decir(await p.evaluate(() => window.__voz.fallos.length === 1), 'y se avisa una sola vez del motivo');

  // Sin ElevenLabs configurado: tampoco se calla.
  await p.evaluate(async () => {
    window.__voz.dichoPorNavegador = [];
    const L = new VOZ.Locutor({ conElevenLabs: false, alNivel: () => {}, alEmpezar: () => {}, alTerminar: () => {} });
    L.decir('Quedo a su disposición.'); L.cerrar();
    await new Promise((r) => setTimeout(r, 400));
  });
  decir(await p.evaluate(() => window.__voz.dichoPorNavegador.length === 1), 'sin ElevenLabs, la voz del navegador dice la frase');

  // Y la figura se mueve con la voz.
  const nivel = await p.evaluate(async () => {
    let max = 0;
    const L = new VOZ.Locutor({ conElevenLabs: true, alNivel: (v) => { max = Math.max(max, v); }, alEmpezar: () => {}, alTerminar: () => {} });
    L.decir('El ORIGEN está a dos dólares con cincuenta y nueve.'); L.cerrar();
    await new Promise((r) => setTimeout(r, 900));
    return max;
  });
  decir(nivel > 0.2, 'y mientras habla, la envolvente mueve la figura', String(nivel));
  await p.unroute('**/voz');
}

titulo('los instrumentos: el catálogo entero, y cada uno a mano');
{
  await p.click('.nav[data-vista=instrumentos]'); await p.waitForTimeout(600);
  const n = await p.evaluate(() => document.querySelectorAll('.instrumento').length);
  decir(n >= 27, `el catálogo trae los 27 instrumentos (hay ${n})`);
  decir((await p.$$('#catalogo .grupo')).length >= 7, 'agrupados por lo que tocan');
  decir(await p.evaluate(() => document.getElementById('nInstrumentos').textContent === String(document.querySelectorAll('.instrumento').length)), 'y el índice cuenta los mismos');
  // calcular, a mano: el mismo camino que usa ULTRON
  await p.click('.instrumento[data-nombre=calcular] summary');
  await p.fill('.instrumento[data-nombre=calcular] input[name=expresion]', '4467.53 / 31.1035 / 55');
  await p.click('.instrumento[data-nombre=calcular] button[type=submit]');
  await p.waitForFunction(() => /2\.6115/.test(document.querySelector('.instrumento[data-nombre=calcular] .salida').textContent), null, { timeout: 5000 }).catch(() => {});
  const s = await texto('.instrumento[data-nombre=calcular] .salida');
  decir(/= 2\.6115/.test(s), 'calcular devuelve el gramín del oro', s);
  decir(/\d+ ms/.test(await texto('.instrumento[data-nombre=calcular] .ms')), 'con lo que tardó');
  // uno que escribe: anota un pendiente, y el registro se entera
  await p.click('.instrumento[data-nombre=anotar_pendiente] summary');
  await p.fill('.instrumento[data-nombre=anotar_pendiente] textarea[name=texto]', 'Fondear la caja con BNB para las salidas');
  await p.click('.instrumento[data-nombre=anotar_pendiente] button[type=submit]');
  await p.waitForFunction(() => /Anotado/.test(document.querySelector('.instrumento[data-nombre=anotar_pendiente] .salida').textContent), null, { timeout: 5000 }).catch(() => {});
  decir(/Anotado como pendiente/.test(await texto('.instrumento[data-nombre=anotar_pendiente] .salida')), 'anotar_pendiente escribe de verdad');
  decir(await p.evaluate(() => document.querySelector('.instrumento[data-nombre=anotar_pendiente] .sello').textContent === 'escribe'), 'y lleva el sello «escribe»');
  // uno sin red lo dice
  await p.click('.instrumento[data-nombre=estado_vivo] summary');
  await p.click('.instrumento[data-nombre=estado_vivo] button[type=submit]');
  await p.waitForTimeout(1200);
  decir(!/Ejecutando/.test(await texto('.instrumento[data-nombre=estado_vivo] .salida')), 'estado_vivo contesta aunque no haya red');
}

titulo('pendientes y memoria, por el API');
{
  await p.click('.nav[data-vista=pendientes]'); await p.waitForTimeout(700);
  decir(/Fondear la caja/.test(await texto('#listaPendientes')), 'el pendiente anotado desde los instrumentos aparece');
  await p.fill('#formPendiente input[name=texto]', 'Revocar el token de Heroku'); await p.click('#formPendiente button[type=submit]'); await p.waitForTimeout(600);
  decir(/Revocar el token/.test(await texto('#listaPendientes')), 'se anota uno nuevo desde el formulario');
  await p.click('#listaPendientes .item [data-cerrar]'); await p.waitForTimeout(600);
  decir((await p.$$('#listaPendientes .item')).length === 1, 'al marcarlo resuelto sale de la lista');
  await p.check('#verHechos'); await p.waitForTimeout(600);
  decir((await p.$$('#listaPendientes .item.hecho')).length === 1, 'y con «mostrar los ya cerrados» vuelve, tachado');
  decir(await p.evaluate(() => document.getElementById('nPendientes').textContent === '1'), 'el índice cuenta los abiertos');
  await p.click('#pendientes [role=tab][data-p=mem]'); await p.waitForTimeout(200);
  await p.fill('#formMemoria input[name=texto]', 'La Junta sesiona los martes'); await p.click('#formMemoria button[type=submit]'); await p.waitForTimeout(600);
  decir(/martes/.test(await texto('#listaMemorias')) && /De la Junta/.test(await texto('#listaMemorias')), 'la memoria se conserva con su alcance');
  await p.click('#listaMemorias [data-olvidar]'); await p.waitForTimeout(600);
  decir(/no conserva todavía/.test(await texto('#listaMemorias')), 'y se olvida');
}

titulo('biblioteca, bitácora, la Junta y ajustes');
{
  const memoria = require('../lib/memoria.js');
  await memoria.guardarDocumento({ titulo: 'Memorando de prueba', tipo: 'memo', markdown: '# Memorando\n\nTexto.', miembro: 'jose@ordenglobal.org' });
  await p.click('.nav[data-vista=biblioteca]'); await p.waitForTimeout(300); await p.evaluate(() => REGISTRO.documentos()); await p.waitForTimeout(600);
  decir(/Memorando de prueba/.test(await texto('#listaDocumentos')), 'el documento aparece en la biblioteca');
  decir(/PDF/.test(await texto('#listaDocumentos')), 'con el PDF a un toque, que es como un documento sale de la casa');
  await p.click('#listaDocumentos .doc'); await p.waitForTimeout(600);
  decir(await p.evaluate(() => !document.getElementById('lector').hidden && /Memorando/.test(document.getElementById('lector').innerText)), 'y se lee dentro de la consola');
  /* La descarga se pide con la sesión del navegador, no con fetch a pelo: lo
     que se prueba es el camino entero —puerta, ruta, impresor— y no la
     librería sola, que ya tiene sus pruebas aparte. */
  {
    const r = await p.evaluate(async () => {
      const doc = (await (await fetch('/documentos')).json())[0];
      const res = await fetch(`/documentos/${doc._id}/descargar?formato=pdf`);
      const b = new Uint8Array(await res.arrayBuffer());
      return { tipo: res.headers.get('content-type'), cabecera: res.headers.get('content-disposition'),
        firma: String.fromCharCode(...b.slice(0, 5)), bytes: b.length };
    });
    decir(r.tipo === 'application/pdf' && r.firma === '%PDF-', 'y al bajarlo llega un PDF de verdad', `${r.tipo} · ${r.firma} · ${r.bytes} bytes`);
    decir(/attachment; filename="Memorando-de-prueba\.pdf"/.test(r.cabecera || ''),
      'con nombre de archivo legible y sin acentos que rompan la descarga', r.cabecera);
  }
  await p.click('.nav[data-vista=bitacora]'); await p.waitForTimeout(600);
  decir(/Nueva conversación/.test(await texto('#listaConversaciones')), 'la bitácora ofrece empezar de nuevo');
  await p.click('.nav[data-vista=junta]'); await p.waitForTimeout(300);
  decir(/José Enamorado/.test(await texto('#listaJunta')) && /presidente/.test(await texto('#listaJunta')), 'la Junta lista a sus miembros con su cargo');
  await p.click('.nav[data-vista=ajustes]'); await p.waitForTimeout(400);
  decir(/Nodo propio|Claude|sin configurar/.test(await texto('#plataforma')), 'los ajustes dicen con qué piensa la plataforma');
  decir(/navegador/.test(await texto('#voces')), 'y sin ElevenLabs lo dicen, en vez de fingir voces');
}

/* Con ULTRON_FOTO puesta se guardan capturas: para MIRAR el diseño sin desplegar. */
if (process.env.ULTRON_FOTO) {
  const D = process.env.ULTRON_FOTO;
  await p.click('.nav[data-vista=despacho]'); await p.waitForTimeout(500); await p.screenshot({ path: `${D}/consola-despacho.png` });
  await p.evaluate(() => DESPACHO.nueva()); await p.waitForTimeout(1400); await p.screenshot({ path: `${D}/consola-portada.png` });
  await p.click('.nav[data-vista=instrumentos]'); await p.waitForTimeout(400); await p.screenshot({ path: `${D}/consola-instrumentos.png` });
  await p.click('.nav[data-vista=ecosistema]'); await p.waitForTimeout(400); await p.screenshot({ path: `${D}/consola-ecosistema.png` });
  await p.setViewportSize({ width: 390, height: 800 }); await p.click('#pestanas-movil [data-vista=despacho]'); await p.waitForTimeout(500); await p.screenshot({ path: `${D}/consola-movil.png` });
  await p.setViewportSize({ width: 1400, height: 900 }); await p.waitForTimeout(300);
}

titulo('a 390 px');
{
  await p.setViewportSize({ width: 390, height: 800 }); await p.click('#pestanas-movil [data-vista=despacho]'); await p.waitForTimeout(700);
  const d = await p.evaluate(() => ({ doc: document.documentElement.scrollWidth, tabs: getComputedStyle(document.getElementById('pestanas-movil')).display !== 'none', indice: getComputedStyle(document.getElementById('indice')).display === 'none' }));
  decir(d.doc <= 390, 'la página no se desplaza a lo ancho', `documento ${d.doc}px`);
  decir(d.tabs && d.indice, 'el índice se vuelve pestañas abajo');
  await p.click('#pestanas-movil [data-vista=tablero]'); await p.waitForTimeout(400);
  decir(await p.evaluate(() => getComputedStyle(document.getElementById('tablero')).display !== 'none'), 'y el tablero se abre como pantalla');
}

decir(errores.length === 0, 'sin errores de JavaScript en todo el recorrido', errores.join(' | '));
await nav.close(); sv.close();
console.log(fallos ? `\n${fallos} falla(s).` : '\nTodo en orden.');
process.exit(fallos ? 1 : 0);
