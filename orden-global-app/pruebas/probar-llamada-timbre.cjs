/* ¿SUENA LO QUE TIENE QUE SONAR, Y DEJA DE SONAR CUANDO TOCA?
 *
 *   node pruebas/probar-llamada-timbre.cjs
 *
 * Las llamadas tienen DOS motores con el mismo protocolo: el del teléfono
 * (`src/og/llamada.js`) y el de la web (`apps-web/veta-wallet/llamada.js`).
 * Esta prueba los carga a los dos DE VERDAD —sin copiar ni simular su
 * lógica— y les hace pasar las mismas situaciones, las que en la calle se
 * veían como fallos sin explicación:
 *
 *   · Una llamada que tardaba más de veinte segundos en contestarse se cortaba
 *     como «sin camino» (el plazo de conexión se armaba al LLAMAR) y al otro
 *     le seguía sonando, porque ese corte no mandaba `cuelgo`.
 *   · Nadie contesta: a los 45 s se rinde quien llama, y lo DICE (`cuelgo`).
 *     Quien recibe deja de sonar solo si nadie contestó, sin mandar nada.
 *   · `atendida`: la cuenta contestó en otro aparato, este deja de sonar.
 *   · `rechazo`/`ocupado` tardíos y una segunda `respuesta` no tumban una
 *     llamada que ya está en pie.
 *   · Dos toques seguidos en «Contestar» mandan UNA `respuesta`.
 *   · La carrera del timbre del teléfono: la llamada y su `cuelgo` en la
 *     misma tanda no dejan el timbre sonando solo.
 *
 * El reloj es de mentira: 45 segundos de timbre pasan en milisegundos, y el
 * orden de los plazos es exacto en vez de «más o menos».
 *
 * Lo único que se sustituye es lo que en una computadora no existe: WebRTC,
 * el micrófono y el módulo nativo de audio del teléfono.
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { registerHooks } = require('node:module');

let fallos = 0;
const ok = (q, c, x = '') => {
  console.log(`${c ? '  ok  ' : ' FALLA'}  ${q}${x ? '  · ' + x : ''}`);
  if (!c) fallos++;
};

/* ── EL RELOJ DE MENTIRA ────────────────────────────────────────────────────
   Se guarda el de verdad para vaciar las promesas entre paso y paso: se usa
   `setImmediate`, que ninguno de los dos motores toca. */
const reloj = { ahora: 0, cola: [], sig: 1 };
const fTimeout = (fn, ms = 0) => {
  const id = reloj.sig++;
  reloj.cola.push({ id, en: reloj.ahora + Math.max(0, Number(ms) || 0), fn });
  return id;
};
const fClear = (id) => { reloj.cola = reloj.cola.filter((x) => x.id !== id); };
const fInterval = (fn, ms) => {
  const id = reloj.sig++;
  const vuelta = () => { fn(); reloj.cola.push({ id, en: reloj.ahora + ms, fn: vuelta }); };
  reloj.cola.push({ id, en: reloj.ahora + ms, fn: vuelta });
  return id;
};
const respirar = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setImmediate(r)); };
async function avanzar(ms) {
  const fin = reloj.ahora + ms;
  await respirar();
  for (;;) {
    reloj.cola.sort((a, b) => a.en - b.en || a.id - b.id);
    const t = reloj.cola[0];
    if (!t || t.en > fin) break;
    reloj.cola.shift();
    reloj.ahora = t.en;
    try { t.fn(); } catch { /* un plazo que falla no para el reloj */ }
    await respirar();
  }
  reloj.ahora = fin;
  await respirar();
}

/* ── WEBRTC DE MENTIRA ──────────────────────────────────────────────────────
   Con las reglas que importan aquí: una `answer` sobre una conexión que no
   espera ninguna revienta —como en el navegador—, y la conexión solo se pone
   en pie cuando la prueba lo dice. */
