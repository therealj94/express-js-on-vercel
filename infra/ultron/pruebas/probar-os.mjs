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
const innerAncho = (a) => a;
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
// ── LA VOZ ──────────────────────────────────────────────────────────────────
// El 6-sep, en el iPad de José: ULTRON no hablaba NUNCA. `sonar()` creaba un
// `new Audio()` por frase y en iOS el permiso de reproducción es del ELEMENTO
// que sonó dentro de un gesto — uno recién creado no lo tiene. Se comprueba que
// hay UN solo elemento y que sobrevive a `callar()`.
titulo('la voz: un solo elemento de audio, que es lo que iOS exige');
{
  const v = await p.evaluate(async () => {
    const L = new VOZ.Locutor({ conElevenLabs: false, alNivel() {}, alEmpezar() {}, alTerminar() {}, alFallo() {} });
    const primero = L.audio;
    L.despertar();
    await new Promise((r) => setTimeout(r, 350));
    const n = 800, b = new ArrayBuffer(44 + n), d = new DataView(b);
    const t = (o, s) => { for (let i = 0; i < s.length; i++) d.setUint8(o + i, s.charCodeAt(i)); };
    t(0, 'RIFF'); d.setUint32(4, 36 + n, true); t(8, 'WAVEfmt ');
    d.setUint32(16, 16, true); d.setUint16(20, 1, true); d.setUint16(22, 1, true);
    d.setUint32(24, 8000, true); d.setUint32(28, 8000, true); d.setUint16(32, 1, true); d.setUint16(34, 8, true);
    t(36, 'data'); d.setUint32(40, n, true);
    for (let i = 0; i < n; i++) d.setUint8(44 + i, 128);
    await L.sonar(new Blob([b], { type: 'audio/wav' }), L.generacion, 'una');
    const trasSonar = L.audio;
    L.callar();
    return { uno: primero === trasSonar && trasSonar === L.audio, desbloqueado: L.desbloqueado, inline: !!primero.playsInline };
  });
  decir(v.uno, 'el mismo elemento de audio para toda la sesión, y sobrevive a callar()', JSON.stringify(v));
  decir(v.desbloqueado, 'y el gesto lo desbloquea de verdad (el WAV mudo lleva muestras)');
  decir(v.inline, 'con playsInline: en iOS, si no, se abre el reproductor a pantalla completa');
}

/* ── LA DESPENSA DE LA VOZ ────────────────────────────────────────────────────
   «¿Será si agregamos caché? Que sea más fluido; la voz está tardando.»
   Medido en producción, cada frase cuesta entre 0,25 y 0,75 s, y casi todo eso
   es el viaje: el servidor ya tiene el audio hecho. ULTRON dice muchas frases
   que ya dijo —el saludo entero, las muletillas, «quedo a su disposición»—, así
   que la segunda vez no puede volver a viajar. */
titulo('la voz suena mientras baja, y la siguiente se calienta mientras suena ésta');
{
  /* ── LO QUE COSTABA ────────────────────────────────────────────────────────
     El mp3 se esperaba ENTERO dos veces —el servidor a ElevenLabs, y el
     navegador al servidor— antes de que sonara un solo byte. Y la primera frase
     no se pedía hasta que el modelo escribía su punto final.
     Ahora el audio se pide por DIRECCIÓN y la etiqueta de audio empieza a sonar
     con los primeros kilobytes; la primera frase se corta por cláusula para
     pedirla antes; y las de detrás se calientan mientras suena la de delante. */
  const r = await p.evaluate(async () => {
    const L = new VOZ.Locutor({ conElevenLabs: true, alNivel() {}, alEmpezar() {}, alTerminar() {}, alFallo() {} });
    L.vozId = 'vozDePrueba';
    const url = L.urlDe('Quedo a su disposición.');
    L.vozId = 'otraVoz';
    const otra = L.urlDe('Quedo a su disposición.');
    /* El corte rápido: la primera frase vale cortada por coma pasadas 55
       letras; de la segunda en adelante se espera al punto. */
    const largo = 'La cadena cinco mil quinientos cincuenta va en el bloque noventa y seis mil, y avanza dos segundos por bloque sin problemas.';
    const rapido = VOZ.partirFrases(largo, { corteRapido: true });
    const normal = VOZ.partirFrases(largo, { corteRapido: false });
    /* El caso de verdad: el modelo todavía está escribiendo y no hay punto. */
    const aMedias = VOZ.partirFrases(largo.replace(/\.$/, ' y el explorador'), { corteRapido: true });
    const aMediasNormal = VOZ.partirFrases(largo.replace(/\.$/, ' y el explorador'), { corteRapido: false });
    return { url, otra, rapido: rapido.frases, normal: normal.frases, aMedias, aMediasNormal };
  });
  decir(/^\/voz\?/.test(r.url) && /t=/.test(r.url) && /v=vozDePrueba/.test(r.url),
    'cada frase tiene su dirección, con la voz dentro', r.url.slice(0, 80));
  decir(r.url !== r.otra, 'y con otra voz la dirección cambia: nunca sale la voz anterior guardada');
  decir(r.rapido.length === 2 && /,$/.test(r.rapido[0]) && r.rapido[0].length < r.normal[0].length,
    'la PRIMERA frase se parte en la coma: el primer audio es más corto y suena antes; el resto va detrás',
    `${r.rapido[0].length} letras en vez de ${r.normal[0].length}`);
  decir(r.normal.length === 1 && /\.$/.test(r.normal[0]),
    'y de la segunda en adelante se espera al punto, que es lo que suena bien', JSON.stringify(r.normal).slice(0, 70));
  decir(r.aMedias.frases.length === 1 && /,$/.test(r.aMedias.frases[0]),
    'y con la frase todavía a medias —que es el caso real— también corta por la coma', JSON.stringify(r.aMedias.frases));
  decir(r.aMediasNormal.frases.length === 0,
    'sin corte rápido, esa misma frase a medias no suelta nada y se espera al punto');

  /* La primera NO se calienta —va en vivo, que es lo que la hace instantánea—
     y las de detrás sí, para que no haya hueco entre una y otra. */
  const c = await p.evaluate(async () => {
    const pedidas = [];
    const real = window.fetch;
    window.fetch = (u, o) => { if (String(u).startsWith('/voz?')) { pedidas.push(String(u)); return Promise.resolve(new Response(new Blob([new Uint8Array([1, 2, 3])]), { status: 200 })); } return real(u, o); };
    try {
      const L = new VOZ.Locutor({ conElevenLabs: true, alNivel() {}, alEmpezar() {}, alTerminar() {}, alFallo() {} });
      L.sonar = () => new Promise((ok) => setTimeout(ok, 30));   // no se suena de verdad en la prueba
      L.alimentar('Primera frase de la respuesta. Segunda frase. Tercera frase. ');
      await new Promise((ok) => setTimeout(ok, 400));
      return { pedidas: pedidas.length, cola: L.cola.length };
    } finally { window.fetch = real; }
  });
  decir(c.pedidas >= 1 && c.pedidas <= 3, 'se calientan las de detrás, de dos en tres, no todas de golpe', `${c.pedidas} calentadas`);
}

