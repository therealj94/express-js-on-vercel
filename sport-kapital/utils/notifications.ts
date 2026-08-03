// utils/notifications.ts
// Notificaciones de gol para posiciones abiertas — fuera de la app (sistema)
// cuando está en segundo plano, y como aviso propio en pantalla cuando está
// abierta (ver components/GoalAlert.tsx). Redacción estilo alerta de mercado
// (ticker + %), no "¡GOOOL! 🎉" — nada de eso.
import * as Notifications from 'expo-notifications';
import { t } from './i18n';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,   // el sonido de gol de la app ya cubre el audio
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

let permissionState: 'unknown' | 'granted' | 'denied' = 'unknown';

export async function ensureNotificationPermission(): Promise<boolean> {
  if (permissionState === 'granted') return true;
  if (permissionState === 'denied') return false;
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.status === 'granted') { permissionState = 'granted'; return true; }
    const req = await Notifications.requestPermissionsAsync();
    permissionState = req.status === 'granted' ? 'granted' : 'denied';
    return permissionState === 'granted';
  } catch (err) {
    console.warn('[notifications] no se pudo pedir permiso', err);
    return false;
  }
}

const BODY_VARIANTS = [
  (team: string) => t('notif.g1', { team }),
  (team: string) => t('notif.g2', { team }),
  (team: string) => t('notif.g3', { team }),
];

export interface GoalNotifyOptions {
  ticker: string;
  teamName: string;
  pct: number;
}

/** Notificación de sistema (se ve fuera de la app si está en segundo plano). */
export async function notifyGoal(opts: GoalNotifyOptions): Promise<void> {
  const granted = await ensureNotificationPermission();
  if (!granted) return;
  const body = BODY_VARIANTS[Math.floor(Math.random() * BODY_VARIANTS.length)](opts.teamName);
  const sign = opts.pct >= 0 ? '+' : '';
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `${opts.ticker} ${sign}${opts.pct.toFixed(2)}%`,
        body,
        sound: false,
      },
      trigger: null,
    });
  } catch (err) {
    console.warn('[notifications] no se pudo enviar la notificación de gol', err);
  }
}