const conexiones = [];
class PC {
  constructor() {
    this.signalingState = 'stable';
    this.connectionState = 'new';
    this.iceConnectionState = 'new';
    this.remoteDescription = null;
    this.localDescription = null;
    this.remotas = 0;
    this.oyentes = {};
    conexiones.push(this);
  }
  addEventListener(t, fn) { (this.oyentes[t] ||= []).push(fn); }
  addTrack() {}
  getSenders() { return []; }
  async createOffer() { return { type: 'offer', sdp: 'oferta' }; }
  async createAnswer() { return { type: 'answer', sdp: 'respuesta' }; }
  async setLocalDescription(d) {
    this.localDescription = { ...d, toJSON: () => ({ type: d.type, sdp: d.sdp }) };
    this.signalingState = d.type === 'offer' ? 'have-local-offer' : 'stable';
  }
  async setRemoteDescription(d) {
    if (d.type === 'answer' && this.signalingState !== 'have-local-offer') {
      throw new Error('InvalidStateError: una answer que nadie esperaba');
    }
    this.remotas++;
    this.remoteDescription = d;
    this.signalingState = d.type === 'offer' ? 'have-remote-offer' : 'stable';
  }
  async addIceCandidate() {}
  close() { this.signalingState = 'closed'; this.cerrada = true; }
  conectar() {
    this.connectionState = 'connected';
    try { this.onconnectionstatechange?.(); } catch {}
    for (const f of this.oyentes.connectionstatechange || []) f();
  }
}
class Descripcion { constructor(d) { Object.assign(this, d); } }
class Candidato { constructor(d) { Object.assign(this, d); } }
const pista = () => ({ kind: 'audio', enabled: true, stop() {} });
const flujo = () => { const p = pista(); return { getTracks: () => [p], getAudioTracks: () => [p], getVideoTracks: () => [] }; };
const mediaDevices = { getUserMedia: async () => flujo(), enumerateDevices: async () => [] };

/* ── EL AUDIO NATIVO DEL TELÉFONO, CON SU RETRASO ───────────────────────────
   `startRingtone` vuelve enseguida pero el sonido arranca DESPUÉS, cuando el
   lado nativo termina de preparar el reproductor (aquí, 200 ms). Un
   `stopRingtone` que llega antes no para nada: es exactamente la carrera. */
const audio = {
  sonando: false,
  arranques: 0,
  start() {}, stop() {}, setKeepScreenOn() {}, setForceSpeakerphoneOn() {},
  startRingback() {}, stopRingback() {},
  startRingtone() { audio.arranques++; fTimeout(() => { audio.sonando = true; }, 200); },
  stopRingtone() { audio.sonando = false; },
};
globalThis.__audioSala = audio;
globalThis.__rtc = { RTCPeerConnection: PC, RTCSessionDescription: Descripcion, RTCIceCandidate: Candidato, mediaDevices };

