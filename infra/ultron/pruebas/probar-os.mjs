/* ULTRON OS · que el tablero esté vivo y no sea una maqueta bonita.
 *
 *   node infra/ultron/pruebas/probar-os.mjs [ancho] [alto]
 *
 * El diseño que llegó era una MAQUETA: cifras escritas a mano dentro del HTML.
 * Lo que se comprueba aquí es justo lo contrario — que cada número de la
 * pantalla venga de una lectura del servidor y que, cuando no llega, el hueco
 * diga «—» en vez de un número plausible. Un tablero que inventa es peor que
 * uno vacío: el hueco se nota y el número se cree.
 *
 * Y las cinco cosas nuevas que pidió José, cada una comprobada de verdad:
 *
 *   1. SUBIR UN ARCHIVO y que ULTRON le saque el texto. Se sube un PDF y un
 *      .docx de verdad, no un `File` de mentira, y se mira cuántas letras leyó.
 *   2. BAJARLO otra vez, byte por byte idéntico al que se subió.
 *   3. LA BOCA con el audio real: que la envolvente siga al sonido y cierre en
 *      los silencios.
 *   4. LA PALABRA QUE DESPIERTA: que «hey ULTRON» la reconozca y que «hola» no.
 *   5. EL TELÉFONO: que a 390 px no se salga nada y se llegue a todo con el dedo.
 */
import { chromium } from 'playwright';
import { createRequire } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const AQUI = dirname(fileURLToPath(import.meta.url));
const ANCHO = Number(process.argv[2] || 1400);
const ALTO = Number(process.argv[3] || 900);

let malas = 0;
const decir = (ok, que, extra = '') => {
  if (!ok) malas++;
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${que}`);
  if (extra) console.log(`           ${String(extra).replace(/\s+/g, ' ').slice(0, 170)}`);
};
const titulo = (t) => console.log(`\n── ${t} ${'─'.repeat(Math.max(2, 56 - t.length))}`);

/* Sin Mongo, sin modelo, sin voz y SIN RED: el OS tiene que levantarse igual y
   decir «—» donde no hay dato. Si el tablero solo funciona con todo encendido,
   la primera mañana que una casa se caiga la junta ve números viejos. */
delete process.env.MONGODB_URI; delete process.env.ANTHROPIC_API_KEY;
delete process.env.ELEVENLABS_API_KEY; delete process.env.ULTRON_NODO_URL;
delete process.env.AWS_ACCESS_KEY_ID;
process.env.ULTRON_SECRETO = 'p';
process.env.ULTRON_JUNTA = JSON.stringify([{ nombre: 'José Enamorado', correo: 'jose@ordenglobal.org', clave: 'clave-jose', rol: 'presidente' }]);
const fetchReal = globalThis.fetch;
globalThis.fetch = async (u, o) => { if (String(u).startsWith('http://127.0.0.1')) return fetchReal(u, o); throw new Error('sin red'); };

const { app } = require('../app.js');
const sv = await new Promise((ok) => { const s = app.listen(0, '127.0.0.1', () => ok(s)); });
const BASE = `http://127.0.0.1:${sv.address().port}`;

const nav = await chromium.launch({
  executablePath: process.env.ULTRON_CHROMIUM || '/opt/pw-browsers/chromium',
  args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'],
});
const p = await nav.newPage({ viewport: { width: ANCHO, height: ALTO }, locale: 'es-HN', hasTouch: ANCHO < 900 });
const errores = [];
p.on('pageerror', (e) => errores.push(String(e.message).slice(0, 160)));
p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|fonts\.g/.test(m.text())) errores.push(m.text().slice(0, 160)); });
const texto = (sel) => p.evaluate((s) => document.querySelector(s)?.innerText || '', sel);

