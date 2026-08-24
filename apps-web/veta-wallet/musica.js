/* LA MÚSICA DEL ECOSISTEMA.
 *
 * ══ POR QUÉ ESTA VEZ SÍ ═══════════════════════════════════════════════════
 *
 * Aquí hubo dos fondos antes y los dos se quitaron: un zumbido grave y un
 * acorde con polvo de estrellas. No molestaban por la mezcla — molestaban
 * porque eran ruido inventado por la casa, sonando solo, sin que nadie lo
 * hubiera pedido. Esta pista la eligió José para SU ecosistema, y eso cambia
 * la pregunta: ya no es «¿ponemos música?», es «¿cómo se pone bien?».
 *
 * ══ CÓMO SE PONE BIEN ═════════════════════════════════════════════════════
 *
 *  · SUAVE Y DEBAJO. La música vive a un tercio del volumen de los efectos y
 *    NUNCA les gana: cuando AU-RA habla, cuando un mundo suena al acercarse,
 *    cuando se abre una casa, la música SE AGACHA sola y vuelve después. Es
 *    la regla de cualquier mezcla honesta: lo que informa va arriba, lo que
 *    ambienta va abajo.
 *  · NO PESA HASTA QUE SUENA. `preload="none"`: los 5 MB no se descargan
 *    nunca si la persona no la enciende, y quien la enciende la recibe en
 *    streaming — empieza a sonar antes de terminar de bajar.
 *  · SE APAGA DE UN TOQUE Y SE ACUERDA. El interruptor está a la vista y la
 *    decisión sobrevive a la recarga. Una música que hay que apagar en cada
 *    visita es exactamente la que molesta.
 *  · ENTRA Y SALE CON CALMA. Nada de cortes: dos segundos para aparecer, uno
 *    y medio para irse.
 *  · SE CALLA SI NO LA MIRAN. Con la pestaña en segundo plano no suena: nadie
 *    quiere música saliendo de una pestaña que dejó atrás.
 */
