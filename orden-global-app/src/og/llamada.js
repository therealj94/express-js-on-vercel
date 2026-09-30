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
 * Y una que no manda nadie de los dos, la pone el relevo: `atendida` { como },
 * con `desde` = el aparato que contestó. La misma cuenta puede tener la
 * llamada sonando en el teléfono, en la web y en AU-RA; cuando uno contesta o
 * rechaza, el relevo se lo dice a la PROPIA cuenta, el aparato que contestó la
 * ignora (es él) y los demás dejan de sonar: «Contestaste en otro aparato».
 * Para eso cada aparato manda su id (`aparato`) al pedir y al dejar señales.
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
 * EL RELEVO ESTA PUESTO, Y AUN ASI SE SIGUE DICIENDO CUANDO FALLA
 *
 * Con STUN a secas, entre el 15 y el 20 % de las llamadas no conecta: cuando
 * los dos están detrás de un NAT cerrado no hay camino directo posible. El
 * relevo TURN de Cloudflare está configurado en el servidor y `/turno`
 * devuelve credenciales de verdad, así que ese hueco está tapado.
 *
 * Pero se pide en cada llamada y puede no llegar —el servidor caído, la cuota
 * agotada—, así que el diagnóstico se mantiene: cuando no hay camino, se
 * cuelga con motivo `sin-camino` y se apunta qué clases de camino llegó a
 * ver. Sin ningún `relay` entre ellas, el relevo no entró y eso se sabe con
 * pruebas en vez de con una corazonada.
 */

import { PermissionsAndroid, Platform } from 'react-native';
import AudioSala from 'react-native-incall-manager';

/* ¿ESTÁ EL MÓDULO DE AUDIO?
 *
 * `react-native-incall-manager` es un módulo nativo: en Expo Go no existe, y
 * si algún día el enlazado cambia podría no existir tampoco en el APK. Todas
 * las llamadas acá van envueltas, así que su ausencia no rompe la llamada —
 * pero SÍ deja el altavoz sin efecto, y un botón que no hace nada es peor que
 * uno que no está. Por eso se comprueba y se dice: la pantalla esconde el
 * botón cuando esto es falso, en vez de ofrecer algo que no responde. */
const HAY_AUDIO = !!AudioSala && typeof AudioSala.start === 'function';
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
   plazo, «no pasa nada» se ve igual que «va a conectar en un segundo».

   OJO CON CUÁNDO SE ARMA. Se armaba al LLAMAR, así que contaba también el
   rato en que al otro le suena el teléfono: toda llamada que tardara más de
   veinte segundos en contestarse se cortaba como «sin camino» —una mentira: no
   había ni empezado a buscarlo— y encima sin mandar `cuelgo`, así que al otro
   le seguía sonando una llamada que ya no existía. Ahora se arma cuando hay
   algo que conectar: al llegar la `respuesta` (quien llama) o al contestar
   (quien recibe). */
const PLAZO_CONEXION = 20000;

/* Cuánto suena antes de rendirse. Es un plazo APARTE y de quien llama: al
   cumplirse cuelga Y lo dice (`cuelgo`), para que al otro le deje de sonar. */
const PLAZO_TIMBRE = 45000;

/* Quien recibe no manda nada al rendirse: solo deja de sonar si nadie
   contestó en ningún lado. Espera un poco más que quien llama, porque lo
   normal es que el `cuelgo` de allá llegue antes; esto es para cuando se
   perdió por el camino y el teléfono se quedaría sonando para nadie. */
const PLAZO_TIMBRE_ENTRANTE = PLAZO_TIMBRE + 5000;

let pc = null;
let miFlujo = null;
let flujoRemoto = null;
let estado = 'libre';            // libre · llamando · entrando · conectando · hablando
let conQuien = null;
let soyQuienLlama = false;
let entrante = null;             // lo que llegó con `llamo`, mientras se pregunta
let iceEnCola = [];
let relojConexion = null;
let relojTimbre = null;          // el de quien llama, y el de quien recibe
/* ¿Se espera todavía una `respuesta`? Solo entre mandar una oferta y que
   llegue la primera: una segunda (dos aparatos del otro lado contestando a
   la vez, un reintento del relevo) no puede volver a tocar la conexión. */
let esperandoRespuesta = false;
let tiposVistos = new Set();
/* Por dónde sale la voz. `auricular` es el de la oreja, `altavoz` es manos
   libres. El bluetooth no es un tercer estado: cuando hay unos audífonos
   conectados, Android manda la voz ahí y esto no se pelea con el sistema. */
let porAltavoz = false;
/* La pantalla compartida, si la hay. Se guarda aparte de `miFlujo` porque al
   dejar de compartir hay que devolver la cámara, y para eso hace falta seguir
   teniéndola. */
let flujoPantalla = null;