const FALSOS = {
  'react-native': 'export const Platform = { OS: "ios" }; export const PermissionsAndroid = {};',
  'react-native-incall-manager': 'export default globalThis.__audioSala;',
  'react-native-webrtc': `
    export const RTCPeerConnection = globalThis.__rtc.RTCPeerConnection;
    export const RTCSessionDescription = globalThis.__rtc.RTCSessionDescription;
    export const RTCIceCandidate = globalThis.__rtc.RTCIceCandidate;
    export const mediaDevices = globalThis.__rtc.mediaDevices;`,
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

/* ── LA WEB, CARGADA DE VERDAD ───────────────────────────────────────────── */
function cargarWeb() {
  const ruta = path.join(__dirname, '..', '..', 'apps-web', 'veta-wallet', 'llamada.js');
  const caja = vm.createContext({
    console, Date, JSON, Math, Promise,
    setTimeout: fTimeout, clearTimeout: fClear, setInterval: fInterval, clearInterval: fClear,
    navigator: { mediaDevices },
    document: { getElementById: () => null },
    RTCPeerConnection: PC, RTCSessionDescription: Descripcion, RTCIceCandidate: Candidato,
  });
  vm.runInContext('globalThis.window = globalThis;', caja);
  vm.runInContext(fs.readFileSync(ruta, 'utf8'), caja, { filename: ruta });
  return caja.LLAMADA;
}

/* Cada motor con su buzón de salida y su lista de cambios. `yo` es el id de
   este aparato: el que reconoce su propia `atendida`. */
function enchufar(L) {
  const m = { L, enviadas: [], cambios: [] };
  L.arrancar({
    mandar: (para, tipo, datos) => { m.enviadas.push({ para, tipo, datos }); },
    alCambiar: (c) => { m.cambios.push(c); },
    aparato: () => 'ESTE-APARATO',
  });
  m.estado = () => L.cuento().estado;
  m.ultimo = () => m.cambios[m.cambios.length - 1] || {};
  m.tipos = () => m.enviadas.map((e) => e.tipo);
  m.limpiar = () => { m.enviadas.length = 0; m.cambios.length = 0; };
  m.sdpRespuesta = { type: 'answer', sdp: 'respuesta' };
  return m;
}

const llega = (m, de, tipo, datos = {}, extra = {}) => m.L.recibir({ de, tipo, datos, ...extra });

async function situaciones(nombre, m, esApp) {
  const ANA = 'ana@ordenglobal.link';
  const BETO = 'beto@ordenglobal.link';
  const OFERTA = { type: 'offer', sdp: 'oferta' };

  console.log(`\n── ${nombre}: contestar tarde ya no corta la llamada ─────────`);
  m.limpiar();
  await m.L.llamar(BETO, false);
  await respirar();
  ok('llamar manda `llamo` con la oferta', m.tipos().includes('llamo'));
  await avanzar(30000);
  ok('a los 30 s sigue sonando: no se corta como «sin camino»', m.estado() === 'llamando', m.estado());
  await llega(m, BETO, 'respuesta', { sdp: m.sdpRespuesta });
  ok('la respuesta la pasa a «conectando»', m.estado() === 'conectando', m.estado());
  await avanzar(19000);
  ok('el plazo de conexión cuenta desde la respuesta (19 s después sigue)', m.estado() === 'conectando');
  conexiones[conexiones.length - 1].conectar();
  ok('y conecta', m.estado() === 'hablando', m.estado());
  await avanzar(60000);
  ok('hablando, ningún plazo la corta', m.estado() === 'hablando');
  m.L.colgar('yo');
  ok('colgar manda `cuelgo`', m.tipos().includes('cuelgo'));

  console.log(`\n── ${nombre}: «sin camino» también se lo dice al otro ───────`);
  m.limpiar();
  await m.L.llamar(BETO, false);
  await avanzar(5000);
  await llega(m, BETO, 'respuesta', { sdp: m.sdpRespuesta });
  await avanzar(20001);
  ok('a los 20 s de la respuesta sin conectar se rinde', m.estado() === 'libre');
  ok('con motivo «sin-camino»', m.ultimo().motivo === 'sin-camino', m.ultimo().motivo);
  ok('y le manda `cuelgo` al otro, que si no se queda en «conectando»',
    m.enviadas.some((e) => e.tipo === 'cuelgo' && e.para === BETO), m.tipos().join(','));

  console.log(`\n── ${nombre}: nadie contesta ───────────────────────────────`);
  m.limpiar();
  await m.L.llamar(BETO, false);
  await avanzar(44000);
  ok('a los 44 s sigue sonando', m.estado() === 'llamando');
  await avanzar(1500);
  ok('a los 45 s se rinde', m.estado() === 'libre');
  ok('con motivo «sin-respuesta»', m.ultimo().motivo === 'sin-respuesta', m.ultimo().motivo);
  ok('y manda `cuelgo` para que al otro le deje de sonar',
    m.enviadas.some((e) => e.tipo === 'cuelgo' && e.para === BETO));

  console.log(`\n── ${nombre}: quien recibe y el \`cuelgo\` que se perdió ─────`);
  m.limpiar();
  await llega(m, ANA, 'llamo', { video: false, sdp: OFERTA });
  ok('entra la llamada', m.estado() === 'entrando');
  await avanzar(45000);
  ok('a los 45 s sigue sonando: le da tiempo al `cuelgo` de allá', m.estado() === 'entrando');
  await avanzar(5500);
  ok('pasado el margen deja de sonar solo', m.estado() === 'libre');
  ok('como perdida', m.ultimo().motivo === 'perdida', m.ultimo().motivo);
  ok('y no manda NADA: quien llama puede estar hablando con otro aparato mío',
    m.enviadas.length === 0, m.tipos().join(','));

  console.log(`\n── ${nombre}: el \`cuelgo\` de siempre ───────────────────────`);
  m.limpiar();
  await llega(m, ANA, 'llamo', { video: false, sdp: OFERTA });
  await llega(m, ANA, 'cuelgo');
  ok('colgó quien llamaba: deja de sonar', m.estado() === 'libre' && m.ultimo().motivo === 'el-otro');
  ok('sin contestar nada', m.enviadas.length === 0);

  console.log(`\n── ${nombre}: contestaste en otro aparato ──────────────────`);
  m.limpiar();
  await llega(m, ANA, 'llamo', { video: false, sdp: OFERTA });
  await llega(m, ANA, 'atendida', { como: 'respuesta' }, { desde: 'ESTE-APARATO' });
  ok('la `atendida` de este mismo aparato se ignora', m.estado() === 'entrando');
  await llega(m, 'carla@ordenglobal.link', 'atendida', { como: 'respuesta' }, { desde: 'OTRO' });
  ok('la de otra llamada también', m.estado() === 'entrando');
  await llega(m, ANA, 'atendida', { como: 'respuesta' }, { desde: 'OTRO-APARATO' });
  ok('la de otro aparato mío la deja de hacer sonar', m.estado() === 'libre');
  ok('con «Contestaste en otro aparato»', m.ultimo().motivo === 'en-otro-aparato', m.ultimo().motivo);
  ok('sin mandarle nada a quien llama (sigue hablando con el otro)', m.enviadas.length === 0, m.tipos().join(','));
  await avanzar(60000);
  ok('y el timbre entrante ya no la vuelve a cortar después', m.cambios.filter((c) => c.motivo).length === 1);

  console.log(`\n── ${nombre}: rechazo, ocupado y respuesta tardíos ──────────`);
  m.limpiar();
  await m.L.llamar(BETO, false);
  await avanzar(3000);
  await llega(m, BETO, 'respuesta', { sdp: m.sdpRespuesta });
  const pcEsta = conexiones[conexiones.length - 1];
  await llega(m, BETO, 'rechazo');
  ok('un `rechazo` tardío (su otro aparato) no corta la que ya contestó', m.estado() === 'conectando', m.estado());
  await llega(m, BETO, 'ocupado');
  ok('un `ocupado` tardío tampoco', m.estado() === 'conectando');
  await llega(m, BETO, 'respuesta', { sdp: m.sdpRespuesta });
  ok('una segunda `respuesta` se ignora en vez de reventar la conexión', m.estado() === 'conectando', m.estado());
  ok('la descripción remota se puso UNA vez', pcEsta.remotas === 1, String(pcEsta.remotas));
  pcEsta.conectar();
  await llega(m, BETO, 'rechazo');
  ok('hablando, un rechazo tardío sigue sin cortar', m.estado() === 'hablando');
  m.L.colgar('yo');

  console.log(`\n── ${nombre}: y mientras suena, el rechazo sí vale ──────────`);
  m.limpiar();
  await m.L.llamar(BETO, false);
  await avanzar(2000);
  await llega(m, BETO, 'rechazo');
  ok('rechazada mientras sonaba: se corta', m.estado() === 'libre' && m.ultimo().motivo === 'rechazada',
    m.ultimo().motivo);
  ok('sin mandar `cuelgo` (el otro ya lo sabe)', !m.tipos().includes('cuelgo'));

  console.log(`\n── ${nombre}: dos toques en «Contestar» ─────────────────────`);
  m.limpiar();
  const antes = conexiones.length;
  await llega(m, ANA, 'llamo', { video: false, sdp: OFERTA });
  await Promise.all([m.L.contestar(false), m.L.contestar(false), m.L.contestar(false)]);
  await respirar();
  ok('UNA respuesta', m.tipos().filter((t) => t === 'respuesta').length === 1, m.tipos().join(','));
  ok('UNA conexión', conexiones.length - antes === 1, String(conexiones.length - antes));
  ok('y queda conectando', m.estado() === 'conectando');
  await avanzar(20001);
  ok('quien contestó también tiene su plazo de conexión, y avisa', m.estado() === 'libre'
    && m.ultimo().motivo === 'sin-camino' && m.enviadas.some((e) => e.tipo === 'cuelgo' && e.para === ANA),
    `${m.ultimo().motivo} · ${m.tipos().join(',')}`);

  if (!esApp) return;

  console.log(`\n── ${nombre}: la carrera del timbre ────────────────────────`);
  m.limpiar();
  audio.sonando = false;
  // La llamada y su cuelgo en la MISMA tanda, como al abrir la app desde el aviso.
  m.L.recibir({ de: ANA, tipo: 'llamo', datos: { video: false, sdp: OFERTA } });
  m.L.recibir({ de: ANA, tipo: 'cuelgo', datos: {} });
  await avanzar(3000);
  ok('llamada y cuelgo juntos: el timbre NO queda sonando', audio.sonando === false);
  ok('y el motor quedó libre', m.estado() === 'libre');

  m.L.recibir({ de: ANA, tipo: 'llamo', datos: { video: false, sdp: OFERTA } });
  m.L.recibir({ de: ANA, tipo: 'atendida', datos: { como: 'respuesta' }, desde: 'OTRO-APARATO' });
  await avanzar(3000);
  ok('con la `atendida` en la misma tanda, tampoco', audio.sonando === false);

  // El callar tardío de una llamada vieja no apaga el timbre de una nueva.
  m.L.recibir({ de: ANA, tipo: 'llamo', datos: { video: false, sdp: OFERTA } });
  m.L.recibir({ de: ANA, tipo: 'cuelgo', datos: {} });
  await avanzar(100);
  m.L.recibir({ de: BETO, tipo: 'llamo', datos: { video: false, sdp: OFERTA } });
  await avanzar(2500);
  ok('una llamada NUEVA justo después sí suena', audio.sonando === true && m.estado() === 'entrando');
  m.L.rechazar();
  await avanzar(2000);
  ok('y rechazarla la calla', audio.sonando === false);
}

(async () => {
  const web = enchufar(cargarWeb());
  const app = enchufar((await import(path.join(__dirname, '..', 'src', 'og', 'llamada.js'))).default);
  // Desde aquí, todos los plazos corren con el reloj de mentira.
  globalThis.setTimeout = fTimeout;
  globalThis.clearTimeout = fClear;
  globalThis.setInterval = fInterval;
  globalThis.clearInterval = fClear;

  await situaciones('WEB', web, false);
  await situaciones('APP', app, true);

  console.log(fallos ? `\n${fallos} en rojo\n` : '\nTodo en verde\n');
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
