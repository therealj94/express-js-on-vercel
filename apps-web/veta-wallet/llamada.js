/* Llamadas de voz, video y pantalla dentro de PULSE CHAT.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * LO PRIMERO, PORQUE CAMBIA LO QUE SE PUEDE PROMETER
 *
 * Esto es una página web sin service worker ni notificaciones push. NO PUEDE
 * SONAR con la app cerrada. Una llamada solo entra si la otra persona tiene
 * PULSE CHAT abierto en ese momento. Quien llame a alguien que cerró la
 * pestaña no va a conseguir nada, y la pantalla se lo dice en vez de dejarlo
 * escuchando un tono que no suena en ningún sitio.
 *
 * Arreglar eso es otro trabajo —service worker + push— y hasta que exista,
 * esto sirve para llamar a alguien con quien ya se está chateando.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * COMO SE MONTA UNA LLAMADA
 *
 *   1. Quien llama manda `llamo` y abre su micrófono (y su cámara si es
 *      video).
 *   2. Quien recibe ve la pantalla de llamada entrante. Si contesta, manda
 *      `respuesta`; si no, `rechazo`.
 *   3. Los dos intercambian `oferta`/`respuesta` (SDP) y `ice` (los caminos
 *      de red posibles) por el buzón de señales del relevo.
 *   4. Cuando encuentran un camino común, el audio y el video viajan DIRECTO
 *      entre los dos navegadores. No pasan por ningún servidor nuestro.
 *
 * SIN TURN, Y ESO SE NOTA
 *
 * Hoy solo hay STUN público, que es gratis. STUN sirve para que cada uno
 * descubra su dirección pública; con eso conectan la mayoría de las llamadas.
 * Pero cuando los dos están detrás de un NAT cerrado —redes móviles, oficinas
 * con cortafuegos— no hay camino directo posible y hace falta un TURN, que
 * es un relevo que reenvía el audio y cuesta dinero al mes.
 *
 * Entre el 15 y el 20 % de las llamadas caen ahí. Este archivo NO las
 * disimula: detecta el fallo de conexión y lo dice con esas palabras. Una
 * llamada que se queda en «conectando…» para siempre es peor que una que
 * avisa, porque la persona vuelve a intentarlo diez veces creyendo que es su
 * internet.
 */

