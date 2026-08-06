// ─────────────────────────────────────────────────────────────────────────────
// Actualizaciones por aire.
//
// Sin esto, cada arreglo —por chico que fuera— exigía compilar un APK nuevo,
// esperar quince minutos y que cada comercio lo reinstalara a mano. Con esto,
// un cambio de JavaScript llega al teléfono en segundos.
//
// Cómo se comporta, y por qué:
//
//   · Pregunta al abrir y al volver del segundo plano. No hay temporizador de
//     fondo: un proceso que consulta cada minuto gasta batería y no aporta.
//   · Descarga en silencio. La descarga no molesta a nadie.
//   · NO se reinicia sola. Reiniciar de golpe a un mesero a mitad de un cobro
//     es peor que esperar: se avisa y la persona decide cuándo.
//   · En desarrollo y en Expo Go no hace nada — ahí el código llega por otra
//     vía y `Updates.isEnabled` es falso.
//
// Sobre el «runtime»: con la política `sdkVersion`, todos los binarios del
// mismo SDK comparten runtime y reciben los mismos updates. Si algún día se
// agrega una librería con parte nativa, ese JavaScript llamaría a algo que el
// binario viejo no tiene: ahí SÍ hay que compilar un APK nuevo. Cambio de
// pantallas, textos, lógica o estilos: por aire.
// ─────────────────────────────────────────────────────────────────────────────

import * as Updates from 'expo-updates'

/** ¿Este binario puede recibir actualizaciones por aire? */
export const puedeActualizar = (): boolean => Updates.isEnabled

/**
 * Busca y descarga. Devuelve `true` solo si quedó una lista para aplicarse.
 * Nunca lanza: un fallo aquí no puede romper el arranque de la app.
 */
export async function buscarActualizacion(): Promise<boolean> {
  if (!Updates.isEnabled) return false
  try {
    const r = await Updates.checkForUpdateAsync()
    if (!r?.isAvailable) return false
    await Updates.fetchUpdateAsync()
    return true
  } catch {
    return false
  }
}

/** Aplica lo descargado. Reinicia la app: solo se llama cuando el usuario acepta. */
export async function aplicarActualizacion(): Promise<void> {
  try {
    await Updates.reloadAsync()
  } catch {
    // Si no se puede recargar, la actualización queda para el próximo arranque.
  }
}
