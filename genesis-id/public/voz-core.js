/* La voz de Genesis Core.
 *
 * ══ DE DÓNDE SALE LA VOZ ═══════════════════════════════════════════════════
 *
 * Del banco que esta casa ya tiene grabado: `cerebro.ordenscan.com/voz/`.
 * Son frases rendidas con Piper en nuestras propias máquinas —no se manda
 * texto a ningún servicio— y suenan igual en todos los aparatos, que es lo
 * que la voz del navegador nunca consiguió: cada teléfono traía la suya y
 * algunas eran el sintetizador viejo.
 *
 * ══ POR QUÉ EL GUION LLEVA EL NOMBRE DEL FICHERO ESCRITO ═══════════════════
 *
 * El cerebro grande calcula la clave del audio a partir del texto (un FNV-1a
 * del texto ya pasado por `limpiar()`). Aquí NO se recalcula, y es a
 * propósito: reproducir esa función —con su mapa de pronunciación y su
 * detección de idioma— es copiarla, y una copia se desincroniza el día que
 * alguien toque `limpiar()` allí. El síntoma sería mudo o, peor, otro audio.
 *
 * Así que cada línea del guion trae su fichero, sacado del manifiesto real y
 * comprobado uno por uno. Si el fichero deja de existir, no se calla: se dice
 * la MISMA frase con la voz del aparato. Nunca un audio que diga algo
 * distinto del subtítulo — ésa es la regla y no se rompe por nada.
 */

const BANCO = 'https://cerebro.ordenscan.com/voz/';

