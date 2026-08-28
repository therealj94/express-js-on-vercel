/* EL OÍDO DE LA CASA, Y LA INTERRUPCIÓN HABLANDO ENCIMA.
 *
 * Dos capacidades nuevas, las dos con el mismo medidor de voz:
 *
 *   1. EL OÍDO GRABADO. En un navegador sin reconocedor (Firefox, iOS viejo)
 *      el modo voz decía «este navegador no sabe escuchar». Ahora graba con
 *      MediaRecorder, corta la frase al silencio, y la transcribe NUESTRO
 *      nodo (Whisper en la GPU, vía CHAT.oir). El texto sigue por la misma
 *      cola que el dictado normal.
 *
 *   2. LA VIGÍA. Mientras ella habla, un micrófono con el eco cancelado
 *      espera 450 ms seguidos de voz humana: si los hay, se calla y te
 *      escucha. El «pará, pará» de una conversación de verdad, sin botón.
 *
 * Un navegador de escritorio no tiene micrófono, así que TODO lo de audio es
 * de mentira y controlable: el nivel de voz se sube y baja desde la prueba
 * (window.__voz), el grabador emite bytes fijos, y CHAT.oir devuelve un texto
 * conocido. Lo que se prueba es la MÁQUINA DE ESTADOS — que es donde vive el
 * fallo posible — no la acústica.
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, '..');
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
                '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg' };

const api = createServer((q, r) => {
  const j = (c, b) => { r.writeHead(c, { 'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': '*' }); r.end(JSON.stringify(b)); };
  if (q.method === 'OPTIONS') return j(204, {});
  const u = q.url.split('?')[0];
  if (u === '/genesis/estado') return j(200, { identidad: { id: 'i1',
    email: 'jose@ordenglobal.org', estado: 'verificada', gid: 'OG-1', faltanDatos: [] } });
  return j(200, u === '/wallet/deposits' || u === '/cards/transactions' ? [] : {});
});
await new Promise((ok) => api.listen(0, ok));
const API = `http://127.0.0.1:${api.address().port}`;

const sv = createServer(async (q, r) => {
  try {
    const p = join(RAIZ, decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/, '/index.html'));
    const d = await readFile(p);
    r.writeHead(200, { 'Content-Type': TIPOS[extname(p)] || 'application/octet-stream' });
    r.end(d);
  } catch { r.writeHead(404); r.end('no'); }
});
await new Promise((ok) => sv.listen(8899, '127.0.0.1', ok));
const WEB = 'http://127.0.0.1:8899/index.html';

const nav = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });

let fallos = 0;
const ok = (c, q, d = '') => {
  console.log(`  ${c ? 'ok   ' : 'FALLA'} ${q}${d && !c ? '\n           ' + d : ''}`);
  if (!c) fallos++;
};

const p = await nav.newPage({ viewport: { width: 390, height: 844 }, bypassCSP: true });
await p.addInitScript((u) => {
  window.OG_API = u;
  /* SIN RECONOCEDOR: este navegador es el caso Firefox. */
  delete window.SpeechRecognition;
  delete window.webkitSpeechRecognition;

  /* EL NIVEL DE VOZ, en manos de la prueba. El analizador de mentira escribe
     una onda cuya amplitud sale de window.__voz: 0 = silencio, 1 = hablando. */
  window.__voz = 0;
  const AC = window.AudioContext;
  window.AudioContext = class extends AC {
    createAnalyser() {
      const an = super.createAnalyser();
      an.getByteTimeDomainData = (datos) => {
        const amp = window.__voz * 60;
        for (let i = 0; i < datos.length; i++) {
          datos[i] = 128 + Math.round(Math.sin(i / 3) * amp);
        }
      };
      return an;
    }
    /* un destino de mentira: el contexto no tiene parlante en CI */
    createMediaStreamSource() { return { connect() {} }; }
  };

  /* EL MICRÓFONO Y EL GRABADOR de mentira. */
  navigator.mediaDevices = navigator.mediaDevices || {};
  navigator.mediaDevices.getUserMedia = async () => ({
    getTracks: () => [{ stop() {} }],
  });
  window.__grabadas = 0;
  window.MediaRecorder = class {
    constructor() { this.state = 'inactive'; }
    start() { this.state = 'recording'; window.__grabadas++; }
    stop() {
      this.state = 'inactive';
      this.ondataavailable?.({ data: new Blob([new Uint8Array(2000)]) });
      this.onstop?.();
    }
  };
}, API);

