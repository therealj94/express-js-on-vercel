/* Llamadas de voz, video y pantalla dentro de PULSE2CHAT.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * LO PRIMERO, PORQUE CAMBIA LO QUE SE PUEDE PROMETER
 *
 * Esto es una página web sin service worker ni notificaciones push. NO PUEDE
 * SONAR con la app cerrada. Una llamada solo entra si la otra persona tiene
 * PULSE2CHAT abierto en ese momento. Quien llame a alguien que cerró la
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
 * Y una señal que no manda ninguno de los dos, la pone el relevo: `atendida`
 * { como }, con `desde` = el aparato que contestó. La misma cuenta puede
 * tener la llamada sonando aquí, en el teléfono y en AU-RA; cuando uno
 * contesta o rechaza, el relevo se lo dice a la PROPIA cuenta, el que contestó
 * la ignora y los demás dejan de sonar: «Contestaste en otro aparato». Es el
 * mismo protocolo que `orden-global-app/src/og/llamada.js`, letra por letra.
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
  let relojTimbre = null;     // cuánto suena, de quien llama y de quien recibe
  let esperandoRespuesta = false; // entre mandar el `llamo` y la primera `respuesta`
  let miAparato = () => '';   // el id de este aparato, para reconocer su `atendida`
  let tiposVistos = new Set();// qué clase de caminos encontró cada lado

  /* VEINTE SEGUNDOS Y SE RINDE.
   *
   * `failed` de ICE no siempre llega: hay redes donde la negociación se queda
   * en `checking` sin decidirse nunca, y ahí la pantalla se quedaba negra sin
   * final. Un plazo convierte «no pasa nada» en «no se pudo, y por esto». */
  const PLAZO_CONEXION = 20000;

  /* PERO SE ARMA CUANDO HAY ALGO QUE CONECTAR. Se armaba al llamar, así que
   * contaba también el rato en que al otro le suena: toda llamada que tardara
   * más de veinte segundos en contestarse se cortaba como «sin camino» —sin
   * haber empezado a buscarlo— y sin mandar `cuelgo`, con lo que al otro le
   * seguía sonando una llamada que ya no existía. Ahora se arma al llegar la
   * `respuesta` (quien llama) o al contestar (quien recibe).
   *
   * El timbre tiene su propio plazo: cuarenta y cinco segundos. Al cumplirse,
   * quien llama cuelga Y lo dice (`cuelgo`). Quien recibe espera un poco más y
   * solo deja de sonar si nadie contestó: es para cuando el `cuelgo` se perdió
   * por el camino, no para adelantarse a él. */
  const PLAZO_TIMBRE = 45000;
  const PLAZO_TIMBRE_ENTRANTE = PLAZO_TIMBRE + 5000;

  function armarPlazo() {
    clearTimeout(relojConexion);
    relojConexion = setTimeout(() => {
      if (estado !== 'hablando') colgar('sin-camino');
    }, PLAZO_CONEXION);
  }

  function soltarTimbre() { clearTimeout(relojTimbre); relojTimbre = null; }

  function armarTimbre(entrante) {
    soltarTimbre();
    relojTimbre = setTimeout(() => {
      relojTimbre = null;
      if (entrante && estado === 'entrando') colgar('perdida');
      if (!entrante && estado === 'llamando' && esperandoRespuesta) colgar('sin-respuesta');
    }, entrante ? PLAZO_TIMBRE_ENTRANTE : PLAZO_TIMBRE);
  }

  let cara = 'user';          // 'user' adelante · 'environment' atrás
  let porAltavoz = true;

  const cuento = () => ({
    estado, conQuien, soyQuienLlama,
    hayVideo: !!miPista?.getVideoTracks().length,
    micAbierto: !!miPista?.getAudioTracks()[0]?.enabled,
    camAbierta: !!miPista?.getVideoTracks()[0]?.enabled,
    compartiendo: !!pistaPantalla,
    camTrasera: cara === 'environment',
    porAltavoz,
    puedeAltavoz: puedeAltavoz(),
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
        // Un corte de un segundo se recupera solo. Se intenta un ICE restart
        // (mismos tipos de señal: ice + oferta/respuesta) y si a los diez
        // segundos sigue caído, ahí sí se cuelga.
        try { if (typeof c.restartIce === 'function') c.restartIce(); } catch {}
        setTimeout(() => {
          if (pc === c && (c.iceConnectionState === 'disconnected' || c.iceConnectionState === 'failed'))
            colgar('corte');
        }, 10000);
      }
    };

    c.onnegotiationneeded = async () => {
      if (c !== pc || estado !== 'hablando' || !conQuien) return;
      try {
        const of = await c.createOffer();
        await c.setLocalDescription(of);
        mandarSenal(conQuien, 'oferta', { sdp: c.localDescription.toJSON() });
      } catch { /* un restart fallido no tumba la llamada: el plazo de corte sí */ }
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
    cara = 'user';
    porAltavoz = !!conVideo;   // video: parlante. voz: el default del aparato.
    return navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: conVideo ? { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: cara } : false,
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
      const oferta = await pc.createOffer();
      await pc.setLocalDescription(oferta);
      // `llamo` va con la oferta dentro: una señal menos de ida y vuelta, y
      // quien recibe ya sabe si es video antes de decidir si contesta.
      esperandoRespuesta = true;
      mandarSenal(conQuien, 'llamo', { video: !!conVideo, sdp: pc.localDescription.toJSON() });
      // Suena con su propio plazo; el de conexión espera a la `respuesta`.
      armarTimbre(false);
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
    /* EL DOBLE TOQUE. Contestar tarda —permisos, micrófono, la conexión— y
       el primer toque ya pasa a «conectando»; sin esta guardia, un segundo
       toque en ese rato abría otro micrófono y otra conexión encima y mandaba
       dos `respuesta`. Solo se contesta lo que está sonando. */
    if (!entrante || estado !== 'entrando') return;
    soltarTimbre();
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
    if (!entrante || estado !== 'entrando') return;
    soltarTimbre();
    mandarSenal(entrante.de, 'rechazo', {});
    entrante = null;
    estado = 'libre';
    conQuien = null;
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
    /* Se le dice al otro siempre que la llamada se cae de este lado y él
       todavía cree que sigue —también por «sin camino» y por el timbre que se
       rindió: sin `cuelgo`, al otro le seguía sonando—. Menos cuando el corte
       VIENE del otro, y cuando aquí solo estaba sonando (`entrando`): quien
       llama puede estar hablando ya con otro aparato de esta cuenta, y un
       `cuelgo` le cortaría esa llamada. «No contesto» es `rechazar`. */
    const avisarAlOtro = otro && estado !== 'libre' && estado !== 'entrando'
      && ['yo', 'corte', 'sin-camino', 'sin-respuesta', 'no-se-pudo'].includes(motivo);
    const fui = soyQuienLlama;
    const videoEra = !!miPista?.getVideoTracks().length;
    const conEra = conQuien;
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
    cara = 'user';
    if (avisarAlOtro) { try { mandarSenal(otro, 'cuelgo', {}); } catch {} }
    try { avisar({ ...cuento(), motivo, caminos, hizoFaltaRelevo,
                   fuiQuienLlamo: fui, conQuienEra: conEra, hayVideoEra: videoEra }); } catch {}
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
   * Cambia entre la cámara de adelante y la de atrás SIN colgar.
   * Es lo que el teléfono ya hacía; en la web se pide un flujo nuevo con
   * `facingMode` y se reemplaza la pista. Con la pantalla compartida no se
   * toca: el emisor lleva la pantalla, no la cámara.
   */
  async function voltear() {
    if (!pc || !miPista || pistaPantalla) return;
    const vieja = miPista.getVideoTracks()[0];
    if (!vieja) return;
    const siguiente = cara === 'user' ? 'environment' : 'user';
    let flujo;
    try {
      flujo = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { exact: siguiente }, width: { ideal: 1280 }, height: { ideal: 720 } },
      });
    } catch {
      try {
        flujo = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: siguiente, width: { ideal: 1280 }, height: { ideal: 720 } },
        });
      } catch { return; }
    }
    const nueva = flujo.getVideoTracks()[0];
    if (!nueva) return;
    nueva.enabled = vieja.enabled;
    const emisor = pc.getSenders().find((s) => s.track?.kind === 'video');
    if (emisor) { try { await emisor.replaceTrack(nueva); } catch { return; } }
    try { miPista.removeTrack(vieja); vieja.stop(); } catch {}
    miPista.addTrack(nueva);
    cara = siguiente;
    pintarLocal();
    anunciar();
  }

  function puedeAltavoz() {
    return typeof HTMLMediaElement !== 'undefined'
      && typeof HTMLMediaElement.prototype.setSinkId === 'function';
  }

  /** Manos libres. En la web solo si el navegador deja elegir la salida. */
  async function altavoz(encender) {
    porAltavoz = encender === undefined ? !porAltavoz : !!encender;
    const v = document.getElementById('lla-remoto');
    if (v && typeof v.setSinkId === 'function') {
      try {
        if (porAltavoz) {
          await v.setSinkId('');
        } else {
          const devs = await navigator.mediaDevices.enumerateDevices();
          const outs = devs.filter((d) => d.kind === 'audiooutput');
          const oreja = outs.find((d) => /communication|earpiece|headset|auricular/i.test(d.label));
          if (oreja) await v.setSinkId(oreja.deviceId);
        }
      } catch { /* el aparato no dejó cambiar: el botón igual refleja el pedido */ }
    }
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

  /* ── ELEGIR MICRÓFONO Y CÁMARA, SIN COLGAR ────────────────────────────────
   *
   * Los nombres de los aparatos solo se leen con el permiso ya dado, así que
   * esto se usa DENTRO de una llamada — que es además el único momento en que
   * cambiar de micrófono significa algo. El cambio es un `replaceTrack` sobre
   * la conexión en pie: el otro lado no nota ni un corte.
   */
  let puestos = { mic: null, cam: null };   // lo elegido, para marcarlo en el panel

  async function aparatos() {
    const l = await navigator.mediaDevices.enumerateDevices();
    return {
      mics: l.filter((x) => x.kind === 'audioinput'),
      cams: l.filter((x) => x.kind === 'videoinput'),
      puestos: { ...puestos },
    };
  }

  async function usarAparato(clase, id) {
    if (!miPista || !id) return;
    const pedido = clase === 'mic'
      ? { audio: { deviceId: { exact: id }, echoCancellation: true,
                   noiseSuppression: true, autoGainControl: true } }
      : { video: { deviceId: { exact: id }, width: { ideal: 1280 }, height: { ideal: 720 } } };
    const flujo = await navigator.mediaDevices.getUserMedia(pedido);
    const nueva = flujo.getTracks()[0];
    const vieja = clase === 'mic' ? miPista.getAudioTracks()[0] : miPista.getVideoTracks()[0];
    // El silencio se hereda: cambiar de micrófono con el micrófono apagado no
    // puede encenderlo a escondidas.
    if (vieja) nueva.enabled = vieja.enabled;
    /* Con la pantalla compartida, la cámara nueva se guarda en `miPista` y no
       toca la conexión: el emisor de video lleva la pantalla, y al dejar de
       compartir, `dejarPantalla()` ya vuelve a la cámara que haya entonces. */
    const tocarConexion = clase === 'mic' || !pistaPantalla;
    if (tocarConexion) {
      const emisor = pc?.getSenders().find((s) => s.track?.kind === nueva.kind);
      if (emisor) await emisor.replaceTrack(nueva);
    }
    if (vieja) { try { miPista.removeTrack(vieja); vieja.stop(); } catch {} }
    miPista.addTrack(nueva);
    puestos[clase] = id;
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
        armarTimbre(true);
        return anunciar();
      }
      /* CONTESTÓ (O RECHAZÓ) OTRO APARATO DE ESTA MISMA CUENTA. La deja el
         relevo con `de` = quien llama y `desde` = el aparato que contestó.
         Si fui yo, se ignora; si no, aquí se deja de sonar sin mandar nada:
         la llamada sigue, en el otro aparato. */
      if (s.tipo === 'atendida') {
        const yoMismo = miAparato();
        if (s.desde && yoMismo && s.desde === yoMismo) return;
        if (estado === 'entrando' && de === conQuien) colgar('en-otro-aparato');
        return;
      }
      if (de !== conQuien) return;   // señal de otra llamada: se ignora

      if (s.tipo === 'respuesta') {
        /* Solo si se espera: la primera a un `llamo`, o la de un ICE restart
           (una `oferta` nuestra en vuelo). Una segunda sobre una conexión ya
           descrita revienta `setRemoteDescription`, y el `catch` de abajo
           colgaba una llamada que iba bien. */
        if (!pc || pc.signalingState !== 'have-local-offer') return;
        if (esperandoRespuesta) {
          esperandoRespuesta = false;
          soltarTimbre();
          estado = 'conectando';
          // AHORA hay algo que conectar: desde aquí cuentan los veinte segundos.
          armarPlazo();
        }
        await pc.setRemoteDescription(new RTCSessionDescription(d.sdp));
        await vaciarCola();
        return anunciar();
      }
      if (s.tipo === 'oferta' && pc) {
        /* ICE restart: el otro lado pidió un camino nuevo. Se contesta con
           el mismo tipo `respuesta` de siempre, para que un cliente viejo
           que no conoce `oferta` no rompa — simplemente la ignora. */
        await pc.setRemoteDescription(new RTCSessionDescription(d.sdp));
        await vaciarCola();
        const resp = await pc.createAnswer();
        await pc.setLocalDescription(resp);
        mandarSenal(conQuien, 'respuesta', { sdp: pc.localDescription.toJSON() });
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
      /* «No contesto» y «estoy en otra» solo valen MIENTRAS SUENA. Con la
         cuenta del otro abierta en dos aparatos, uno contesta y el otro puede
         decir que no un segundo después: ese tardío no corta la llamada que
         ya está en pie con el primero. */
      if (s.tipo === 'rechazo' || s.tipo === 'ocupado') {
        if (estado !== 'llamando' || !esperandoRespuesta) return;
        return colgar(s.tipo === 'rechazo' ? 'rechazada' : 'ocupado');
      }
    } catch {
      colgar('no-se-pudo');
    }
  }

  /** Lo enchufa la app: le pasa cómo mandar señales y a quién avisar. */
  function arrancar({ mandar, alCambiar, traerTurno, aparato }) {
    mandarSenal = mandar;
    avisar = alCambiar || (() => {});
    pedirTurno = traerTurno || null;
    miAparato = typeof aparato === 'function' ? aparato : () => '';
    // Se piden ya, sin esperar a la primera llamada: cuando alguien toque
    // «llamar» las credenciales ya van a estar puestas.
    refrescarTurno();
  }

  /** Para saber si el relevo está enchufado. Lo usa el diagnóstico. */
  const hayTurno = () => turno.length > 0;

  return { puede, puedePantalla, arrancar, recibir, llamar, contestar, rechazar,
           reengancharVideo, hayTurno, aparatos, usarAparato,
           colgar, micro, camara, voltear, altavoz, puedeAltavoz,
           pantalla, dejarPantalla, ponerTurno,
           estado: () => estado, cuento, entrante: () => entrante };
})();

if (typeof window !== 'undefined') window.LLAMADA = LLAMADA;