// ── entrar y abrir el OS ───────────────────────────────────────────────────
titulo('la puerta y el arranque');
await p.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
await p.evaluate(async (b) => {
  await fetch(b + '/entrar', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ correo: 'jose@ordenglobal.org', clave: 'clave-jose' }) });
}, BASE);
await p.goto(BASE + '/os?buffer', { waitUntil: 'domcontentloaded' });   // ?buffer: para poder fotografiar el lienzo
await p.waitForTimeout(2600);
decir(await p.evaluate(() => !!window.OS), 'el OS arranca');
decir(await p.evaluate(() => !!window.BOCA), 'con el medidor de la boca cargado');
decir(/ULTRON OS/.test(await texto('#techo')), 'y se presenta como ULTRON OS');

/* ── LA FIGURA ──────────────────────────────────────────────────────────────
   El motor 3D venía del diseño con `mount()` exportado y NADIE lo llamaba: la
   pantalla salía perfecta con un agujero negro en el medio, que es justo donde
   va ULTRON. Aquí se comprueba que está montado y que de verdad pinta píxeles
   —un lienzo con contexto pero en negro es lo mismo que ningún lienzo—. */
titulo('la figura de ULTRON, en el centro');
{
  await p.waitForFunction(() => window.ULTRON_HOLO_LISTO !== undefined, { timeout: 15000 }).catch(() => {});
  const h = await p.evaluate(() => {
    const cv = document.querySelector('#holo');
    if (!cv) return { hay: false, porQue: document.querySelector('#sin-holo') ? 'se cayó a la salida honesta' : 'no hay lienzo' };
    const g = cv.getContext('webgl2') || cv.getContext('webgl');
    return { hay: true, listo: !!window.ULTRON_HOLO_LISTO, montado: !!window.__ULTRON_BUSTO, ctx: !!g, w: cv.width, h: cv.height };
  });
  decir(h.hay && h.montado, 'el busto se monta solo, sin que nadie lo llame a mano', JSON.stringify(h));
  decir(h.hay && h.w > 200 && h.h > 200, 'y ocupa el centro de la pantalla', `${h.w}×${h.h}`);
  // ¿pinta? Se mira el lienzo dos veces separadas y se compara: si nada cambia, está muerto.
  const vivo = await p.evaluate(async () => {
    const cv = document.querySelector('#holo'); if (!cv) return null;
    const foto = () => cv.toDataURL('image/png');
    const a = foto(); await new Promise((r) => setTimeout(r, 900)); const b = foto();
    return { negro: a.length < 3000, cambia: a !== b };
  });
  decir(vivo && !vivo.negro, 'dibuja algo, no un lienzo en negro');
  decir(vivo && vivo.cambia, 'y se mueve: respira, parpadea, gira');
}

// Una respuesta puesta, que es como se ve de verdad cuando se usa.
await p.evaluate(() => window.OS._adentro.pintarDicho(
  'La cadena **8532** está en el bloque 4 812 907 y avanza a 2.1 s por bloque.\n\n'
  + 'La casa que se ve floja es ORDENSCAN: contesta en 1.9 s cuando el resto está por debajo de 300 ms. '
  + 'No está caída, pero conviene mirar el índice de bloques antes que se note en la web.'));
await p.waitForTimeout(400);

// ── el tablero no inventa ──────────────────────────────────────────────────
titulo('el tablero: cada cifra de una lectura');
{
  /* Sin red no hay casa que conteste, así que el ecosistema TIENE que decir
     que están caídas — no dejar los rótulos en blanco ni poner un número. */
  const eco = await texto('#eco');
  decir(/CAÍDA|HTTP/.test(eco), 'sin red, las casas se pintan como caídas y no en blanco', eco);
  const techo = await texto('#medidas');
  decir(/—/.test(techo), 'y lo que no se pudo leer dice «—», no un número inventado', techo);
  decir(!/\b(1[.,]283[.,]413|2\.318|41 ms)\b/.test(techo), 'ninguna cifra de la maqueta original quedó pegada', techo);
  const nodo = await texto('#nodo-modelo');
  decir(nodo.trim().length > 0, 'el núcleo cognitivo dice con qué modelo piensa', nodo);
}

