/* LA CONSOLA de la Junta, en un navegador de verdad, contra el servidor de verdad.
 *
 *   node infra/ultron/pruebas/probar-consola.mjs
 *
 * Sin cerebro, sin voz y sin red: lo que se comprueba es que la consola sea
 * una puerta, un despacho que saluda por el nombre y en registro
 * institucional, un tablero que dice «no responde» y no un cero, el catálogo
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
await p.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
await p.waitForSelector('#puerta:not([hidden])', { timeout: 10000 });
decir(await p.evaluate(() => document.getElementById('consola').hidden), 'sin sesión se ve la puerta y no la consola');
decir(/Junta Directiva/.test(await texto('#puerta')), 'y la puerta dice a quién está reservada');
await p.fill('input[name=correo]', 'jose@ordenglobal.org'); await p.fill('input[name=clave]', 'mala'); await p.click('#formPuerta button[type=submit]');
await p.waitForTimeout(600);
decir(/incorrectos/i.test(await texto('#puertaError')), 'con la clave mala lo dice');
await p.fill('input[name=clave]', 'clave-jose'); await p.click('#formPuerta button[type=submit]');
await p.waitForSelector('#consola:not([hidden])', { timeout: 8000 });
decir(true, 'con la buena entra');

titulo('el despacho saluda por el nombre, en registro institucional');
await p.waitForFunction(() => /Buen(os|as) (días|tardes|noches), José\./.test(document.getElementById('hilo').innerText), null, { timeout: 8000 }).catch(() => {});
{
  const h = await texto('#hilo');
  decir(/Buen(os|as) (días|tardes|noches), José\./.test(h), 'saluda por el nombre de pila', h);
  decir(/Quedo a su disposición\./.test(h), 'y cede la palabra en registro institucional', h);
  decir(!/¿Por dónde empezamos\?|vos|che/.test(h), 'sin coloquialismos', h);
  decir(/ninguna casa contesta|no hay pendientes/.test(h), 'y dice la verdad sobre la casa (sin red, ninguna contesta)', h);
  decir((await p.$$('#sugerencias .sug')).length >= 4, 'con sugerencias de consulta para la Junta');
  decir(/José Enamorado/.test(await texto('#cabecera')) && /presidente/.test(await texto('#cabecera')), 'la cabecera dice quién está y con qué cargo');
}

titulo('el tablero dice la verdad');
{
  await p.waitForFunction(() => /no responde/.test(document.getElementById('tabCasas').innerText), null, { timeout: 8000 }).catch(() => {});
  const t = await texto('#tablero');
  decir(/no responde/.test(t), 'las casas caídas dicen «no responde», no un cero', t.slice(0, 200));
  decir(/sin precio/.test(t), 'y el ORIGEN sale «sin precio», no con uno inventado');
  decir(/José Enamorado/.test(t), 'la Junta aparece con sus miembros');
  decir(/sin cerebro|nodo propio|Claude/.test(t), 'y el sistema dice con qué piensa');
}

titulo('pensar sin cerebro lo dice, no se cuelga');
{
  await p.fill('#entrada', 'Presente el parte del día.'); await p.press('#entrada', 'Enter');
  await p.waitForTimeout(1500);
  const h = await texto('#hilo');
  decir(/ANTHROPIC_API_KEY|cerebro/i.test(h), 'aparece el motivo en el hilo', h.slice(-200));
  decir(await p.evaluate(() => !document.getElementById('btnEnviar').disabled), 'y el compositor vuelve a quedar usable');
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
  await p.click('#listaDocumentos .doc'); await p.waitForTimeout(600);
  decir(await p.evaluate(() => !document.getElementById('lector').hidden && /Memorando/.test(document.getElementById('lector').innerText)), 'y se lee dentro de la consola');
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
