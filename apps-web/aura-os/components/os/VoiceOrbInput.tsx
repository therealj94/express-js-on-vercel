'use client';
// EL ARCO DE VOZ, y el cerebro del OS del lado del navegador.
//
// Abajo, un arco luminoso: se escribe en el centro, o se toca el orbe para
// hablar. No es una barra de chat: es una línea de luz bajo la figura.
//
// Aquí también vive `os`, el que orquesta un turno: manda a /pensar, reparte
// el texto que va llegando a la burbuja Y al locutor (que lo dice frase por
// frase mientras el modelo sigue escribiendo), pone el modo del ser en cada
// paso, y si se está conversando vuelve a escuchar al terminar de hablar.
import { useEffect, useRef, useState } from 'react';
import { api, pensar } from '@/lib/api';
import { useOs } from '@/lib/os-store';
import { escuchar, hayOido, Locutor } from '@/lib/voz';

const PRIMERA_LINEA = 'Hola, soy Aura. Tu asistente de Orden Global. Dime.';

/* ── el orquestador ─────────────────────────────────────────────────────── */
let locutor: Locutor | null = null;
let vaciasSeguidas = 0;
let audioPermitido = false;
let saludoDicho = false;
let saludoPendiente: string[] = [];

function elLocutor(): Locutor {
  if (locutor) return locutor;
  const S = useOs.getState;
  locutor = new Locutor({
    conElevenLabs: !!S().yo?.voz,
    alNivel: (v) => S().setVoiceLevel(v),
    alEmpezar: () => { if (S().mode !== 'think') S().setMode('speak'); else S().setMode('speak'); },
    alTerminar: () => {
      const s = S();
      if (s.mode === 'speak') s.setMode('idle');
      if (s.conversando) setTimeout(() => { if (useOs.getState().conversando) void os.escucharUnaVez(); }, 350);
    },
  });
  return locutor;
}

export const os = {
  /** Se llama una vez: sesión, datos vivos, saludo. */
  async iniciar() {
    const S = useOs.getState;
    try { S().setYo(await api.yo()); S().setNecesitaEntrar(false); }
    catch (e) { if ((e as { status?: number }).status === 401) { S().setNecesitaEntrar(true); return; } S().avisar('No pude hablar con el servidor.'); return; }
    await os.refrescar();
    setInterval(() => { void os.refrescar(); }, 30_000);
    // el boot dura 2,8 s: la primera línea llega cuando los ojos ya se encendieron
    setTimeout(() => {
      S().setBootComplete();
      S().auraReply(PRIMERA_LINEA);
      saludoPendiente.push(PRIMERA_LINEA);
      void api.saludo().then((sal) => { S().auraReply(sal.texto); saludoPendiente.push(sal.texto); os.decirSaludoSiSePuede(); }).catch(() => {});
      os.decirSaludoSiSePuede();
    }, 2800);
  },
  async refrescar() {
    const S = useOs.getState;
    const [v, p] = await Promise.allSettled([api.vivo(), api.pendientes()]);
    if (v.status === 'fulfilled') S().setVivo(v.value);
    if (p.status === 'fulfilled') S().setPendientes(p.value);
  },
  /** El navegador no deja sonar nada sin un toque: al primero, se dice el saludo. */
  permitirAudio() {
    if (audioPermitido) return; audioPermitido = true; os.decirSaludoSiSePuede();
  },
  decirSaludoSiSePuede() {
    if (!audioPermitido || saludoDicho || !saludoPendiente.length) return;
    saludoDicho = true;
    const L = elLocutor(); for (const f of saludoPendiente) L.decir(f); saludoPendiente = [];
  },
  /** Un turno entero: texto → pensar → burbuja viva → voz frase por frase. */
  async enviar(texto: string, modo: 'voz' | 'texto') {
    const S = useOs.getState; const s = S();
    const t = texto.trim(); if (!t || s.mode === 'think') return;
    os.permitirAudio();
    const L = elLocutor(); L.callar();
    s.sendUser(t);
    const burbuja = s.auraReply('', { vivo: true });
    let acumulado = ''; const herr: string[] = []; let hablado = false;
    await pensar(t, { modo, conversacionId: S().conversacionId, alias: 'Aura' }, {
      onInicio: (id) => S().setConversacionId(id),
      onTexto: (trozo) => {
        acumulado += trozo; S().patchAura(burbuja.id, acumulado, true, herr);
        if (modo === 'voz' || S().conversando) { L.alimentar(trozo); hablado = true; }
      },
      onReemplazo: (texto2) => { acumulado = texto2; S().patchAura(burbuja.id, acumulado, true, herr); },
      onHerramienta: (n) => { herr.push(n); S().patchAura(burbuja.id, acumulado, true, herr); },
      onFin: (r) => {
        const final = r.texto || acumulado; S().patchAura(burbuja.id, final, false, herr);
        if (hablado) L.cerrar(); else if (S().mode === 'think') S().setMode('idle');
        if (r.herramientas?.some((h) => /pendiente|recordar/.test(h.nombre))) void os.refrescar();
        for (const a of r.acciones || []) if (a.tipo === 'abrir' && a.url) S().auraReply(`Te dejé ${a.nombre} a un toque: ${a.url}`);
      },
      onError: (mensaje, codigo) => {
        S().patchAura(burbuja.id, mensaje, false);
        if (S().mode === 'think') S().setMode('idle');
        if (codigo === 'SIN_SESION') S().setNecesitaEntrar(true);
      },
    });
  },
  /** Escuchar una vez y mandar lo dicho. */
  async escucharUnaVez(alParcial?: (t: string) => void): Promise<void> {
    const S = useOs.getState;
    if (!hayOido()) { S().avisar('Este navegador no escucha. Escribime, y te contesto con voz.'); return; }
    os.permitirAudio(); elLocutor().callar();
    S().setEscuchando(true);
    const dicho = await escuchar({ alParcial });
    S().setEscuchando(false);
    if (dicho) { vaciasSeguidas = 0; await os.enviar(dicho, 'voz'); return; }
    if (S().conversando) {
      vaciasSeguidas++;
      if (vaciasSeguidas >= 3) { os.conversar(false); S().avisar('Acá estoy cuando quieras.'); }
      else setTimeout(() => { if (useOs.getState().conversando) void os.escucharUnaVez(alParcial); }, 400);
    }
  },
  conversar(encender: boolean) {
    const S = useOs.getState;
    S().setConversando(encender); vaciasSeguidas = 0;
    if (encender) void os.escucharUnaVez(); else elLocutor().callar();
  },
  callar() { elLocutor().callar(); const s = useOs.getState(); if (s.mode === 'speak') s.setMode('idle'); },
};

