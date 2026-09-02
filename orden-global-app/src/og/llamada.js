/* Llamadas de voz y video de PULSE2CHAT, en el teléfono.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ESTO HABLA EL MISMO IDIOMA QUE LA WEB, Y ESO NO ES UN DETALLE
 *
 * `apps-web/veta-wallet/llamada.js` ya llamaba desde el navegador. Si el
 * teléfono inventara su propio protocolo, un teléfono no podría llamar a una
 * pestaña, que es justo lo que más va a pasar: la mitad de la gente entra por
 * la web y la otra mitad por la app.
 *
 * Así que las señales son EXACTAMENTE las mismas, con los mismos nombres y
 * los mismos campos:
 *
 *   llamo      { video, sdp }   quien llama, con su oferta ya dentro
 *   respuesta  { sdp }          quien contesta
 *   ice        { candidato }    los caminos de red que va encontrando cada uno
 *   rechazo    {}               «no contesto»
 *   ocupado    {}               «estoy en otra»
 *   cuelgo     {}               se terminó
 *
 * Cualquier cambio aquí hay que hacerlo también allá, o las llamadas entre
 * app y web dejan de montarse sin que ninguna prueba lo note.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * LO QUE CAMBIA RESPECTO DE LA WEB
 *
 * En el navegador el video se cuelga de un <video> por su `srcObject`. Acá no
 * hay DOM: `react-native-webrtc` pinta con <RTCView streamURL={…}>, así que
 * los flujos se ENTREGAN en el estado y la pantalla decide dónde ponerlos.
 * Este archivo no sabe nada de cómo se ve una llamada, y esa es la idea.
 *
 * Y hay algo que el teléfono sí puede y la web no: sonar con la app cerrada.
 * El aviso de llamada entrante viaja por el mismo push que los mensajes; esto
 * solo se encarga de la llamada en sí.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * SIN TURN, ENTRE EL 15 Y EL 20 % NO CONECTA
 *
 * Con STUN a secas conectan casi todas. Cuando los dos están detrás de un NAT
 * cerrado —dos redes móviles, por ejemplo— no hay camino directo posible y
 * hace falta un relevo TURN, que cuesta al mes. Este archivo NO lo disimula:
 * cuando pasa, cuelga con motivo `sin-camino` y apunta qué clases de camino
 * llegó a ver. Una llamada que se queda en «conectando…» para siempre es peor
 * que una que avisa, porque la persona lo intenta diez veces creyendo que es
 * su internet.
 */

import { PermissionsAndroid, Platform } from 'react-native';
import {
  RTCPeerConnection,
  RTCIceCandidate,
  RTCSessionDescription,
  mediaDevices,
} from 'react-native-webrtc';

/* STUN público de Google y Cloudflare: gratis, sin cuenta y llevan años en
   pie. El día que se enchufe un TURN se suma a esta lista y no cambia nada
   más — `iceServers` acepta los dos a la vez y el motor elige. */
const HIELO = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
];

/* Cuánto se espera a que la conexión se ponga en pie antes de rendirse. Sin
   plazo, «no pasa nada» se ve igual que «va a conectar en un segundo». */
const PLAZO_CONEXION = 20000;

let pc = null;
let miFlujo = null;
let flujoRemoto = null;
let estado = 'libre';            // libre · llamando · entrando · conectando · hablando
let conQuien = null;
let soyQuienLlama = false;
let entrante = null;             // lo que llegó con `llamo`, mientras se pregunta
let iceEnCola = [];
let relojConexion = null;
let tiposVistos = new Set();

let mandarSenal = () => {};
let avisar = () => {};
let pedirTurno = null;

/* Las credenciales del relevo duran una hora. Se guardan un rato porque
   pedirlas en cada llamada sería una ida y vuelta de red justo en el momento
   en que más importa la prisa. */
let turno = [];
let turnoHasta = 0;

