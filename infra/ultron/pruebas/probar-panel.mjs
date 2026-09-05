/* EL PANEL, en un navegador de verdad, contra el servidor de verdad.
 *
 *   node infra/ultron/pruebas/probar-panel.mjs
 *
 * Sin Anthropic: el cerebro está apagado y se comprueba que el panel LO DIGA
 * en vez de fingir. Lo que sí se recorre entero: la puerta, el pulso de la
 * casa, la memoria (guardar y olvidar), la biblioteca, y que a 360 px no se
 * salga nada. Y la presencia: que el lienzo tenga tinta —un canvas en blanco
 * no da error y es la firma de este panel.
 */
import { chromium } from 'playwright';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

let fallos = 0;
const decir = (ok, que, extra = '') => { console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${que}${extra ? '\n           ' + String(extra).replace(/\s+/g, ' ').slice(0, 200) : ''}`); if (!ok) fallos++; };
const titulo = (t) => console.log(`\n── ${t} ${'─'.repeat(Math.max(2, 58 - t.length))}`);

delete process.env.MONGODB_URI; delete process.env.ANTHROPIC_API_KEY; delete process.env.ELEVENLABS_API_KEY;
process.env.ULTRON_SECRETO = 'p';
process.env.ULTRON_JUNTA = JSON.stringify([{ nombre: 'José', correo: 'jose@ordenglobal.org', clave: 'clave-jose', rol: 'presidente' }]);
// el estado vivo sin red: cada casa «no contesta», que es un estado válido
const fetchReal = globalThis.fetch;
globalThis.fetch = async (u, o) => { if (String(u).startsWith('http://127.0.0.1')) return fetchReal(u, o); throw new Error('sin red'); };

const { app } = require('../app.js');
const sv = await new Promise((ok) => { const s = app.listen(0, '127.0.0.1', () => ok(s)); });
const BASE = `http://127.0.0.1:${sv.address().port}`;

const nav = await chromium.launch({ executablePath: process.env.ULTRON_CHROMIUM || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const p = await nav.newPage({ viewport: { width: 1380, height: 900 }, locale: 'es-HN' });
const errores = []; p.on('pageerror', (e) => errores.push(String(e.message).slice(0, 120)));
p.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|401|403|503|Failed to load resource/.test(m.text())) errores.push(m.text().slice(0, 120)); });