/* ── el arco ────────────────────────────────────────────────────────────── */
export default function VoiceOrbInput() {
  const [texto, setTexto] = useState('');
  const escuchando = useOs((s) => s.escuchando);
  const conversando = useOs((s) => s.conversando);
  const mode = useOs((s) => s.mode);
  const bootComplete = useOs((s) => s.bootComplete);
  const necesitaEntrar = useOs((s) => s.necesitaEntrar);
  const input = useRef<HTMLInputElement>(null);
  const pulsando = useRef<number | null>(null);

  useEffect(() => {
    const permitir = () => os.permitirAudio();
    window.addEventListener('pointerdown', permitir, { once: true });
    window.addEventListener('keydown', permitir, { once: true });
    return () => { window.removeEventListener('pointerdown', permitir); window.removeEventListener('keydown', permitir); };
  }, []);

  const mandar = () => { const t = texto.trim(); if (!t) return; setTexto(''); void os.enviar(t, 'texto'); };
  // el orbe: un toque escucha una vez; mantenerlo apretado enciende la conversación
  const bajar = () => { pulsando.current = window.setTimeout(() => { pulsando.current = null; os.conversar(!useOs.getState().conversando); }, 550); };
  const soltar = () => {
    if (pulsando.current) { clearTimeout(pulsando.current); pulsando.current = null;
      if (useOs.getState().conversando) os.conversar(false); else if (mode === 'speak') os.callar(); else void os.escucharUnaVez((t) => setTexto(t)); }
  };
  if (!bootComplete || necesitaEntrar) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 flex flex-col items-center pb-[max(18px,env(safe-area-inset-bottom))] pointer-events-none">
      <div className="relative w-[min(92vw,640px)] pointer-events-auto">
        <input
          ref={input} value={texto} onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); mandar(); } }}
          placeholder={escuchando ? 'Te escucho…' : conversando ? 'Conversando · toca el orbe para parar' : 'Háblame…'}
          className="arco-input w-full py-3 pr-14 text-[15px] font-sans"
          aria-label="Háblame"
        />
        <div className="arco w-full" />
        {/* el orbe de voz, al final del arco */}
        <button
          onPointerDown={bajar} onPointerUp={soltar} onPointerLeave={() => { if (pulsando.current) { clearTimeout(pulsando.current); pulsando.current = null; } }}
          className={`absolute right-0 -top-1 w-11 h-11 rounded-full grid place-items-center transition-shadow ${escuchando || conversando ? 'shadow-[0_0_28px_rgba(93,214,255,.75)]' : 'shadow-[0_0_14px_rgba(93,214,255,.35)]'}`}
          style={{ background: 'radial-gradient(circle at 40% 35%, rgba(234,242,255,.95), rgba(93,214,255,.85) 40%, rgba(27,107,255,.5) 75%, rgba(27,107,255,0) 100%)' }}
          title="Toca para hablar · mantené apretado para conversar" aria-label="Hablar">
          <span className={`block w-2 h-2 rounded-full bg-abismo ${escuchando ? 'late' : ''}`} />
        </button>
      </div>
      <div className="mt-2 font-mono text-[9.5px] tracking-hud text-bruma/60 select-none">
        {escuchando ? 'ESCUCHANDO' : conversando ? 'CONVERSANDO' : mode === 'speak' ? 'HABLANDO · toca el orbe para callar' : mode === 'think' ? 'PENSANDO' : 'TOCA EL ORBE · MANTENÉ PARA CONVERSAR'}
      </div>
    </div>
  );
}