titulo('la figura de ULTRON, en el centro');
{
  await p.waitForFunction(() => window.ULTRON_HOLO_LISTO !== undefined, { timeout: 15000 }).catch(() => {});
  const h = await p.evaluate(() => {
    const cv = document.querySelector('#holo');
    if (!cv) return { hay: false, porQue: document.querySelector('#sin-holo') ? 'se cayó a la salida honesta' : 'no hay lienzo' };
    /* Desde la revisión 2 el centro es el NÚCLEO en lienzo 2D, no el busto en
       WebGL: se pide el contexto 2d, que es el que de verdad usa. */
    const g = cv.getContext('2d') || cv.getContext('webgl2') || cv.getContext('webgl');
    return { hay: true, listo: !!window.ULTRON_HOLO_LISTO, figura: window.__ULTRON_FIGURA || null, montado: !!window.__ULTRON_FIGURA_VIVA, ctx: !!g, w: cv.width, h: cv.height };
  });
  decir(h.hay && h.montado, 'la figura se monta sola, sin que nadie la llame a mano', JSON.stringify(h));
  decir(h.figura === 'nucleo', 'y la que sale por omisión es el núcleo, no el busto', String(h.figura));
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
  'La cadena **5550** está en el bloque 96 828 y avanza a 2.1 s por bloque.\n\n'
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
titulo('EL NEGOCIO: el tablero enseña por fin una cifra de negocio');
{
  /* El tablero tenía once paneles y ninguno de negocio: se veía si cada casa
     CONTESTA, no a cuánto está el ORIGEN, si la puerta del dinero está abierta
     ni si las listas de cumplimiento están al día. Ni una de estas cifras es
     nueva: todas venían en /vivo y se tiraban. */
  const r = await p.evaluate(() => {
    OS._adentro.pintarNegocio({
      origen: { origenUsd: 2.587519, oroOnzaUsd: 4426.45, fuente: 'coingecko' },
      ordenex: { compraUsdt: 'abierta', cadena: true, mercados: [{ mercado: 'AUKA-ORIGEN', mejorVenta: 4365.3, enOrigen: 1710.69, ultimo: null }] },
      aucorp: { sanciones: { registros: 19321, fechaDescarga: '2026-09-02', vencidas: false }, tasas: true, tasasCuando: '2026-09-06T00:02:31.000Z' },
      genesis: { enRegla: false, leFalta: ['bitácora sin firmar', 'segundo factor sin activar en 3 operadores'] },
    });
    return { t: document.querySelector('#negocio').innerText, sub: document.querySelector('#neg-sub').textContent };
  });
  decir(/2[.,]587519/.test(r.t), 'el precio del ORIGEN, con los decimales que hacen falta para verlo mover', r.t.split('\n')[1]);
  decir(/4[.,\s]?426[.,]45/.test(r.t), 'y la onza de oro que lo referencia', JSON.stringify(r.t.slice(0, 160)));
  decir(/ABIERTA/.test(r.t), 'si la puerta del dinero está abierta: lo primero antes de decirle a alguien que mande dinero');
  decir(/AUKA/.test(r.t) && /piden 4[.,]?365[.,]30/.test(r.t) && /vale 1[.,]?710[.,]69/.test(r.t),
    'a qué precio se puede vender hoy: la mejor oferta y lo que vale de referencia',
    r.t.split('\n').filter((l) => /AUKA|piden|vale/.test(l)).join(' · '));
  decir(/19[.,\s]?321/.test(r.t) && /2026-09-02/.test(r.t), 'las listas de sanciones, con su fecha', JSON.stringify(r.t.slice(-220)));
  decir(/bitácora sin firmar/.test(r.t), 'y lo que le falta a Genesis para estar en regla, con todas las letras');
  decir(/2[.,]5875/.test(r.sub) && /abierta/.test(r.sub), 'el resumen del panel dice lo mismo sin abrirlo', r.sub);

  /* Y lo que NO se leyó dice «—», como en todo el tablero: un hueco se nota y
     un número plausible se cree. */
  const vacio = await p.evaluate(() => {
    OS._adentro.pintarNegocio(null);
    return { t: document.querySelector('#negocio').innerText, sub: document.querySelector('#neg-sub').textContent };
  });
  decir(!/\d/.test(vacio.t.replace(/ORIGEN|AUKA/g, '')) || /—/.test(vacio.t), 'sin lectura no inventa un precio: pone «—»', vacio.t.split('\n').slice(0, 3).join(' / '));
  decir(/sin lectura/.test(vacio.sub), 'y lo dice en el rótulo del panel', vacio.sub);
}

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

/* ── LOS BYTES COMO LOS DEVUELVE MONGO ───────────────────────────────────────
   Este fallo llegó a producción porque la prueba probaba el camino equivocado:
   sin Mongo los archivos van al almacén de memoria, donde los bytes son un
   Buffer de verdad. Con Mongo, `.lean()` devuelve un `Binary` de BSON, y en un
   Binary `.length` es una FUNCIÓN: la cabecera Content-Length salía inválida,
   la excepción subía sin atrapar y —Express 4 con un manejador `async`— se
   llevaba por delante el proceso entero. La junta se quedaba sin consola por
   una descarga.
   Aquí se mete un Binary a mano en el almacén y se comprueba que baja bien. */
titulo('los bytes tal como los devuelve Mongo');
{
  const { Binary } = require('bson');
  const archivos = require('../lib/archivos.js');
  const original = Buffer.from('Informe de la Junta · con acentos y ñ.\nSegunda línea.', 'utf8');
  const guardado = await archivos.guardar({
    nombre: 'binario.txt', tipo: 'text/plain', buf: original, miembro: 'jose@ordenglobal.org',
  });
  // se sustituye el Buffer por un Binary, que es lo que llega desde la base
  archivos._adentro.provisional[0].crudo = new Binary(original);
  const r = await p.evaluate(async (id) => {
    const res = await fetch(`/archivos/${id}/bajar`, { credentials: 'same-origin' });
    return { estado: res.status, largo: res.headers.get('content-length'), texto: await res.text() };
  }, guardado._id);
  decir(r.estado === 200, 'un archivo guardado como Binary de BSON baja igual', `HTTP ${r.estado}`);
  decir(r.texto === original.toString('utf8'), 'y sale byte por byte como entró', r.texto?.slice(0, 40));
  decir(String(r.largo) === String(original.length), 'con un Content-Length numérico, no una función', `${r.largo} vs ${original.length}`);
  decir(await p.evaluate(() => fetch('/vivo', { credentials: 'same-origin' }).then((x) => x.ok)),
    'y el servidor SIGUE EN PIE después (antes se llevaba la casa entera)');
  await p.evaluate((id) => fetch(`/archivos/${id}`, { method: 'DELETE', credentials: 'same-origin' }), guardado._id);
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
  /* La regla no cambió, cambió cómo se cumple. En «conversación» el micrófono
     se abre solo después del saludo —José lo pidió—, pero SOLO si el permiso ya
     estaba dado de antes. Sin permiso concedido, la oreja arranca cerrada: nunca
     se le saca a nadie un permiso que no pidió. Aquí no hay permiso, así que
     tiene que estar cerrada. */
  decir(await p.evaluate(() => document.querySelector('#oreja')?.getAttribute('aria-pressed') === 'false'),
    'sin permiso de micrófono la oreja arranca CERRADA: no se saca un permiso que nadie pidió');
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

/* ── EL DUEÑO EN EL PANEL ────────────────────────────────────────────────────
   ULTRON pide; el dueño aprueba con un clic viendo el resumen exacto. Aquí se
   crea un pedido por dentro y se comprueba que el panel lo enseña, que el
   botón aprueba de verdad (la ruta cambia el estado) y que la bóveda se abre
   sin enseñar jamás un valor. */
titulo('el dueño: aprobar con un clic');
{
  const permisos = require('../lib/permisos.js');
  // En el teléfono los paneles viven en el cajón: se abre antes de tocar nada.
  if (ANCHO < 860) { await p.click('#tirador'); await p.waitForTimeout(450); }
  const pedido = await permisos.pedir({ actor: { correo: 'jose@ordenglobal.org' }, herramienta: 'terminal', entrada: { comando: 'npm audit' }, motivo: 'revisar dependencias' });
  await p.evaluate(async () => { const d = await (await fetch('/autorizaciones', { credentials: 'same-origin' })).json(); window.OS._adentro.pintarAutorizaciones(d); });
  await p.waitForTimeout(200);
  const panel = await texto('#autorizaciones');
  decir(/npm audit/.test(panel) && /revisar dependencias/.test(panel), 'el pedido aparece con el comando exacto y el motivo', panel);
  decir(/1 esperando.*\(usted\)/.test(await texto('#dueno-sub')), 'y el panel sabe que quien mira es el dueño', await texto('#dueno-sub'));
  /* Con el localizador, no con el elemento: el panel se vuelve a pintar cada
     treinta segundos y un elemento guardado puede quedar suelto del DOM entre
     medirlo y tocarlo. El localizador se resuelve otra vez al tocar. */
  const boton = p.locator('#autorizaciones .btn.si').first();
  await boton.waitFor({ state: 'visible', timeout: 8000 }).catch(() => {});
  decir((await boton.count()) === 1, 'el dueño ve el botón APROBAR');
  /* El panel se vuelve a pintar con cada lectura; si la medida cae en medio,
     se mide otra vez. Una medida nula no es un botón chico. */
  let box = await boton.boundingBox();
  if (!box) { await p.waitForTimeout(400); box = await boton.boundingBox(); }
  decir(box && box.height >= 32, 'y llega al blanco del dedo', box && `${Math.round(box.width)}×${Math.round(box.height)}`);
  await boton.click();
  await p.waitForTimeout(900);
  const despues = (await permisos.lista({ limite: 5 })).find((x) => String(x._id) === String(pedido._id));
  decir(despues?.estado === 'aprobado' && despues.resueltoPor === 'jose@ordenglobal.org', 'el clic aprueba de verdad, firmado por el dueño', despues?.estado);
  /* LA BÓVEDA. En pantalla ancha, desde el chip del panel del dueño. En el
     teléfono ese chip ya no está —el panel vive dentro del cajón y el chip
     medía once píxeles entre otros dos—: se llega desde AJUSTES, que es donde
     se buscan las cosas de uno. Se comprueba el camino que toca a cada ancho. */
  const chipBoveda = await p.evaluate(() => {
    const b = document.querySelector('#b-boveda');
    return !!b && getComputedStyle(b).display !== 'none';
  });
  decir(ANCHO < 860 ? !chipBoveda : chipBoveda, ANCHO < 860
    ? 'en el teléfono la bóveda NO está en el panel del dueño'
    : 'en pantalla ancha la bóveda sigue en el panel del dueño');
  if (chipBoveda) await p.click('#b-boveda');
  else {
    await p.click('#m-ajustes');
    await p.waitForFunction(() => document.querySelector('#aj-boveda'), { timeout: 9000 }).catch(() => {});
    await p.click('#aj-boveda');
  }
  await p.waitForFunction(() => /BÓVEDA/.test(document.querySelector('#dialogo')?.innerText || ''), { timeout: 9000 }).catch(() => {});
  const dlg = await texto('#dialogo');
  decir(/LA BÓVEDA/.test(dlg), 'la bóveda se abre desde el panel');
  decir(/APAGADA/.test(dlg) || /cifran aquí/.test(dlg), 'y dice si está encendida o qué falta para encenderla', dlg.slice(0, 120));
  const tipo = await p.evaluate(() => document.querySelector('#bv-valor')?.type || 'no hay campo (apagada)');
  decir(tipo === 'password' || tipo.startsWith('no hay'), 'el valor se escribe a ciegas', tipo);
  await p.evaluate(() => document.querySelector('#dialogo')?.remove());
  // el equipo
  await p.click('#b-equipo');
  await p.waitForFunction(() => /centinela/.test(document.querySelector('#dialogo')?.innerText || ''), { timeout: 8000 }).catch(() => {});
  const eq = await texto('#dialogo');
  decir(/EL EQUIPO/.test(eq) && /centinela/.test(eq) && /cerrajero/.test(eq), 'el equipo enseña sus bots', eq.slice(0, 160));
  await p.evaluate(() => document.querySelector('#dialogo')?.remove());
  if (ANCHO < 860) { await p.click('#tirador'); await p.waitForTimeout(400); }
}

/* ── EL BOTÓN DE ATRÁS ────────────────────────────────────────────────────────
   «Revisemos que botón atrás tengamos.» En el teléfono, atrás es el gesto que
   más se usa, y antes se salía de ULTRON entero con el diálogo abierto detrás.
   Se comprueba con la vuelta atrás DE VERDAD del navegador, no con una tecla. */
/* ── EL CENTRO SE TOCA ────────────────────────────────────────────────────────
   «Darle click y nos escuche, se pone en verde y aparezca te estoy
   escuchando; y si vuelvo a tocar el centro lo interrumpo.» */
titulo('el botón de en medio: tocar, arrastrar, teclado y acercarse');
{
  /* Chromium sin marca NO trae `webkitSpeechRecognition`, así que aquí se le
     pone uno de mentira: lo que se comprueba es la CONDUCTA del botón —abre,
     lo dice, se pone verde, y volver a tocar cierra—, no el reconocedor del
     navegador, que es de Google y no es nuestro. */
  await p.evaluate(() => {
    /* `VOZ` es un `const` del guion: vive en el ámbito del script y no cuelga
       de `window`, así que se toca por su nombre. */
    VOZ.hayOido = () => true;
    VOZ.oir = () => ({ abort() {} });
  });
  const rotulo = () => p.evaluate(() => document.querySelector('#estado-txt')?.textContent || '');

  /* ES UN BOTÓN DE VERDAD, no un oyente de toques sobre el fondo. De ahí sale
     gratis lo que costaba escribir a mano: el tabulador, Enter, y que un
     lector de pantalla lo anuncie como botón y diga si está apretado. */
  const b = await p.evaluate(() => {
    const e = document.querySelector('#hablar');
    if (!e) return null;
    const r = e.getBoundingClientRect();
    const z = window.__ULTRON_FIGURA_VIVA?.zona?.() || null;
    return { etiqueta: e.tagName, nombre: e.getAttribute('aria-label'), apretado: e.getAttribute('aria-pressed'),
      cx: r.x + r.width / 2, cy: r.y + r.height / 2, d: r.width, zona: z };
  });
  decir(b?.etiqueta === 'BUTTON' && /Hablar/.test(b.nombre || ''), 'el centro ES un botón, con su nombre', `${b?.etiqueta} · ${b?.nombre}`);
  decir(b?.apretado === 'false', 'y dice si está apretado, que es lo que anuncia un lector de pantalla');
  decir(b?.zona && Math.abs(b.cx - b.zona.cx) < 2 && Math.abs(b.cy - b.zona.cy) < 2,
    'cae EXACTAMENTE encima del núcleo: su sitio lo dice el dibujo, no una copia de sus números',
    `botón ${Math.round(b.cx)},${Math.round(b.cy)} · núcleo ${Math.round(b.zona?.cx)},${Math.round(b.zona?.cy)}`);
  decir(b && b.d > 120 && b.d < innerAncho(ANCHO) , 'y mide lo que el núcleo, no la pantalla entera como antes', `${Math.round(b.d)} px`);

  /* La pista dice para qué sirve, y lo dice según con qué se puede hacer: con
     un ratón no se «toca». Se mira ANTES de usar el botón, porque en cuanto se
     usa desaparece —ya enseñó lo que tenía que enseñar—. */
  const pista = await p.evaluate(() => ({ txt: document.querySelector('#pista-hablar')?.textContent,
    visible: getComputedStyle(document.querySelector('#pista-hablar')).opacity }));
  decir(/HABLAR/.test(pista.txt || '') && Number(pista.visible) > 0, 'una pista junto al núcleo dice para qué sirve', `${pista.txt} · opacidad ${pista.visible}`);

  // ── TOCAR
  await p.click('#hablar');
  await p.waitForTimeout(450);
  decir(/ESTOY ESCUCHANDO/.test(await rotulo()), 'un toque abre el micrófono y lo DICE en primera persona', await rotulo());
  decir(await p.$eval('#hablar', (e) => e.getAttribute('aria-pressed')) === 'true', 'y el botón queda marcado como apretado');
  const verde = await p.evaluate(() => getComputedStyle(document.querySelector('#estado')).color);
  decir(/92, 242, 176/.test(verde), 'el centro y el estado se ponen en verde', verde);
  await p.click('#hablar');
  await p.waitForTimeout(400);
  decir(!/ESTOY ESCUCHANDO/.test(await rotulo()), 'y volver a tocarlo lo cierra', await rotulo());

  // ── ARRASTRAR: gira, y NO abre el micrófono
  const giroAntes = await p.evaluate(() => { window.__GIRO = 0; const v = window.__ULTRON_FIGURA_VIVA; const g = v.girar; v.girar = (dx) => { window.__GIRO += dx; return g.call(v, dx); }; return 0; });
  const c = await p.$eval('#hablar', (e) => { const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  await p.mouse.move(c.x, c.y); await p.mouse.down();
  await p.mouse.move(c.x + 90, c.y, { steps: 8 }); await p.mouse.up();
  await p.waitForTimeout(400);
  decir(!/ESTOY ESCUCHANDO/.test(await rotulo()), 'arrastrar para girar NO abre el micrófono: eso sería un micrófono que se enciende solo', await rotulo());
  const giro = await p.evaluate(() => window.__GIRO);
  decir(giro > 40 && giro < 140, 'y el arrastre SÍ llega al dibujo: el botón lo tapa y se lo pasa', `${Math.round(giro)} px girados`);

  // ── EL TECLADO
  /* Y SE VE dónde está el foco. Un botón al que se llega con el tabulador y no
     se ve es peor que uno al que no se llega.
     Hay que llegar TABULANDO de verdad: `:focus-visible` —que es lo que
     enciende el aro, y a propósito, para que un clic de ratón no deje un aro
     puesto— no se enciende con un foco puesto por programa. */
  await p.evaluate(() => document.querySelector('#hablar').blur());
  await p.keyboard.press('Escape');
  let vueltas = 0;
  while (vueltas++ < 60 && await p.evaluate(() => document.activeElement?.id) !== 'hablar') await p.keyboard.press('Tab');
  /* El aro entra con una transición de 200 ms, y `getComputedStyle` devuelve el
     valor de AHORA, no el de destino: sin esperar se lee el color de partida,
     que es transparente, y la prueba pasa o falla según lo rápida que vaya la
     máquina. */
  await p.waitForTimeout(400);
  const aro = await p.evaluate(() => {
    const e = document.querySelector('#hablar');
    const g = getComputedStyle(e.querySelector('.aro'));
    return { enfocado: e.matches(':focus-visible'), borde: g.borderTopColor, sombra: g.boxShadow, vueltas: 0 };
  });
  decir(aro.enfocado, `se llega tabulando (${vueltas} tabuladas) y el navegador lo marca como foco de teclado`);
  decir(aro.borde === 'rgb(5, 225, 255)' && /rgba\(5, 225, 255/.test(aro.sombra),
    'y entonces se ve dónde está: el aro se enciende', `${aro.borde} · ${String(aro.sombra).slice(0, 46)}`);
  /* Y en cuanto se usa una vez, la pista se va y no vuelve: está para enseñar
     que el centro se toca, y una vez enseñado sobra. */
  decir(await p.evaluate(() => Number(getComputedStyle(document.querySelector('#pista-hablar')).opacity)) === 0,
    'y usado una vez, la pista se retira: ya enseñó lo que tenía que enseñar');
  await p.keyboard.press('Enter');
  await p.waitForTimeout(400);
  decir(/ESTOY ESCUCHANDO/.test(await rotulo()), 'y Enter lo dispara, sin tocar la pantalla', await rotulo());
  await p.keyboard.press('Enter');
  await p.waitForTimeout(350);

  /* ── ACERCARSE SIN TOCAR · «air touch» ────────────────────────────────────
     El núcleo se enciende cuando el puntero se acerca. Se comprueba el número
     que lee el dibujo: lejos cero, encima uno. */
  await p.mouse.move(4, 4); await p.waitForTimeout(120);
  const lejos = await p.evaluate(() => window.__ULTRON_MENTE().cerca);
  await p.mouse.move(c.x, c.y); await p.waitForTimeout(120);
  const encima = await p.evaluate(() => window.__ULTRON_MENTE().cerca);
  /* A un radio y pico del centro: dentro de la franja donde sube gradual, en
     cualquier tamaño de pantalla. */
  await p.mouse.move(c.x, Math.max(2, c.y - Math.round(b.zona.r * 1.1))); await p.waitForTimeout(120);
  const medio = await p.evaluate(() => window.__ULTRON_MENTE().cerca);
  decir(lejos === 0 && encima === 1, 'lejos no se enciende y encima se enciende del todo', `lejos ${lejos} · encima ${encima}`);
  decir(medio > 0 && medio < 1, 'y en medio se enciende A MEDIAS: el núcleo reacciona según lo cerca que esté', `${medio.toFixed(2)}`);
}

/* ── LOS DOS WIDGETS NUEVOS ─────────────────────────────────────────────────── */
titulo('interrumpir MATA el turno, no solo calla la bocina');
{
  /* ── POR QUÉ ESTO IMPORTA MÁS DE LO QUE PARECE ─────────────────────────────
     El nodo corre con UNA sola ranura (`OLLAMA_NUM_PARALLEL=1`). Cuando José
     interrumpía a ULTRON, la consola callaba el audio y ya: el servidor seguía
     redactando la respuesta entera contra esa única ranura, así que la pregunta
     nueva —la que acababa de hacer— se ponía en fila DETRÁS de una respuesta
     que nadie iba a leer. Eso era el «súper lento» de después de interrumpir.
     Aquí se comprueba lo único que arregla eso: que la conexión se corte de
     verdad, que la frase con la que interrumpió se mande, y que la consola
     quede libre en el acto en vez de esperar a que el servidor se dé cuenta. */
  const r = await p.evaluate(async () => {
    const visto = { abortos: 0, enviados: [], modos: [] };
    const real = window.fetch;
    window.fetch = (u, o = {}) => {
      if (String(u).includes('/pensar')) {
        try { visto.enviados.push(JSON.parse(o.body).texto); visto.modos.push(JSON.parse(o.body).modo); } catch { /* nada */ }
        /* Un SSE que NUNCA termina: es el turno largo de verdad. Solo se
           resuelve si lo abortan. */
        return new Promise((ok, mal) => {
          const s = o.signal;
          if (s?.aborted) { visto.abortos++; return mal(new DOMException('abort', 'AbortError')); }
          s?.addEventListener('abort', () => { visto.abortos++; mal(new DOMException('abort', 'AbortError')); });
        });
      }
      return real(u, o);
    };
    try {
      OS.enviar('Contame cómo va la cadena.');
      await new Promise((ok) => setTimeout(ok, 250));
      const pensandoAntes = OS._adentro.pensando();
      // Y ahora se interrumpe hablándole encima, con una frase nueva.
      OS.enviar('No, mejor decime el saldo.', true);
      await new Promise((ok) => setTimeout(ok, 300));
      return { ...visto, pensandoAntes, pensandoDespues: OS._adentro.pensando() };
    } finally { window.fetch = real; }
  });
  decir(r.pensandoAntes === true, 'el primer turno arranca y queda pensando');
  decir(r.abortos >= 1, 'al interrumpir se ABORTA la conexión: el servidor deja de generar', `${r.abortos} abortos`);
  decir(r.enviados.length === 2 && /saldo/.test(r.enviados[1] || ''),
    'y la frase con la que interrumpió SE MANDA, en vez de perderse en silencio', JSON.stringify(r.enviados));
  decir(r.modos[0] === 'texto' && r.modos[1] === 'voz',
    'lo dictado va con modo «voz» —respuesta corta, para oírse— y lo escrito con «texto»', JSON.stringify(r.modos));
  decir(r.pensandoDespues === true, 'y el turno nuevo queda pensando: no hay hueco entre uno y otro');

  /* Tocar el centro es la otra manera de interrumpir, y tiene que cortar
     igual: hasta hoy solo llamaba a `locutor.callar()`. */
  const t = await p.evaluate(async () => {
    let abortado = false;
    const real = window.fetch;
    window.fetch = (u, o = {}) => {
      if (String(u).includes('/pensar')) {
        return new Promise((ok, mal) => o.signal?.addEventListener('abort', () => { abortado = true; mal(new DOMException('abort', 'AbortError')); }));
      }
      return real(u, o);
    };
    try {
      OS.enviar('Una pregunta larga de las que tardan.');
      await new Promise((ok) => setTimeout(ok, 200));
      document.querySelector('#nucleo, .nucleo, #figura')?.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1 }));
      OS._adentro.toqueNucleo();
      await new Promise((ok) => setTimeout(ok, 200));
      return { abortado, pensando: OS._adentro.pensando() };
    } finally { window.fetch = real; }
  });
  decir(t.abortado, 'tocar el centro también corta el turno en el servidor');
  decir(t.pensando === false, 'y la consola queda libre en el acto: el micrófono no espera a nadie');
}

titulo(`el globo no se come el botón de hablar, a ${ANCHO} px`);
{
  /* Medido antes de esto: con una respuesta en pantalla el globo tapaba el 38 %
     del botón de hablar en el teléfono y el 31 % en escritorio. El mando
     principal dejaba de responder en su parte de abajo JUSTO cuando hay una
     respuesta, que es cuando uno quiere interrumpir. */
  const tapado = async () => p.evaluate(() => {
    const h = document.querySelector('#hablar');
    const c = h.getBoundingClientRect();
    let dentro = 0, tapados = 0;
    const cx = c.left + c.width / 2, cy = c.top + c.height / 2, rad = c.width / 2;
    for (let y = c.top; y < c.bottom; y += 5) for (let x = c.left; x < c.right; x += 5) {
      if ((x - cx) ** 2 + (y - cy) ** 2 > rad * rad) continue;
      dentro++;
      const el = document.elementFromPoint(x, y);
      if (el && el !== h && !h.contains(el)) tapados++;
    }
    return dentro ? Math.round(tapados / dentro * 100) : 0;
  });
  await p.evaluate(() => OS._adentro.pintarDicho('Una respuesta corta, de las que caben enteras en el globo.'));
  await p.waitForTimeout(120);
  const corta = await tapado();
  decir(corta <= (ANCHO < 900 ? 2 : 25),
    'con una respuesta en pantalla, el botón de hablar sigue siendo del botón', `${corta}% tapado`);

  /* Y con una respuesta LARGA el texto se queda con el toque, porque
     desplazarla con el dedo es lo que hay que poder hacer. */
  const larga = await p.evaluate(async () => {
    OS._adentro.pintarDicho('Renglón que se repite para llenar el globo y obligarlo a desplazarse. '.repeat(60));
    await new Promise((ok) => setTimeout(ok, 120));
    const d = document.querySelector('#dicho');
    return { desplaza: d.scrollHeight > d.clientHeight + 2, toque: getComputedStyle(d).pointerEvents };
  });
  decir(!larga.desplaza || larga.toque === 'auto',
    'y si la respuesta NO cabe, el texto se queda con el toque para poder desplazarla',
    `${larga.desplaza ? 'se desplaza' : 'cabe entera'} · pointer-events ${larga.toque}`);
  await p.evaluate(() => OS._adentro.pintarDicho(''));
}

titulo('un turno largo se ve trabajar, y nunca se queda mudo para siempre');
{
  /* ── LO QUE PASÓ EL 7-SEP ─────────────────────────────────────────────────
     Una conversación ESCRITA de diez minutos, siete turnos seguidos, todos
     con la primera palabra a los once segundos y el turno entero en veinte o
     treinta. Durante todo ese rato la pantalla decía «ANALIZANDO» y nada más:
     quieto, sin una cifra, indistinguible de un cuelgue. Y como se ve colgado
     uno vuelve a mandar la pregunta — que desde ayer MATA el turno anterior—
     y empieza otra espera de treinta segundos. Así se queda pegado de verdad:
     lo confirman las dos líneas «se cortó: lo dejó quien preguntaba» del
     registro, seguidas de nada. */
  const r = await p.evaluate(async () => {
    const real = window.fetch;
    let soltar;
    window.fetch = (u, o = {}) => {
      if (String(u).includes('/pensar')) {
        return new Promise((ok, mal) => { soltar = mal; o.signal?.addEventListener('abort', () => mal(new DOMException('a', 'AbortError'))); });
      }
      return real(u, o);
    };
    try {
      OS.enviar('Una pregunta de las que tardan media vuelta.');
      const visto = [];
      for (let i = 0; i < 5; i++) { await new Promise((ok) => setTimeout(ok, 1050)); visto.push(document.querySelector('#estado-txt').textContent); }
      return { visto, pensando: OS._adentro.pensando() };
    } finally { window.fetch = real; try { soltar?.(new DOMException('a', 'AbortError')); } catch { /* nada */ } }
  });
  decir(r.visto.some((t) => /PENSANDO \d+ s/.test(t)),
    'mientras piensa, el rótulo dice cuántos segundos lleva', JSON.stringify(r.visto));
  const segundos = r.visto.map((t) => Number((/PENSANDO (\d+) s/.exec(t) || [])[1])).filter(Number.isFinite);
  decir(segundos.length >= 2 && segundos.at(-1) > segundos[0],
    'y el contador CORRE: es lo que distingue «va lento» de «se colgó»', segundos.join(' · '));

  /* Y si de verdad se queda mudo, se corta solo en vez de dejar la pantalla
     en «analizando» para siempre. Se envejece el reloj en vez de esperar
     noventa segundos de verdad. */
  const corte = await p.evaluate(async () => {
    const real = window.fetch;
    window.fetch = (u, o = {}) => {
      if (String(u).includes('/pensar')) return new Promise((ok, mal) => o.signal?.addEventListener('abort', () => mal(new DOMException('a', 'AbortError'))));
      return real(u, o);
    };
    try {
      OS.enviar('Otra que se queda muda del todo.');
      await new Promise((ok) => setTimeout(ok, 300));
      OS._adentro.envejecerTurno(95);
      await new Promise((ok) => setTimeout(ok, 1600));
      return { pensando: OS._adentro.pensando(), boton: !document.querySelector('#enviar').disabled };
    } finally { window.fetch = real; }
  });
  decir(corte.pensando === false, 'a los 90 s sin una señal, el turno se corta solo');
  decir(corte.boton, 'y el renglón vuelve a quedar usable, en vez de deshabilitado para siempre');
}

titulo('la caja de Ordenex y el registro del día, en el tablero');
{
  decir(await p.$('.p[data-panel="caja"]') !== null, 'el tablero trae el panel de la caja de Ordenex');
  decir(await p.$('.p[data-panel="registro"]') !== null, 'y el del registro de conversaciones');
  /* Sin llave de Ordenex la caja NO puede leer. Lo que se comprueba es que lo
     DIGA en vez de pintar ceros: un panel que pinta cero con la caja sin leer
     es un panel que un día jura que no queda dinero. */
  await p.evaluate(() => window.OS._adentro.pintarCaja({ error: 'No hay llave de administración de Ordenex.' }));
  const t = await p.$eval('#caja-ox', (e) => e.innerText);
  decir(/llave de administración/.test(t) && !/\b0\b/.test(t), 'sin llave, la caja dice qué falta y NO pinta ceros', t.slice(0, 90));
  /* Y con datos, cada cifra en su sitio y ninguna inventada. */
  await p.evaluate(() => window.OS._adentro.pintarCaja({
    ok: true, cuando: new Date().toISOString(),
    caliente: { ok: true, direccion: '0xabc', saldos: [{ simbolo: 'ORIGEN', cantidad: '412000' }, { simbolo: 'AUKA', cantidad: '0' }] },
    pagadora: [{ red: 'BNB Smart Chain', usdt: 10.5, enVuelo: 0, gasNativo: 0.004, ventasQueQuedan: 141, alcanza: true }],
    gas: [{ red: 'Polygon', ok: false }],
    comision: { saldos: [{ activo: 'USDT', cantidad: 3.4 }], deRetiros: 12, ppm: 1000 },
    movimiento: { ordenesAbiertas: 2, retirosPendientes: 0, retirosEnRevision: 1, compraEncendida: true, ventaEncendida: false },
    faltan: [],
  }));
  const c = await p.$eval('#caja-ox', (e) => e.innerText);
  decir(/412000/.test(c) && /10\.50/.test(c), 'con datos, el ORIGEN de la caliente y los USDT de la pagadora', c.replace(/\n/g, ' · ').slice(0, 120));
  decir(/141 ventas/.test(c), 'y el gas se mide en VENTAS que quedan, no en monedas que nadie sabe leer');
  decir(/no leído/.test(c), 'lo que no se pudo leer dice «no leído», nunca cero');
  decir(/EN REVISIÓN/.test(c), 'y un retiro en revisión —un débito en pie que nadie sabe si salió— se ve');

  await p.evaluate(() => window.OS._adentro.pintarRegistro({
    hoy: '2026-09-06',
    dias: [{ dia: '2026-09-06', turnos: 8, conversaciones: [{ _id: 'a1', titulo: 'La caja de Ordenex', turnos: 8 }] },
      { dia: '2026-09-05', turnos: 3, conversaciones: [{ _id: 'a2', titulo: 'El nodo de la tarjeta', turnos: 3 }] }],
  }));
  const g = await p.$eval('#registro', (e) => e.innerText);
  decir(/HOY/.test(g) && /5 sep/.test(g), 'el registro se lista por DÍA, que es de lo que uno se acuerda', g.replace(/\n/g, ' · '));
  decir(/8 turnos/.test(g), 'con cuántos turnos tuvo cada día');
}

/* ── BORRAR UN DOCUMENTO ────────────────────────────────────────────────────── */
titulo('el tablero dice lo que costó y lo que tardó');
{
  /* Tres cifras que el servidor daba desde el principio y que la pantalla no
     enseñaba: el RELEVO (cuándo ULTRON está pensando en la nube en vez de en
     nuestro nodo, que cuesta y sale de la casa), el GASTO del día, y lo que
     TARDÓ el último turno. La queja de siempre es «va lento» y no había un
     solo número en pantalla que lo dijera. */
  await p.evaluate(() => OS._adentro.pintarSalud({ cerebro: true, donde: 'nodo', modelo: 'nodo:x', relevo: true, nodo: { vivo: true, ctx: 12288, ctxMax: 32768 } }));
  const conRelevo = await p.evaluate(() => document.querySelector('#nodo-lineas').innerText);
  decir(/RELEVO/.test(conRelevo) && /CLAUDE/i.test(conRelevo),
    'cuando el nodo cae y cubre Claude, el tablero lo DICE', conRelevo.split('\n').find((l) => /RELEVO/.test(l)));
  await p.evaluate(() => OS._adentro.pintarSalud({ cerebro: true, donde: 'nodo', modelo: 'nodo:x', relevo: false, nodo: { vivo: true, ctx: 12288, ctxMax: 32768 } }));
  decir(!/RELEVO/.test(await p.evaluate(() => document.querySelector('#nodo-lineas').innerText)),
    'y cuando no hay relevo, no ocupa un renglón para decir «no»');

  const conGasto = await p.evaluate(async () => {
    await new Promise((ok) => setTimeout(ok, 1200));
    return document.querySelector('#nodo-lineas').innerText;
  });
  decir(/GASTO HOY/.test(conGasto), '/gasto existía y nadie lo llamaba: ahora está en el panel del cerebro',
    conGasto.split('\n').find((l) => /GASTO/.test(l)));

  const conCrono = await p.evaluate(() => {
    OS._adentro.marcarTurno({ primera: 1200, total: 3400 });
    return document.querySelector('#nodo-lineas').innerText;
  });
  decir(/ÚLTIMO TURNO/.test(conCrono) && /1[.,]2 s/.test(conCrono),
    'y lo que tardó el último turno, con la primera palabra aparte: es el silencio que se siente',
    conCrono.split('\n').find((l) => /ÚLTIMO/.test(l)));
}

titulo('el reloj de LA CAJA corre: un saldo viejo no puede parecer de ahora');
{
  /* Es la única cifra del tablero que se lee a mano, así que es la que más
     fácil se queda vieja. «Leída hace 2 min» escrito una vez y quieto mientras
     pasa media hora es peor que no poner nada. */
  const r = await p.evaluate(async () => {
    OS._adentro.pintarCaja({ cuando: new Date(Date.now() - 3 * 60_000).toISOString(), caliente: {}, gas: {}, comision: {} });
    const alPintar = document.querySelector('#caja-sub').textContent;
    OS._adentro.envejecerCaja(12);
    await new Promise((ok) => setTimeout(ok, 1300));
    const sub = document.querySelector('#caja-sub');
    return { alPintar, luego: sub.textContent, clase: sub.className };
  });
  decir(/hace 3 min/.test(r.alPintar), 'al pintarla dice de cuándo es', r.alPintar);
  decir(/hace 12 min/.test(r.luego), 'y el reloj sigue corriendo solo, sin volver a leer', r.luego);
  decir(/amb/.test(r.clase), 'y pasados diez minutos se pone en ámbar: ya no sirve para decidir un envío', r.clase);
}

titulo('los botones que ULTRON deja, y los pendientes que se cierran');
{
  /* Los chips se pintaban con `acciones.map(a => a.nombre)` y `nombre` lo trae
     UNA de las diez clases de acción: las demás salían EN BLANCO y al tocarlas
     le mandaban a ULTRON una pregunta vacía. */
  const r = await p.evaluate(() => {
    OS._adentro.chips([
      { tipo: 'abrir', nombre: 'Ordenex', url: 'https://ordenex.example/' },
      { tipo: 'autorizacion', id: 'abc', resumen: 'desplegar' },
      { tipo: 'secreto_aplicado', app: 'x', variable: 'Y' },
      { tipo: 'pr', url: 'https://github.example/pr/1', rama: 'arreglo' },
    ]);
    const b = [...document.querySelectorAll('#chips .chip')];
    return { n: b.length, textos: b.map((x) => x.textContent), urls: b.map((x) => x.dataset.url || null) };
  });
  decir(r.n === 2, 'solo son botones las acciones que de verdad tienen algo que tocar', `${r.n} de 4`);
  decir(r.textos.every((t) => t.trim().length > 2), 'y ninguno sale en blanco', JSON.stringify(r.textos));
  decir(r.urls.every(Boolean), 'cada uno lleva su dirección: tocarlo ABRE, no le pregunta a ULTRON', JSON.stringify(r.urls));

  const sug = await p.evaluate(() => {
    OS._adentro.chips(['¿Cómo va la cadena?', '¿A cuánto está el oro?']);
    return [...document.querySelectorAll('#chips .chip')].map((x) => ({ t: x.textContent, u: x.dataset.url || null }));
  });
  decir(sug.length === 2 && !sug[0].u, 'y las sugerencias del saludo siguen siendo preguntas, no enlaces', JSON.stringify(sug));

  /* Los pendientes se veían y no se tocaban: para cerrar uno había que
     pedírselo a ULTRON por escrito. `PATCH /pendientes/:id` existía desde el
     principio y nadie lo llamaba. */
  const pend = await p.evaluate(async (b) => {
    await fetch(b + '/pendientes', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texto: 'Rotar la clave de Mongo' }) });
    const l = await (await fetch(b + '/pendientes', { credentials: 'same-origin' })).json();
    OS._adentro.pintarPendientes(l);
    const boton = document.querySelector('#pendientes [data-pend]');
    if (!boton) return { hayBoton: false };
    boton.click();
    await new Promise((ok) => setTimeout(ok, 700));
    const despues = await (await fetch(b + '/pendientes', { credentials: 'same-origin' })).json();
    return { hayBoton: true, abiertos: despues.filter((x) => x.estado !== 'hecho').length };
  }, BASE);
  decir(pend.hayBoton, 'cada pendiente trae su botón para marcarlo hecho');
  decir(pend.abiertos === 0, 'y al tocarlo se cierra DE VERDAD en el servidor, no solo en pantalla', `${pend.abiertos} abiertos`);
}

