/* La voz de ULTRON en el navegador: decir y escuchar.
 *
 * DECIR, FRASE POR FRASE. El texto llega del modelo a trozos; se corta en
 * frases completas y cada frase se pide a /voz en cuanto está, mientras la
 * anterior suena. La primera palabra se oye a los dos o tres segundos, no al
 * final. Sin ElevenLabs se usa la voz del navegador: peor timbre, misma
 * conducta.
 *
 * EL AUDIO SE DESPIERTA CON UN GESTO. Un navegador no deja sonar nada que no
 * nazca de un toque o una tecla: el AudioContext nace suspendido y todo lo
 * que se conecte a él es silencio. `despertar()` se llama en el primer gesto
 * de la persona, y es el motivo por el que ULTRON habla cuando toca.
 */
const VOZ = (() => {
  'use strict';

  const paraDecir = (md) => String(md || '')
    .replace(/```[\s\S]*?```/g, ' ').replace(/https?:\/\/\S+/g, ' ').replace(/\[(.*?)\]\(.*?\)/g, '$1')
    .replace(/^\s*[#>*-]+\s*/gm, '').replace(/[*_`|]/g, '').replace(/\s+/g, ' ').trim();

  function partirFrases(texto) {
    const frases = []; let resto = texto;
    const re = /^([\s\S]*?[.!?…](?:["»)\]]?)(?=\s|$))/;
    for (;;) {
      const m = re.exec(resto); if (!m) break;
      const f = m[1].trim();
      if (f.length < 12 && frases.length) frases[frases.length - 1] += ' ' + f; else if (f) frases.push(f);
      resto = resto.slice(m[0].length);
    }
    return { frases, resto };
  }

  /** Un WAV corto en silencio: la llave del permiso de audio.
   *  CON MUESTRAS, no solo cabecera. El anterior declaraba `data` de CERO
   *  bytes: Chrome lo tragaba, pero Safari —y iOS es todo Safari— no considera
   *  reproducido un audio sin una sola muestra, así que el permiso NUNCA se
   *  daba y todo lo que venía después era silencio. Ochenta milisegundos de
   *  ceros a 8 kHz: 640 bytes, inaudibles, y suficientes para que cuente. */
  function wavMudo() {
    const muestras = 640;
    const b = new ArrayBuffer(44 + muestras), v = new DataView(b);
    const txt = (o, t) => { for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); };
    txt(0, 'RIFF'); v.setUint32(4, 36 + muestras, true); txt(8, 'WAVEfmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, 8000, true); v.setUint32(28, 8000, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true);
    txt(36, 'data'); v.setUint32(40, muestras, true);
    for (let i = 0; i < muestras; i++) v.setUint8(44 + i, 128);   // 128 = silencio en PCM de 8 bits
    return new Blob([b], { type: 'audio/wav' });
  }

  /* iOS —y iPadOS, que se hace pasar por Mac— tiene reglas propias: el permiso
     de audio vive en el ELEMENTO que sonó durante el gesto, no en la página. */
  const esIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  class Locutor {
    static avisado = false;   // el aviso de «no pude usar la voz» se da una vez
    static sintesisDespierta = false;
    constructor({ conElevenLabs, alNivel, alEmpezar, alTerminar, alFallo }) {
      Object.assign(this, { conElevenLabs, alNivel, alEmpezar, alTerminar, alFallo });
      this.cola = []; this.sonando = false; this.generacion = 0; this.resto = ''; this.ctx = null; this.vozId = null;
      this.desbloqueado = false;
      /* ── UN SOLO ELEMENTO, PARA SIEMPRE ─────────────────────────────────
         El fallo que esto arregla, con nombre y fecha: en el iPad de José
         ULTRON no hablaba NUNCA. `sonar()` creaba `new Audio(url)` por cada
         frase, y en iOS el permiso de reproducción no es de la página: es del
         ELEMENTO que sonó dentro de un gesto de la persona. Un elemento recién
         creado, tres segundos después del toque, no lo tiene — `play()` se
         rechaza, se cae al respaldo del navegador, que en iOS también exige
         gesto, y el resultado es «ULTRON está hablando» en pantalla y silencio
         absoluto.
         Aquí hay UN elemento, se desbloquea con el primer toque y después solo
         se le cambia el `src`. El permiso se da una vez y vale para todo. */
      this.audio = new Audio();
      this.audio.preload = 'auto';
      this.audio.playsInline = true;                 // iOS no abre el reproductor a pantalla completa
      this.audio.setAttribute('playsinline', '');
      this.audio.crossOrigin = 'anonymous';
    }
    /**
     * Se llama DENTRO de un gesto de la persona: un audio mudo de un instante
     * le da al navegador lo que exige para dejar sonar los que vengan después,
     * que llegan del servidor y ya no nacen de un gesto.
     *
     * Va por `blob:` y no por `data:` a propósito: la política de contenido de
     * la casa admite `blob:` en media —es por donde llegan los audios de
     * verdad— y no hay motivo para ampliarla por un silencio de un frame.
     */
    despertar() {
      if (this.desbloqueado) return;
      try {
        /* Sobre EL elemento, no sobre uno de usar y tirar: lo que se desbloquea
           es este de aquí, que es el que va a sonar toda la sesión.
           Y sin `volume = 0`: iOS ignora `volume` en un elemento de medios —no
           se puede bajar por código— y algunos navegadores no cuentan como
           reproducción lo que suena a cero. El WAV ya es silencio de verdad. */
        const url = URL.createObjectURL(wavMudo());
        this.audio.src = url;
        const p = this.audio.play();
        const listo = () => { this.desbloqueado = true; URL.revokeObjectURL(url); };
        if (p && p.then) p.then(listo).catch(() => URL.revokeObjectURL(url));
        else listo();
        /* La voz del navegador también quiere su gesto en iOS: se le da uno
           mudo aquí mismo, para que el respaldo funcione cuando haga falta. */
        if (window.speechSynthesis && !Locutor.sintesisDespierta) {
          Locutor.sintesisDespierta = true;
          try { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u); } catch { /* nada */ }
        }
      } catch { /* si no se puede, el primer audio de verdad lo intentará */ }
    }
    alimentar(trozo) {
      this.resto += trozo;
      const { frases, resto } = partirFrases(this.resto); this.resto = resto;
      for (const f of frases) this.decir(f);
    }
    cerrar() {
      const u = this.resto.trim(); this.resto = '';
      if (u) this.decir(u);
      if (!this.sonando && !this.cola.length) this.alTerminar?.();
    }
    decir(frase) {
      const limpio = paraDecir(frase); if (!limpio) return;
      const gen = this.generacion;
      // El texto viaja CON el audio: si el mp3 no llega o no puede sonar, hay
      // con qué decirlo por el otro camino en vez de callarse.
      this.cola.push({ texto: limpio, audio: this.conElevenLabs ? DATOS.voz(limpio, { rapido: true, vozId: this.vozId }).catch(() => null) : Promise.resolve(null) });
      if (!this.sonando) this.seguir(gen);
    }
    callar() {
      this.generacion++; this.cola = []; this.resto = '';
      /* `corte()` es lo que cierra la sesión de `sonar()` que esté en marcha.
         Sin esto se paraba el elemento con `pause()` —que NO dispara `ended`—,
         así que el temporizador de la envolvente, que late a 40 Hz, seguía
         corriendo para siempre y la promesa de `sonar()` no resolvía nunca.
         Una conversación de treinta frases dejaba treinta temporizadores vivos
         moviéndole la boca a nadie. */
      this.corte?.();
      /* Se para, no se destruye: destruirlo tiraba a la basura el permiso de
         iOS y la frase siguiente ya no sonaba. `removeAttribute('src')` en vez
         de `src = ''`, que en Safari dispara un `error` de red por intentar
         cargar la página como si fuera un audio. */
      if (this.audio) { try { this.audio.pause(); this.audio.removeAttribute('src'); this.audio.load(); } catch { /* nada */ } }
      if (window.speechSynthesis) speechSynthesis.cancel();
      this.sonando = false; this.alNivel?.(0);
    }
    get ocupado() { return this.sonando || this.cola.length > 0; }
    async seguir(gen) {
      this.sonando = true; this.alEmpezar?.();
      while (this.cola.length && gen === this.generacion) {
        const { texto, audio } = this.cola.shift();
        const blob = await audio;
        if (gen !== this.generacion) break;
        // Sin mp3 —no hay ElevenLabs, o el servidor no pudo— se dice igual.
        if (blob && blob.size > 0) await this.sonar(blob, gen, texto);
        else await this.conNavegador(texto, gen);
      }
      if (gen === this.generacion) { this.sonando = false; this.alNivel?.(0); this.alTerminar?.(); }
    }
    /**
     * Sonar un audio. Y aquí va la lección más cara de esta consola:
     *
     * NO SE ENRUTA EL AUDIO POR WEB AUDIO. La versión anterior conectaba cada
     * `<audio>` a un AnalyserNode con `createMediaElementSource` para medir la
     * envolvente y mover la figura. Eso REDIRIGE el sonido del elemento al
     * grafo de Web Audio: si el contexto está suspendido —y lo está siempre
     * hasta que un gesto lo despierta, y vuelve a suspenderse si la pestaña
     * pierde el foco— el elemento deja de sonar por su cuenta y no suena por
     * ningún lado. El síntoma era exacto: «ULTRON está hablando» abajo y
     * silencio total. Una envolvente bonita no vale que el asistente sea mudo.
     *
     * Así que el audio suena por el elemento, a secas, y el nivel que mueve la
     * figura se sintetiza mientras suena. La figura no sabe la diferencia.
     *
     * Y si el audio no puede sonar —`play()` rechazado por la política de
     * autoarranque, un mp3 que no llegó— NO se calla: se dice la frase con la
     * voz del navegador. Peor timbre, pero se oye, que es lo que importa.
     */
    sonar(blob, gen, texto) {
      return new Promise((listo) => {
        const url = URL.createObjectURL(blob);
        const a = this.audio;                 // SIEMPRE el mismo: ver el constructor
        a.src = url;
        let envolvente = null;
        /* LA ENVOLVENTE DE VERDAD, si se pudo sacar. `BOCA` decodifica una
           COPIA de los bytes en un contexto que jamás se conecta a los
           altavoces y devuelve la energía del sonido centésima a centésima; el
           `<audio>` de aquí abajo no se toca y sigue sonando solo, que es la
           regla que este comentario defiende arriba.
           Se pide sin esperar: si tarda más que el arranque del audio, las
           primeras décimas van con la inventada y en cuanto llega se cambia
           sola. Nadie ve el salto y nadie se queda sin voz. */
        let real = null;
        window.BOCA?.envolvente(blob).then((e) => { real = e; }).catch(() => { /* la inventada sigue */ });
        const soltar = () => { clearInterval(envolvente); envolvente = null; a.onended = a.onerror = a.onplaying = null; URL.revokeObjectURL(url); this.alNivel?.(0); };
        const fin = () => { this.corte = null; soltar(); listo(); };
        this.corte = fin;      // para que `callar()` pueda cerrar esta sesión
        a.onended = fin;
        a.onerror = () => { soltar(); this.conNavegador(texto, gen).then(listo); };
        a.onplaying = () => {
          // La envolvente: un habla tiene sílabas, no una línea recta.
          envolvente = setInterval(() => {
            if (gen !== this.generacion || a.paused || a.ended) return;
            if (real) { this.alNivel?.(real.at(a.currentTime)); return; }
            const t = performance.now() / 1000;
            this.alNivel?.(Math.min(1, 0.35 + 0.3 * Math.abs(Math.sin(t * 7.3)) + 0.2 * Math.abs(Math.sin(t * 3.1))));
          }, 25);
        };
        a.play().catch((e) => {
          // Lo más común: la política de autoarranque. Se dice igual, con la
          // voz del navegador, y se avisa UNA vez para que se sepa por qué
          // cambió el timbre.
          soltar();
          if (!Locutor.avisado) { Locutor.avisado = true; this.alFallo?.(String(e?.name || e)); }
          this.conNavegador(texto, gen).then(listo);
        });
      });
    }
    conNavegador(texto, gen) {
      return new Promise((listo) => {
        if (!window.speechSynthesis) return listo();
        const u = new SpeechSynthesisUtterance(texto); u.lang = 'es-HN'; u.rate = 1;
        /* `getVoices()` devuelve [] hasta que el navegador termina de cargarlas
           —en iOS tarda—, y entonces `u.voice` quedaba en null y hablaba en
           inglés. Si no hay ninguna todavía, se deja que elija por `lang`. */
        const voces = speechSynthesis.getVoices() || [];
        u.voice = voces.find((v) => /es-(HN|MX|US|419)/i.test(v.lang)) || voces.find((v) => /^es/i.test(v.lang)) || null;
        const t = setInterval(() => { if (gen === this.generacion) this.alNivel?.(0.35 + 0.3 * Math.abs(Math.sin(performance.now() / 160))); }, 60);
        const fin = () => { clearInterval(t); this.alNivel?.(0); listo(); };
        u.onend = fin; u.onerror = fin; speechSynthesis.speak(u);
      });
    }
  }

  const hayOido = () => !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  /** Escucha una vez. Resuelve con lo dicho (vacío si no se oyó nada). */
  function escuchar({ alParcial } = {}) {
    return new Promise((listo) => {
      const R = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!R) return listo('');
      const rec = new R(); rec.lang = 'es-HN'; rec.interimResults = true; rec.continuous = false;
      let final = '';
      rec.onresult = (ev) => { let inter = ''; for (let i = 0; i < ev.results.length; i++) { const r = ev.results[i]; if (r.isFinal) final += r[0].transcript; else inter += r[0].transcript; } alParcial?.((final + ' ' + inter).trim()); };
      rec.onerror = () => listo(final.trim()); rec.onend = () => listo(final.trim());
      try { rec.start(); } catch { listo(''); }
    });
  }

  /* ── OÍR DE CONTINUO, Y PODER CORTAR ──────────────────────────────────────
   *
   * `escuchar` de arriba sirve para dictar UNA frase: se abre, la persona
   * habla, se cierra y devuelve lo dicho. La palabra que despierta necesita
   * otra cosa — quedarse abierta indefinidamente, avisar de cada trozo aunque
   * no haya terminado, y poder cortarse en seco desde fuera cuando la palabra
   * suena. Meter eso en la de arriba habría cambiado la que ya usa el panel,
   * así que va aparte.
   *
   * Devuelve un mando con `abort()`. Quien lo enciende es responsable de
   * apagarlo: un micrófono abierto que nadie cierra es exactamente lo que
   * nadie quiere en su casa.
   */
  function oir({ idioma = 'es-HN', continuo = true, alOir, alFin, alFallo } = {}) {
    const R = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!R) { alFallo?.('sin-reconocimiento'); return { abort() {} }; }
    const rec = new R();
    rec.lang = idioma; rec.interimResults = true; rec.continuous = continuo;
    let muerto = false;
    rec.onresult = (ev) => {
      let final = '', inter = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const r = ev.results[i];
        if (r.isFinal) final += r[0].transcript; else inter += r[0].transcript;
      }
      const dicho = (final + ' ' + inter).trim();
      if (dicho) alOir?.(dicho, !!final);
    };
    rec.onerror = (e) => { if (!muerto) alFallo?.(String(e?.error || 'error')); };
    rec.onend = () => { if (!muerto) alFin?.(); };
    try { rec.start(); } catch (e) { alFallo?.(String(e?.name || e)); }
    return { abort() { muerto = true; try { rec.abort(); } catch { /* ya estaba */ } } };
  }

  return { Locutor, escuchar, oir, hayOido, paraDecir, partirFrases, esIOS };
})();
