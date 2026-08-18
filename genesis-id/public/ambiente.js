/* El fondo sonoro de Genesis Core.
 *
 * ══ POR QUÉ ESTÁ SINTETIZADO Y NO ES UN FICHERO ════════════════════════════
 *
 * Un mp3 de ambiente cinematográfico tendría dos problemas que esta casa ya
 * conoce. El primero es de dónde sale: la CSP de esta página abre UN origen y
 * solo uno —el banco de voz— y traer audio de un tercero sería abrir la puerta
 * a un servidor que no controlamos, para poner música de fondo. El segundo es
 * el peso: un ambiente que aguante diez minutos sin que se note el bucle son
 * varios megas, y esta pantalla se abre desde un teléfono en una sala con mal
 * wifi.
 *
 * Sintetizado no pesa nada, no sale a ningún sitio, y no tiene bucle: no se
 * repite nunca porque no hay nada grabado que repetir.
 *
 * ══ QUÉ SUENA ══════════════════════════════════════════════════════════════
 *
 * Un acorde de tres notas muy graves —la fundamental, su quinta y su octava—
 * con las voces ligeramente desafinadas entre sí. Ese desafine mínimo es lo
 * que produce el «batido» lento que hace que un pad suene vivo en vez de
 * plano; afinadas exactas suena a tono de prueba de un aparato.
 *
 * Encima, dos capas más:
 *   · un filtro que se abre y se cierra despacio, que es lo que hace que
 *     parezca que la cosa respira;
 *   · un GOLPE en cada latido del cerebro, muy grave y muy corto, sincronizado
 *     con la onda que se ve en pantalla. Sin él, el sonido y la imagen van por
 *     su cuenta y se nota; con él, lo que se oye es lo que se está viendo.
 *
 * ══ ARRANCA APAGADO, Y NO ES POR PRUDENCIA ═════════════════════════════════
 *
 * Ningún navegador deja que una página empiece a sonar sin que alguien la haya
 * tocado, y hace bien: abrir un enlace y que empiece a sonar música es de mala
 * educación. Así que hay un botón. Y la preferencia se recuerda, para que
 * quien lo enciende una vez no tenga que encenderlo en cada carga.
 */

const CLAVE = 'genesisCore.sonido';

export function crearAmbiente({ periodo }) {
  let ctx = null, maestro = null, filtro = null, lfo = null;
  const voces = [];
  let encendido = false;
  let latido = 0;

  /* Las tres notas. 55 Hz es un LA muy grave — lo bastante abajo para que el
     ambiente no compita con la voz que habla encima, que es la que importa. */
  const NOTAS = [
    { hz: 55.00, gan: 0.085, desafine: 0 },
    { hz: 82.41, gan: 0.055, desafine: +0.18 },   // la quinta
    { hz: 110.0, gan: 0.040, desafine: -0.22 },   // la octava
    { hz: 164.8, gan: 0.016, desafine: +0.31 },   // un armónico, apenas
  ];

  function montar() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();

    maestro = ctx.createGain();
    maestro.gain.value = 0;                 // entra con una rampa, ver abajo
    maestro.connect(ctx.destination);

    /* Un paso bajo con poca resonancia. La resonancia alta hace que al abrirse
       el filtro «cante» un formante, y eso ya no es ambiente: es un sintetizador
       haciéndose notar. */
    filtro = ctx.createBiquadFilter();
    filtro.type = 'lowpass';
    filtro.frequency.value = 260;
    filtro.Q.value = 0.7;
    filtro.connect(maestro);

    // El filtro se abre y se cierra en un ciclo muy largo: 38 segundos. Corto,
    // el oído lo identifica como un efecto y deja de ser fondo.
    lfo = ctx.createOscillator();
    lfo.frequency.value = 1 / 38;
    const prof = ctx.createGain();
    prof.gain.value = 150;
    lfo.connect(prof);
    prof.connect(filtro.frequency);
    lfo.start();

    for (const n of NOTAS) {
      // Dos osciladores por nota, uno un pelo desafinado del otro: el batido
      // entre los dos es lo que da el movimiento interno del acorde.
      for (const lado of [-1, 1]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = n.hz;
        o.detune.value = (n.desafine + lado * 3.5);
        const g = ctx.createGain();
        g.gain.value = n.gan / 2;
        o.connect(g); g.connect(filtro);
        o.start();
        voces.push(o);
      }
    }
    return true;
  }

  /** El golpe del latido: un seno muy grave que cae en un cuarto de segundo.
   *  Se dispara desde el bucle de dibujo, así que suena exactamente cuando la
   *  onda sale del centro — no «más o menos a la vez». */
  function golpe() {
    if (!ctx || !encendido) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(64, t);
    o.frequency.exponentialRampToValueAtTime(34, t + 0.32);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    o.connect(g); g.connect(maestro);
    o.start(t); o.stop(t + 0.5);
  }

  return {
    get encendido() { return encendido; },
    // Se recuerda la elección: quien lo enciende una vez no tiene que volver a
    // encenderlo en cada carga.
    get recordado() { try { return localStorage.getItem(CLAVE) === '1'; } catch (e) { return false; } },

    async alternar(si) {
      encendido = si === undefined ? !encendido : si;
      try { localStorage.setItem(CLAVE, encendido ? '1' : '0'); } catch (e) {}
      if (encendido) {
        if (!ctx && !montar()) { encendido = false; return false; }
        if (ctx.state === 'suspended') await ctx.resume();
        // Rampa de tres segundos. De golpe, un acorde grave a volumen pleno
        // asusta; ésta es la entrada que se le pide a un fondo.
        maestro.gain.cancelScheduledValues(ctx.currentTime);
        maestro.gain.setValueAtTime(maestro.gain.value, ctx.currentTime);
        maestro.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 3);
      } else if (ctx) {
        maestro.gain.cancelScheduledValues(ctx.currentTime);
        maestro.gain.setValueAtTime(maestro.gain.value, ctx.currentTime);
        maestro.gain.linearRampToValueAtTime(0, ctx.currentTime + 1.2);
      }
      return encendido;
    },

    /** Lo llama el bucle de dibujo en cada cuadro con el reloj de la animación.
     *  Aquí se decide si toca golpe, comparando en qué ciclo del latido vamos:
     *  así el sonido no se desincroniza aunque la pestaña se quede sin pintar
     *  un rato y el reloj dé un salto. */
    latir(ahora) {
      const ciclo = Math.floor(ahora / periodo);
      if (ciclo !== latido) { latido = ciclo; golpe(); }
    },
  };
}