titulo('los documentos entrantes se pueden borrar');
{
  /* Las peticiones van DENTRO de la página: la sesión es una galleta de este
     origen y desde node habría que copiarla a mano. */
  const cuantos = () => p.evaluate(async () => (await (await fetch('/archivos', { credentials: 'same-origin' })).json()).length);
  const antes = await cuantos();
  decir(antes > 0, `hay ${antes} documento(s) de las pruebas de arriba`);
  decir(await p.$('#archivos [data-borrar]') !== null, 'cada uno trae su botón de borrar');
  /* Se borra por la ruta, que es exactamente lo que hace el botón: `confirm()`
     no se puede contestar desde aquí sin acordarlo con el navegador, y lo que
     importa comprobar es que el documento se va de verdad. */
  const fue = await p.evaluate(async () => {
    const id = document.querySelector('#archivos [data-borrar]').dataset.borrar;
    const r = await fetch(`/archivos/${id}`, { method: 'DELETE', credentials: 'same-origin' });
    return r.status;
  });
  const despues = await cuantos();
  decir(fue === 200 && despues === antes - 1, 'y borrarlo lo saca de verdad, no solo de la pantalla', `${antes} → ${despues}`);
}

titulo(`el dedo: nada por debajo de 44 px, y sin zoom, a ${ANCHO} px`);
{
  /* Medido a 390 px antes de esto: el rótulo de la salud 20 px de alto, la
     rueda de ajustes 28, los chips de los paneles 24, el clip 32, los mandos
     del renglón 38. Casi todo la mitad de lo que pide un dedo — y se nota en
     la mano, porque se falla el toque y se acaba tocando el de al lado. */
  const r = await p.evaluate(() => {
    const chicos = [], zoom = [];
    for (const el of document.querySelectorAll('button,a[href],input,textarea,select,[role=button]')) {
      const c = el.getBoundingClientRect();
      if (!c.width || !c.height || getComputedStyle(el).visibility === 'hidden') continue;
      /* El blanco de verdad incluye la capa invisible que algunos llevan
         encima: se mide el mayor de los dos. */
      const capa = getComputedStyle(el, '::after');
      const altoCapa = parseFloat(capa.height) || 0, anchoCapa = parseFloat(capa.width) || 0;
      const alto = Math.max(c.height, altoCapa), ancho = Math.max(c.width, anchoCapa);
      if (alto < 44 || ancho < 28) chicos.push(`${el.id || el.className} ${Math.round(ancho)}×${Math.round(alto)}`);
      if (/input|textarea/i.test(el.tagName) && parseFloat(getComputedStyle(el).fontSize) < 16) zoom.push(el.id || el.tagName);
    }
    return { chicos, zoom, dedo: matchMedia('(pointer:coarse)').matches };
  });
  if (r.dedo) {
    decir(r.chicos.length === 0, 'todo lo que se toca llega a los 44 px que pide el dedo', r.chicos.join(' · ') || 'ninguno chico');
    /* Safari hace zoom en cualquier campo con letra menor de 16 px, y después
       no vuelve solo: la pantalla se queda grande y hay que pellizcar. */
    decir(r.zoom.length === 0, 'y ningún campo tiene la letra por debajo de 16 px: tocarlo no hace ZOOM', r.zoom.join(' · ') || 'ninguno');
    const dos = await p.evaluate(() => {
      const t = document.querySelector('#texto').getBoundingClientRect();
      const e = document.querySelector('#enviar').getBoundingClientRect();
      return { anchoTexto: Math.round(t.width), pantalla: innerWidth, enviarDebajo: e.top >= t.bottom - 2 };
    });
    decir(dos.enviarDebajo, 'el renglón se lleva un piso entero y los mandos van debajo');
    decir(dos.anchoTexto > dos.pantalla * 0.8,
      'así el renglón deja de ser un tercio de la pantalla', `${dos.anchoTexto} de ${dos.pantalla} px`);
  } else {
    decir(true, `a ${ANCHO} px no es una pantalla de dedo: las reglas de los 44 px no aplican y no se miden`);
  }
}

