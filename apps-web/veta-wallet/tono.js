/* El timbre de las llamadas.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * POR QUE NO ES UN ARCHIVO DE AUDIO
 *
 * Un mp3 de timbre pesa entre 50 y 200 KB, hay que servirlo, cachearlo, y si
 * la red va lenta el teléfono suena tarde o no suena — justo cuando más
 * importa. Esto lo genera el propio navegador con osciladores: son unos
 * cientos de bytes de código, suena en el acto y funciona sin conexión.
 *
 * Y además se puede parar en seco. Un <audio> en bucle tiene un retardo al
 * detenerse que hace que el timbre siga sonando medio segundo después de
 * contestar, y eso se nota mucho.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * LOS DOS TIMBRES SON DISTINTOS A PROPOSITO
 *
 * El de quien LLAMA imita el tono de espera del teléfono: un pitido largo
 * cada tres segundos, tranquilo, porque no pide nada — solo dice «seguí
 * esperando».
 *
 * El de quien RECIBE es insistente: dos pitidos rápidos cada segundo y medio,
 * más agudos. Tiene que ganarle al ruido de la calle y decir «esto es ahora».
 *
 * ══════════════════════════════════════════════════════════════════════════
 * EL PERMISO DEL NAVEGADOR
 *
 * Los navegadores no dejan sonar nada hasta que la persona haya tocado la
 * página al menos una vez. Para quien llama no hay problema: acaba de tocar
 * «llamar». Para quien recibe puede fallar si abrió la pestaña y no la tocó
 * nunca — y por eso el aviso de llamada entrante NO depende solo del sonido:
 * la pantalla se pone entera, y en el móvil además vibra, que no pide
 * permiso.
 */

const TONO = (() => {
  'use strict';

  let ctx = null;
  let reloj = null;
  let sonando = null;      // 'llamando' · 'entrando' · null

  const contexto = () => {
    if (!ctx) {
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C) return null;
      ctx = new C();
    }
    // Safari deja el contexto «suspendido» hasta que algo lo despierta.
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  };

  /**
   * Un pitido.
   *
   * La subida y la bajada del volumen NO son adorno: un oscilador que arranca
   * y se corta de golpe produce un chasquido —el famoso «click»— que suena a
   * error, no a teléfono. Diez milisegundos de rampa lo quitan.
   */
  function pitido(hz, dura, cuando, volumen = 0.18) {
    const c = contexto();
    if (!c) return;
    const osc = c.createOscillator();
    const vol = c.createGain();
    osc.type = 'sine';
    osc.frequency.value = hz;
    vol.gain.setValueAtTime(0, cuando);
    vol.gain.linearRampToValueAtTime(volumen, cuando + 0.01);
    vol.gain.setValueAtTime(volumen, cuando + dura - 0.02);
    vol.gain.linearRampToValueAtTime(0, cuando + dura);
    osc.connect(vol).connect(c.destination);
    osc.start(cuando);
    osc.stop(cuando + dura + 0.02);
  }

  /** El tono de espera de quien llama. Tranquilo. */
  function tandaLlamando() {
    const c = contexto();
    if (!c) return;
    const t = c.currentTime;
    // Dos armónicos juntos suenan a teléfono; uno solo suena a alarma de
    // microondas. Es la misma razón por la que el tono de una central
    // telefónica siempre son dos frecuencias a la vez.
    pitido(440, 0.9, t, 0.12);
    pitido(480, 0.9, t, 0.12);
  }

  /** El de quien recibe. Insistente. */
  function tandaEntrando() {
    const c = contexto();
    if (!c) return;
    const t = c.currentTime;
    pitido(660, 0.22, t, 0.2);
    pitido(880, 0.22, t + 0.3, 0.2);
    // Y vibra, que no necesita permiso ni volumen. En un bolsillo esto llega
    // antes que cualquier sonido.
    try { navigator.vibrate?.([220, 120, 220]); } catch {}
  }

  function parar() {
    clearInterval(reloj);
    reloj = null;
    sonando = null;
    try { navigator.vibrate?.(0); } catch {}
  }

  /**
   * @param {'llamando'|'entrando'} cual
   */
  function sonar(cual) {
    if (sonando === cual) return;
    parar();
    sonando = cual;
    const tanda = cual === 'entrando' ? tandaEntrando : tandaLlamando;
    tanda();
    reloj = setInterval(tanda, cual === 'entrando' ? 1500 : 3000);
  }

  /** Un solo golpe corto. Para cuando la llamada conecta o se cae. */
  function golpe(bueno = true) {
    const c = contexto();
    if (!c) return;
    const t = c.currentTime;
    if (bueno) { pitido(660, 0.09, t, 0.14); pitido(880, 0.11, t + 0.1, 0.14); }
    else { pitido(400, 0.13, t, 0.14); pitido(300, 0.18, t + 0.14, 0.14); }
  }

  /* Se despierta el audio con el primer toque de la persona en la página.
     Sin esto, el navegador bloquea el primer timbre y quien recibe una
     llamada no oye nada — el caso que mas importa. */
  function despertar() {
    const c = contexto();
    if (c && c.state === 'suspended') c.resume().catch(() => {});
  }

  if (typeof document !== 'undefined') {
    for (const ev of ['pointerdown', 'keydown']) {
      document.addEventListener(ev, despertar, { once: false, passive: true });
    }
  }

  return { sonar, parar, golpe, despertar, sonando: () => sonando };
})();

if (typeof window !== 'undefined') window.TONO = TONO;