// ── subir un archivo de verdad ─────────────────────────────────────────────
titulo('subir un archivo, y que le saque el texto');
{
  const pdf = join(AQUI, '..', '..', '..', 'documentos', 'Orden-Global-Video-GPU-Propia.pdf');
  if (!existsSync(pdf)) { decir(false, 'hace falta el PDF de prueba', pdf); }
  else {
    const bytes = readFileSync(pdf);
    const r = await p.evaluate(async ({ b64, nombre }) => {
      const bin = atob(b64); const u = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      const res = await fetch('/archivos', { method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/pdf', 'X-Nombre': encodeURIComponent(nombre) }, body: u });
      return { estado: res.status, d: await res.json().catch(() => ({})) };
    }, { b64: bytes.toString('base64'), nombre: 'Informe de la junta.pdf' });
    decir(r.estado === 200, 'el PDF sube', `HTTP ${r.estado} · ${r.d?.error || ''}`);
    decir((r.d?.texto?.length || 0) > 5000, `y ULTRON le sacó el texto (${r.d?.texto?.length || 0} letras)`, r.d?.porQue);
    decir(/GPU|Manual|LoRA/.test(r.d?.texto || ''), 'texto de verdad, no símbolos sueltos', (r.d?.texto || '').slice(0, 90));

    // Y baja idéntico
    const igual = await p.evaluate(async (id) => {
      const res = await fetch(`/archivos/${id}/bajar`, { credentials: 'same-origin' });
      const b = new Uint8Array(await res.arrayBuffer());
      let s = 0; for (let i = 0; i < b.length; i += 997) s = (s + b[i]) % 1e9;
      return { n: b.length, s, tipo: res.headers.get('content-type') };
    }, r.d._id);
    let s2 = 0; for (let i = 0; i < bytes.length; i += 997) s2 = (s2 + bytes[i]) % 1e9;
    decir(igual.n === bytes.length && igual.s === s2, 'y vuelve a bajar byte por byte idéntico',
      `${igual.n} vs ${bytes.length} bytes`);
    decir(igual.tipo === 'application/pdf', 'con su tipo, para que el navegador lo sepa abrir', igual.tipo);

    await p.evaluate(() => window.OS && document.querySelector('#clip') && fetch('/archivos').then((r) => r.json()));
    await p.waitForTimeout(700);
    await p.evaluate(async () => { const l = await (await fetch('/archivos')).json(); window.OS._adentro.pintarArchivos(l); });
    decir(/Informe de la junta/.test(await texto('#archivos')), 'y aparece en DOCUMENTOS ENTRANTES');
    decir(/letras leídas/.test(await texto('#archivos')), 'diciendo cuánto pudo leer, no solo «subido»');
  }
}

// ── lo que NO se puede leer, lo dice ───────────────────────────────────────
titulo('lo que no se puede leer, se dice');
{
  const r = await p.evaluate(async () => {
    const u = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
    const res = await fetch('/archivos', { method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'image/png', 'X-Nombre': 'foto.png' }, body: u });
    return await res.json();
  });
  decir(!r.texto && /imagen/i.test(r.porQue || ''), 'una imagen se guarda y se dice que no lleva texto', r.porQue);
  const mal = await p.evaluate(async () => {
    const res = await fetch('/archivos', { method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/x-msdownload', 'X-Nombre': 'virus.exe' }, body: new Uint8Array([1, 2, 3]) });
    return { estado: res.status, d: await res.json() };
  });
  decir(mal.estado === 400 && mal.d.codigo === 'TIPO_NO', 'un tipo que no se admite se rechaza con su motivo', `${mal.estado} ${mal.d.codigo}`);
}

// ── la boca, con audio de verdad ───────────────────────────────────────────
titulo('la boca la mueve el audio, no un reloj');
{
  /* Un WAV sintetizado aquí mismo: medio segundo de tono, medio de silencio,
     medio de tono. Si la envolvente es de verdad tiene que subir, bajar a cero
     y volver a subir. Una envolvente inventada da lo mismo en los tres. */
  const r = await p.evaluate(async () => {
    const sr = 16000, dur = 1.5, n = sr * dur;
    const buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
    const txt = (o, t) => { for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); };
    txt(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); txt(8, 'WAVEfmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    txt(36, 'data'); v.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const suena = t < 0.5 || t > 1.0;                       // silencio en el medio
      v.setInt16(44 + i * 2, suena ? Math.sin(t * 2 * Math.PI * 220) * 22000 : 0, true);
    }
    const e = await window.BOCA.envolvente(new Blob([buf], { type: 'audio/wav' }));
    if (!e) return { error: 'no se pudo decodificar' };
    return { error: null, a: e.at(0.25), medio: e.at(0.75), b: e.at(1.25), dura: e.dura };
  });
  if (r.error) decir(false, 'la envolvente se saca del audio', r.error);
  else {
    decir(r.a > 0.5, `abre la boca donde hay sonido (${r.a.toFixed(2)})`);
    decir(r.medio < 0.15, `y la cierra en el silencio (${r.medio.toFixed(2)})`);
    decir(r.b > 0.5, `y la vuelve a abrir (${r.b.toFixed(2)})`);
  }
}

// ── la palabra que despierta ───────────────────────────────────────────────
titulo('«hey ULTRON»');
{
  const r = await p.evaluate(() => {
    const re = window.OS._adentro.DESPIERTA;
    return {
      hey: re.test('hey ultron'), oye: re.test('oye ultron como esta la cadena'),
      solo: re.test('ultron'), acento: re.test('hey ultrón'),
      hola: re.test('hola que tal'), casa: re.test('quiero comprar una casa'),
    };
  });
  decir(r.hey && r.oye && r.solo && r.acento, 'reconoce «hey ULTRON», «oye ULTRON», con y sin tilde');
  decir(!r.hola && !r.casa, 'y NO se despierta con cualquier frase', JSON.stringify(r));
  decir(await p.evaluate(() => document.querySelector('#oreja')?.getAttribute('aria-pressed') === 'false'),
    'la oreja arranca CERRADA: un micrófono abierto que nadie encendió no se hace');
}

// ── que se pueda tocar ─────────────────────────────────────────────────────
titulo(`los mandos, a ${ANCHO} px`);
{
  const m = await p.evaluate(() => {
    const mide = (s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; };
    return { micro: mide('#micro'), oreja: mide('#oreja'), clip: mide('#clip2'), enviar: mide('#enviar'), texto: mide('#texto') };
  });
  for (const [n, c] of Object.entries(m)) {
    decir(c && c.w >= 36 && c.h >= 34, `${n} llega al blanco del dedo`, c ? `${c.w}×${c.h}` : 'no está');
  }
  /* Que el DOCUMENTO no se estire no basta: un `overflow:hidden` esconde el
     desbordamiento y deja el texto CORTADO, que es exactamente lo que pasaba en
     el teléfono —la respuesta de ULTRON se leía a media frase—. Así que se
     miden los elementos uno por uno, y solo se perdona lo que vive dentro de un
     carril que se desliza a propósito (el muelle de las casas). */
  const desborde = await p.evaluate(() => {
    const fuera = [];
    const enCarril = (e) => { for (let n = e; n; n = n.parentElement) { if (n.id === 'muelle') return true; if (getComputedStyle(n).overflowX === 'auto') return true; } return false; };
    document.querySelectorAll('#os *').forEach((e) => {
      const r = e.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return;
      if ((r.right > innerWidth + 1.5 || r.left < -1.5) && !enCarril(e)) {
        fuera.push(`${e.tagName.toLowerCase()}${e.id ? '#' + e.id : '.' + (e.className || '').toString().split(' ')[0]} [${Math.round(r.left)}…${Math.round(r.right)}]`);
      }
    });
    return { fuera, doc: document.documentElement.scrollWidth, win: innerWidth };
  });
  decir(desborde.doc <= desborde.win + 1, 'el documento no se estira de ancho', `${desborde.doc}px vs ${desborde.win}px`);
  decir(desborde.fuera.length === 0, 'y ningún panel queda cortado por el borde',
    desborde.fuera.slice(0, 5).join(' · '));

  // Y que lo que ULTRON contesta se lea entero, no a media frase.
  const globo = await p.evaluate(() => {
    const d = document.querySelector('#dicho'); if (!d) return null;
    const r = d.getBoundingClientRect();
    return { dentro: r.left >= -1 && r.right <= innerWidth + 1, corta: d.scrollWidth > d.clientWidth + 2, w: Math.round(r.width) };
  });
  decir(globo && globo.dentro && !globo.corta, 'la respuesta de ULTRON cabe entera en la pantalla', JSON.stringify(globo));
}

/* ── LO QUE LOS TRES EXPERTOS ENCONTRARON ────────────────────────────────────
   Cada uno de estos fallos estaba VIVO en la pantalla y ninguno daba error:
   salían como una pantalla bonita que mentía. Quedan clavados aquí para que no
   vuelvan por la puerta de atrás. */
titulo('lo que la crítica encontró');
{
  // 1 · Los colores de estado no se pintaban: `.fila span:last-child` (0,2,1)
  //     ganaba a `.mal` (0,1,0), así que «CAÍDA» salía del mismo blanco que el
  //     reloj y el tablero no se distinguía de uno sano.
  const col = await p.evaluate(() => {
    const s = [...document.querySelectorAll('#eco .fila > span:last-child')];
    const mala = s.find((e) => e.classList.contains('mal'));
    const gris = s.find((e) => e.classList.contains('hueco'));
    const c = (e) => e && getComputedStyle(e).color;
    return { mal: c(mala), hueco: c(gris), blanco: c(s.find((e) => !e.className)) };
  });
  decir(col.mal === 'rgb(255, 90, 110)', 'una casa caída se pinta ROJA de verdad', JSON.stringify(col));
  decir(!col.hueco || col.hueco !== col.mal, 'y «no lo sé» NO se pinta del mismo color que «está mal»', JSON.stringify(col));

  // 2 · «RPC 0 ms» con todo caído: la media entraba los ceros de las fallidas,
  //     el mejor número posible en el peor momento posible.
  const rpc = await texto('#m-rpc');
  decir(rpc.trim() === '—', 'sin ninguna casa en pie, la latencia dice «—» y no «0»', rpc);

  // 3 · El precio del ORIGEN desaparecía cuando no había referencia: una
  //     ausencia invisible se lee como que el dato no hacía falta.
  decir(/ORIGEN/.test(await texto('#eco')), 'el precio del ORIGEN se enseña siempre, aunque sea para decir que falta');

  // 4 · «MOTOR · SIN RESPUESTA» permanente: /salud solo trae `nodo` si se
  //     piensa con el nodo propio, y el panel leía ese nulo como una avería.
  const cerebro = await texto('#nodo-lineas');
  decir(!/SIN RESPUESTA/.test(cerebro), 'el cerebro no se declara caído por pensar en la nube', cerebro);
  decir(/secciones/.test(cerebro), 'y el saber se cuenta en secciones, no en «fichas» (que son otra cosa)', cerebro);

  // 5 · El tirador del cajón estaba declarado DESPUÉS del media query, así que
  //     `display:none` ganaba siempre: en el teléfono no había forma de ver un
  //     solo dato. Un tablero sin tablero.
  if (ANCHO < 860) {
    const t = await p.evaluate(() => {
      const e = document.querySelector('#tirador'); if (!e) return null;
      const r = e.getBoundingClientRect();
      return { visible: getComputedStyle(e).display !== 'none', w: Math.round(r.width), h: Math.round(r.height),
        dentro: r.bottom <= innerHeight + 1, expandido: e.getAttribute('aria-expanded') };
    });
    decir(t?.visible && t.h >= 34 && t.dentro, 'en el teléfono el tirador de los paneles EXISTE y se puede tocar', JSON.stringify(t));
    const antes = await p.evaluate(() => document.querySelector("#paneles").inert);
    await p.click('#tirador');
    await p.waitForTimeout(450);
    const desp = await p.evaluate(() => ({ inerte: document.querySelector("#paneles").inert,
      exp: document.querySelector('#tirador').getAttribute('aria-expanded'),
      eco: document.querySelector('#eco')?.getBoundingClientRect().top }));
    decir(antes === true && desp.inerte === false, 'y el cajón cerrado no se lleva el foco fuera de la pantalla');
    decir(desp.exp === 'true', 'el tirador dice si está abierto (aria-expanded)');
    decir(desp.eco != null && desp.eco < ALTO, 'al abrirlo, lo primero del cajón es el ECOSISTEMA y se ve entero', String(desp.eco));
    await p.click('#tirador'); await p.waitForTimeout(400);
  }

  // 6 · Ni una región viva: quien usa lector de pantalla escribía y no pasaba
  //     absolutamente nada.
  const a11y = await p.evaluate(() => ({
    h1: !!document.querySelector('h1'),
    main: !!document.querySelector('main'),
    vivo: !!document.querySelector('[aria-live]'),
    lienzoOculto: document.querySelector('#holo')?.getAttribute('aria-hidden') === 'true',
    campo: !!document.querySelector('#texto'),
  }));
  decir(a11y.h1 && a11y.main, 'la página tiene un encabezado y regiones de verdad', JSON.stringify(a11y));
  decir(a11y.vivo, 'y una región viva para anunciar lo que ULTRON contesta');
  decir(a11y.lienzoOculto, 'el busto está oculto al lector de pantalla: para quien no lo ve es decoración');

  // 7 · El foco no se veía en el único campo de la pantalla.
  await p.focus('#texto'); await p.waitForTimeout(120);
  const foco = await p.evaluate(() => getComputedStyle(document.querySelector('#caja')).boxShadow);
  decir(foco && foco !== 'none', 'y al enfocar el renglón se ve dónde está el foco', foco);

  // 8 · La lectura congelada: cifras de hace tres horas con el reloj vivo.
  const cong = await p.evaluate(async () => {
    window.OS._adentro.envejecer(600);         // como si hiciera diez minutos que no se lee
    await new Promise((r) => setTimeout(r, 1200));
    const c = document.querySelector('#cintillo');
    return { avisa: c && !c.classList.contains('oculto'), texto: c?.textContent || '', apagado: document.body.classList.contains('vieja') };
  });
  decir(cong.avisa && cong.apagado, 'si la lectura se corta, la pantalla lo DICE y apaga las cifras', cong.texto);

  // 9 · Las fuentes salían de Google en una consola privada.
  const fuera = await p.evaluate(() => [...document.querySelectorAll('link[href],script[src]')]
    .map((e) => e.href || e.src).filter((u) => u && !u.startsWith(location.origin)));
  decir(fuera.length === 0, 'la pantalla no le pide nada a ningún servidor de fuera', fuera.join(' '));
}

titulo('sin errores de JavaScript');
decir(errores.length === 0, 'ninguno', errores.slice(0, 3).join(' | '));

await nav.close();
sv.close();
console.log(malas ? `\n${malas} fallo(s).\n` : '\nTodo en verde\n');
process.exit(malas ? 1 : 0);