titulo('el botón de atrás cierra lo que esté encima, no ULTRON');
{
  const url = p.url();
  await p.click('#m-ajustes');
  await p.waitForFunction(() => /AJUSTES/.test(document.querySelector('#dialogo')?.innerText || ''), { timeout: 9000 }).catch(() => {});
  decir(await p.$('#dialogo') !== null, 'con AJUSTES abierto…');
  await p.goBack();
  await p.waitForTimeout(350);
  decir(await p.$('#dialogo') === null, '…atrás lo cierra');
  decir(p.url() === url, 'y NO saca de ULTRON: se queda en la misma pantalla', p.url());
  /* Y el cierre por botón tiene que dejar el historial como estaba: si dejara
     una marca de más, la siguiente vuelta atrás no haría nada y parecería
     que el gesto se rompió. */
  await p.click('#m-ajustes');
  await p.waitForFunction(() => document.querySelector('#dialogo'), { timeout: 9000 }).catch(() => {});
  await p.click('#aj-cerrar');
  await p.waitForTimeout(400);
  decir(await p.$('#dialogo') === null, 'CERRAR también cierra');
  const largo = await p.evaluate(() => history.length);
  await p.click('#m-ajustes');
  await p.waitForFunction(() => document.querySelector('#dialogo'), { timeout: 9000 }).catch(() => {});
  await p.click('#aj-cerrar');
  await p.waitForTimeout(400);
  decir(await p.evaluate(() => history.length) === largo, 'y abrir y cerrar no deja marcas sueltas en el historial', `${largo}`);
}

