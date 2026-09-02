import * as TaskManager from 'expo-task-manager';
import * as BackgroundTask from 'expo-background-task';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { enExpoGo } from './entorno';

// Se reexporta porque media app lo pide desde aquí (More.js, entre otras) y
// mover el cálculo a entorno.js no tiene por qué obligar a nadie a cambiar
// su import. Quien no necesite notificaciones que lo pida a './entorno'
// directamente: así no arrastra expo-task-manager solo para saber dónde está.
export { enExpoGo };

// expo-notifications NO se importa de forma estática, y esto es importante:
// su index.js reexporta desde `DevicePushTokenAutoRegistration.fx` — el
// sufijo `.fx` significa "efecto al importar" — y ese archivo llama a
// addPushTokenListener() en el ámbito del módulo. Esa llamada, desde el SDK
// 53, hace `throw` en Android cuando corre en Expo Go. Resultado: la app se
// cerraba al arrancar con "[runtime not ready]" solo por tener el import,
// sin haber llamado a ninguna función de notificaciones.
//
// Cargándolo con require() y solo fuera de Expo Go, el módulo nunca se
// evalúa allí y la app abre normal.
//
// EL PRECIO, QUE NO ES PEQUEÑO Y HAY QUE DECIRLO: este guard apaga
// expo-notifications ENTERO, no solo el push remoto. En Expo Go las
// notificaciones LOCALES sí funcionarían —las del dinero entrante y las de
// PULSE2CHAT lo son— pero aquí quedan apagadas junto con el resto, porque no
// hay forma de cargar media librería. No hay arreglo barato: mientras el
// índice lance al importarse, el guard se queda. Lo que NO se hace es
// disimularlo: Ajustes dice, con todas sus letras, que en Expo Go no llega
// ningún aviso del teléfono — ni de dinero ni de chat, ni siquiera local
// (ver `set.notifsGo` en i18n.js y la tarjeta de avisos de AjustesAuro).
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
// En Expo Go la tarea NI SE DEFINE, y conviene entender que eso deja el
// segundo plano muerto por partida doble: aunque el sistema despertara la
// app, `notif()` es null allí y no habría con qué lanzar el aviso. O sea que
// en la vista previa no hay aviso de dinero con la app cerrada, punto. Con
// la app ABIERTA sí se entera: watchIncoming() sigue consultando la red cada
// 25 s y App.js lo enseña como toast dentro de la app — que es un toast, no
// una notificación del teléfono, y así se dice en Ajustes.
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
  // Expo Go sale ANTES de pedir permiso, y el orden es el arreglo.
  //
  // Estaba al revés y por eso el interruptor de Ajustes se caía solo: en Expo
  // Go `notif()` es null, así que pedirPermiso() devolvía false SIN haber
  // preguntado nada, activarAvisos() se iba en la línea siguiente y More.js
  // leía ese false como «lo negaste» — devolvía el interruptor a apagado y
  // mostraba «permite las notificaciones en los ajustes del teléfono». La
  // persona no había negado nada, y ningún ajuste del teléfono lo arreglaba.
  //
  // Aquí no hay permiso que pedir ni tarea que registrar. Lo único real es
  // dejar la preferencia guardada para cuando la app corra en el APK, así
  // que es lo único que se hace. Que en Expo Go no llegue NINGÚN aviso del
  // sistema —tampoco los locales— se dice en Ajustes; no se disimula acá
  // devolviendo un true a secas y que el usuario lo descubra esperando.
  if (enExpoGo) {
    await AsyncStorage.setItem(WATCH_EMAIL, (email || '').toLowerCase()).catch(() => {});
    await AsyncStorage.setItem(ENABLED, '1').catch(() => {});
    return true;
  }
  const ok = await pedirPermiso();
  if (!ok) return false;
  await AsyncStorage.setItem(WATCH_EMAIL, (email || '').toLowerCase()).catch(() => {});
  await AsyncStorage.setItem(ENABLED, '1').catch(() => {});
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
// Mensajes de PULSE2CHAT: la notificación local que lanza el vigía
// (src/og/vigiaChat.js) cuando llegan sin leer con la app en segundo plano.
// ============================================================

