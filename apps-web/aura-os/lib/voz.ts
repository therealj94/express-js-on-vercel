// LA VOZ DE AURA, del lado del navegador: hablar frase por frase mientras el
// modelo sigue escribiendo, y escuchar.
//
// ── POR QUÉ FRASE POR FRASE ─────────────────────────────────────────────────
//
// La versión anterior esperaba la respuesta ENTERA para pedir el audio: con
// una respuesta de 25 segundos de modelo, la primera palabra dicha llegaba a
// los 28. Aquí el texto que va llegando se corta en frases; cada frase se
// manda a /voz (con el modelo rápido de ElevenLabs) en cuanto está completa, y
// los audios se encolan y suenan uno detrás de otro. La primera frase suena a
// los dos o tres segundos, mientras las siguientes todavía se piensan.
//
// La envolvente del audio (un AnalyserNode) alimenta `voiceLevel`, que es lo
// que mueve el pecho y los filamentos. Sin ElevenLabs cae a la voz del
// navegador con una envolvente fingida que respira: peor voz, misma vida.
import { voz as pedirVoz } from './api';

export function paraDecir(md: string): string {
  return md.replace(/```[\s\S]*?```/g, ' ').replace(/https?:\/\/\S+/g, ' ').replace(/[#*_>`|]/g, '').replace(/\[(.*?)\]\(.*?\)/g, '$1').replace(/_\(.*?\)_/g, '').replace(/\s+/g, ' ').trim();
}

/** Corta el texto en frases completas; devuelve las frases y lo que sobra. */
export function partirFrases(texto: string): { frases: string[]; resto: string } {
  const frases: string[] = [];
  let resto = texto;
  const re = /^([\s\S]*?[.!?…](?:["»)\]]?)(?=\s|$))/;
  for (;;) {
    const m = re.exec(resto);
    if (!m) break;
    const f = m[1].trim();
    // Una frase de tres letras («ok.») no vale un viaje al servidor: se junta
    // con la siguiente.
    if (f.length < 12 && frases.length) { frases[frases.length - 1] += ' ' + f; } else if (f) frases.push(f);
    resto = resto.slice(m[0].length);
  }
  return { frases, resto };
}

type Nivel = (v: number) => void;

export class Locutor {
  private cola: Promise<Blob | null>[] = [];
  private sonando = false;
  private audio: HTMLAudioElement | null = null;
  private ctx: AudioContext | null = null;
  private analizador: AnalyserNode | null = null;
  private generacion = 0;
  private resto = '';
  private alNivel: Nivel;
  private alTerminar: () => void;
  private alEmpezar: () => void;
  private conElevenLabs: boolean;
  private respirando: number | null = null;

  constructor({ alNivel, alEmpezar, alTerminar, conElevenLabs }: { alNivel: Nivel; alEmpezar: () => void; alTerminar: () => void; conElevenLabs: boolean }) {
    this.alNivel = alNivel; this.alEmpezar = alEmpezar; this.alTerminar = alTerminar; this.conElevenLabs = conElevenLabs;
  }

  /** Texto que va llegando del modelo (markdown). Se dice lo que ya es frase. */
  alimentar(trozo: string) {
    this.resto += trozo;
    const { frases, resto } = partirFrases(this.resto);
    this.resto = resto;
    for (const f of frases) this.decir(f);
  }
  /** El modelo terminó: lo que quedó sin punto también se dice. */
  cerrar() {
    const ultimo = this.resto.trim(); this.resto = '';
    if (ultimo) this.decir(ultimo);
    if (!this.sonando && !this.cola.length) this.alTerminar();
  }
  /** Una frase suelta, fuera del stream (el saludo). */
  decir(frase: string) {
    const limpio = paraDecir(frase); if (!limpio) return;
    const gen = this.generacion;
    if (this.conElevenLabs) {
      // Se pide YA y se encola la promesa: el audio se fabrica mientras suena
      // la frase anterior.
      this.cola.push(pedirVoz(limpio, true).catch(() => null));
    } else {
      this.cola.push(Promise.resolve(new Blob([limpio], { type: 'text/plain' })));
    }
    if (!this.sonando) void this.seguir(gen);
  }
  /** Callarse ahora: interrupción de la persona. */
  callar() {
    this.generacion++; this.cola = []; this.resto = '';
    if (this.audio) { this.audio.pause(); this.audio.src = ''; this.audio = null; }
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
    if (this.respirando) { clearInterval(this.respirando); this.respirando = null; }
    this.sonando = false; this.alNivel(0);
  }
  get ocupado() { return this.sonando || this.cola.length > 0; }

  private async seguir(gen: number) {
    this.sonando = true; this.alEmpezar();
    while (this.cola.length && gen === this.generacion) {
      const blob = await this.cola.shift()!;
      if (gen !== this.generacion) break;
      if (!blob) continue;
      if (blob.type === 'text/plain') await this.decirConNavegador(await blob.text(), gen);
      else await this.sonar(blob, gen);
    }
    if (gen === this.generacion) { this.sonando = false; this.alNivel(0); this.alTerminar(); }
  }

  private sonar(blob: Blob, gen: number) {
    return new Promise<void>((listo) => {
      const url = URL.createObjectURL(blob);
      const a = new Audio(url); this.audio = a;
      try {
        this.ctx = this.ctx || new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
        const src = this.ctx.createMediaElementSource(a);
        this.analizador = this.ctx.createAnalyser(); this.analizador.fftSize = 256;
        src.connect(this.analizador); this.analizador.connect(this.ctx.destination);
        const datos = new Uint8Array(this.analizador.frequencyBinCount);
        const medir = () => {
          if (a.paused || a.ended || gen !== this.generacion) return;
          this.analizador!.getByteFrequencyData(datos);
          let s = 0; for (let i = 0; i < 40; i++) s += datos[i];
          this.alNivel(Math.min(1, s / 40 / 150));
          requestAnimationFrame(medir);
        };
        a.addEventListener('play', () => requestAnimationFrame(medir), { once: true });
      } catch { /* sin AudioContext: suena igual, sin envolvente */ }
      const fin = () => { URL.revokeObjectURL(url); this.alNivel(0); listo(); };
      a.onended = fin; a.onerror = fin;
      a.play().catch(fin);
    });
  }

  private decirConNavegador(texto: string, gen: number) {
    return new Promise<void>((listo) => {
      if (typeof speechSynthesis === 'undefined') return listo();
      const u = new SpeechSynthesisUtterance(texto); u.lang = 'es-HN'; u.rate = 1.02;
      const voces = speechSynthesis.getVoices();
      u.voice = voces.find((v) => /es-(HN|MX|US|419)/i.test(v.lang)) || voces.find((v) => /^es/i.test(v.lang)) || null;
      this.respirando = window.setInterval(() => { if (gen === this.generacion) this.alNivel(0.35 + 0.3 * Math.abs(Math.sin(performance.now() / 160))); }, 60);
      const fin = () => { if (this.respirando) { clearInterval(this.respirando); this.respirando = null; } this.alNivel(0); listo(); };
      u.onend = fin; u.onerror = fin; speechSynthesis.speak(u);
    });
  }
}

// ── Escuchar ────────────────────────────────────────────────────────────────

type Reconocedor = { lang: string; interimResults: boolean; continuous: boolean; start: () => void; stop: () => void;
  onstart: (() => void) | null; onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null };

export function hayOido(): boolean {
  const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
  return !!(w.SpeechRecognition || w.webkitSpeechRecognition);
}

/** Escucha una vez. Resuelve con lo dicho (vacío si no se oyó nada). */
export function escuchar({ alParcial, alEmpezar }: { alParcial?: (t: string) => void; alEmpezar?: () => void } = {}): Promise<string> {
  return new Promise((listo) => {
    const w = window as unknown as { SpeechRecognition?: new () => Reconocedor; webkitSpeechRecognition?: new () => Reconocedor };
    const R = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!R) return listo('');
    const rec = new R(); rec.lang = 'es-HN'; rec.interimResults = true; rec.continuous = false;
    let final = '';
    rec.onstart = () => alEmpezar?.();
    rec.onresult = (ev) => {
      let inter = '';
      for (let i = 0; i < ev.results.length; i++) { const r = ev.results[i]; if (r.isFinal) final += r[0].transcript; else inter += r[0].transcript; }
      alParcial?.((final + ' ' + inter).trim());
    };
    rec.onerror = () => listo(final.trim());
    rec.onend = () => listo(final.trim());
    try { rec.start(); } catch { listo(''); }
  });
}
