// ═══ DÓNDE ESTÁ CORRIENDO LA APP ════════════════════════════════════════
//
// Una sola respuesta a «¿esto es Expo Go?». Vivía dentro de notify.js, y
// cualquier pantalla que quisiera saberlo tenía que importar notify.js
// entero —y con él expo-task-manager y expo-background-task— solo para
// preguntar dónde está. Aquí no se importa nada nativo salvo
// expo-constants, que es del propio SDK y siempre viaja dentro.
//
// POR QUÉ IMPORTA LA DISTINCIÓN
//
// Expo Go trae los módulos nativos del SDK oficial y NADA más. De lo que usa
// esta app, allí no existen:
//   · expo-speech-recognition  → el micrófono de AU-RA (FlotanteOG)
//   · @react-native-ml-kit/text-recognition → el OCR del documento (KYC)
// Y hay un tercer caso, más traicionero: expo-notifications SÍ viaja dentro
// de Expo Go, pero su índice lanza al importarse en Android desde el SDK 53
// (reexporta `DevicePushTokenAutoRegistration.fx`, que registra un listener
// de push en el ámbito del módulo). Por eso notify.js lo carga con require()
// y solo fuera de Expo Go.
//
// ── LA REGLA DEL AIRE, ESCRITA ─────────────────────────────────────────
//
//   Todo módulo NATIVO que no aparezca en
//   node_modules/expo/bundledNativeModules.json entra por require() DENTRO
//   de un try/catch. Nunca por import estático.
//
// El motivo es el orden de evaluación: un import estático se resuelve al
// cargar el módulo que lo pide, y esos paquetes llaman a
// requireNativeModule() en el ámbito del suyo. Si el binario no lo trae,
// lanza ANTES de que exista pantalla y la app se cierra con «[runtime not
// ready]» — sin haber llamado a ninguna función. Con require() dentro de
// try/catch la app abre igual y solo se apaga la función afectada.
// Así lo hacen ya voz.js, sonidos.js, Inmersivo.js y el mrzOcr.
//
// Con una trampa que conviene recordar, porque costó encontrarla: que el
// require() NO lance no significa que el módulo esté. Los paquetes escritos
// al estilo viejo de React Native devuelven un Proxy de mentira cuando su
// módulo nativo falta, y el error solo aparece al llamar a un método. Por
// eso mrzOcr.js comprueba además NativeModules.TextRecognition.
//
// ── LO QUE EXPO GO SÍ DA ───────────────────────────────────────────────
//
// expo-audio, expo-camera, expo-speech, expo-font, expo-navigation-bar,
// expo-updates (apagado: isEnabled es false), react-native-webview,
// react-native-svg, async-storage, netinfo. O sea: la app se puede probar
// entera salvo la voz de AU-RA, el OCR del KYC y los avisos del sistema.

import Constants, { ExecutionEnvironment } from 'expo-constants';

/**
 * true cuando la app corre DENTRO de Expo Go (el cliente de la tienda), no
 * en un APK propio ni en una build de desarrollo.
 *
 * Va en try/catch por prudencia: se lee en el ámbito del módulo y lo importa
 * media app, así que una versión de expo-constants que no exportara
 * ExecutionEnvironment no puede ser el motivo de que la app no abra. Ante la
 * duda se responde `false`, que es el comportamiento de siempre (el del APK).
 */
export const enExpoGo = (() => {
  try {
    return Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
  } catch (e) {
    return false;
  }
})();