await p.goto(WEB);
await p.evaluate(() => {
  localStorage.setItem('veta.bienvenida.v1', '1');
  localStorage.setItem('veta.aura.presentada.jose@ordenglobal.org', '1');
  const tk = 'x.' + btoa(JSON.stringify({ address: '0xaaaa', exp: Math.floor(Date.now() / 1e3) + 9999 })) + '.y';
  localStorage.setItem('veta.sesion', JSON.stringify({
    token: tk, correo: 'jose@ordenglobal.org', nombre: 'José', direccion: '0xaaaa' }));
});
await p.goto(WEB);
await p.waitForTimeout(2200);
await p.evaluate(() => { VETA.ir('app'); VETA.vista('chat'); });
await p.waitForTimeout(2200);
await p.evaluate(() => {
  VETA._chatCon({ id: 'aura@ordenglobal.org', nombre: 'AU-RA' });
  /* Los dobles del relevo y del oído: lo que se mide es la máquina de
     estados, no la red. */
  window.__enviados = [];
  window.__oidas = 0;
  CHAT.enviar = async (para, texto) => { window.__enviados.push(texto); return { ok: true }; };
  CHAT.bandeja = async () => ({ mensajes: [], enLinea: true });
  CHAT.conversaciones = async () => [];
  CHAT.oir = async (blob) => { window.__oidas++; return 'cuánto tengo de saldo'; };
  Object.defineProperty(CHAT, 'listo', { value: () => true });
});
await p.waitForTimeout(500);

console.log('\nSin reconocedor del navegador, el modo voz IGUAL se abre\n');
ok(await p.evaluate(() => { VETA.auraVozPantalla(); return true; }), 'se pudo entrar');
await p.waitForTimeout(900);
ok(await p.evaluate(() => !!document.querySelector('.aura-voz')),
   'la pantalla de voz está — antes decía «este navegador no sabe escuchar»');
ok(await p.evaluate(() => window.__grabadas >= 1),
   'y el grabador arrancó: escucha el oído de la casa');

console.log('\nHablar y callarse manda la frase transcrita por el nodo\n');
await p.evaluate(() => { window.__voz = 1; });
await p.waitForTimeout(700);          // voz sostenida: la frase empieza
await p.evaluate(() => { window.__voz = 0; });
await p.waitForTimeout(1600);         // 900 ms de silencio: la frase corta
await p.waitForFunction(() => window.__oidas >= 1, null, { timeout: 8000 }).catch(() => null);
ok(await p.evaluate(() => window.__oidas >= 1),
   'el audio viajó al oído de la casa',
   `CHAT.oir se llamó ${await p.evaluate(() => window.__oidas)} veces`);
await p.waitForTimeout(800);
const enviados = await p.evaluate(() => window.__enviados);
ok(enviados.includes('cuánto tengo de saldo'),
   'y lo transcrito entró por la misma cola que el dictado',
   `se mandó: ${JSON.stringify(enviados)}`);

console.log('\nEl silencio NO manda nada\n');
const oidasAntes = await p.evaluate(() => window.__oidas);
await p.waitForTimeout(2000);          // nadie habla
ok((await p.evaluate(() => window.__oidas)) === oidasAntes,
   'callado no se transcribe ni se manda: grabar silencio es espiar');

console.log('\nY hablarle ENCIMA la calla\n');
/* Ella «habla»: un vozEnVivo de mentira que no termina hasta que lo corten.
   Con su voz sonando, se sube el nivel del micrófono 500 ms: la vigía tiene
   que callarla — sin tocar ningún botón. */
await p.evaluate(() => {
  window.__laCortaron = false;
  CHAT.vozEnVivo = ({ senal, alTrozo }) => new Promise((oki, mal) => {
    senal.addEventListener('abort', () => { window.__laCortaron = true; mal(new DOMException('x', 'AbortError')); });
    /* un primer trozo de mentira para que pase a «hablando»: un mp3 chico no
       decodifica, así que se marca el estado a mano con el gancho del test */
  });
  VETA._auraVozEstado || null;
});
await p.evaluate(() => { window.__voz = 0; });
/* La promesa queda viva hasta que la vigía la corte; su rechazo (AbortError)
   es el resultado esperado, no un fallo del test. */
const sono = p.evaluate(() => VETA._auraDecirEnVivo('hola')).catch(() => null);
await p.waitForTimeout(600);
/* pasa a «hablando» a mano: el trozo de verdad necesitaría un mp3 decodificable
   y acá lo que se prueba es la vigía, no el decodificador */
/* `typeof` y no `window.VETA`: VETA es un const de guion clásico y no cuelga
   de window — la lección que ya mordió dos veces. */
const pudoSimular = await p.evaluate(() => {
  if (typeof VETA === 'undefined' || !VETA._auraSimularHablando) return false;
  VETA._auraSimularHablando();
  return true;
});
if (pudoSimular) {
  await p.waitForTimeout(700);          // la vigía calibra su piso
  await p.evaluate(() => { window.__voz = 1; });
  await p.waitForFunction(() => window.__laCortaron, null, { timeout: 6000 }).catch(() => null);
  ok(await p.evaluate(() => window.__laCortaron),
     'hablando encima, ella se calla sola — sin botón',
     'la vigía no la cortó: revisar auraVigiaEmpezar');
} else {
  ok(false, 'el gancho de simular «hablando» existe', 'falta VETA._auraSimularHablando');
}

await sono;
await nav.close(); sv.close(); api.close();
console.log(fallos ? `\n${fallos} comprobación(es) fallaron\n` : '\nTodo en verde\n');
process.exit(fallos ? 1 : 0);
