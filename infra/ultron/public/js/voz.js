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

  class Locutor {
    constructor({ conElevenLabs, alNivel, alEmpezar, alTerminar }) {
      Object.assign(this, { conElevenLabs, alNivel, alEmpezar, alTerminar });
      this.cola = []; this.sonando = false; this.generacion = 0; this.resto = ''; this.ctx = null; this.audio = null; this.vozId = null;
    }
    despertar() {
      try {
        this.ctx = this.ctx || new (window.AudioContext || window.webkitAudioContext)();
        if (this.ctx.state === 'suspended') this.ctx.resume();
      } catch { /* sin AudioContext: suena por <audio> igual */ }
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
      this.cola.push(this.conElevenLabs ? DATOS.voz(limpio, { rapido: true, vozId: this.vozId }).catch(() => null) : Promise.resolve(new Blob([limpio], { type: 'text/plain' })));
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
        const blob = await this.cola.shift();
        if (gen !== this.generacion) break;
        if (!blob) continue;
        if (blob.type === 'text/plain') await this.conNavegador(await blob.text(), gen); else await this.sonar(blob, gen);
      }
      if (gen === this.generacion) { this.sonando = false; this.alNivel?.(0); this.alTerminar?.(); }
    }
    sonar(blob, gen) {
      return new Promise((listo) => {
        const url = URL.createObjectURL(blob); const a = new Audio(url); this.audio = a;
        try {
          this.despertar();
          if (this.ctx && this.ctx.state === 'running') {
            const src = this.ctx.createMediaElementSource(a); const an = this.ctx.createAnalyser(); an.fftSize = 256;
            src.connect(an); an.connect(this.ctx.destination);
            const datos = new Uint8Array(an.frequencyBinCount);
            const medir = () => { if (a.paused || a.ended || gen !== this.generacion) return; an.getByteFrequencyData(datos); let s = 0; for (let i = 0; i < 40; i++) s += datos[i]; this.alNivel?.(Math.min(1, s / 40 / 150)); requestAnimationFrame(medir); };
            a.addEventListener('play', () => requestAnimationFrame(medir), { once: true });
          }
        } catch { /* sin envolvente */ }
        const fin = () => { URL.revokeObjectURL(url); this.alNivel?.(0); listo(); };
        a.onended = fin; a.onerror = fin; a.play().catch(fin);
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