let mandarSenal = () => {};
let avisar = () => {};
let pedirTurno = null;
let miAparato = () => '';        // el id de este aparato, para reconocer su propia `atendida`

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
  porAltavoz,
  audioListo: HAY_AUDIO,
  compartiendo: !!flujoPantalla,
  /* Lo que va en el recuadro chico: la pantalla si la estoy compartiendo, y
     si no, mi cámara. Lo decide el motor y no la pantalla, porque es él quien
     sabe cuál de los dos está de verdad viajando al otro lado. */
  flujoChico: flujoPantalla || miFlujo,
});

const anunciar = (extra) => { try { avisar({ ...cuento(), ...(extra || {}) }); } catch {} };

function armarPlazo() {
  clearTimeout(relojConexion);
  relojConexion = setTimeout(() => {
    if (estado !== 'hablando') colgar('sin-camino');
  }, PLAZO_CONEXION);
}

function soltarTimbre() {
  clearTimeout(relojTimbre); relojTimbre = null;
}

/* Quien llama: cuarenta y cinco segundos sonando y se rinde, diciéndolo. */
function armarTimbreSaliente() {
  soltarTimbre();
  relojTimbre = setTimeout(() => {
    relojTimbre = null;
    if (estado === 'llamando' && esperandoRespuesta) colgar('sin-respuesta');
  }, PLAZO_TIMBRE);
}

/* Quien recibe: deja de sonar solo si en todo ese rato nadie contestó. */
function armarTimbreEntrante() {
  soltarTimbre();
  relojTimbre = setTimeout(() => {
    relojTimbre = null;
    if (estado === 'entrando') colgar('perdida');
  }, PLAZO_TIMBRE_ENTRANTE);
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
      try { AudioSala.stopRingback(); } catch {}
      /* La pantalla no se apaga durante la llamada. Sin esto, a los treinta
         segundos se apaga sola y el botón de colgar queda detrás del
         desbloqueo — que es donde nadie lo encuentra con prisa. */
      try { AudioSala.setKeepScreenOn(true); } catch {}
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

/* EL AUDIO DE UNA LLAMADA NO ES EL AUDIO DE UN VIDEO.
 *
 * Sin esto, la voz sale por el altavoz de multimedia al volumen de la música,
 * el teléfono no apaga la pantalla cuando te lo acercás a la oreja, y unos
 * audífonos bluetooth conectados quedan ignorados. `InCallManager` le dice a
 * Android que esto es una llamada: pone el modo de comunicación, enciende el
 * sensor de proximidad, y enruta a los audífonos si los hay.
 *
 * En una VIDEOllamada se arranca en altavoz, porque nadie mira una pantalla
 * con el teléfono pegado a la oreja. En una de voz, en el auricular.
 */
function audioArranca(conVideo) {
  try {
    AudioSala.start({ media: conVideo ? 'video' : 'audio', auto: true });
    porAltavoz = !!conVideo;
    AudioSala.setForceSpeakerphoneOn(porAltavoz);
  } catch { /* sin el módulo la llamada igual se escucha, solo que peor */ }
}

function audioTermina() {
  timbreCalla();
  try { AudioSala.stopRingback(); } catch {}
  try { AudioSala.setKeepScreenOn(false); } catch {}
  try { AudioSala.stop(); } catch {}
  porAltavoz = false;
}

/* EL TIMBRE DENTRO DE LA APP.
 *
 * El relevo NO manda push cuando la persona está escuchando el buzón, y hace
 * bien: quien escucha recibe la llamada directa y el push sería un segundo
 * aviso por lo mismo. Pero eso dejaba un agujero grande: con la app abierta,
 * la llamada entrante aparecía EN SILENCIO. En un bolsillo, o con el teléfono
 * boca abajo en la mesa, eso es una llamada perdida con la app funcionando.
 *
 * Así que si el aviso no lo da el sistema, lo damos nosotros: timbre y
 * vibración mientras dure la pregunta.
 */
/* LA CARRERA DEL TIMBRE. `startRingtone` vuelve enseguida pero el sonido
   arranca DESPUÉS, en el lado nativo, cuando termina de preparar el
   reproductor. Si la llamada y su `cuelgo` (o su `atendida`) llegan en la
   misma tanda —pasa al abrir la app desde el aviso, con todo esperando en el
   buzón—, el `stopRingtone` llega antes de que haya nada sonando, no para
   nada, y el timbre arranca después y se queda sonando solo. Así que callar
   se repite un par de veces más, y cada timbre lleva su número: el callar
   tardío no apaga un timbre NUEVO que haya empezado entretanto. */
let serieTimbre = 0;
let sonandoTimbre = false;

function timbreArranca() {
  const mia = ++serieTimbre;
  sonandoTimbre = true;
  try { AudioSala.startRingtone('_DEFAULT_', [0, 900, 600], null, 30); } catch {}
  // Y si mientras tanto la llamada ya no está sonando, se calla lo que arrancó.
  setTimeout(() => { if (mia === serieTimbre && estado !== 'entrando') timbreCalla(); }, 0);
}

function timbreCalla() {
  const mia = ++serieTimbre;
  sonandoTimbre = false;
  try { AudioSala.stopRingtone(); } catch {}
  for (const ms of [500, 1500]) {
    setTimeout(() => {
      if (mia === serieTimbre && !sonandoTimbre) { try { AudioSala.stopRingtone(); } catch {} }
    }, ms);
  }
}

/* Y el tono de ida: los dos o tres tonos que dicen «está sonando del otro
   lado». Sin él, quien llama mira una pantalla muda sin saber si salió. */
function tonoArranca() {
  // Solo el tono: `audioArranca` ya puso el modo de llamada unas líneas antes,
  // y volver a arrancarlo acá lo reiniciaría en mitad de la salida.
  try { AudioSala.startRingback('_DTMF_'); } catch {}
}

/** El manos libres. `undefined` alterna. */
export function altavoz(encender) {
  porAltavoz = encender === undefined ? !porAltavoz : !!encender;
  try { AudioSala.setForceSpeakerphoneOn(porAltavoz); } catch {}
  anunciar();
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
    audioArranca(conVideo);
    pc = nuevaConexion();
    miFlujo.getTracks().forEach((t) => pc.addTrack(t, miFlujo));
    const oferta = await pc.createOffer({});
    await pc.setLocalDescription(oferta);
    /* `llamo` va con la oferta dentro: una ida y vuelta menos, y quien recibe
       ya sabe si es video ANTES de decidir si contesta. */
    esperandoRespuesta = true;
    mandarSenal(conQuien, 'llamo', { video: !!conVideo, sdp: pc.localDescription.toJSON() });
    // Suena, con su propio plazo. El de conexión espera a la `respuesta`.
    armarTimbreSaliente();
    tonoArranca();
    anunciar();
  } catch (e) {
    colgar('no-se-pudo');
    throw e;
  }
}

