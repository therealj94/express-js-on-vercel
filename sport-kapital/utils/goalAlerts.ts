// utils/goalAlerts.ts
// Un solo observador para "gol a favor de un equipo que tengo comprado":
// dispara el sonido, el aviso en pantalla (components/GoalAlert.tsx) y,
// si la app está en segundo plano, la notificación de sistema. Todo parte
// de la misma detección (utils/goalDetection.ts) para no desincronizarse.
import { AppState } from 'react-native';
import { useStore } from '@/store/useStore';
import { playGoalSound } from './sound';
import { duckMusicFor } from './music';
import { notifyGoal } from './notifications';
import { isOwnedGoalNews } from './goalDetection';

const TOAST_DURATION_MS = 4200;
const GOAL_SOUND_MS = 3000; // la música se pausa mientras suena el gol y se reanuda sola

export function startGoalAlerts(): () => void {
  let lastNewsId = useStore.getState().news[0]?.id ?? null;
  let toastTimer: ReturnType<typeof setTimeout> | null = null;

  const unsub = useStore.subscribe((state) => {
    const latest = state.news[0];
    if (!latest || latest.id === lastNewsId) return;
    lastNewsId = latest.id;

    if (!isOwnedGoalNews(latest, state.positions)) return;

    const team = state.teams.find((t) => t.id === latest.teamId);
    if (!team) return;

    // el gol suena solo si el sonido maestro está encendido Y el usuario no
    // apagó el sonido de gol en su perfil. La música se pausa para que el gol
    // se escuche fuerte y claro, y se reanuda sola al terminar.
    if (!state.soundMuted && state.goalSoundOn) {
      duckMusicFor(GOAL_SOUND_MS);
      playGoalSound();
    }

    if (toastTimer) clearTimeout(toastTimer);
    state.setGoalAlert({
      id: latest.id,
      teamId: team.id,
      teamName: team.name,
      ticker: team.short,
      pct: latest.impact,
      color: team.color,
      color2: team.color2,
    });
    toastTimer = setTimeout(() => useStore.getState().setGoalAlert(null), TOAST_DURATION_MS);

    // fuera de la app (en segundo plano): además, notificación de sistema.
    // en primer plano ya se ve el aviso propio, no hace falta duplicar.
    if (AppState.currentState !== 'active') {
      notifyGoal({ ticker: team.short, teamName: team.name, pct: latest.impact });
    }
  });

  return () => { unsub(); if (toastTimer) clearTimeout(toastTimer); };
}