/* ── LOS PANELES COMO WIDGETS ─────────────────────────────────────────────────
   «Que las cosas en web se puedan organizar, hacer más grande, más pequeñas,
   como widgets que se puedan ir armando.» */
titulo('armar el tablero: mover, agrandar y quitar paneles');
{
  await p.click('#m-ajustes');
  await p.waitForFunction(() => /EL TABLERO/.test(document.querySelector('#dialogo')?.innerText || ''), { timeout: 9000 }).catch(() => {});
  decir(await p.$('#aj-armar') !== null, 'AJUSTES tiene ARMAR EL TABLERO');
  decir(await p.$('#aj-boveda') !== null, 'y la bóveda, que en el teléfono ya no está en el panel del dueño');
  await p.click('#aj-armar');
  await p.waitForTimeout(500);
  decir(await p.evaluate(() => document.body.classList.contains('armando')), 'se entra al modo de armar');
  const mandos = await p.evaluate(() => document.querySelectorAll('.p-mandos').length);
  decir(mandos >= 8, `cada panel a la vista trae sus mandos (${mandos})`);

  const antes = await p.evaluate(() => [...document.querySelectorAll('#izq .p')].map((x) => x.dataset.panel));
  await p.click('#izq .p:nth-of-type(2) .p-mandos button[data-m="subir"]');
  await p.waitForTimeout(450);
  const despues = await p.evaluate(() => [...document.querySelectorAll('#izq .p')].map((x) => x.dataset.panel));
  decir(despues[0] === antes[1] && despues[1] === antes[0], 'subir un panel lo sube de verdad', `${antes.join(',')} → ${despues.join(',')}`);

  const peso0 = await p.evaluate(() => parseFloat(document.querySelector('#izq .p').style.getPropertyValue('--peso')));
  await p.click('#izq .p:first-of-type .p-mandos button[data-m="mas"]');
  await p.waitForTimeout(400);
  const peso1 = await p.evaluate(() => parseFloat(document.querySelector('#izq .p').style.getPropertyValue('--peso')));
  decir(peso1 > peso0, 'y agrandarlo le cambia el alto que ocupa', `${peso0} → ${peso1}`);

  const cual = await p.evaluate(() => document.querySelector('#izq .p').dataset.panel);
  await p.click('#izq .p:first-of-type .p-mandos button[data-m="quitar"]');
  await p.waitForTimeout(450);
  decir(await p.evaluate((c) => document.querySelector(`.p[data-panel="${c}"]`).classList.contains('escondido'), cual), 'quitarlo lo saca del tablero');
  decir(await p.evaluate((c) => !!document.querySelector(`#armar-ocultos [data-vuelve="${c}"]`), cual), 'y queda a mano en la barra para devolverlo');
  await p.click(`#armar-ocultos [data-vuelve="${cual}"]`);
  await p.waitForTimeout(450);
  decir(await p.evaluate((c) => !document.querySelector(`.p[data-panel="${c}"]`).classList.contains('escondido'), cual), 'devolverlo lo devuelve');

  /* Lo armado se guarda con el correo, no en el navegador: es la misma regla
     que la voz y el idioma. Se comprueba pidiéndoselo al servidor. */
  const g = await p.evaluate(async () => (await (await fetch('/preferencias', { credentials: 'same-origin' })).json()).tablero);
  decir(Array.isArray(g) && g.length >= 8 && g.some((x) => x.peso > 1), 'y todo eso queda guardado en el servidor, con su correo', JSON.stringify(g).slice(0, 130));

  await p.click('#armar-fabrica');
  await p.waitForTimeout(450);
  await p.click('#armar-listo');
  await p.waitForTimeout(450);
  decir(!(await p.evaluate(() => document.body.classList.contains('armando'))), 'LISTO sale del modo de armar');
  decir(await p.evaluate(() => document.querySelectorAll('.p-mandos').length) === 0, 'y los mandos se van con él');
}

titulo('sin errores de JavaScript');
decir(errores.length === 0, 'ninguno', errores.slice(0, 3).join(' | '));

await nav.close();
sv.close();
console.log(malas ? `\n${malas} fallo(s).\n` : '\nTodo en verde\n');
process.exit(malas ? 1 : 0);
