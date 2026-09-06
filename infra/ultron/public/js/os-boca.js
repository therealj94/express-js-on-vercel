/* LA BOCA DE ULTRON, MOVIDA POR EL AUDIO DE VERDAD.
 *
 * ── EL ERROR QUE NO SE PUEDE REPETIR ────────────────────────────────────────
 *
 * En `voz.js` está escrita con todas las letras la lección más cara de esta
 * consola: NO SE ENRUTA EL AUDIO POR WEB AUDIO. Conectar cada `<audio>` a un
 * AnalyserNode con `createMediaElementSource` REDIRIGE el sonido del elemento
 * al grafo de Web Audio, y si el contexto está suspendido —lo está siempre
 * hasta que un gesto lo despierta, y vuelve a suspenderse al perder el foco—
 * el elemento deja de sonar por su cuenta y no suena por ningún lado. El
 * síntoma fue exacto: «ULTRON está hablando» en pantalla y silencio total.
 *
 * Por eso hasta hoy la figura se movía con una envolvente INVENTADA: dos senos
 * sumados que parecen sílabas. Se ve viva y no tiene nada que ver con lo que
 * se está oyendo. Con un busto que abre la boca, eso ya no alcanza: la boca se
 * mueve cuando hay silencio y se queda quieta en una vocal larga, y el ojo lo
 * caza enseguida.
 *
 * ── LA SALIDA, QUE NO ES NI UNA NI OTRA ─────────────────────────────────────
 *
 * El audio NO se toca. Sigue sonando por su `<audio>`, solo, exactamente como
 * hoy. Lo que se hace es DECODIFICARLO APARTE —una copia de los bytes, en un
 * contexto que nunca se conecta a los altavoces— y sacarle de una vez la
 * envolvente entera: cuánta energía tiene el sonido en cada centésima. Después,
 * mientras el elemento suena, se lee esa tabla en la posición
 * `audio.currentTime`. La boca se mueve con el audio de verdad, y el audio no
 * pasa por ningún grafo que pueda enmudecerlo.
 *
 * `decodeAudioData` funciona con el contexto SUSPENDIDO: decodificar no es
 * reproducir. Ese es el detalle que hace que todo esto sea posible.
 *
 * ── Y SI NO SE PUEDE ────────────────────────────────────────────────────────
 *
 * Un navegador que no decodifique ese MP3, un contexto que no se deje crear,
 * un audio que llegó a medias: se devuelve `null` y quien llama se queda con
 * la envolvente inventada de siempre. Nunca se cambia una boca que se mueve
 * mal por una boca que no se mueve.
 */
const BOCA = (() => {
  'use strict';

  const HZ = 100;                 // muestras por segundo de la envolvente
  const TOPE_SEG = 90;            // una frase de ULTRON no llega ni a 30

  let ctx = null;
  /** El contexto de decodificar. Nace suspendido y NUNCA se conecta a nada. */
  function contexto() {
    if (ctx) return ctx;
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    try { ctx = new C(); } catch { return null; }
    return ctx;
  }

  /**
   * La envolvente de un audio, o null si no se pudo.
   * Devuelve { at(t) } donde `t` son segundos y la respuesta va de 0 a 1.
   */
  async function envolvente(blob) {
    const c = contexto();
    if (!c || !blob) return null;
    let datos;
    try {
      /* Una COPIA de los bytes: `arrayBuffer()` de un Blob devuelve un buffer
         nuevo, pero `decodeAudioData` se lo queda (lo deja «detached»), y si
         alguien más tuviera ese mismo buffer se le vaciaría en la mano. */
      const bytes = await blob.arrayBuffer();
      datos = await c.decodeAudioData(bytes);
    } catch { return null; }
    if (!datos || !datos.length || datos.duration > TOPE_SEG) return null;

    const n = Math.max(1, Math.ceil(datos.duration * HZ));
    const por = Math.max(1, Math.floor(datos.sampleRate / HZ));
    const canal = datos.getChannelData(0);
    const env = new Float32Array(n);

    /* RMS por ventana, no el pico. El pico salta con cualquier chasquido y da
       una boca temblorosa; la energía media sigue la sílaba, que es lo que
       mueve una mandíbula de verdad. */
    let alto = 1e-6;
    for (let i = 0; i < n; i++) {
      const a = i * por, b = Math.min(canal.length, a + por);
      let s = 0;
      for (let k = a; k < b; k++) s += canal[k] * canal[k];
      const v = Math.sqrt(s / Math.max(1, b - a));
      env[i] = v;
      if (v > alto) alto = v;
    }

    /* Se normaliza contra el PICO DE ESTA FRASE y no contra un valor fijo: una
       frase dicha bajito tiene que abrir la boca igual que una dicha fuerte, o
       ULTRON parecería susurrar sin mover los labios. Y la raíz levanta la
       parte floja de la curva, que es donde vive el habla normal — con la
       energía en crudo la boca solo se abre en los golpes. */
    for (let i = 0; i < n; i++) env[i] = Math.sqrt(Math.min(1, env[i] / alto));

    /* ── EL SUELO, QUE ES LO QUE CIERRA LA BOCA ─────────────────────────────
       Un MP3 nunca da cero: trae el ruido del codificador y el aire de la sala
       de grabación. Medido con una frase real de ULTRON, el mínimo daba 0,023
       y la media 0,513 — pero la parte «callada» se quedaba en 0,10-0,15, así
       que la mandíbula no cerraba NUNCA. Una boca entreabierta en cada pausa
       se lee como una máquina colgada, no como alguien que respira.
       Se toma el percentil 10 como el suelo de esta frase —no un valor fijo,
       porque cada grabación trae el suyo— y se resta. Lo que estaba en el
       suelo pasa a ser cero: silencio, boca cerrada. */
    const orden = Float32Array.from(env).sort();
    const piso = orden[Math.floor(n * 0.1)] || 0;
    for (let i = 0; i < n; i++) env[i] = Math.max(0, (env[i] - piso) / Math.max(0.05, 1 - piso));

    /* Un suavizado corto: la mandíbula tiene masa y no salta de cero a uno en
       una centésima. Se hace en dos pasadas —ida y vuelta— para no correr la
       curva hacia adelante, que dejaría la boca abriéndose tarde. */
    const suave = new Float32Array(n);
    const k = 0.35;
    let v = 0;
    for (let i = 0; i < n; i++) { v += (env[i] - v) * k; suave[i] = v; }
    v = 0;
    for (let i = n - 1; i >= 0; i--) { v += (suave[i] - v) * k; suave[i] = v; }

    return {
      dura: datos.duration,
      muestras: n,
      at(t) {
        if (!(t >= 0)) return 0;
        const i = Math.min(n - 1, Math.round(t * HZ));
        return suave[i] || 0;
      },
    };
  }

  /* El contexto de decodificar se puede quedar abierto entre frases —crear uno
     por frase agota el cupo del navegador, que son unos pocos— pero cuando la
     conversación termina no tiene por qué seguir vivo. */
  function soltar() {
    if (!ctx) return;
    try { ctx.close(); } catch { /* ya estaba cerrado */ }
    ctx = null;
  }

  return { envolvente, soltar, _adentro: { HZ, contexto } };
})();

if (typeof window !== 'undefined') window.BOCA = BOCA;
