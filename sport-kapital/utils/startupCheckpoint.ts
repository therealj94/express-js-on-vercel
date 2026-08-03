// utils/startupCheckpoint.ts
// Diagnóstico + auto-aislamiento de arranque (versión Expo Go / SDK 54).
//
// Antes usaba MMKV (escritura síncrona) porque perseguíamos un crash NATIVO;
// ese crash quedó resuelto upstream en SDK 54, así que ahora esto es un
// mecanismo de mejor-esfuerzo sobre AsyncStorage (lo que Expo Go incluye):
// registra el último paso de arranque alcanzado y, si un arranque anterior
// murió en un paso secundario, ese paso se salta en los siguientes arranques.
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY_LAST = 'sk_startup_last';
const KEY_DISABLED = 'sk_startup_disabled';
const DONE = 'complete';

// pasos "de núcleo" que nunca se desactivan (sin ellos no hay app)
const NEVER_DISABLE = new Set(['boot', 'loadMarket', 'marketEngine', DONE]);

let previousFailure: string | null = null;
let disabled = new Set<string>();

/**
 * Llamar UNA sola vez al arrancar. Carga (async) el estado del arranque
 * anterior; si murió en un paso secundario, lo desactiva para los próximos.
 * Es fire-and-forget: no bloquea el arranque.
 */
export function initStartupDiag(): void {
  (async () => {
    try {
      const [rawDisabled, last] = await Promise.all([
        AsyncStorage.getItem(KEY_DISABLED),
        AsyncStorage.getItem(KEY_LAST),
      ]);
      if (rawDisabled) disabled = new Set(JSON.parse(rawDisabled) as string[]);
      if (last && last !== DONE) {
        previousFailure = last;
        if (!NEVER_DISABLE.has(last) && !disabled.has(last)) {
          disabled.add(last);
          await AsyncStorage.setItem(KEY_DISABLED, JSON.stringify(Array.from(disabled)));
        }
      }
      await AsyncStorage.setItem(KEY_LAST, 'boot');
    } catch { /* no-op */ }
  })();
}

/** Marca (best-effort) el paso de arranque actual. */
export function checkpoint(name: string): void {
  AsyncStorage.setItem(KEY_LAST, name).catch(() => {});
}

/** El arranque llegó al final sin crashear. */
export function completeStartup(): void {
  AsyncStorage.setItem(KEY_LAST, DONE).catch(() => {});
}

/** En qué paso murió el arranque anterior (null si terminó bien o aún no cargó). */
export function previousStartupFailure(): string | null {
  return previousFailure;
}

/** ¿Este paso quedó desactivado por haber crasheado en un arranque anterior? */
export function isStepDisabled(name: string): boolean {
  return disabled.has(name);
}

/** Lista de pasos desactivados (para el banner de diagnóstico). */
export function disabledSteps(): string[] {
  return Array.from(disabled);
}