async function refrescarTurno() {
  if (!pedirTurno || Date.now() < turnoHasta) return;
  try {
    const s = await pedirTurno();
    if (Array.isArray(s) && s.length) {
      turno = s;
      turnoHasta = Date.now() + 45 * 60 * 1000;   // menos que la hora que duran
    }
  } catch { /* sin relevo se sigue igual: la mayoría conecta sin él */ }
}

const servidores = () => (turno.length ? [...HIELO, ...turno] : HIELO);

export const cuento = () => ({
  estado,
  conQuien,
  soyQuienLlama,
  entrante,
  /* Los flujos van en el estado para que la pantalla los pinte. Se entregan
     los objetos, no sus URLs: `toURL()` cambia cuando cambia el flujo, y la
     pantalla necesita poder distinguir «el mismo flujo» de «uno nuevo». */
  flujoLocal: miFlujo,
  flujoRemoto,
  hayVideo: !!miFlujo?.getVideoTracks?.().length,
  micAbierto: !!miFlujo?.getAudioTracks?.()[0]?.enabled,
  camAbierta: !!miFlujo?.getVideoTracks?.()[0]?.enabled,
});

const anunciar = (extra) => { try { avisar({ ...cuento(), ...(extra || {}) }); } catch {} };

function armarPlazo() {
  clearTimeout(relojConexion);
  relojConexion = setTimeout(() => {
    if (estado !== 'hablando') colgar('sin-camino');
  }, PLAZO_CONEXION);
}

/* ── LA CONEXIÓN ─────────────────────────────────────────────────────────── */

function nuevaConexion() {
  /* `iceCandidatePoolSize` hace que se empiecen a buscar caminos ANTES de que
     haya una oferta. Sin esto la búsqueda arranca al crear la oferta y se
     pierden uno o dos segundos justo cuando la persona mira la pantalla. */
  const c = new RTCPeerConnection({ iceServers: servidores(), iceCandidatePoolSize: 4 });

  c.addEventListener('icecandidate', (e) => {
    if (!e.candidate || !conQuien) return;
    /* Se apunta QUÉ CLASE de camino es. Es lo que después permite decir «hace
       falta un relevo» con pruebas y no con una corazonada: `host` es la red
       local, `srflx` la dirección pública que dio el STUN, y `relay` solo
       aparece si hay TURN. Sin ningún `relay` y sin conexión, el diagnóstico
       es exacto. */
    try { tiposVistos.add(e.candidate.type || '?'); } catch {}
    mandarSenal(conQuien, 'ice', { candidato: e.candidate.toJSON ? e.candidate.toJSON() : e.candidate });
  });

  c.addEventListener('track', (e) => {
    if (e.streams && e.streams[0]) {
      flujoRemoto = e.streams[0];
      anunciar();
    }
  });

  c.addEventListener('iceconnectionstatechange', () => {
    /* `failed` significa que se probaron todos los caminos y no hay ninguno.
       Casi siempre es NAT cerrado de los dos lados, que es exactamente lo que
       resolvería un TURN. Se corta y se dice. */
    if (c.iceConnectionState === 'failed') colgar('sin-camino');
    if (c.iceConnectionState === 'disconnected') {
      // Un corte de un segundo se recupera solo; sin este margen la llamada
      // se cae con cada túnel del camino.
      setTimeout(() => {
        if (pc === c && c.iceConnectionState === 'disconnected') colgar('corte');
      }, 6000);
    }
  });

  c.addEventListener('connectionstatechange', () => {
    /* «Hablando» SOLO cuando la conexión está de verdad en pie. Ponerlo en
       cuanto alguien contesta produce lo peor: la pantalla diciendo «En
       llamada» sobre un negro que no llega nunca. */
    if (c.connectionState === 'connected') {
      clearTimeout(relojConexion); relojConexion = null;
      if (estado !== 'hablando') { estado = 'hablando'; anunciar(); }
    }
    if (c.connectionState === 'failed') colgar('sin-camino');
  });

  return c;
}

