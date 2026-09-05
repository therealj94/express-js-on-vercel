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

  /** Un WAV de un frame en silencio: la llave del permiso de audio. */
  function wavMudo() {
    const b = new ArrayBuffer(44), v = new DataView(b);
    const txt = (o, t) => { for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); };
    txt(0, 'RIFF'); v.setUint32(4, 36, true); txt(8, 'WAVEfmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, 8000, true); v.setUint32(28, 8000, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true);
    txt(36, 'data'); v.setUint32(40, 0, true);
    return new Blob([b], { type: 'audio/wav' });
  }

  class Locutor {
    static avisado = false;   // el aviso de «no pude usar la voz» se da una vez
    constructor({ conElevenLabs, alNivel, alEmpezar, alTerminar, alFallo }) {
      Object.assign(this, { conElevenLabs, alNivel, alEmpezar, alTerminar, alFallo });
      this.cola = []; this.sonando = false; this.generacion = 0; this.resto = ''; this.ctx = null; this.audio = null; this.vozId = null;
      // Un desbloqueo silencioso: un audio de un instante, dentro del gesto,
      // que deja al navegador con el permiso dado para los que vengan después.
      this.desbloqueado = false;
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
        const a = new Audio(URL.createObjectURL(wavMudo()));
        a.volume = 0;
        const p = a.play();
        if (p && p.then) p.then(() => { this.desbloqueado = true; }).catch(() => {});
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
      if (this.audio) { this.audio.pause(); this.audio.src = ''; this.audio = null; }
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
        const url = URL.createObjectURL(blob); const a = new Audio(url); this.audio = a;
        a.preload = 'auto';
        let envolvente = null;
        const soltar = () => { clearInterval(envolvente); URL.revokeObjectURL(url); this.alNivel?.(0); };
        const fin = () => { soltar(); listo(); };
        a.onended = fin;
        a.onerror = () => { soltar(); this.conNavegador(texto, gen).then(listo); };
        a.onplaying = () => {
          // La envolvente: un habla tiene sílabas, no una línea recta.
          envolvente = setInterval(() => {
            if (gen !== this.generacion || a.paused || a.ended) return;
            const t = performance.now() / 1000;
            this.alNivel?.(Math.min(1, 0.35 + 0.3 * Math.abs(Math.sin(t * 7.3)) + 0.2 * Math.abs(Math.sin(t * 3.1))));
          }, 55);
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
        const voces = speechSynthesis.getVoices();
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

  return { Locutor, escuchar, hayOido, paraDecir, partirFrases };
})();
