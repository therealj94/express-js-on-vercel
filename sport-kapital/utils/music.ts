// utils/music.ts
// Música de fondo de la app (expo-audio, SDK 54): una sola pista ("Dai Dai")
// en bucle nativo continuo, con fade-in al arrancar y fade-out al apagarla.
// "off", o el botón maestro de sonido apagado, la detiene.
// Independiente del sonido de gol (utils/sound.ts) — se maneja por separado.
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { useStore, type MusicMode } from '@/store/useStore';

type TrackKey = 'track2';

export const TRACK_LABELS: Record<TrackKey, string> = {
  track2: 'Dai Dai',
};

const TARGET_VOLUME = 0.9;
const FADE_STEPS = 16;

let player: AudioPlayer | null = null;
let appliedMode: MusicMode | null = null;
let appliedMuted: boolean | null = null;
let generation = 0;
let ducked = false;

async function fadeTo(target: number, ms: number, myGen: number): Promise<void> {
  if (!player) return;
  const from = player.volume;
  for (let i = 1; i <= FADE_STEPS; i++) {
    if (myGen !== generation || !player) return;
    try { player.volume = Math.max(0, Math.min(1, from + (target - from) * (i / FADE_STEPS))); } catch { return; }
    await new Promise((r) => setTimeout(r, ms / FADE_STEPS));
  }
}

function destroyPlayer(): void {
  try { player?.pause(); player?.remove(); } catch { /* ya liberado */ }
  player = null;
}

/**
 * Pausa la música mientras suena otro audio importante (ej. el sonido de gol)
 * y la reanuda sola al terminar. Si el estado de música cambió mientras tanto
 * (mute, "off"), NO la reanuda — respeta el estado nuevo.
 */
export function duckMusicFor(ms: number): void {
  if (!player || ducked) return;
  ducked = true;
  const genAtPause = generation;
  try { player.pause(); } catch { /* no-op */ }
  setTimeout(() => {
    ducked = false;
    if (generation !== genAtPause || !player) return;
    if (appliedMode === 'off' || appliedMuted) return;
    try { player.play(); } catch { /* no-op */ }
  }, ms);
}

async function applyState(mode: MusicMode, muted: boolean): Promise<void> {
  if (mode === appliedMode && muted === appliedMuted) return;
  appliedMode = mode;
  appliedMuted = muted;
  generation++;
  const myGen = generation;

  if (mode === 'off' || muted) {
    await fadeTo(0, 700, myGen);
    if (myGen === generation) destroyPlayer();
    return;
  }

  if (!player) {
    try {
      await setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: false });
      player = createAudioPlayer(require('@/assets/music/track2.mp3'));
      player.loop = true;          // bucle nativo: nunca hay corte seco
      player.volume = 0;
      player.play();
    } catch (err) {
      console.warn('[music] no se pudo cargar la pista', err);
      player = null;
      return;
    }
    await fadeTo(TARGET_VOLUME, 1100, myGen);
  }
}

/**
 * Arranca (o detiene) la música de fondo según la preferencia guardada, y
 * reacciona en vivo si el usuario la cambia desde su perfil (o apaga el
 * botón maestro de sonido). Se llama una vez desde el root layout; devuelve
 * una función de limpieza.
 */
export function startAppMusic(): () => void {
  const s = useStore.getState();
  applyState(s.musicMode, s.soundMuted);
  const unsub = useStore.subscribe((state) => { applyState(state.musicMode, state.soundMuted); });
  return () => {
    unsub();
    generation++;
    appliedMode = null;
    appliedMuted = null;
    destroyPlayer();
  };
}
