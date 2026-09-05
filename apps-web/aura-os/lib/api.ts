// EL API DE ULTRON, desde el OS. Mismo origen: la cookie de sesión viaja sola.
//
// Todo lo que el OS enseña sale de aquí y es REAL: el estado vivo de las
// casas, los pendientes de la junta, el saludo por nombre, y el pensar en
// streaming. No hay un solo número inventado en este archivo, y no puede
// haberlo: un OS que enseña datos de mentira al lado de datos de verdad
// enseña a no creerle a ninguno.

export interface Miembro { nombre: string; correo: string; rol?: string; whatsapp?: string | null }
export interface Casa { nombre: string; vivo: boolean; http?: number | null }
export interface EstadoVivo {
  leidoEn: string;
  origen: { origenUsd: number; oroOnzaUsd?: number; fuente?: string } | null;
  ordenex: Casa & { bloque5550?: number | null; compraUsdt?: 'abierta' | 'cerrada' | null; mercados?: { mercado: string }[] };
  aucorp: Casa & { tasas?: boolean; tasasCuando?: string | null; monedas?: unknown[] };
  wallet: Casa;
  genesis: Casa;
  ordenscan: Casa & { bloque8532?: number | null };
}
export interface Pendiente { _id: string; texto: string; estado: 'abierto' | 'hecho'; quien?: string | null; tema?: string | null; en: string }
export interface Yo { miembro: Miembro; junta: { nombre: string; correo: string; rol?: string; whatsapp: boolean }[]; cerebro: boolean; modelo: string; donde: 'nodo' | 'claude'; voz: boolean; memoria: string; saber?: { total: number } }
export interface Saludo { texto: string; nombre: string; hora: number; pendientes: number }

async function pedir<T>(ruta: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(ruta, { credentials: 'same-origin', headers: { 'Content-Type': 'application/json', ...(init.headers || {}) }, ...init });
  if (r.status === 401) throw Object.assign(new Error('Sin sesión.'), { codigo: 'SIN_SESION', status: 401 });
  if (!r.ok) { const d = await r.json().catch(() => ({})); throw Object.assign(new Error(d.error || `El servidor contestó ${r.status}.`), { codigo: d.codigo || 'ERROR', status: r.status }); }
  return r.json() as Promise<T>;
}

export const api = {
  yo: () => pedir<Yo>('/yo'),
  entrar: (correo: string, clave: string) => pedir<{ miembro: Miembro }>('/entrar', { method: 'POST', body: JSON.stringify({ correo, clave }) }),
  saludo: () => pedir<Saludo>('/saludo'),
  vivo: () => pedir<EstadoVivo>('/vivo'),
  pendientes: () => pedir<Pendiente[]>('/pendientes'),
  salir: () => pedir<{ ok: true }>('/salir', { method: 'POST' }),
};

export interface PensarEventos {
  onInicio?: (conversacionId: string) => void;
  onTexto?: (trozo: string) => void;
  onReemplazo?: (texto: string) => void;
  onHerramienta?: (nombre: string) => void;
  onFin?: (r: { texto?: string; acciones?: { tipo: string; nombre: string; url: string }[]; herramientas?: { nombre: string }[]; conversacionId?: string }) => void;
  onError?: (mensaje: string, codigo: string) => void;
}

/**
 * Pensar, en vivo. El servidor manda Server-Sent Events; aquí se leen del
 * stream y se reparten. `modo: 'voz'` pide respuestas cortas para escuchar.
 */
export async function pensar(texto: string, { modo, conversacionId, alias }: { modo: 'voz' | 'texto'; conversacionId: string | null; alias?: string }, ev: PensarEventos): Promise<void> {
  const r = await fetch('/pensar', {
    method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ texto, modo, conversacionId, alias }),
  });
  if (!r.ok || !r.body) {
    const d = await r.json().catch(() => ({}));
    ev.onError?.(d.error || `El servidor contestó ${r.status}.`, d.codigo || (r.status === 401 ? 'SIN_SESION' : 'ERROR'));
    return;
  }
  const lector = r.body.getReader(); const dec = new TextDecoder(); let buf = '';
  for (;;) {
    const { value, done } = await lector.read(); if (done) break;
    buf += dec.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const bloque = buf.slice(0, i); buf = buf.slice(i + 2);
      const evento = /^event: (.+)$/m.exec(bloque)?.[1]; const datos = /^data: (.+)$/m.exec(bloque)?.[1];
      if (!evento || !datos) continue;
      let d: Record<string, unknown>; try { d = JSON.parse(datos); } catch { continue; }
      switch (evento) {
        case 'inicio': ev.onInicio?.(String(d.conversacionId)); break;
        case 'texto': ev.onTexto?.(String(d.t ?? '')); break;
        case 'reemplazo': ev.onReemplazo?.(String(d.texto ?? '')); break;
        case 'herramienta': ev.onHerramienta?.(String(d.nombre ?? '')); break;
        case 'fin': ev.onFin?.(d as Parameters<NonNullable<PensarEventos['onFin']>>[0]); break;
        case 'error': ev.onError?.(String(d.mensaje ?? 'No pude contestar.'), String(d.codigo ?? 'ERROR')); break;
      }
    }
  }
}

/** El audio de una frase, con la voz rápida para conversar. */
export async function voz(texto: string, rapido = true): Promise<Blob | null> {
  const r = await fetch('/voz', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ texto, rapido }) });
  if (!r.ok) return null;
  return r.blob();
}
