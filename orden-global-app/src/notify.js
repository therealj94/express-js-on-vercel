import * as TaskManager from 'expo-task-manager';
import * as BackgroundTask from 'expo-background-task';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';

// ¿Estamos dentro de Expo Go? Se calcula acá arriba porque de ello depende
// si se puede cargar expo-notifications siquiera (ver justo debajo).
export const enExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

// expo-notifications NO se importa de forma estática, y esto es importante:
// su index.js reexporta desde `DevicePushTokenAutoRegistration.fx` — el
// sufijo `.fx` significa "efecto al importar" — y ese archivo llama a
// addPushTokenListener() en el ámbito del módulo. Esa llamada, desde el SDK
// 53, hace `throw` en Android cuando corre en Expo Go. Resultado: la app se
// cerraba al arrancar con "[runtime not ready]" solo por tener el import,
// sin haber llamado a ninguna función de notificaciones.
//
// Cargándolo con require() y solo fuera de Expo Go, el módulo nunca se
// evalúa allí y la app abre normal. Las notificaciones no funcionan en Expo
// Go de todas formas — eso ya estaba asumido y documentado.
let _N;
function notif() {
  if (_N !== undefined) return _N;
  _N = null;
  if (!enExpoGo) {
    try { _N = require('expo-notifications'); } catch (e) { _N = null; }
  }
  return _N;
}

// ============================================================
// Avisos de tokens recibidos.
//
// Veta Wallet no tiene servidor de push: quien manda el dinero es la
// blockchain, no nosotros. Así que el aviso se arma en el propio teléfono:
//
//   App ABIERTA   → un vigilante consulta la red cada 25 s (watchIncoming).
//   App CERRADA   → una tarea en segundo plano hace la misma consulta cada
//                   ~15 min (el mínimo que permiten Android e iOS) y lanza
//                   la notificación local si apareció algo nuevo.
//
// En ambos casos la notificación es LOCAL, así que no hace falta ninguna
// clave de push ni exponer nada del usuario a un tercero.
//
// El "ya lo avisé" se guarda por cuenta: se recuerda el hash de la última
// transferencia entrante notificada, para no repetir el mismo aviso.
// ============================================================

const TASK = 'veta-incoming-tx';
const SEEN = (email) => `veta-last-in-${(email || 'anon').toLowerCase()}`;
const WATCH_EMAIL = 'veta-notify-email';
const ENABLED = 'veta-notify-on';

const CANAL = 'veta-in'; // canal de Android para los avisos de dinero recibido
const CANAL_CHAT = 'auro-chat'; // canal aparte: el usuario puede silenciar el chat sin callar el dinero

// Valores de los enums de expo-notifications, con respaldo literal. Si una
// versión de la librería dejara de exportarlos, `X.MAX` sería un TypeError y
// el aviso no saldría — en silencio, porque va dentro de un try. Con el
// respaldo el aviso sale igual.
const PRIORIDAD_MAX = notif()?.AndroidNotificationPriority?.MAX ?? 'max';
const IMPORTANCIA_MAX = notif()?.AndroidImportance?.MAX ?? 5;
const VISIBLE_EN_BLOQUEO = notif()?.AndroidNotificationVisibility?.PUBLIC ?? 1;

// Con la app abierta la notificación también se ve y se oye, arriba de todo,
// igual que un mensaje de WhatsApp.
notif()?.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,   // el banner que baja desde arriba
    shouldShowList: true,     // y queda en la bandeja
    shouldPlaySound: true,
    shouldSetBadge: true,
    priority: PRIORIDAD_MAX,
  }),
});

const isIn = (x) => x.type === 'recive' || x.type === 'receive' || x.type === 'in';

/** Transferencias entrantes, de la más reciente a la más antigua. */
export function incoming(transfers) {
  return (transfers || [])
    .filter(isIn)
    .slice()
    .sort((a, b) => (Number(b.timeStamp) || 0) - (Number(a.timeStamp) || 0));
}

/**
 * Compara lo que trae la red con lo último avisado y devuelve SOLO lo nuevo.
 * Si nunca se ha avisado nada (primer arranque) no devuelve nada: no tiene
 * sentido notificar de golpe todo el historial.
 */
export function nuevasEntrantes(transfers, lastHash) {
  const list = incoming(transfers);
  if (!list.length) return [];
  if (!lastHash) return [];
  const i = list.findIndex((x) => x.hash === lastHash);
  return i < 0 ? list.slice(0, 5) : list.slice(0, i);
}

const fmt = (v) => {
  const n = Number(v) || 0;
  return n >= 1 ? n.toLocaleString('en-US', { maximumFractionDigits: 4 }) : n.toLocaleString('en-US', { maximumFractionDigits: 6 });
};

/** Texto del aviso, en el idioma de la app. */
export function textoAviso(tx, lang = 'en') {
  const monto = `${fmt(tx.value)} ${tx.symbol || 'ORIGEN'}`;
  return lang === 'es'
    ? { title: 'Tokens recibidos', body: `Recibiste ${monto} en tu Veta Wallet.` }
    : { title: 'Tokens received', body: `You received ${monto} in your Veta Wallet.` };
}

