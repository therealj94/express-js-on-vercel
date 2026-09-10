/* Llamadas de grupo en el teléfono, en malla.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ES EL MISMO PROTOCOLO QUE `apps-web/veta-wallet/llamadaGrupo.js`
 *
 * Las señales tienen los mismos nombres y los mismos campos —gllamo, gentro,
 * goferta, grespuesta, gice, gsalgo, grechazo— para que un teléfono pueda
 * entrar a una llamada que empezó en un navegador y al revés. Cambiar una acá
 * sin cambiarla allá parte el grupo en dos mitades que no se oyen.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * POR QUE MALLA Y NO UN SERVIDOR QUE REPARTA
 *
 * En malla cada teléfono se conecta con cada otro y el audio va DIRECTO. Sigue
 * siendo de punta a punta: nadie en el medio puede abrirlo, ni nosotros.
 *
 * Un SFU aguantaría muchas más personas, pero para repartir tiene que
 * DESCIFRAR. Es un intercambio real, no una preferencia técnica: se gana gente
 * y se pierde el secreto, que es justo el sello que el chat enseña.
 *
 * EL LIMITE, MEDIDO
 *
 * En malla cada uno SUBE su video a todos los demás. A 360p son 0,5 Mbps por
 * persona: tres son 1 Mbps de subida, cuatro 1,5 y cinco 2. Un móvil decente
 * sube entre 2 y 5, así que cinco es el techo honesto. Se corta ahí y se dice,
 * en vez de dejar que la sexta persona degrade la llamada DE TODOS.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * QUIEN OFRECE, Y POR QUE IMPORTA
 *
 * Cuando dos se descubren, uno hace la oferta y el otro espera. Si los dos
 * ofrecieran a la vez —lo que en WebRTC se llama «glare»— las dos ofertas
 * chocan y esa conexión no se levanta nunca. La regla es fija y sin sorteo:
 * ofrece el correo menor. Dos teléfonos llegan a la misma conclusión sin
 * hablarlo, y un teléfono y un navegador también.
 */

import { PermissionsAndroid, Platform } from 'react-native';
import AudioSala from 'react-native-incall-manager';

/* Igual que en el cara a cara: si el módulo nativo no está, el altavoz no
   responde y la pantalla esconde su botón en vez de ofrecerlo muerto. */
const HAY_AUDIO = !!AudioSala && typeof AudioSala.start === 'function';
import {
  RTCPeerConnection,
  RTCIceCandidate,
  RTCSessionDescription,
  mediaDevices,
} from 'react-native-webrtc';

/* Cinco es el techo. No es un número redondo elegido a ojo: la sexta persona
   empuja la subida de cada uno por encima de lo que un móvil sostiene. */
const TOPE = 5;

/* Video más chico que en el cara a cara, y a propósito: en malla cada uno sube
   tantas copias como gente haya. Con 720p, cuatro serían 4,5 Mbps de subida y
   el teléfono no llega. */
const VIDEO = { width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 24 } };

let yo = null;
let grupo = null;
let miFlujo = null;
let estado = 'libre';          // libre · llamando · entrando · hablando
let conVideo = true;
let porAltavoz = true;
const pares = new Map();       // correo -> { pc, flujo, cola: [] }
let entrante = null;

/* Quien anunció que entraba ANTES de que yo abriera mi cámara.
 *
 * Pasa siempre que dos contestan casi a la vez: el primero manda su `gentro`
 * mientras el segundo todavía está en la pantalla de «entra una llamada», sin
 * micrófono abierto. Si se creara la conexión en ese momento nacería SIN mis
 * pistas —no existen todavía— y esa persona no me oiría nunca, aunque la
 * conexión figurara como conectada. Se anotan y se atienden al contestar. */
const porConectar = new Set();

/* La pantalla compartida, si la hay. Se declara acá arriba —y no junto a su
   función— porque `cuento()` la lee, y `cuento()` corre antes. */
let flujoPantalla = null;

let mandarSenal = null;
let traerTurno = null;
let avisar = () => {};
let hielo = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
];

export const cuento = () => ({
  estado,
  grupo,
  yo,
  entrante,
  gente: [...pares.entries()].map(([correo, p]) => ({
    correo,
    hayFlujo: !!p.flujo,
    conectado: p.pc?.connectionState === 'connected',
  })),
  cuantos: pares.size + (estado === 'hablando' || estado === 'llamando' ? 1 : 0),
  micAbierto: !!miFlujo?.getAudioTracks?.()[0]?.enabled,
  camAbierta: !!miFlujo?.getVideoTracks?.()[0]?.enabled,
  conVideo,
  porAltavoz,
  audioListo: HAY_AUDIO,
  flujoLocal: miFlujo,
  lleno: pares.size + 1 >= TOPE,
  compartiendo: !!flujoPantalla,
  TOPE,
});