// El canal se crea la primera vez que hace falta, no al arrancar: quien no
// usa el chat no necesita un canal de chat en los ajustes de Android.
let canalChatListo = false;
async function asegurarCanalChat(N) {
  if (Platform.OS !== 'android' || canalChatListo) return;
  await N.setNotificationChannelAsync(CANAL_CHAT, {
    name: 'PULSE2CHAT',
    description: 'Mensajes nuevos en PULSE2CHAT',
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
 * «PULSE2CHAT · quien: texto corto». `con` viaja en data: al tocarla, App.js
 * abre el hilo exacto de esa conversación, no la lista.
 */
export async function notificarMensaje({ quien, texto, con }) {
  const N = notif();
  if (!N) return false;
  try {
    await asegurarCanalChat(N);
    await N.scheduleNotificationAsync({
      content: {
        title: `PULSE2CHAT · ${quien}`,
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
    /* El aviso que viene del RELEVO no trae `screen`: trae `tipo`, y no puede
       traer más — no lleva ni una palabra del mensaje, que es la promesa. Así
       que aquí se traduce: cualquier aviso de chat abre el chat. Sin esto, un
       mensaje o una llamada tocados desde la pantalla de bloqueo llevaban a
       Actividad, que es la lista de movimientos de dinero. */
    const pantalla = data.screen || (data.tipo ? 'chat' : 'activity');
    cb(pantalla, data);
  });
  return () => sub.remove();
}

// ============================================================
// EL TESTIGO DE ESTE TELÉFONO — para que suene con la app cerrada.
//
// ══ POR QUÉ NO ALCANZABA CON LO DE ARRIBA ═══════════════════
//
// Todo lo anterior son avisos LOCALES: el vigía sondea el relevo desde dentro
// de la app y lanza la notificación él mismo. Eso funciona mientras el proceso
// viva, y Android lo mata a los pocos minutos de irse a segundo plano. La
// tarea de sistema lo reanima cada ~15 minutos, que está bien para un mensaje
// y es inservible para una llamada: nadie espera un timbre un cuarto de hora.
//
// Un aviso que llega SIEMPRE tiene que venir de fuera. Aquí se pide el testigo
// de este aparato y se le entrega al relevo; a partir de ahí es el relevo quien
// despierta el teléfono, con la app cerrada, con la pantalla apagada.
//
// ══ Y NO REEMPLAZA AL VIGÍA, LO COMPLETA ════════════════════
//
// El vigía sigue: es el que sabe QUIÉN escribió y QUÉ dijo, porque lo lee del
// relevo con la llave del chat. El push de fuera no lleva ni una palabra —esa
// es la promesa del relevo, y se cumple también aquí—, así que lo que hace es
// despertar y decir «hay algo»; el detalle lo pone la app cuando abre.
const CANAL_LLAMADAS = 'llamadas';
// El relevo manda `channelId: 'mensajes'` para los mensajes y 'llamadas' para
// el timbre. Los nombres tienen que coincidir con los de allí o Android usa el
// canal por defecto y el aviso sale mudo. Ver infra/mensajes/servidor.py.
const CANAL_PUSH = 'mensajes';

let canalesPushListos = false;
async function asegurarCanalesPush(N) {
  if (Platform.OS !== 'android' || canalesPushListos) return;
  await N.setNotificationChannelAsync(CANAL_PUSH, {
    name: 'PULSE2CHAT · mensajes',
    description: 'Mensajes nuevos, aunque la app esté cerrada',
    importance: IMPORTANCIA_MAX,
    vibrationPattern: [0, 180, 80, 180],
    lightColor: '#C9A961',
    lockscreenVisibility: VISIBLE_EN_BLOQUEO,
    sound: 'default', enableVibrate: true, showBadge: true,
  });
  // Las llamadas van en su propio canal: quien silencie los mensajes no tiene
  // por qué perderse un timbre, y al revés. Y con vibración larga, que es lo
  // que distingue un timbre de un aviso sin mirar el teléfono.
  await N.setNotificationChannelAsync(CANAL_LLAMADAS, {
    name: 'PULSE2CHAT · llamadas',
    description: 'Llamadas y videollamadas entrantes',
    importance: IMPORTANCIA_MAX,
    vibrationPattern: [0, 700, 400, 700, 400, 700],
    lightColor: '#C9A961',
    lockscreenVisibility: VISIBLE_EN_BLOQUEO,
    sound: 'default', enableVibrate: true, showBadge: true,
  });
  canalesPushListos = true;
}

let testigoPuesto = null;

/**
 * Pide el testigo de este teléfono y lo entrega al relevo. Devuelve el testigo,
 * o null si aquí no hay avisos que dar (Expo Go, permiso denegado, sin red).
 *
 * `apuntar` es quien lo entrega — se pasa desde fuera para que este archivo no
 * sepa de relevos, igual que no sabe de pantallas.
 */
export async function apuntarEsteTelefono(apuntar) {
  const N = notif();
  if (!N) return null;                    // en Expo Go no hay push que pedir
  try {
    if (!(await pedirPermiso())) return null;
    await asegurarCanalesPush(N);
    // El projectId es OBLIGATORIO en un build de EAS: sin él, la llamada falla
    // con «No projectId found» y el teléfono se queda mudo sin decir por qué.
    const projectId = Constants?.expoConfig?.extra?.eas?.projectId
      || Constants?.easConfig?.projectId;
    const { data } = await N.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    if (!data) return null;
    // Se entrega SIEMPRE, también si es el mismo de la última vez: el relevo
    // reemplaza por testigo y no duplica, y una lista podada por error del
    // otro lado se vuelve a llenar sola en el siguiente arranque.
    await apuntar(data);
    testigoPuesto = data;
    return data;
  } catch (e) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) console.warn('[notify] sin testigo de push:', e?.message || e);
    return null;
  }
}

/** El testigo entregado en esta sesión, si lo hubo. Para darlo de baja al
 *  cerrar sesión: dejarlo puesto mandaría los avisos de esta cuenta al
 *  teléfono de quien entre después. */
export const testigoDeEsteTelefono = () => testigoPuesto;
export function soltarTestigo() { testigoPuesto = null; }