export function crearVoz({ alNivel, alTexto, alEstado }) {
  let audio = null, ctxAudio = null, analizador = null, datos = null;
  let turno = 0, medidor = 0;
  let hablando = false;

  /* ── EL NIVEL DE LA BOCA ──
     Cuando suena un mp3 se MIDE la señal: la boca se abre donde hay sonido y
     se cierra en los silencios, así que las pausas de la frase se ven. */
  function medirDelAudio() {
    if (!analizador) return;
    analizador.getByteTimeDomainData(datos);
    let s = 0;
    for (let i = 0; i < datos.length; i++) { const d = (datos[i] - 128) / 128; s += d * d; }
    const rms = Math.sqrt(s / datos.length);
    // La voz vive en un margen estrecho de RMS; se estira para que la boca
    // recorra su rango entero en vez de temblar en el 10 %.
    alNivel(Math.min(1, rms * 5.5));
    medidor = requestAnimationFrame(medirDelAudio);
  }

  /* Con la voz del navegador no hay señal que medir: `SpeechSynthesis` no da
     acceso al audio. Aquí sí se FABRICA una envolvente, y se dice, para que
     nadie lo confunda con lo de arriba: dos ondas de distinta frecuencia para
     que no salga un vaivén de metrónomo. */
  function nivelFingido() {
    const t = performance.now() / 1000;
    const v = 0.45 + 0.34 * Math.sin(t * 11.3) + 0.21 * Math.sin(t * 6.7 + 1.2);
    alNivel(Math.max(0, Math.min(1, v)));
    medidor = requestAnimationFrame(nivelFingido);
  }

  function pararMedidor() {
    if (medidor) cancelAnimationFrame(medidor);
    medidor = 0;
    alNivel(0);
  }

  /** Engancha el analizador al elemento de audio. Se hace UNA vez por
   *  AudioContext: `createMediaElementSource` sobre el mismo elemento dos
   *  veces lanza, y sobre elementos distintos deja el anterior colgado. */
  function engancharAnalisis(el) {
    try {
      if (!ctxAudio) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return false;
        ctxAudio = new AC();
        analizador = ctxAudio.createAnalyser();
        analizador.fftSize = 1024;
        datos = new Uint8Array(analizador.fftSize);
        analizador.connect(ctxAudio.destination);
      }
      if (ctxAudio.state === 'suspended') ctxAudio.resume();
      const fuente = ctxAudio.createMediaElementSource(el);
      fuente.connect(analizador);
      return true;
    } catch (e) {
      // Sin análisis se sigue: la boca se moverá con la envolvente fabricada,
      // que es peor pero no deja la cara muerta mientras suena la voz.
      return false;
    }
  }

  function conNavegador(texto, mio, acabar) {
    const s = window.speechSynthesis;
    if (!s) { acabar(); return; }
    const u = new SpeechSynthesisUtterance(texto);
    u.lang = 'es-MX';
    u.rate = 0.98; u.pitch = 1.0;
    /* Se busca una voz latina y natural, en ese orden, y NO se acepta
       cualquiera: una voz peninsular en mitad de una presentación en México
       se nota más que un acento robótico. */
    const voces = s.getVoices();
    const prefiere = [/es-?MX/i, /es-?US/i, /es-?419/i, /Paulina|Mónica|Monica/i, /^es/i];
    for (const re of prefiere) {
      const v = voces.find((x) => re.test(x.lang || '') || re.test(x.name || ''));
      if (v) { u.voice = v; u.lang = v.lang || u.lang; break; }
    }
    u.onend = () => { if (mio === turno) acabar(); };
    u.onerror = () => { if (mio === turno) acabar(); };
    nivelFingido();
    s.cancel();
    s.speak(u);
  }

  /** Dice UNA línea: `{ texto, audio }`. Devuelve una promesa que se resuelve
   *  cuando termina — o cuando alguien la corta. */
  function decir(linea) {
    return new Promise((listo) => {
      const mio = ++turno;
      alTexto(linea.texto);

      const acabar = () => {
        if (mio !== turno) return;
        pararMedidor();
        listo();
      };

      if (!linea.audio) { conNavegador(linea.texto, mio, acabar); return; }

      const el = new Audio(BANCO + linea.audio);
      el.crossOrigin = 'anonymous';   // hace falta para poder ANALIZAR la señal
      el.preload = 'auto';
      audio = el;

      let arrancó = false;
      /* Si el fichero no llega, se habla con la voz del aparato — la misma
         frase. Dos segundos y medio: es lo que tarda en notarse un silencio
         raro delante de gente, y menos que eso corta descargas lentas. */
      const vigía = setTimeout(() => {
        if (arrancó || mio !== turno) return;
        try { el.pause(); } catch (e) {}
        conNavegador(linea.texto, mio, acabar);
      }, 2500);

      const enMarcha = () => {
        if (arrancó) return;
        arrancó = true; clearTimeout(vigía);
        if (engancharAnalisis(el)) medirDelAudio(); else nivelFingido();
      };
      el.oncanplay = enMarcha;
      el.onplaying = enMarcha;
      el.onended = acabar;
      el.onerror = () => {
        if (arrancó || mio !== turno) return;
        arrancó = true; clearTimeout(vigía);
        conNavegador(linea.texto, mio, acabar);
      };

      const pr = el.play();
      if (pr && pr.catch) pr.catch(() => {
        if (arrancó || mio !== turno) return;
        arrancó = true; clearTimeout(vigía);
        conNavegador(linea.texto, mio, acabar);
      });
    });
  }

  return {
    get hablando() { return hablando; },

    /** Dice un guion entero, línea a línea. Volver a llamar corta el anterior. */
    async recitar(lineas) {
      this.callar();
      hablando = true;
      alEstado(true);
      const mío = turno + 1;
      for (const l of lineas) {
        if (!hablando || turno >= mío + lineas.length) break;
        await decir(l);
        if (!hablando) break;
      }
      if (hablando) { hablando = false; alEstado(false); alTexto(''); }
    },

    callar() {
      turno++;
      hablando = false;
      pararMedidor();
      if (audio) { try { audio.pause(); audio.currentTime = 0; } catch (e) {} audio = null; }
      try { window.speechSynthesis && window.speechSynthesis.cancel(); } catch (e) {}
      alEstado(false);
      alTexto('');
    },
  };
}