const anunciar = (extra) => { try { avisar({ ...cuento(), ...(extra || {}) }); } catch {} };

async function refrescarHielo() {
  if (!traerTurno) return;
  try {
    const s = await traerTurno();
    if (Array.isArray(s) && s.length) hielo = [...hielo, ...s];
  } catch { /* sin relevo se sigue igual */ }
}

async function permisos(video) {
  if (Platform.OS !== 'android') return true;
  const quiere = [PermissionsAndroid.PERMISSIONS.RECORD_AUDIO];
  if (video) quiere.push(PermissionsAndroid.PERMISSIONS.CAMERA);
  try {
    const r = await PermissionsAndroid.requestMultiple(quiere);
    return quiere.every((p) => r[p] === PermissionsAndroid.RESULTS.GRANTED);
  } catch { return false; }
}

async function abrirMedios(video) {
  if (!(await permisos(video))) throw new Error('sin-permiso');
  return mediaDevices.getUserMedia({ audio: true, video: video ? VIDEO : false });
}

/* Una llamada de grupo arranca SIEMPRE en altavoz: son varios, y nadie sigue
   una conversación de cuatro con el teléfono pegado a la oreja. */
function audioArranca() {
  try {
    AudioSala.start({ media: 'video', auto: true });
    porAltavoz = true;
    AudioSala.setForceSpeakerphoneOn(true);
    // La pantalla no se apaga mientras dure: el botón de salir no puede
    // quedar detrás del desbloqueo.
    AudioSala.setKeepScreenOn(true);
  } catch {}
}

function audioTermina() {
  try { AudioSala.stopRingtone(); } catch {}
  try { AudioSala.setKeepScreenOn(false); } catch {}
  try { AudioSala.stop(); } catch {}
}

/* El mismo timbre que en el cara a cara, y por la misma razón: con la app
   abierta el relevo no manda push, así que si no sonamos nosotros la llamada
   de grupo aparece muda. */
function timbreArranca() {
  try { AudioSala.startRingtone('_DEFAULT_', [0, 900, 600], null, 30); } catch {}
}

function timbreCalla() {
  try { AudioSala.stopRingtone(); } catch {}
}

export function altavoz(encender) {
  porAltavoz = encender === undefined ? !porAltavoz : !!encender;
  try { AudioSala.setForceSpeakerphoneOn(porAltavoz); } catch {}
  anunciar();
}

/* ── LOS PARES ───────────────────────────────────────────────────────────── */

function nuevoPar(correo) {
  if (pares.has(correo)) return pares.get(correo);
  const pc = new RTCPeerConnection({ iceServers: hielo, iceCandidatePoolSize: 2 });
  const par = { pc, flujo: null, cola: [] };
  pares.set(correo, par);

  pc.addEventListener('icecandidate', (e) => {
    if (e.candidate) {
      mandarSenal(correo, 'gice', {
        grupo,
        candidato: e.candidate.toJSON ? e.candidate.toJSON() : e.candidate,
      });
    }
  });

  pc.addEventListener('track', (e) => {
    par.flujo = (e.streams && e.streams[0]) || null;
    anunciar();
  });

  pc.addEventListener('connectionstatechange', () => {
    /* Una conexión que se cae se lleva SOLO a esa persona, no la llamada. En
       una de cinco, que se caiga la de uno no puede echar a los otros cuatro
       — que es lo que pasaría si esto colgara todo. */
    if (['failed', 'closed'].includes(pc.connectionState)) cerrarPar(correo);
    anunciar();
  });

  if (miFlujo) miFlujo.getTracks().forEach((t) => pc.addTrack(t, miFlujo));
  return par;
}

function cerrarPar(correo) {
  const p = pares.get(correo);
  if (!p) return;
  try { p.pc.close(); } catch {}
  pares.delete(correo);
  anunciar();
  // El último que quedaba se fue: la llamada se acabó sola.
  if (!pares.size && estado === 'hablando') colgar('solo');
}

/** Quién hace la oferta. Regla fija: el correo menor. Ver la nota de arriba. */
const meTocaOfrecer = (otro) => String(yo || '') < String(otro || '');

