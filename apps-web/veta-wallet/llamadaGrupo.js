/* Llamadas de grupo, en malla.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * POR QUE MALLA Y NO UN SFU
 *
 * En malla cada teléfono se conecta con cada otro, y el audio y el video van
 * DIRECTO entre las personas. Sigue siendo cifrado de punta a punta: nadie en
 * el medio puede abrirlo, ni nosotros ni Cloudflare.
 *
 * Un SFU —un servidor que recibe todo y lo reparte— aguanta muchas más
 * personas, pero para repartir tiene que DESCIFRAR. Con SFU la llamada deja
 * de ser de punta a punta, y ese es justo el sello que el chat enseña. Es un
 * intercambio real, no una preferencia técnica: se gana gente y se pierde el
 * secreto.
 *
 * EL LIMITE, MEDIDO
 *
 * En malla cada uno SUBE su video a todos los demás. A 360p:
 *
 *      3 personas  →  1,0 Mbps de subida
 *      4 personas  →  1,5 Mbps
 *      5 personas  →  2,0 Mbps
 *
 * Un móvil decente sube entre 2 y 5 Mbps, así que cinco es el techo honesto y
 * cuatro es lo cómodo. Por eso el tope está en cinco y se dice en pantalla en
 * vez de dejar que la sexta persona rompa la llamada de todos.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * EL PROTOCOLO, Y EL PROBLEMA QUE RESUELVE
 *
 *   1. Quien empieza manda `gllamo` a cada miembro del grupo.
 *   2. Quien acepta manda `gentro` a TODOS, no solo a quien llamó: así los
 *      que ya estaban se enteran de que hay alguien nuevo con quien
 *      conectarse.
 *   3. Al recibir `gentro` de X, uno de los dos hace la oferta y el otro
 *      espera. QUIEN la hace se decide comparando los correos: el menor
 *      ofrece. Si los dos ofrecieran a la vez —lo que en WebRTC se llama
 *      «glare»— las dos ofertas chocan y la conexión no se levanta nunca.
 *      Una regla fija y sin sorteo evita eso sin hablarlo.
 *   4. `gsalgo` cuando alguien se va, para que los demás cierren SU conexión
 *      con esa persona y no se queden con un cuadro congelado.
 */