/* LOS PERMISOS SE PIDEN ACÁ, Y NO ANTES.
 *
 * En Android, `getUserMedia` NO pide nada: si el permiso no está dado
 * simplemente falla, y la llamada moría con «no se pudo abrir el micrófono»
 * sin que a la persona le hubiera aparecido nunca un diálogo que pudiera
 * aceptar.
 *
 * Y se piden en el momento de llamar, no al abrir la app: un permiso de
 * micrófono que salta sin que nadie haya pedido llamar se niega casi siempre,
 * y en Android negarlo dos veces lo deja bloqueado para siempre.
 */
async function permisos(conVideo) {
  if (Platform.OS !== 'android') return true;
  const quiere = [PermissionsAndroid.PERMISSIONS.RECORD_AUDIO];
  if (conVideo) quiere.push(PermissionsAndroid.PERMISSIONS.CAMERA);
  try {
    const r = await PermissionsAndroid.requestMultiple(quiere);
    return quiere.every((p) => r[p] === PermissionsAndroid.RESULTS.GRANTED);
  } catch {
    return false;
  }
}

/** Abre micrófono, y cámara si es una llamada de video. */
async function abrirMedios(conVideo) {
  if (!(await permisos(conVideo))) throw new Error('sin-permiso');
  return mediaDevices.getUserMedia({
    audio: true,
    video: conVideo
      ? { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }
      : false,
  });
}

async function vaciarCola() {
  const cola = iceEnCola;
  iceEnCola = [];
  for (const cand of cola) {
    try { await pc.addIceCandidate(new RTCIceCandidate(cand)); } catch { /* uno malo no tumba la llamada */ }
  }
}

/* ── LLAMAR ──────────────────────────────────────────────────────────────── */

export async function llamar(correo, conVideo) {
  if (estado !== 'libre') throw new Error('ya hay una llamada');
  conQuien = String(correo || '').toLowerCase();
  soyQuienLlama = true;
  estado = 'llamando';
  iceEnCola = [];
  anunciar();
  try {
    // El relevo se pide ANTES de crear la conexión: `iceServers` no se puede
    // cambiar después, y añadirlo tarde no sirve de nada.
    await refrescarTurno();
    miFlujo = await abrirMedios(conVideo);
    pc = nuevaConexion();
    miFlujo.getTracks().forEach((t) => pc.addTrack(t, miFlujo));
    armarPlazo();
    const oferta = await pc.createOffer({});
    await pc.setLocalDescription(oferta);
    /* `llamo` va con la oferta dentro: una ida y vuelta menos, y quien recibe
       ya sabe si es video ANTES de decidir si contesta. */
    mandarSenal(conQuien, 'llamo', { video: !!conVideo, sdp: pc.localDescription.toJSON() });
    anunciar();
  } catch (e) {
    colgar('no-se-pudo');
    throw e;
  }
}

/* ── CONTESTAR ───────────────────────────────────────────────────────────── */

export async function contestar(conVideo) {
  if (!entrante) return;
  const { de, sdp } = entrante;
  conQuien = de;
  soyQuienLlama = false;
  // CONECTANDO, no «hablando»: todavía no llegó ni un pixel del otro lado.
  estado = 'conectando';
  anunciar();
  try {
    await refrescarTurno();
    miFlujo = await abrirMedios(conVideo);
    pc = nuevaConexion();
    miFlujo.getTracks().forEach((t) => pc.addTrack(t, miFlujo));
    armarPlazo();
    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    await vaciarCola();
    const resp = await pc.createAnswer();
    await pc.setLocalDescription(resp);
    mandarSenal(conQuien, 'respuesta', { sdp: pc.localDescription.toJSON() });
    entrante = null;
    anunciar();
  } catch (e) {
    colgar('no-se-pudo');
    throw e;
  }
}

export function rechazar() {
  if (!entrante) return;
  mandarSenal(entrante.de, 'rechazo', {});
  entrante = null;
  estado = 'libre';
  conQuien = null;
  anunciar();
}

/* ── COLGAR ──────────────────────────────────────────────────────────────── */