async function ofrecerA(correo) {
  const par = nuevoPar(correo);
  const of = await par.pc.createOffer({});
  await par.pc.setLocalDescription(of);
  mandarSenal(correo, 'goferta', { grupo, sdp: par.pc.localDescription.toJSON() });
}

async function vaciarCola(par) {
  for (const c of par.cola) {
    try { await par.pc.addIceCandidate(new RTCIceCandidate(c)); } catch {}
  }
  par.cola = [];
}

/* ── EMPEZAR ─────────────────────────────────────────────────────────────── */

export async function llamar(gid, miembros, video = true) {
  if (estado !== 'libre') throw new Error('ya hay una llamada');
  if ((miembros || []).length + 1 > TOPE) { const e = new Error('lleno'); e.code = 'lleno'; throw e; }
  grupo = gid; conVideo = !!video; estado = 'llamando';
  anunciar();
  try {
    await refrescarHielo();
    miFlujo = await abrirMedios(conVideo);
    audioArranca();
    /* La lista de miembros viaja DENTRO del aviso. Sin ella, quien contesta no
       sabe a quién más avisar de que entró, y el tercero acabaría oyendo solo
       al primero: cada uno conectado con quien lo llamó y con nadie más. */
    const todos = [...(miembros || []), yo];
    for (const m of (miembros || [])) {
      mandarSenal(m, 'gllamo', { grupo: gid, video: conVideo, miembros: todos });
    }
    anunciar();
  } catch (e) {
    colgar('no-se-pudo');
    throw e;
  }
}

export async function contestar(video = true) {
  if (!entrante) return;
  const dentro = entrante;
  timbreCalla();
  grupo = dentro.grupo; conVideo = !!video;
  estado = 'hablando';
  anunciar();
  try {
    await refrescarHielo();
    miFlujo = await abrirMedios(conVideo);
    audioArranca();
    /* Se avisa a TODOS los del grupo, no solo a quien llamó: los que ya
       estaban tienen que enterarse de que hay alguien nuevo para abrirle su
       propia conexión. Sin esto, el tercero solo oiría al primero. */
    for (const m of (dentro.miembros || [])) {
      if (m !== yo) mandarSenal(m, 'gentro', { grupo });
    }
    entrante = null;
    await atenderPendientes();
    anunciar();
  } catch (e) {
    colgar('no-se-pudo');
    throw e;
  }
}

/** Abre la conexión con quien avisó antes de que yo tuviera cámara. */
async function atenderPendientes() {
  for (const c of [...porConectar]) {
    porConectar.delete(c);
    if (pares.has(c) || pares.size + 1 >= TOPE) continue;
    try {
      if (meTocaOfrecer(c)) await ofrecerA(c);
      else nuevoPar(c);
    } catch {}
  }
}

export function rechazar() {
  if (!entrante) return;
  timbreCalla();
  audioTermina();
  mandarSenal(entrante.de, 'grechazo', { grupo: entrante.grupo });
  entrante = null; grupo = null; estado = 'libre';
  anunciar();
}

export function colgar(motivo = 'yo') {
  const g = grupo;
  const gente = [...pares.keys()];
  for (const c of gente) { try { pares.get(c).pc.close(); } catch {} }
  pares.clear();
  porConectar.clear();
  audioTermina();
  try { miFlujo?.getTracks?.().forEach((t) => t.stop()); } catch {}
  miFlujo = null;
  if (g && motivo === 'yo') {
    for (const c of gente) mandarSenal(c, 'gsalgo', { grupo: g });
  }
  grupo = null; estado = 'libre'; entrante = null;
  anunciar({ motivo });
}

/* ── LO QUE LLEGA ────────────────────────────────────────────────────────── */

