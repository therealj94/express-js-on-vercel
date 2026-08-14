// El nombre del asistente: tuyo. Se guarda en el teléfono y lo usan el
// flotante, el hub y la voz.
//
// Por defecto se llama NEXUS. El valor por defecto SOLO manda cuando no hay
// nada guardado: si la persona ya le puso nombre --incluido el viejo GENESIS
// escrito a mano--, ese nombre se respeta. Renombrar de oficio lo guardado
// sería pisarle una decisión suya.
import * as SecureStore from 'expo-secure-store';

export const NOMBRE_POR_DEFECTO = 'NEXUS';
let nombre = NOMBRE_POR_DEFECTO;

// ── quién quiere enterarse ────────────────────────────────────────────────
// El flotante pinta la inicial y el hub el nombre completo; sin aviso, un
// cambio de nombre no se vería hasta el siguiente render por casualidad.
// Con esto la carga desde SecureStore y el renombrado se notan al instante.
const oyentes = new Set();
const avisar = () => { oyentes.forEach((f) => { try { f(nombre); } catch (e) {} }); };

export const nombreAsistente = () => nombre;

export function suscribirNombre(fn) {
  oyentes.add(fn);
  return () => { oyentes.delete(fn); };
}

export async function cargarNombre() {
  const g = await SecureStore.getItemAsync('og.asistente').catch(() => null);
  // solo un valor con letra cuenta: una cadena vacía guardada por error no
  // puede dejar al asistente sin nombre (la inicial se pinta en pantalla)
  if (g && String(g).trim()) { nombre = String(g).trim(); avisar(); }
  return nombre;
}

export async function ponerNombre(x) {
  nombre = String(x || '').trim().slice(0, 16) || nombre;
  await SecureStore.setItemAsync('og.asistente', nombre).catch(() => {});
  avisar();
  return nombre;
}
