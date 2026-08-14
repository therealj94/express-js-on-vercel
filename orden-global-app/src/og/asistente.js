// El nombre del asistente: tuyo. Se guarda en el teléfono y lo usan la barra,
// el hub y la voz.
import * as SecureStore from 'expo-secure-store';
let nombre = 'GENESIS';
export const nombreAsistente = () => nombre;
export async function cargarNombre() {
  const g = await SecureStore.getItemAsync('og.asistente').catch(() => null);
  if (g) nombre = g;
  return nombre;
}
export async function ponerNombre(x) {
  nombre = String(x || '').trim().slice(0, 16) || nombre;
  await SecureStore.setItemAsync('og.asistente', nombre).catch(() => {});
  return nombre;
}
