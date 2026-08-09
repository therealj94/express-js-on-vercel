import * as Updates from 'expo-updates';

// ============================================================
// Actualizaciones por aire (EAS Update).
//
// Hasta ahora `expo-updates` no estaba instalado, aunque app.json declaraba
// la URL de actualizaciones. El resultado: el pipeline publicaba, el panel de
// Expo mostraba los updates, y NINGÚN teléfono con el APK los recibía nunca.
// Solo llegaban a Expo Go, que trae su propio motor.
//
// Cómo funciona ahora:
//   · La app pregunta al arrancar y al volver del segundo plano si hay algo
//     nuevo para su runtime.
//   · Si lo hay, lo descarga en segundo plano y avisa. No se reinicia sola:
//     reiniciar de golpe a alguien que está a mitad de un envío sería peor
//     que esperar. Se ofrece y el usuario decide.
//   · En Expo Go y en desarrollo no hace nada — ahí el update ya llega por
//     otra vía y `Updates.isEnabled` es falso.
//
// Sobre el "runtime": con la política `fingerprint`, cada cambio de código
// nativo (agregar una librería con parte nativa) genera un runtime distinto y
// esos updates NO se envían a builds viejos. Es a propósito: mandar JS que
// llama a un módulo nativo inexistente reventaría la app. Cuando eso pasa hay
// que compilar un APK nuevo.
// ============================================================

/** ¿Este binario puede recibir updates por aire? */
export const puedeActualizar = () => !!Updates.isEnabled;

/**
 * Busca y descarga una actualización. Devuelve true solo si quedó una lista
 * para aplicarse. Nunca lanza: un fallo acá no debe romper el arranque.
 */
export async function buscarActualizacion() {
  if (!Updates.isEnabled) return false;
  try {
    const r = await Updates.checkForUpdateAsync();
    if (!r?.isAvailable) return false;
    await Updates.fetchUpdateAsync();
    return true;
  } catch (e) {
    // Sin red, servidor caído o runtime incompatible. Se ignora en silencio:
    // el usuario no puede hacer nada al respecto y la app funciona igual.
    return false;
  }
}

/** Aplica la actualización ya descargada reiniciando la app. */
export async function aplicarActualizacion() {
  try { await Updates.reloadAsync(); } catch (e) {}
}

/** Identificador del paquete que está corriendo, para diagnóstico. */
export function updateEnUso() {
  return {
    id: Updates.updateId || null,
    canal: Updates.channel || null,
    runtime: Updates.runtimeVersion || null,
    // true cuando corre el JS que venía dentro del APK, sin updates aplicados
    esDelBinario: !!Updates.isEmbeddedLaunch,
  };
}
