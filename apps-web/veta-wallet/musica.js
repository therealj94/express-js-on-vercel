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
  /* EL TECHO. Música de fondo quiere decir que no se note que está: que se
     eche de menos al apagarla y no se piense en ella mientras suena. A 0,26
     competía con lo que pasaba en pantalla; a 0,16 sostiene sin pedir turno.
     Y ahora es el único sonido continuo de la casa —las notas de los planetas
     se callaron— así que no tiene con quién pelear. */
  const VOL = 0.16;
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
  /* LA PISTA, CON EL SELLO DE LA VERSIÓN DETRÁS.
   *
   * El archivo se llama siempre igual —cosmos.mp3— así que un navegador que
   * bajó una versión anterior se queda con ella y sigue sonando la vieja por
   * mucho que publiquemos la nueva. Sin fecha de vencimiento: cinco megas de
   * audio son justo lo que un navegador guarda con más ganas. Con el sello
   * detrás, cada versión de la casa es una dirección distinta: la copia
   * guardada se aprovecha mientras la pista sea la misma, y se tira sola el
   * día que la cambiamos.
   *
   * Se cuelga aquí y no en el HTML porque `preload="none"` con un src puesto
   * igual deja al navegador resolver la dirección; poniéndola en el momento de
   * armar, la pista no existe hasta que alguien enciende la música. */
  function colgarPista() {
    if (!el || el.querySelector('source')) return;
    const sello = (window.VETA?.version?.().app) || 'x';
    const fuente = document.createElement('source');
    fuente.src = `assets/aud/cosmos.mp3?v=${encodeURIComponent(sello)}`;
    fuente.type = 'audio/mpeg';
    el.appendChild(fuente);
    el.load();
  }

  function armar() {
    if (ctx) return true;
    el = document.getElementById('musica-cosmos');
    if (!el) return false;
    colgarPista();
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
  /* EL ÚLTIMO RESPIRO PEDIDO. Un fondo que se apaga y vuelve llama más la
     atención que uno constante, así que cuánto y cuán hondo se agacha la
     música es una decisión de producto — y desde fuera no se puede oír: hay
     que preguntar. Aquí queda anotado el último. */
  let ultimo = null;

  function agachar(ms = 1200, hondo = false) {
    ultimo = { ms, hondo, cuando: Date.now() };
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
  /* ══ LOS GOLPES YA NO LA AGACHAN ═════════════════════════════════════════
     Cada golpe de la película la bajaba al diez por ciento durante segundo y
     pico. Con la música al veintiséis eso tenía sentido —había que hacerle
     sitio—; con la música al dieciséis y sin las notas de los planetas
     encima, lo único que hace es que la pista se apague y vuelva sola, y desde
     fuera eso se ve como una música que falla. Un fondo que aparece y
     desaparece llama MÁS la atención que uno constante, que es justo lo
     contrario de lo que un fondo tiene que hacer.
     Se deja un respiro cortito y suave: lo justo para que un golpe grande
     tenga aire, sin que se note el hueco. */
  addEventListener('ae-golpe', (e) => {
    agachar(Math.min(500, Math.max(260, e?.detail?.ms || 400)), false);
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

  /* El volumen REAL del grafo, no el que se pidió. Sirve para comprobar desde
     fuera algo que el oído humano juzga mal: si la música se agacha sola. */
  const volumen = () => (gan ? gan.gain.value : null);
  const ultimoAgache = () => (ultimo ? { ...ultimo } : null);

  return {
    encender, apagar, alterna, agachar, crecer, desdeElPrincipio, volumen, ultimoAgache,
    puesta: () => puesta,
    quiere,
    alCambiar: (fn) => { alCambiar = fn; },
  };
})();

if (typeof window !== 'undefined') window.MUSICA = MUSICA;
