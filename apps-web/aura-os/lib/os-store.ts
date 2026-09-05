// EL ESTADO DEL OS. Un solo lugar, sin ceremonia: qué está haciendo Aura, qué
// módulo está enfocado, la conversación, la voz.
//
// `mode` es lo que la figura ACTÚA: boot, idle, listen, think, speak, focus.
// No es un estado de UI, es el estado del ser: cambiar el modo cambia la cara.
import { create } from 'zustand';
import type { EstadoVivo, Pendiente, VozCatalogo, Yo } from './api';

export type Mode = 'boot' | 'idle' | 'listen' | 'think' | 'speak' | 'focus';
export type ModuleId = 'gold' | 'wallet' | 'ordenex' | 'chain' | 'aucorp' | 'genesis' | 'pendientes';

export interface Mensaje {
  id: string;
  de: 'yo' | 'aura';
  texto: string;
  en: number;
  vivo?: boolean;            // todavía se está escribiendo
  herramientas?: string[];
}

export interface OsState {
  mode: Mode;
  activeModule: ModuleId | null;
  messages: Mensaje[];
  voiceLevel: number;        // 0..1, la envolvente de la voz de Aura
  bootComplete: boolean;
  yo: Yo | null;
  necesitaEntrar: boolean;
  vivo: EstadoVivo | null;
  pendientes: Pendiente[];
  conversacionId: string | null;
  escuchando: boolean;
  conversando: boolean;      // escucha → contesta → vuelve a escuchar
  lod: 0 | 1 | 2;            // 0 pleno · 1 menos partículas · 2 mínimo
  sinWebGL: boolean;
  aviso: string | null;
  silencio: boolean;         // la persona apagó la voz
  vozId: string | null;      // la voz elegida (id de ElevenLabs); null = la de la casa
  voces: VozCatalogo[];

  boot: () => void;
  setBootComplete: () => void;
  setMode: (m: Mode) => void;
  focusModule: (id: ModuleId) => void;
  clearFocus: () => void;
  sendUser: (texto: string) => Mensaje;
  auraReply: (texto: string, opciones?: { vivo?: boolean; herramientas?: string[]; id?: string }) => Mensaje;
  patchAura: (id: string, texto: string, vivo: boolean, herramientas?: string[]) => void;
  setVoiceLevel: (v: number) => void;
  setYo: (m: Yo | null) => void;
  setNecesitaEntrar: (b: boolean) => void;
  setVivo: (v: EstadoVivo | null) => void;
  setPendientes: (p: Pendiente[]) => void;
  setConversacionId: (id: string | null) => void;
  setEscuchando: (b: boolean) => void;
  setConversando: (b: boolean) => void;
  setLod: (l: 0 | 1 | 2) => void;
  setSinWebGL: (b: boolean) => void;
  avisar: (t: string | null) => void;
  setSilencio: (b: boolean) => void;
  setVozId: (id: string | null) => void;
  setVoces: (v: VozCatalogo[]) => void;
}

let contador = 0;
const idNuevo = () => `m${Date.now().toString(36)}${(contador++).toString(36)}`;

export const useOs = create<OsState>((set, get) => ({
  mode: 'boot',
  activeModule: null,
  messages: [],
  voiceLevel: 0,
  bootComplete: false,
  yo: null,
  necesitaEntrar: false,
  vivo: null,
  pendientes: [],
  conversacionId: null,
  escuchando: false,
  conversando: false,
  lod: 0,
  sinWebGL: false,
  aviso: null,
  silencio: leerLocal('aura.silencio') === '1',
  vozId: leerLocal('aura.voz'),
  voces: [],

  boot: () => set({ mode: 'boot', bootComplete: false }),
  setBootComplete: () => set({ bootComplete: true, mode: 'idle' }),
  setMode: (mode) => set({ mode }),
  focusModule: (id) => set({ activeModule: id, mode: 'focus' }),
  clearFocus: () => set((s) => ({ activeModule: null, mode: s.mode === 'focus' ? 'idle' : s.mode })),
  sendUser: (texto) => {
    const m: Mensaje = { id: idNuevo(), de: 'yo', texto, en: Date.now() };
    set((s) => ({ messages: [...s.messages, m], mode: 'think' }));
    return m;
  },
  auraReply: (texto, opciones = {}) => {
    const m: Mensaje = { id: opciones.id || idNuevo(), de: 'aura', texto, en: Date.now(), vivo: opciones.vivo, herramientas: opciones.herramientas };
    set((s) => ({ messages: [...s.messages, m] }));
    return m;
  },
  patchAura: (id, texto, vivo, herramientas) =>
    set((s) => ({ messages: s.messages.map((m) => (m.id === id ? { ...m, texto, vivo, herramientas: herramientas ?? m.herramientas } : m)) })),
  setVoiceLevel: (voiceLevel) => { if (Math.abs(get().voiceLevel - voiceLevel) > 0.02) set({ voiceLevel }); },
  setYo: (yo) => set({ yo }),
  setNecesitaEntrar: (necesitaEntrar) => set({ necesitaEntrar }),
  setVivo: (vivo) => set({ vivo }),
  setPendientes: (pendientes) => set({ pendientes }),
  setConversacionId: (conversacionId) => set({ conversacionId }),
  setEscuchando: (escuchando) => set((s) => ({ escuchando, mode: escuchando ? 'listen' : s.mode === 'listen' ? 'idle' : s.mode })),
  setConversando: (conversando) => set({ conversando }),
  setLod: (lod) => set({ lod }),
  setSinWebGL: (sinWebGL) => set({ sinWebGL }),
  avisar: (aviso) => set({ aviso }),
  setSilencio: (silencio) => { guardarLocal('aura.silencio', silencio ? '1' : '0'); set({ silencio }); },
  setVozId: (vozId) => { guardarLocal('aura.voz', vozId || ''); set({ vozId }); },
  setVoces: (voces) => set({ voces }),
}));

// La voz elegida y el silencio se recuerdan en este navegador. Puede no haber
// almacenamiento (ventana privada, captura): se sigue igual, sin recordar.
function leerLocal(k: string): string | null { try { return typeof localStorage !== 'undefined' ? localStorage.getItem(k) || null : null; } catch { return null; } }
function guardarLocal(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } }

/** Los tres últimos visibles; los demás ya se hicieron partículas. */
export const visibles = (messages: Mensaje[]) => messages.slice(-3);
