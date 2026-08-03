// utils/busy.ts
import { useStore } from '@/store/useStore';

/**
 * Ejecuta `action` mostrando el indicador de carga global (pelota) y bloqueando
 * taps duplicados mientras dura. Si ya hay una acción en curso, ignora el nuevo tap.
 */
export function runBusy(action: () => void, ms = 550) {
  const { busy, setBusy } = useStore.getState();
  if (busy) return;
  setBusy(true);
  setTimeout(() => {
    // try/finally: si `action` lanza una excepción, el estado busy IGUAL se
    // libera. Antes quedaba trabado en true y la capa que absorbe taps dejaba
    // TODA la app sin poder tocarse (la pantalla "no respondía").
    try { action(); } finally { setBusy(false); }
  }, ms);
}

/**
 * Variante para acciones asíncronas (llamadas de red como login/registro en
 * la nube): mantiene el bloqueo de doble tap mientras `action` está en vuelo,
 * sin importar cuánto tarde, y siempre libera el estado busy al terminar.
 */
export async function runBusyAsync(action: () => Promise<void>) {
  const { busy, setBusy } = useStore.getState();
  if (busy) return;
  setBusy(true);
  try {
    await action();
  } finally {
    setBusy(false);
  }
}