/** Devuelve true si la señal era de grupo, para que quien reparte no la pase dos veces. */
export async function recibir(s) {
  const de = String(s?.de || '').toLowerCase();
  const d = s?.datos || {};
  if (!String(s?.tipo || '').startsWith('g')) return false;
  try {
    if (s.tipo === 'gllamo') {
      if (estado !== 'libre') return true;                    // ocupado: se ignora
      entrante = {
        de, grupo: d.grupo, video: !!d.video,
        // Si no vino la lista, al menos se conoce a quien llamó.
        miembros: (d.miembros && d.miembros.length) ? d.miembros : [de],
      };
      grupo = d.grupo; estado = 'entrando';
      timbreArranca();
      anunciar();
      return true;
    }
    if (d.grupo !== grupo) return true;                       // de otra llamada

    if (s.tipo === 'gentro') {
      if (pares.size + 1 >= TOPE) return true;                // lleno: no entra
      // Sin cámara todavía: se anota y se atiende al contestar.
      if (!miFlujo) { porConectar.add(de); return true; }
      if (estado === 'llamando') estado = 'hablando';
      if (meTocaOfrecer(de)) await ofrecerA(de);
      else nuevoPar(de);
      anunciar();
      return true;
    }
    if (s.tipo === 'goferta') {
      const par = nuevoPar(de);
      await par.pc.setRemoteDescription(new RTCSessionDescription(d.sdp));
      await vaciarCola(par);
      const r = await par.pc.createAnswer();
      await par.pc.setLocalDescription(r);
      mandarSenal(de, 'grespuesta', { grupo, sdp: par.pc.localDescription.toJSON() });
      if (estado !== 'hablando') estado = 'hablando';
      anunciar();
      return true;
    }
    if (s.tipo === 'grespuesta') {
      const par = pares.get(de);
      if (!par) return true;
      await par.pc.setRemoteDescription(new RTCSessionDescription(d.sdp));
      await vaciarCola(par);
      return true;
    }
    if (s.tipo === 'gice') {
      const par = pares.get(de);
      if (!par || !d.candidato) return true;
      // Los candidatos llegan a veces antes que la descripción, y añadirlos
      // entonces revienta: se guardan y se meten cuando ya hay dónde.
      if (par.pc.remoteDescription) {
        try { await par.pc.addIceCandidate(new RTCIceCandidate(d.candidato)); } catch {}
      } else par.cola.push(d.candidato);
      return true;
    }
    if (s.tipo === 'gsalgo') { cerrarPar(de); return true; }
    if (s.tipo === 'grechazo') { anunciar(); return true; }
  } catch {
    cerrarPar(de);
  }
  return true;
}

/* ── MANDOS ──────────────────────────────────────────────────────────────── */

export function micro(encender) {
  const t = miFlujo?.getAudioTracks?.()[0];
  if (!t) return;
  t.enabled = encender === undefined ? !t.enabled : !!encender;
  anunciar();
}

export function camara(encender) {
  const t = miFlujo?.getVideoTracks?.()[0];
  if (!t) return;
  t.enabled = encender === undefined ? !t.enabled : !!encender;
  anunciar();
}

export function voltear() {
  const t = miFlujo?.getVideoTracks?.()[0];
  if (!t?._switchCamera) return;
  try { t._switchCamera(); } catch {}
}

/** Compartir pantalla: se reemplaza la pista en TODAS las conexiones. */
export async function pantalla() {
  if (!pares.size) return;
  if (flujoPantalla) return dejarPantalla();
  try {
    const p = await mediaDevices.getDisplayMedia({ video: true, audio: false });
    flujoPantalla = p;
    const nueva = p.getVideoTracks()[0];
    for (const { pc } of pares.values()) {
      const emisor = pc.getSenders().find((x) => x.track?.kind === 'video');
      if (emisor) { try { await emisor.replaceTrack(nueva); } catch {} }
    }
    nueva.addEventListener?.('ended', () => { dejarPantalla(); });
    anunciar();
  } catch {
    flujoPantalla = null;
    anunciar();
  }
}

export async function dejarPantalla() {
  if (!flujoPantalla) return;
  try { flujoPantalla.getTracks().forEach((t) => t.stop()); } catch {}
  flujoPantalla = null;
  const dela = miFlujo?.getVideoTracks?.()[0] || null;
  for (const { pc } of pares.values()) {
    const emisor = pc.getSenders().find((x) => x.track?.kind === 'video');
    if (emisor) { try { await emisor.replaceTrack(dela); } catch {} }
  }
  anunciar();
}

export function arrancar({ correo, mandar, alCambiar, turno }) {
  yo = String(correo || '').toLowerCase();
  mandarSenal = mandar || (() => {});
  avisar = alCambiar || (() => {});
  traerTurno = turno || null;
}

/** El flujo de una persona. La pantalla lo pide por correo en vez de que se lo
    mandemos en cada aviso: un MediaStream no se puede copiar, y pasarlo por el
    objeto de estado obligaría a compararlo por identidad en cada repintado. */
export const flujoDe = (correo) => pares.get(String(correo || '').toLowerCase())?.flujo || null;

export const enLlamada = () => estado !== 'libre';

export default {
  arrancar, recibir, llamar, contestar, rechazar, colgar, flujoDe,
  micro, camara, voltear, altavoz, pantalla, dejarPantalla,
  cuento, enLlamada, TOPE,
};