titulo('la puerta');
await p.goto(BASE + '/clasico/', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(1200);
decir(await p.evaluate(() => !document.getElementById('puerta').hidden && document.getElementById('panel').hidden), 'sin sesión se ve la puerta y no el panel');
decir(await p.evaluate(() => { const c = document.getElementById('presenciaPuerta'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4 * 97) if (d[i] > 10) n++; return n > 40; }), 'la presencia de la puerta tiene tinta: el lienzo no está en blanco');
await p.fill('input[name=correo]', 'jose@ordenglobal.org'); await p.fill('input[name=clave]', 'mala'); await p.click('#formPuerta button[type=submit]');
await p.waitForTimeout(600);
decir(/incorrectos/i.test(await p.textContent('#puertaError')), 'con la clave mala lo dice');
await p.fill('input[name=clave]', 'clave-jose'); await p.click('#formPuerta button[type=submit]');
await p.waitForTimeout(1800);
decir(await p.evaluate(() => document.getElementById('puerta').hidden && !document.getElementById('panel').hidden), 'con la buena entra al panel');

titulo('el panel dice la verdad sobre lo que tiene');
{
  const puntos = await p.evaluate(() => [...document.querySelectorAll('#puntos .punto')].map((x) => x.className.replace('punto ', '') + ':' + x.textContent.trim()));
  decir(puntos.some((x) => x === 'mal:cerebro'), 'cerebro en rojo: sin ANTHROPIC_API_KEY no se finge', puntos.join(' '));
  decir(puntos.some((x) => x === 'medio:memoria'), 'memoria en amarillo: provisional', puntos.join(' '));
  decir(puntos.some((x) => x === 'medio:voz'), 'voz en amarillo: del navegador');
  const vit = await p.textContent('#vitales');
  decir(/no contesta/.test(vit), 'el pulso dice «no contesta» cuando no hay red, no un cero', vit.slice(0, 120));
  decir(/ORIGEN/.test(vit) && /—/.test(vit), 'y el ORIGEN sale sin precio (—), no con uno inventado');
  const saber = await p.textContent('#saberResumen');
  decir(/\d{3} secciones/.test(saber), 'y cuánto sabe', saber.slice(0, 80));
}

titulo('la presencia y el vacío');
{
  decir(await p.evaluate(() => { const c = document.getElementById('presencia'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4 * 97) if (d[i] > 10) n++; return n > 100; }), 'la presencia del panel tiene tinta');
  decir(await p.evaluate(() => !!document.querySelector('#hilo .hero canvas')), 'al entrar hay un hero con la figura grande');
  decir(await p.evaluate(() => { const c = document.getElementById('presenciaHero'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4 * 97) if (d[i] > 10) n++; return n > 200; }), 'y la figura del hero tiene tinta');
  await p.waitForSelector('#saludoTexto.listo', { timeout: 8000 }).catch(() => {});
  const saludo = await p.textContent('#saludoTexto');
  decir(/^Buen(os|as) (días|tardes|noches), José\./.test(saludo), 'ULTRON saluda por el nombre de pila', saludo);
  decir(/pendiente/.test(saludo) && /¿Por dónde empezamos\?/.test(saludo), 'con lo que hay y una pregunta', saludo);
  decir((await p.$$('#hilo .sug')).length === 4, 'con cuatro sugerencias para empezar');
  decir(await p.evaluate(() => !!document.getElementById('heroConversar') && !!document.getElementById('conversarBtn')), 'y dos formas de empezar a hablar: en el hero y en la cabecera');
  // los datos alrededor de la figura: la presencia chica los recibe
  decir(await p.evaluate(() => datosParaPresencia().some((d) => d.k === 'PENDIENTES') && datosParaPresencia().some((d) => /ORDENEX/.test(d.k))), 'los datos del ecosistema orbitan la figura: pendientes, casas', await p.evaluate(() => datosParaPresencia().map((d) => d.k).join(',')));
}

titulo('pensar con el cerebro apagado lo dice, no se cuelga');
{
  await p.fill('#entrada', 'hola'); await p.click('#mandar');
  await p.waitForTimeout(1500);
  const t = await p.textContent('#hilo');
  decir(/ANTHROPIC_API_KEY|apagado/i.test(t), 'aparece el motivo en el hilo', t.slice(-160));
  decir(await p.evaluate(() => !document.querySelector('#hilo .hero')), 'y el hero se fue: empezó la conversación');
  decir(await p.evaluate(() => !document.getElementById('mandar').disabled || !document.getElementById('entrada').value), 'y el compositor vuelve a quedar usable');
}

titulo('los pendientes desde el panel');
{
  // Abre en pendientes: lo primero que la junta quiere ver es qué falta.
  decir(await p.evaluate(() => !document.getElementById('pPendientes').hidden && document.getElementById('pMemoria').hidden),
    'el lateral abre en pendientes, no en memoria');
  await p.fill('#nuevoPendiente', 'Fondear la caliente con ORIGEN'); await p.click('#guardarPendiente');
  await p.waitForTimeout(700);
  decir(/Fondear la caliente/.test(await p.textContent('#pendientes')), 'se anota y aparece');
  await p.click('#pendientes .caja'); await p.waitForTimeout(700);
  decir(await p.evaluate(() => !/Fondear/.test(document.getElementById('pendientes').innerText)),
    'al marcarlo hecho sale de la lista de lo que falta');
  await p.check('#verHechos'); await p.waitForTimeout(700);
  decir(await p.evaluate(() => {
    const it = [...document.querySelectorAll('#pendientes .item')].find((x) => /Fondear/.test(x.innerText));
    return !!it && it.classList.contains('hecho') && /line-through/.test(getComputedStyle(it.querySelector('.tx')).textDecorationLine + getComputedStyle(it.querySelector('.tx')).textDecoration);
  }), 'y con «ver lo ya hecho» vuelve, tachado');
  await p.uncheck('#verHechos'); await p.waitForTimeout(500);
  await p.click('.pestanas button[data-p=memoria]'); await p.waitForTimeout(300);
}

titulo('la memoria desde el panel');
{
  await p.fill('#nuevaMemoria', 'La junta se reúne los martes'); await p.click('#guardarMemoria');
  await p.waitForTimeout(700);
  const l = await p.textContent('#memorias');
  decir(/martes/.test(l) && /junta/.test(l), 'se guarda y se marca como de la junta (la frase dice «junta»)', l.slice(0, 100));
  await p.click('#memorias .x'); await p.waitForTimeout(600);
  decir(/Todavía no recuerdo/.test(await p.textContent('#memorias')), 'y se olvida');
}

titulo('la biblioteca');
{
  const memoria = require('../lib/memoria.js');
  await memoria.guardarDocumento({ titulo: 'Memo de la prueba', tipo: 'memo', markdown: '# Memo', miembro: 'jose@ordenglobal.org' });
  await p.click('.pestanas button[data-p=biblioteca]'); await p.waitForTimeout(800);
  await p.evaluate(() => cargarDocumentos()); await p.waitForTimeout(600);
  decir(/Memo de la prueba/.test(await p.textContent('#documentos')), 'el documento aparece');
  decir((await p.$$('#documentos a[href*="descargar"]')).length >= 2, 'con sus dos descargas');
}

titulo('a 360 px');
{
  await p.setViewportSize({ width: 360, height: 740 }); await p.waitForTimeout(700);
  const d = await p.evaluate(() => {
    const fuera = [];
    document.querySelectorAll('#panel *').forEach((el) => { const r = el.getBoundingClientRect(); if (r.width && r.height && r.right > 361 && getComputedStyle(el).position !== 'fixed') {
      let pa = el.parentElement, ok = false; while (pa && pa !== document.body) { if (/auto|scroll/.test(getComputedStyle(pa).overflowX)) { ok = true; break; } pa = pa.parentElement; }
      if (!ok) fuera.push(el.tagName + (el.id ? '#' + el.id : '') + ' ' + Math.round(r.right)); } });
    return { doc: document.documentElement.scrollWidth, fuera: fuera.slice(0, 5) };
  });
  decir(d.doc <= 360, 'la página no se desplaza a lo ancho', `documento ${d.doc}px`);
  decir(d.fuera.length === 0, 'y nada se sale sin riel', d.fuera.join(' · '));
  decir(await p.evaluate(() => getComputedStyle(document.getElementById('abrirDer')).display !== 'none'), 'el botón de memoria/biblioteca aparece en el teléfono');
  await p.click('#abrirDer'); await p.waitForTimeout(400);
  decir(await p.evaluate(() => document.getElementById('der').classList.contains('abierta')), 'y abre el lateral');
}

titulo('sin errores de JavaScript');
decir(errores.length === 0, 'ninguno en todo el recorrido', errores.join(' | '));

await nav.close(); await new Promise((ok) => sv.close(ok));
console.log(fallos ? `\n${fallos} comprobación(es) fallaron` : '\nTodo en verde');
process.exit(fallos ? 1 : 0);