const LLAMADA = (() => {
  'use strict';

  /* STUN público de Google. Es gratis, no requiere cuenta y lleva años en
     pie. El día que se enchufe un TURN, se añade aquí y no cambia nada más:
     `iceServers` acepta los dos a la vez y el navegador elige. */
  const HIELO = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
  ];

  /* Los servidores de relevo (TURN), pedidos al nuestro justo antes de
     llamar. Se guardan un rato porque las credenciales duran una hora: pedir
     unas nuevas en cada llamada sería una ida y vuelta de red en el momento
     en que más importa la prisa. */
  let turno = [];
  let turnoHasta = 0;
  let pedirTurno = null;              // lo pone `arrancar()`

  const ponerTurno = (cfg) => { turno = cfg ? (Array.isArray(cfg) ? cfg : [cfg]) : []; };

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

  const puede = () =>
    typeof RTCPeerConnection !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

  const puedePantalla = () => !!navigator.mediaDevices?.getDisplayMedia;

  // ── el estado de la llamada en curso ──────────────────────────────────────
  let pc = null;              // la conexión
  let miPista = null;         // lo que sale de mi cámara y mi micrófono
  let pistaPantalla = null;   // la pantalla compartida, si la hay
  let conQuien = null;        // el correo del otro lado
  let soyQuienLlama = false;
  let estado = 'libre';       // libre · llamando · entrando · hablando · cayendo
  let avisar = () => {};      // quien pinta la pantalla se suscribe aquí
  let mandarSenal = null;     // lo pone `arrancar()`; habla con el relevo
  let iceEnCola = [];         // los caminos que llegan antes de la descripción
  let relojConexion = null;   // el plazo para que la conexión se levante
  let tiposVistos = new Set();// qué clase de caminos encontró cada lado

  /* VEINTE SEGUNDOS Y SE RINDE.
   *
   * `failed` de ICE no siempre llega: hay redes donde la negociación se queda
   * en `checking` sin decidirse nunca, y ahí la pantalla se quedaba negra sin
   * final. Un plazo convierte «no pasa nada» en «no se pudo, y por esto». */
  const PLAZO_CONEXION = 20000;

  function armarPlazo() {
    clearTimeout(relojConexion);
    relojConexion = setTimeout(() => {
      if (estado !== 'hablando') colgar('sin-camino');
    }, PLAZO_CONEXION);
  }

  const cuento = () => ({
    estado, conQuien, soyQuienLlama,
    hayVideo: !!miPista?.getVideoTracks().length,
    micAbierto: !!miPista?.getAudioTracks()[0]?.enabled,
    camAbierta: !!miPista?.getVideoTracks()[0]?.enabled,
    compartiendo: !!pistaPantalla,
  });

  const anunciar = () => { try { avisar(cuento()); } catch {} };

  /* ── LA CONEXIÓN ───────────────────────────────────────────────────────── */

  function nuevaConexion() {
    /* `iceCandidatePoolSize` hace que el navegador empiece a buscar caminos
       ANTES de que haya una oferta. Sin esto, la búsqueda arranca recién al
       crear la oferta y se pierden uno o dos segundos justo cuando la persona
       está mirando la pantalla esperando. */
    const c = new RTCPeerConnection({ iceServers: servidores(), iceCandidatePoolSize: 4 });

    c.onicecandidate = (e) => {
      if (e.candidate && conQuien) {
        /* Se apunta QUE CLASE de camino es. Es lo que después permite decir
           «hace falta un relevo» con pruebas en vez de con una corazonada:
           `host` es la red local, `srflx` es la dirección pública que dio el
           STUN, y `relay` solo aparece si hay un TURN. Sin ningún `relay` y
           sin conexión, el diagnóstico es exacto. */
        try { tiposVistos.add(e.candidate.type || '?'); } catch {}
        mandarSenal(conQuien, 'ice', { candidato: e.candidate.toJSON() });
      }
    };

    c.ontrack = (e) => {
      const v = document.getElementById('lla-remoto');
      if (v && e.streams[0] && v.srcObject !== e.streams[0]) v.srcObject = e.streams[0];
    };

    /* AQUI SE DETECTA EL CASO SIN TURN.
     *
     * `failed` significa que se probaron todos los caminos y no hay ninguno.
     * Casi siempre es NAT cerrado de los dos lados, que es exactamente lo que
     * un TURN resolvería. Se corta y se dice, en vez de dejar la pantalla en
     * «conectando…» hasta que la persona se rinda. */
    c.oniceconnectionstatechange = () => {
      if (c.iceConnectionState === 'failed') colgar('sin-camino');
      if (c.iceConnectionState === 'disconnected') {
        // Un corte de un segundo se recupera solo; se le da margen antes de
        // matar la llamada, que si no se cae con cada túnel del camino.
        setTimeout(() => {
          if (pc === c && c.iceConnectionState === 'disconnected') colgar('corte');
        }, 6000);
      }
    };

    c.onconnectionstatechange = () => {
      /* «Hablando» SOLO cuando la conexión está de verdad en pie.
       *
       * Antes se ponía en cuanto alguien contestaba, y eso producía justo lo
       * que se vio en producción: la pantalla decía «En llamada» sobre un
       * negro que no llegaba nunca. Decirle a alguien que está hablando
       * cuando no llega ni un pixel es la peor forma de fallar, porque no
       * tiene nada que hacer con esa información. */
      if (c.connectionState === 'connected') {
        clearTimeout(relojConexion); relojConexion = null;
        if (estado !== 'hablando') { estado = 'hablando'; anunciar(); }
      }
      if (c.connectionState === 'failed') colgar('sin-camino');
    };
    return c;
  }

  /** Abre micrófono, y cámara si es una llamada de video. */
  async function abrirMedios(conVideo) {
    return navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: conVideo ? { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' } : false,
    });
  }

  /* Vuelve a colgar los flujos de sus elementos y los manda reproducir.
     Se llama cada vez que se pinta la pantalla: si el `srcObject` se asignó
     mientras la capa estaba oculta, algunos navegadores no arrancan solos y
     el recuadro se queda negro con la cámara encendida. */
  function reengancharVideo() {
    for (const [id, flujo] of [['lla-local', pistaPantalla || miPista], ['lla-remoto', null]]) {
      const v = document.getElementById(id);
      if (!v) continue;
      if (flujo && v.srcObject !== flujo) v.srcObject = flujo;
      if (v.srcObject && v.paused) { try { v.play()?.catch(() => {}); } catch {} }
    }
  }

  function pintarLocal() {
    const v = document.getElementById('lla-local');
    if (v && miPista && v.srcObject !== miPista) v.srcObject = miPista;
  }

  /* ── LLAMAR ───────────────────────────────────────────────────────────── */

  async function llamar(correo, conVideo) {
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
      miPista = await abrirMedios(conVideo);
      pintarLocal();
      pc = nuevaConexion();
      miPista.getTracks().forEach((t) => pc.addTrack(t, miPista));
      armarPlazo();
      const oferta = await pc.createOffer();
      await pc.setLocalDescription(oferta);
      // `llamo` va con la oferta dentro: una señal menos de ida y vuelta, y
      // quien recibe ya sabe si es video antes de decidir si contesta.
      mandarSenal(conQuien, 'llamo', { video: !!conVideo, sdp: pc.localDescription.toJSON() });
      anunciar();
    } catch (e) {
      colgar('no-se-pudo');
      throw e;
    }
  }

  /* ── CONTESTAR ────────────────────────────────────────────────────────── */

  /** Lo que llegó con `llamo`, mientras la pantalla pregunta si se contesta. */
  let entrante = null;

  async function contestar(conVideo) {
    if (!entrante) return;
    const { de, sdp } = entrante;
    conQuien = de;
    soyQuienLlama = false;
    // CONECTANDO, no «hablando»: todavía no hay ni un pixel del otro lado.
    estado = 'conectando';
    try {
      await refrescarTurno();
      miPista = await abrirMedios(conVideo);
      pintarLocal();
      pc = nuevaConexion();
      miPista.getTracks().forEach((t) => pc.addTrack(t, miPista));
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

  function rechazar() {
    if (!entrante) return;
    mandarSenal(entrante.de, 'rechazo', {});
    entrante = null;
    estado = 'libre';
    anunciar();
  }

  /* Los candidatos ICE llegan a veces ANTES que la descripción remota, y
     añadirlos entonces revienta. Se guardan y se sueltan cuando ya hay dónde
     ponerlos. Es el fallo clásico de una primera implementación: funciona en
     una red rápida y falla en la de la calle. */
  async function vaciarCola() {
    for (const cand of iceEnCola) {
      try { await pc.addIceCandidate(new RTCIceCandidate(cand)); } catch {}
    }
    iceEnCola = [];
  }

  /* ── COLGAR ───────────────────────────────────────────────────────────── */

  function soltarTodo() {
    try { miPista?.getTracks().forEach((t) => t.stop()); } catch {}
    try { pistaPantalla?.getTracks().forEach((t) => t.stop()); } catch {}
    try { pc?.close(); } catch {}
    miPista = null; pistaPantalla = null; pc = null; iceEnCola = [];
    for (const id of ['lla-local', 'lla-remoto']) {
      const v = document.getElementById(id);
      if (v) v.srcObject = null;
    }
  }

  /**
   * Cuelga. `motivo` viaja a la pantalla para poder decir QUE pasó: no es lo
   * mismo «colgaste» que «no había camino» —esa segunda es la del TURN que no
   * tenemos— y meterlas en el mismo mensaje deja a la gente sin saber si el
   * problema es suyo.
   */
  function colgar(motivo = 'yo') {
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
    try { avisar({ ...cuento(), motivo, caminos, hizoFaltaRelevo }); } catch {}
  }

  /* ── MICRÓFONO, CÁMARA Y PANTALLA ─────────────────────────────────────── */

  function micro(encender) {
    const t = miPista?.getAudioTracks()[0];
    if (!t) return;
    t.enabled = encender === undefined ? !t.enabled : !!encender;
    anunciar();
  }

  function camara(encender) {
    const t = miPista?.getVideoTracks()[0];
    if (!t) return;
    t.enabled = encender === undefined ? !t.enabled : !!encender;
    anunciar();
  }

  /**
   * Compartir la pantalla.
   *
   * Se REEMPLAZA la pista de la cámara por la de la pantalla en la conexión
   * que ya está en pie (`replaceTrack`), en vez de renegociar la llamada
   * entera. Renegociar corta el audio un instante y a veces no vuelve; esto
   * es un cambio limpio que el otro lado ni nota.
   *
   * En iPhone no existe `getDisplayMedia` desde una web, y eso no lo arregla
   * nadie: el botón no aparece ahí en vez de aparecer y fallar.
   */
  async function pantalla() {
    if (!pc || !puedePantalla()) return;
    if (pistaPantalla) return dejarPantalla();
    const p = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    pistaPantalla = p;
    const nueva = p.getVideoTracks()[0];
    const emisor = pc.getSenders().find((s) => s.track?.kind === 'video');
    if (emisor) await emisor.replaceTrack(nueva);
    else pc.addTrack(nueva, p);
    // Si se corta desde el aviso del propio navegador («dejar de compartir»),
    // hay que enterarse: sin esto la app seguiría creyendo que comparte.
    nueva.onended = () => dejarPantalla();
    const v = document.getElementById('lla-local');
    if (v) v.srcObject = p;
    anunciar();
  }

  async function dejarPantalla() {
    if (!pistaPantalla) return;
    try { pistaPantalla.getTracks().forEach((t) => t.stop()); } catch {}
    pistaPantalla = null;
    const dela = miPista?.getVideoTracks()[0] || null;
    const emisor = pc?.getSenders().find((s) => s.track?.kind === 'video');
    if (emisor) { try { await emisor.replaceTrack(dela); } catch {} }
    pintarLocal();
    anunciar();
  }

  /* ── LO QUE LLEGA DEL OTRO LADO ───────────────────────────────────────── */

  async function recibir(s) {
    const de = String(s.de || '').toLowerCase();
    const d = s.datos || {};
    try {
      if (s.tipo === 'llamo') {
        // Ocupado: se contesta y no se deja la llamada colgando. Sin esto,
        // quien llama espera hasta rendirse sin saber por qué.
        if (estado !== 'libre') return mandarSenal(de, 'ocupado', {});
        entrante = { de, video: !!d.video, sdp: d.sdp };
        conQuien = de;
        estado = 'entrando';
        return anunciar();
      }
      if (de !== conQuien) return;   // señal de otra llamada: se ignora

      if (s.tipo === 'respuesta' && pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(d.sdp));
        await vaciarCola();
        return anunciar();
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

  /** Lo enchufa la app: le pasa cómo mandar señales y a quién avisar. */
  function arrancar({ mandar, alCambiar, traerTurno }) {
    mandarSenal = mandar;
    avisar = alCambiar || (() => {});
    pedirTurno = traerTurno || null;
    // Se piden ya, sin esperar a la primera llamada: cuando alguien toque
    // «llamar» las credenciales ya van a estar puestas.
    refrescarTurno();
  }

  /** Para saber si el relevo está enchufado. Lo usa el diagnóstico. */
  const hayTurno = () => turno.length > 0;

  return { puede, puedePantalla, arrancar, recibir, llamar, contestar, rechazar,
           reengancharVideo, hayTurno,
           colgar, micro, camara, pantalla, dejarPantalla, ponerTurno,
           estado: () => estado, cuento, entrante: () => entrante };
})();

if (typeof window !== 'undefined') window.LLAMADA = LLAMADA;