/* ── CONTESTAR ───────────────────────────────────────────────────────────── */

export async function contestar(conVideo) {
  /* EL DOBLE TOQUE. Contestar tarda —permisos, micrófono, la conexión— y el
     primer toque ya pasa a «conectando»; sin esta guardia, un segundo toque
     en ese rato volvía a abrir micrófono y conexión encima de los primeros y
     mandaba dos `respuesta`. Solo se contesta lo que está sonando. */
  if (!entrante || estado !== 'entrando') return;
  const { de, sdp } = entrante;
  soltarTimbre();
  timbreCalla();
  conQuien = de;
  soyQuienLlama = false;
  // CONECTANDO, no «hablando»: todavía no llegó ni un pixel del otro lado.
  estado = 'conectando';
  anunciar();
  try {
    await refrescarTurno();
    miFlujo = await abrirMedios(conVideo);
    audioArranca(conVideo);
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
  if (!entrante || estado !== 'entrando') return;
  soltarTimbre();
  timbreCalla();
  audioTermina();
  mandarSenal(entrante.de, 'rechazo', {});
  entrante = null;
  estado = 'libre';
  conQuien = null;
  anunciar();
}

/* ── COLGAR ──────────────────────────────────────────────────────────────── */

function soltarTodo() {
  audioTermina();
  try { flujoPantalla?.getTracks?.().forEach((t) => t.stop()); } catch {}
  flujoPantalla = null;
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
  /* A quién se le dice. Se le dice al otro siempre que la llamada se cae de
     este lado y él todavía cree que sigue —también por «sin camino» y por el
     timbre que se rindió: sin `cuelgo`, al otro le seguía sonando—. Menos en
     dos casos: cuando el corte VIENE del otro (ya lo sabe), y cuando la llamada
     solo estaba sonando aquí (`entrando`): quien llama puede estar hablando ya
     con otro aparato de esta cuenta, y un `cuelgo` le cortaría esa llamada.
     Lo de «no contesto» se dice con `rechazar`, no desde aquí. */
  const avisarAlOtro = otro && estado !== 'libre' && estado !== 'entrando'
    && ['yo', 'corte', 'sin-camino', 'sin-respuesta', 'no-se-pudo'].includes(motivo);
  /* El diagnóstico se arma ANTES de soltar todo, que es cuando todavía se
     puede mirar. Sirve para decirle a la persona por qué no conectó, y a
     nosotros para saber si hace falta pagar el TURN o si es otra cosa. */
  const caminos = [...tiposVistos].join(',') || 'ninguno';
  const hizoFaltaRelevo = motivo === 'sin-camino' && !tiposVistos.has('relay');
  clearTimeout(relojConexion); relojConexion = null;
  soltarTimbre();
  esperandoRespuesta = false;
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

/* ── COMPARTIR LA PANTALLA ───────────────────────────────────────────────
 *
 * Se REEMPLAZA la pista de video que ya viaja (`replaceTrack`) en vez de
 * renegociar la llamada entera. Renegociar corta el audio un instante y a
 * veces no vuelve; esto es un cambio limpio que el otro lado ni nota.
 *
 * En Android, capturar la pantalla obliga a un servicio en primer plano —el
 * módulo lo trae declarado— y a que la persona acepte el aviso del sistema.
 * Si lo cancela, `getDisplayMedia` lanza y acá no pasa nada más: no se toca
 * la llamada, que sigue como estaba.
 *
 * Y SOLO DENTRO DE UNA LLAMADA DE VIDEO. Compartir en una de voz obligaría a
 * agregar una pista nueva y renegociar, que es justo lo que este camino
 * evita. El botón no aparece ahí, en vez de aparecer y fallar.
 */
export async function pantalla() {
  if (!pc) return;
  if (flujoPantalla) return dejarPantalla();
  try {
    const p = await mediaDevices.getDisplayMedia({ video: true, audio: false });
    flujoPantalla = p;
    const nueva = p.getVideoTracks()[0];
    const emisor = pc.getSenders().find((x) => x.track?.kind === 'video');
    if (emisor) await emisor.replaceTrack(nueva);
    else pc.addTrack(nueva, p);
    /* Si se corta desde el aviso del sistema —«dejar de compartir»— hay que
       enterarse: sin esto la app seguiría creyendo que comparte y el otro
       lado vería una imagen congelada. */
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
  // Vuelve la cámara a la conexión que ya está en pie.
  const dela = miFlujo?.getVideoTracks?.()[0] || null;
  const emisor = pc?.getSenders?.().find((x) => x.track?.kind === 'video');
  if (emisor) { try { await emisor.replaceTrack(dela); } catch {} }
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
      timbreArranca();
      armarTimbreEntrante();
      anunciar();
      return;
    }
    /* CONTESTÓ (O RECHAZÓ) OTRO APARATO DE ESTA MISMA CUENTA. La deja el
       relevo con `de` = quien llama y `desde` = el aparato que contestó. Si
       fui yo, se ignora; si no, aquí se deja de sonar, sin mandar nada: la
       llamada sigue, en el otro aparato. */
    if (s.tipo === 'atendida') {
      const yoMismo = miAparato();
      if (s.desde && yoMismo && s.desde === yoMismo) return;
      if (estado === 'entrando' && de === conQuien) colgar('en-otro-aparato');
      return;
    }
    if (de !== conQuien) return;   // señal de otra llamada: se ignora

    if (s.tipo === 'respuesta') {
      /* Solo la PRIMERA, y solo si se estaba esperando. Una segunda sobre una
         conexión ya descrita revienta `setRemoteDescription` y el `catch` de
         abajo colgaba una llamada que iba bien. */
      if (!pc || !esperandoRespuesta || pc.signalingState !== 'have-local-offer') return;
      esperandoRespuesta = false;
      soltarTimbre();
      try { AudioSala.stopRingback(); } catch {}
      estado = 'conectando';
      // AHORA sí hay algo que conectar: desde aquí cuentan los veinte segundos.
      armarPlazo();
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
    /* «No contesto» y «estoy en otra» solo valen MIENTRAS SUENA. Con la cuenta
       del otro abierta en dos aparatos, uno puede contestar y el otro decir
       que no (o que está ocupado) un segundo después: ese tardío no puede
       cortar la llamada que ya está en pie con el primero. */
    if (s.tipo === 'rechazo' || s.tipo === 'ocupado') {
      if (estado !== 'llamando' || !esperandoRespuesta) return;
      return colgar(s.tipo === 'rechazo' ? 'rechazada' : 'ocupado');
    }
  } catch {
    colgar('no-se-pudo');
  }
}

/** Lo enchufa la app: cómo mandar señales, a quién avisar y de dónde sale el relevo. */
export function arrancar({ mandar, alCambiar, traerTurno, aparato }) {
  mandarSenal = mandar || (() => {});
  avisar = alCambiar || (() => {});
  pedirTurno = traerTurno || null;
  miAparato = typeof aparato === 'function' ? aparato : () => '';
  // Se piden ya, sin esperar a la primera llamada: cuando alguien toque
  // «llamar», las credenciales ya van a estar puestas.
  refrescarTurno();
}

export const hayTurno = () => turno.length > 0;
export const enLlamada = () => estado !== 'libre';

export default {
  arrancar, recibir, llamar, contestar, rechazar, colgar,
  micro, camara, voltear, altavoz, pantalla, dejarPantalla,
  cuento, hayTurno, enLlamada,
};