const GRUPO = (() => {
  'use strict';

  /* Cinco es el techo. No es un número redondo elegido a ojo: a 360p la
     sexta persona empuja la subida de cada uno por encima de lo que un móvil
     sostiene, y la llamada se degrada PARA TODOS, no solo para quien entró
     último. Se corta antes y se dice. */
  const TOPE = 5;

  /* Video más chico que en el cara a cara, y a propósito: en malla cada uno
     sube tantas copias como gente haya. Con 720p, cuatro personas serían 4,5
     Mbps de subida y el teléfono no llega. */
  const VIDEO = { width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 24 } };

  let yo = null;               // mi correo
  let grupo = null;            // el id del grupo en llamada
  let miPista = null;
  let estado = 'libre';        // libre · llamando · entrando · hablando
  let conVideo = true;
  const pares = new Map();     // correo -> { pc, flujo, cola: [] }
  let entrante = null;         // { de, grupo, nombre }

  /* Quien anuncio que entraba ANTES de que yo abriera mi camara.
   *
   * Pasa siempre que dos personas contestan casi a la vez: la primera manda
   * su `gentro` mientras la segunda todavia esta en la pantalla de «entra una
   * llamada», sin microfono ni camara abiertos. Si se creara la conexion en
   * ese momento, nacería SIN mis pistas —no existen todavia— y esa persona no
   * me oiria nunca, aunque la conexion figurara como conectada.
   *
   * Costo una prueba de tres navegadores: Caro oia a Beto y Beto no oia a
   * Caro. Se guardan y se atienden en cuanto hay camara. */
  const porConectar = new Set();

  let mandarSenal = null;
  let traerTurno = null;
  let avisar = () => {};
  let hielo = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
  ];

  const puede = () =>
    typeof RTCPeerConnection !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

  const cuento = () => ({
    estado, grupo,
    yo,
    gente: [...pares.entries()].map(([correo, p]) => ({
      correo, hayFlujo: !!p.flujo, conectado: p.pc?.connectionState === 'connected',
    })),
    cuantos: pares.size + (estado === 'hablando' || estado === 'llamando' ? 1 : 0),
    micAbierto: !!miPista?.getAudioTracks()[0]?.enabled,
    camAbierta: !!miPista?.getVideoTracks()[0]?.enabled,
    conVideo,
    lleno: pares.size + 1 >= TOPE,
  });

  const anunciar = () => { try { avisar(cuento()); } catch {} };

  async function refrescarHielo() {
    if (!traerTurno) return;
    try {
      const s = await traerTurno();
      if (Array.isArray(s) && s.length) hielo = [...hielo.filter(x => !x.username), ...s];
    } catch { /* sin relevo se sigue igual */ }
  }

  async function abrirMedios(video) {
    return navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: video ? VIDEO : false,
    });
  }

  /* ── UNA CONEXION CON UNA PERSONA ─────────────────────────────────────── */

  function nuevoPar(correo) {
    if (pares.has(correo)) return pares.get(correo);
    const pc = new RTCPeerConnection({ iceServers: hielo, iceCandidatePoolSize: 2 });
    const par = { pc, flujo: null, cola: [] };
    pares.set(correo, par);

    pc.onicecandidate = (e) => {
      if (e.candidate) mandarSenal(correo, 'gice', { grupo, candidato: e.candidate.toJSON() });
    };
    pc.ontrack = (e) => {
      par.flujo = e.streams[0] || null;
      anunciar();
    };
    pc.onconnectionstatechange = () => {
      /* Una conexión que se cae se lleva SOLO a esa persona, no la llamada.
         En una llamada de cinco, que se caiga la de uno no puede echar a los
         otros cuatro — que es lo que pasaría si esto colgara todo. */
      if (['failed', 'closed'].includes(pc.connectionState)) cerrarPar(correo);
      anunciar();
    };

    if (miPista) miPista.getTracks().forEach((t) => pc.addTrack(t, miPista));
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
    const of = await par.pc.createOffer();
    await par.pc.setLocalDescription(of);
    mandarSenal(correo, 'goferta', { grupo, sdp: par.pc.localDescription.toJSON() });
  }

  async function vaciarCola(par) {
    for (const c of par.cola) {
      try { await par.pc.addIceCandidate(new RTCIceCandidate(c)); } catch {}
    }
    par.cola = [];
  }

  /* ── EMPEZAR ──────────────────────────────────────────────────────────── */

  /**
   * @param {string} gid       el grupo
   * @param {string[]} miembros correos, sin el mío
   * @param {boolean} video
   */
  async function llamar(gid, miembros, video = true) {
    if (estado !== 'libre') throw new Error('ya hay una llamada');
    if ((miembros || []).length + 1 > TOPE) { const e = new Error('lleno'); e.code = 'lleno'; throw e; }
    grupo = gid; conVideo = !!video; estado = 'llamando';
    anunciar();
    await refrescarHielo();
    miPista = await abrirMedios(conVideo);
    // Se avisa a todos. Quien tenga la app abierta va a ver la llamada; quien
    // no, no se entera — y eso es un límite de la web, no un fallo de aquí.
    /* La lista de miembros viaja DENTRO del aviso. Sin ella, quien contesta
       no sabe a quién más avisar de que entró, y el tercero acabaría oyendo
       solo al primero: cada uno conectado con quien lo llamó y con nadie más. */
    const todos = [...miembros, yo];
    for (const m of miembros) {
      mandarSenal(m, 'gllamo', { grupo: gid, video: conVideo, miembros: todos });
    }
    anunciar();
  }

  async function contestar(video = true) {
    if (!entrante) return;
    grupo = entrante.grupo; conVideo = !!video;
    estado = 'hablando';
    anunciar();
    await refrescarHielo();
    miPista = await abrirMedios(conVideo);
    /* Se avisa a TODOS los del grupo, no solo a quien llamó: los que ya
       estaban tienen que enterarse de que hay alguien nuevo para abrirle su
       propia conexión. Sin esto, el tercero solo oiría al primero. */
    for (const m of (entrante.miembros || [])) {
      if (m !== yo) mandarSenal(m, 'gentro', { grupo });
    }
    entrante = null;
    // Y ahora si, los que habian anunciado su entrada mientras yo decidia.
    await atenderPendientes();
    anunciar();
  }

  /** Abre la conexion con quien aviso antes de que yo tuviera camara. */
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

  function rechazar() {
    if (!entrante) return;
    mandarSenal(entrante.de, 'grechazo', { grupo: entrante.grupo });
    entrante = null; grupo = null; estado = 'libre';
    anunciar();
  }

  function colgar(motivo = 'yo') {
    const g = grupo;
    const gente = [...pares.keys()];
    for (const c of gente) { try { pares.get(c).pc.close(); } catch {} }
    pares.clear();
    porConectar.clear();
    try { miPista?.getTracks().forEach((t) => t.stop()); } catch {}
    miPista = null;
    if (g && motivo === 'yo') {
      for (const c of gente) mandarSenal(c, 'gsalgo', { grupo: g });
    }
    grupo = null; estado = 'libre'; entrante = null;
    try { avisar({ ...cuento(), motivo }); } catch {}
  }

  /* ── LO QUE LLEGA ─────────────────────────────────────────────────────── */

  async function recibir(s) {
    const de = String(s.de || '').toLowerCase();
    const d = s.datos || {};
    if (!String(s.tipo || '').startsWith('g')) return false;   // no es de grupo
    try {
      if (s.tipo === 'gllamo') {
        if (estado !== 'libre') return true;                   // ocupado: se ignora
        entrante = { de, grupo: d.grupo, video: !!d.video,
                     // Si no vino la lista, al menos se conoce a quien llamó.
                     miembros: (d.miembros && d.miembros.length) ? d.miembros : [de] };
        grupo = d.grupo; estado = 'entrando';
        anunciar();
        return true;
      }
      if (d.grupo !== grupo) return true;                      // de otra llamada

      if (s.tipo === 'gentro') {
        if (pares.size + 1 >= TOPE) return true;               // lleno: no entra
        // Sin camara todavia: se anota y se atiende al contestar. Ver la nota
        // de `porConectar`.
        if (!miPista) { porConectar.add(de); return true; }
        if (estado === 'llamando') { estado = 'hablando'; }
        // Solo uno de los dos ofrece. El otro espera la oferta.
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
        // Igual que en el cara a cara: los candidatos llegan a veces antes que
        // la descripción, y añadirlos entonces revienta.
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

  /* ── MANDOS ───────────────────────────────────────────────────────────── */

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

  /** Compartir pantalla: se reemplaza la pista en TODAS las conexiones. */
  async function pantalla() {
    if (!pares.size || !navigator.mediaDevices?.getDisplayMedia) return null;
    const p = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    const nueva = p.getVideoTracks()[0];
    for (const { pc } of pares.values()) {
      const emisor = pc.getSenders().find((x) => x.track?.kind === 'video');
      if (emisor) { try { await emisor.replaceTrack(nueva); } catch {} }
    }
    nueva.onended = () => {
      const dela = miPista?.getVideoTracks()[0] || null;
      for (const { pc } of pares.values()) {
        const emisor = pc.getSenders().find((x) => x.track?.kind === 'video');
        if (emisor) { try { emisor.replaceTrack(dela); } catch {} }
      }
      anunciar();
    };
    anunciar();
    return p;
  }

  function arrancar({ correo, mandar, alCambiar, turno }) {
    yo = String(correo || '').toLowerCase();
    mandarSenal = mandar;
    avisar = alCambiar || (() => {});
    traerTurno = turno || null;
  }

  /** El flujo de una persona. La pantalla lo pide por correo en vez de que se
      lo mandemos en cada aviso: un MediaStream no se puede copiar, y pasarlo
      por el objeto de estado obligaria a compararlo por identidad en cada
      repintado. */
  const flujoDe = (correo) => pares.get(String(correo || '').toLowerCase())?.flujo || null;

  return { puede, arrancar, recibir, llamar, contestar, rechazar, colgar, flujoDe,
           micro, camara, pantalla, cuento, entrante: () => entrante,
           miPista: () => miPista, TOPE };
})();

if (typeof window !== 'undefined') window.GRUPO = GRUPO;
