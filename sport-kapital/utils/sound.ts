// utils/sound.ts
// Sonido de gol (expo-audio, SDK 54 — expo-av fue retirado). Precarga el
// reproductor una sola vez y lo reutiliza (replay desde el inicio) para que
// no haya retraso perceptible cada vez que se dispara.
//
// El disparo (detectar la noticia + revisar mute + notificación + aviso en
// pantalla) vive en utils/goalAlerts.ts — este archivo solo sabe reproducir.
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';

let player: AudioPlayer | null = null;
let loading = false;

function ensureLoaded(): void {
  if (player || loading) return;
  loading = true;
  try {
    // suena aunque el teléfono esté en silencio/vibrar — es una alerta de
    // precio, no notificación de sistema, así que debe llamar la atención.
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
    player = createAudioPlayer(require('@/assets/sounds/gol.mp3'));
    player.volume = 1.0;
  } catch (err) {
    console.warn('[sound] no se pudo cargar el sonido de gol', err);
  } finally {
    loading = false;
  }
}

/** Precarga el sonido al abrir la app, para que la primera reproducción no tenga retraso. */
export function preloadGoalSound(): void {
  ensureLoaded();
}

export async function playGoalSound(): Promise<void> {
  try {
    ensureLoaded();
    if (!player) return;
    await player.seekTo(0);
    player.volume = 1.0;
    player.play();
  } catch (err) {
    console.warn('[sound] no se pudo reproducir el sonido de gol', err);
  }
}