// ---- permisos y canal ----
export async function pedirPermiso() {
  const N = notif();
  if (!N) return false;          // en Expo Go no hay notificaciones
  try {
    const actual = await N.getPermissionsAsync();
    let ok = actual.granted || actual.ios?.status === N.IosAuthorizationStatus.PROVISIONAL;
    if (!ok && actual.canAskAgain !== false) {
      const pedido = await N.requestPermissionsAsync();
      ok = pedido.granted;
    }
    // El canal debe existir ANTES de lanzar nada: en Android 8+ la
    // importancia del canal es lo que decide si el aviso sale como banner
    // emergente o se queda callado en la bandeja.
    if (ok && Platform.OS === 'android') {
      await N.setNotificationChannelAsync(CANAL, {
        name: 'Tokens recibidos',
        description: 'Aviso cuando entra dinero a tu Veta Wallet',
        importance: IMPORTANCIA_MAX,
        vibrationPattern: [0, 220, 90, 220],
        lightColor: '#C9A961',
        lockscreenVisibility: VISIBLE_EN_BLOQUEO,
        sound: 'default',
        enableVibrate: true,
        showBadge: true,
      });
    }
    return !!ok;
  } catch (e) { return false; }
}

async function lanzar(tx, lang) {
  const N = notif();
  if (!N) return;
  const { title, body } = textoAviso(tx, lang);
  try {
    await N.scheduleNotificationAsync({
      content: {
        title,
        body,
        sound: 'default',
        priority: PRIORIDAD_MAX,
        color: '#C9A961',
        vibrate: [0, 220, 90, 220],
        // El aviso NO se borra solo: se queda en la bandeja hasta que lo
        // tocas, aunque cambies de app o cierres Veta Wallet del todo.
        autoDismiss: false,
        sticky: false, // se puede descartar deslizando, pero no desaparece sola
        data: { hash: tx.hash, screen: 'activity' },
      },
      // En Android el canal se indica AQUÍ, en el disparador: con `null` se
      // usaba el canal por defecto y el aviso no salía como banner.
      trigger: Platform.OS === 'android' ? { channelId: CANAL } : null,
    });
    return true;
  } catch (e) {
    // Que un aviso falle no debe romper la app, pero tampoco desaparecer
    // sin dejar rastro: en desarrollo se ve en consola.
    if (typeof __DEV__ !== 'undefined' && __DEV__) console.warn('[notify] no se pudo lanzar el aviso:', e?.message || e);
    return false;
  }
}

/** Avisa de lo nuevo y deja marcado hasta dónde se avisó. */
async function avisarNuevas(email, transfers, lang) {
  const list = incoming(transfers);
  if (!list.length) return 0;
  const last = await AsyncStorage.getItem(SEEN(email)).catch(() => null);
  const nuevas = nuevasEntrantes(transfers, last);
  // Se avisa de la más antigua a la más nueva, para que queden en orden.
  for (const tx of nuevas.slice().reverse()) await lanzar(tx, lang);
  await AsyncStorage.setItem(SEEN(email), list[0].hash || '').catch(() => {});
  return nuevas.length;
}

// ============================================================
// App ABIERTA: vigilante en primer plano
// ============================================================
let timer = null;

/**
 * Consulta el portafolio cada `cada` ms y avisa de lo entrante.
 * `traer` es una función que devuelve { transfers } (apiPortfolio).
 * Devuelve la función para detenerlo.
 */
export function watchIncoming({ email, traer, lang = 'en', cada = 25000, onNuevas }) {
  stopWatch();
  if (!email || typeof traer !== 'function') return () => {};
  let vivo = true;
  const tick = async () => {
    if (!vivo) return;
    try {
      const p = await traer();
      const n = await avisarNuevas(email, p?.transfers, lang);
      if (n > 0 && onNuevas) onNuevas(n, p);
    } catch (e) {}
  };
  timer = setInterval(tick, cada);
  tick();
  return () => { vivo = false; stopWatch(); };
}

export function stopWatch() {
  if (timer) { clearInterval(timer); timer = null; }
}

/** Marca el estado actual como "ya visto" (al iniciar sesión, para no avisar del historial). */
export async function marcarVisto(email, transfers) {
  const list = incoming(transfers);
  await AsyncStorage.setItem(SEEN(email), list[0]?.hash || 'none').catch(() => {});
}