const MUSICA = (() => {
  'use strict';

  const LLAVE = 'veta.musica';
  const VOL = 0.26;            // el techo: debajo de todo lo demás
  const SUBE = 2.0;            // segundos de entrada
  const BAJA = 1.5;            // segundos de salida

  let el = null;               // el <audio>
  let ctx = null;
  let gan = null;              // el volumen de la música
  let fuente = null;
  let puesta = false;          // ¿la persona la quiere?
  let sonando = false;
  let agacheHasta = 0;         // hasta cuándo dura el agache
  let agacheReloj = null;
  let alCambiar = null;

  const quiere = () => {
    try { return localStorage.getItem(LLAVE) !== 'no'; } catch { return true; }
  };

  /* El grafo se arma la PRIMERA vez que se enciende, no al cargar la página:
     un AudioContext creado sin gesto nace suspendido y en algunos navegadores
     cuenta contra el límite de contextos. */
  function armar() {
    if (ctx) return true;
    el = document.getElementById('musica-cosmos');
    if (!el) return false;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    try {
      ctx = new AC();
      fuente = ctx.createMediaElementSource(el);
      gan = ctx.createGain();
      gan.gain.value = 0;
      /* Un compresor suave de propina: la pista tiene picos y valles, y sin
         esto los valles se pierden bajo los efectos y los picos asoman. */
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -24;
      comp.ratio.value = 4;
      comp.attack.value = 0.02;
      comp.release.value = 0.4;
      fuente.connect(gan);
      gan.connect(comp);
      comp.connect(ctx.destination);
      return true;
    } catch { ctx = null; return false; }
  }

  let agacheHondo = false;
  const nivel = () => (agacheHasta > performance.now()
    ? VOL * (agacheHondo ? 0.10 : 0.22)
    : VOL);

  function rampa(a, seg) {
    if (!gan || !ctx) return;
    const t = ctx.currentTime;
    gan.gain.cancelScheduledValues(t);
    gan.gain.setValueAtTime(Math.max(0.0001, gan.gain.value), t);
    gan.gain.linearRampToValueAtTime(Math.max(0.0001, a), t + seg);
  }

  /** Enciende. Tiene que llegar detrás de un gesto la primera vez. */
  async function encender(guardar = true) {
    if (!armar()) return false;
    if (guardar) { try { localStorage.setItem(LLAVE, 'si'); } catch { /* nada */ } }
    puesta = true;
    try {
      if (ctx.state === 'suspended') await ctx.resume();
      el.volume = 1;             // el volumen de verdad lo pone el grafo
      await el.play();
      sonando = true;
      rampa(nivel(), SUBE);
      alCambiar?.(true);
      return true;
    } catch {
      /* El navegador dijo que no (sin gesto todavía): queda armado para el
         primer toque de la persona, sin insistir ni avisar de nada. */
      sonando = false;
      return false;
    }
  }

  function apagar(guardar = true) {
    if (guardar) { try { localStorage.setItem(LLAVE, 'no'); } catch { /* nada */ } }
    puesta = false;
    if (!ctx || !el) return;
    rampa(0, BAJA);
    const yo = ++turno;
    setTimeout(() => { if (yo === turno && !puesta) { try { el.pause(); } catch { /* nada */ } sonando = false; } },
      BAJA * 1000 + 60);
    alCambiar?.(false);
  }
  let turno = 0;

  const alterna = () => (puesta ? apagar() : encender());

  /* AGACHARSE. Lo llama todo lo que tiene algo que decir: la voz de AU-RA, un
     aviso, el narrador del Génesis. La música baja a un quinto y vuelve sola
     cuando el que hablaba termina. */
  function agachar(ms = 1200, hondo = false) {
    agacheHasta = Math.max(agacheHasta, performance.now() + ms);
    if (hondo) agacheHondo = true;
    if (!sonando) return;
    rampa(nivel(), 0.25);
    clearTimeout(agacheReloj);
    agacheReloj = setTimeout(() => {
      if (sonando && agacheHasta <= performance.now()) { agacheHondo = false; rampa(VOL, 0.9); }
    }, ms + 80);
  }

  /* La swell del cine: en un momento grande —«y fue la luz»— la música SUBE
     por encima de su techo un rato corto. Es el único caso en que se le
     permite mandar, y dura lo que dura el momento. */
  function crecer(hasta = 1.55, seg = 2.2) {
    if (!sonando) return;
    agacheHasta = 0;
    clearTimeout(agacheReloj);
    rampa(VOL * hasta, seg);
    agacheReloj = setTimeout(() => { if (sonando) rampa(VOL, 3.2); }, seg * 1000 + 2200);
  }

  /* Volver al principio: el Génesis empieza con la pista desde su primera
     nota, que es donde la música cuenta lo mismo que la historia. */
  function desdeElPrincipio() {
    if (!el) return;
    try { el.currentTime = 0; } catch { /* algunos formatos no dejan buscar */ }
  }

  /* EL AVISO DEL CIELO. Cuando la galaxia va a soltar un golpe —zarpar hacia
     una app, aterrizar— la música se agacha antes de que suene, no después.
     Los dos viven en contextos de audio distintos y no pueden compartir un
     limitador: que uno se aparte cuando habla el otro es la única mezcla
     posible, y además es la correcta. */
  addEventListener('ae-golpe', (e) => {
    agachar(Math.max(600, e?.detail?.ms || 1000), true);
  });

  // Con la pestaña atrás, silencio.
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) { try { ctx.suspend(); } catch { /* nada */ } }
    else if (puesta) { try { ctx.resume(); } catch { /* nada */ } }
  });

  /* El primer toque de la persona es la llave del audio: si la quería puesta
     y el navegador no dejó, aquí es donde por fin suena. */
  function alPrimerGesto() {
    if (quiere() && !sonando) encender(false);
    removeEventListener('pointerdown', alPrimerGesto);
    removeEventListener('keydown', alPrimerGesto);
  }
  addEventListener('pointerdown', alPrimerGesto);
  addEventListener('keydown', alPrimerGesto);

  return {
    encender, apagar, alterna, agachar, crecer, desdeElPrincipio,
    puesta: () => puesta,
    quiere,
    alCambiar: (fn) => { alCambiar = fn; },
  };
})();

if (typeof window !== 'undefined') window.MUSICA = MUSICA;