function soltarTodo() {
  try { miFlujo?.getTracks?.().forEach((t) => t.stop()); } catch {}
  try { pc?.close?.(); } catch {}
  miFlujo = null;
  flujoRemoto = null;
  pc = null;
  iceEnCola = [];
}

/**
 * Cuelga. El `motivo` viaja a la pantalla para poder decir QUÉ pasó: no es lo
 * mismo «colgaste» que «no había camino» —esa segunda es la del relevo que no
 * tenemos—, y meterlas en el mismo mensaje deja a la gente sin saber si el
 * problema es suyo.
 */
export function colgar(motivo = 'yo') {
  const otro = conQuien;
  const avisarAlOtro = otro && ['yo', 'corte'].includes(motivo) && estado !== 'libre';
  /* El diagnóstico se arma ANTES de soltar todo, que es cuando todavía se
     puede mirar. Sirve para decirle a la persona por qué no conectó, y a
     nosotros para saber si hace falta pagar el TURN o si es otra cosa. */
  const caminos = [...tiposVistos].join(',') || 'ninguno';
  const hizoFaltaRelevo = motivo === 'sin-camino' && !tiposVistos.has('relay');
  clearTimeout(relojConexion); relojConexion = null;
  tiposVistos = new Set();
  soltarTodo();
  estado = 'libre';
  conQuien = null;
  soyQuienLlama = false;
  entrante = null;
  if (avisarAlOtro) { try { mandarSenal(otro, 'cuelgo', {}); } catch {} }
  anunciar({ motivo, caminos, hizoFaltaRelevo });
}

/* ── MICRÓFONO, CÁMARA ───────────────────────────────────────────────────── */

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

/** Cambia entre la cámara de adelante y la de atrás. Solo en el teléfono. */
export function voltear() {
  const t = miFlujo?.getVideoTracks?.()[0];
  if (!t?._switchCamera) return;
  try { t._switchCamera(); } catch {}
}

/* ── LO QUE LLEGA DEL OTRO LADO ──────────────────────────────────────────── */

export async function recibir(s) {
  const de = String(s.de || '').toLowerCase();
  const d = s.datos || {};
  try {
    if (s.tipo === 'llamo') {
      /* Ocupado: se contesta y no se deja la llamada colgando. Sin esto quien
         llama espera hasta rendirse sin saber por qué. */
      if (estado !== 'libre') { mandarSenal(de, 'ocupado', {}); return; }
      entrante = { de, video: !!d.video, sdp: d.sdp };
      conQuien = de;
      estado = 'entrando';
      anunciar();
      return;
    }
    if (de !== conQuien) return;   // señal de otra llamada: se ignora

    if (s.tipo === 'respuesta' && pc) {
      await pc.setRemoteDescription(new RTCSessionDescription(d.sdp));
      await vaciarCola();
      anunciar();
      return;
    }
    if (s.tipo === 'ice') {
      const cand = d.candidato;
      if (!cand) return;
      if (pc?.remoteDescription) {
        try { await pc.addIceCandidate(new RTCIceCandidate(cand)); } catch {}
      } else {
        iceEnCola.push(cand);
      }
      return;
    }
    if (s.tipo === 'cuelgo') return colgar('el-otro');
    if (s.tipo === 'rechazo') return colgar('rechazada');
    if (s.tipo === 'ocupado') return colgar('ocupado');
  } catch {
    colgar('no-se-pudo');
  }
}

/** Lo enchufa la app: cómo mandar señales, a quién avisar y de dónde sale el relevo. */
export function arrancar({ mandar, alCambiar, traerTurno }) {
  mandarSenal = mandar || (() => {});
  avisar = alCambiar || (() => {});
  pedirTurno = traerTurno || null;
  // Se piden ya, sin esperar a la primera llamada: cuando alguien toque
  // «llamar», las credenciales ya van a estar puestas.
  refrescarTurno();
}

export const hayTurno = () => turno.length > 0;
export const enLlamada = () => estado !== 'libre';

export default {
  arrancar, recibir, llamar, contestar, rechazar, colgar,
  micro, camara, voltear, cuento, hayTurno, enLlamada,
};