// ============================================================
// App CERRADA: tarea en segundo plano
// ============================================================
//
// La tarea se define en el ámbito del módulo (requisito de expo-task-manager:
// tiene que existir antes de que el sistema despierte la app). Importa
// apiPortfolio de forma diferida para no arrastrar toda la app al arrancar.
// En Expo Go no hay trabajo en segundo plano: los módulos nativos que lo
// hacen no vienen dentro. Registrar la tarea allí lanza un error, así que se
// detecta el entorno y se omite. (`enExpoGo` se declara arriba del todo,
// porque de él depende si se puede cargar expo-notifications siquiera.)
if (!enExpoGo) {
  TaskManager.defineTask(TASK, async () => {
    try {
      const on = await AsyncStorage.getItem(ENABLED);
      const email = await AsyncStorage.getItem(WATCH_EMAIL);
      if (on === '0' || !email) return BackgroundTask.BackgroundTaskResult.Success;
      const { ensureSession, apiPortfolio } = require('./api');
      const ok = await ensureSession();
      if (!ok) return BackgroundTask.BackgroundTaskResult.Success;
      const p = await apiPortfolio();
      const lang = (await AsyncStorage.getItem('veta-lang')) || 'en';
      await avisarNuevas(email, p?.transfers, lang);
      return BackgroundTask.BackgroundTaskResult.Success;
    } catch (e) {
      return BackgroundTask.BackgroundTaskResult.Failed;
    }
  });
}

/** Enciende los avisos para esta cuenta (permiso + tarea en segundo plano). */
export async function activarAvisos(email) {
  const ok = await pedirPermiso();
  if (!ok) return false;
  await AsyncStorage.setItem(WATCH_EMAIL, (email || '').toLowerCase()).catch(() => {});
  await AsyncStorage.setItem(ENABLED, '1').catch(() => {});
  if (enExpoGo) return true; // en Expo Go solo hay avisos con la app abierta
  try {
    const ya = await TaskManager.isTaskRegisteredAsync(TASK);
    // minimumInterval va en MINUTOS (antes, en background-fetch, eran segundos).
    if (!ya) await BackgroundTask.registerTaskAsync(TASK, { minimumInterval: 15 });
  } catch (e) {}
  return true;
}

/** Apaga los avisos (Ajustes → Notificaciones). */
export async function desactivarAvisos() {
  await AsyncStorage.setItem(ENABLED, '0').catch(() => {});
  stopWatch();
  if (enExpoGo) return;
  try {
    if (await TaskManager.isTaskRegisteredAsync(TASK)) await BackgroundTask.unregisterTaskAsync(TASK);
  } catch (e) {}
}

export async function avisosActivos() {
  try { return (await AsyncStorage.getItem(ENABLED)) !== '0'; } catch (e) { return true; }
}

/** Al cerrar sesión: nada de avisos de una cuenta que ya no está abierta. */
export async function limpiarAvisos() {
  await desactivarAvisos();
  await AsyncStorage.removeItem(WATCH_EMAIL).catch(() => {});
}

// ============================================================
// Mensajes de AURO CHAT: la notificación local que lanza el vigía
// (src/og/vigiaChat.js) cuando llegan sin leer con la app en segundo plano.
// ============================================================

// El canal se crea la primera vez que hace falta, no al arrancar: quien no
// usa el chat no necesita un canal de chat en los ajustes de Android.
let canalChatListo = false;
async function asegurarCanalChat(N) {
  if (Platform.OS !== 'android' || canalChatListo) return;
  await N.setNotificationChannelAsync(CANAL_CHAT, {
    name: 'AURO CHAT',
    description: 'Mensajes nuevos en AURO CHAT',
    importance: IMPORTANCIA_MAX,
    vibrationPattern: [0, 180, 80, 180],
    lightColor: '#C9A961',
    lockscreenVisibility: VISIBLE_EN_BLOQUEO,
    sound: 'default',
    enableVibrate: true,
    showBadge: true,
  });
  canalChatListo = true;
}

/**
 * «AURO CHAT · quien: texto corto». `con` viaja en data: al tocarla, App.js
 * abre el hilo exacto de esa conversación, no la lista.
 */
export async function notificarMensaje({ quien, texto, con }) {
  const N = notif();
  if (!N) return false;
  try {
    await asegurarCanalChat(N);
    await N.scheduleNotificationAsync({
      content: {
        title: `AURO CHAT · ${quien}`,
        body: texto || '',
        sound: 'default',
        priority: PRIORIDAD_MAX,
        color: '#C9A961',
        autoDismiss: false,
        sticky: false,
        data: { screen: 'chat', con },
      },
      trigger: Platform.OS === 'android' ? { channelId: CANAL_CHAT } : null,
    });
    return true;
  } catch (e) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) console.warn('[notify] no salió el aviso de chat:', e?.message || e);
    return false;
  }
}

/** Se dispara al tocar la notificación: devuelve la pantalla a abrir y los
 *  datos del aviso (el de chat trae `con`, la conversación a abrir). */
export function alTocarNotificacion(cb) {
  const N = notif();
  if (!N) return () => {};       // en Expo Go no hay notificaciones que tocar
  const sub = N.addNotificationResponseReceivedListener((r) => {
    const data = r?.notification?.request?.content?.data || {};
    cb(data.screen || 'activity', data);
  });
  return () => sub.remove();
}
