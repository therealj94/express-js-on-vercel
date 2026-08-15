// ═══ LA VISTA PREVIA: QUÉ HAY Y QUÉ FALTA ═══════════════════════════════
//
// POR QUÉ EXISTE ESTE FICHERO
//
// Orden Global se abre de dos maneras y no son la misma cosa:
//
//   · la app INSTALADA (el APK), que lleva dentro todos los módulos nativos
//     que se compilaron con ella;
//   · EXPO GO, la aplicación de Expo que sirve para verla sin instalar nada
//     —se abre un QR y ya—. Trae los nativos del SDK oficial y NINGUNO de
//     terceros, porque los de terceros hay que compilarlos dentro y Expo Go
//     es un binario que publica Expo, no uno nuestro.
//
// De todo lo que usa esta app, en Expo Go faltan exactamente DOS cosas:
//   · expo-speech-recognition → el micrófono de NEXUS;
//   · @react-native-ml-kit/text-recognition → el lector del documento del KYC.
// Cámara, sonido, QR, red, almacenamiento… todo lo demás sí está, así que la
// vista previa enseña la app casi entera.
//
// LA REGLA QUE ESTE FICHERO SIRVE
//
// La app no puede reventar al abrirse ahí, y tampoco puede MENTIR. Un botón
// de micrófono que no va a oír a nadie es peor que no tener botón: se toca,
// no pasa nada, y la culpa se la lleva quien lo tocó. Preguntar aquí —en un
// solo sitio— evita que cada pantalla tenga su propia versión de la
// respuesta, que es como se llega a que una esconda el botón y otra lo pinte.
//
// POR QUÉ NO ESTÁ TODO EN src/entorno.js
//
// Aquel contesta UNA pregunta —«¿esto es Expo Go?»— y lo hace sin importar
// nada más que expo-constants, porque lo llama notify.js al arrancar la app.
// Este contesta las otras dos —«¿hay micrófono?», «¿hay lector?»—, que son
// las que la interfaz necesita para no prometer de más, y para responderlas
// hay que tocar los módulos de terceros. Se apoya en aquel para el entorno:
// una sola verdad por pregunta.
import Constants from 'expo-constants';
import { enExpoGo as CLIENTE_DE_TIENDA } from '../entorno';
import { puedeEscanear } from '../mrzOcr';

// Las tres respuestas se calculan UNA vez y se recuerdan: ni el entorno ni
// los módulos nativos cambian mientras la app vive, y esto se pregunta desde
// pantallas que se repintan muchas veces por segundo (el Núcleo, mientras se
// arrastra un mundo).
let _previa = null;
let _voz = null;

/**
 * ¿Estamos dentro de Expo Go, es decir, en la vista previa?
 *
 * Se miran DOS señales y no una a propósito:
 *
 *   · `executionEnvironment === 'storeClient'` —la que trae src/entorno.js—
 *     es la que en el SDK 54 distingue de verdad el cliente de tienda de un
 *     binario propio;
 *   · `appOwnership === 'expo'` es la de toda la vida. Expo la está jubilando
 *     (en una build de desarrollo ya llega `null`) pero en Expo Go sigue
 *     contestando, así que aquí hace de red.
 *
 * Con las dos, que Expo cambie una no deja la vista previa sin identificarse
 * — y una vista previa que no se sabe vista previa es justo la que promete lo
 * que no puede dar. Si ni siquiera se pueden leer, se responde «no»: se
 * asume la app instalada antes que inventarle un aviso de vista previa a
 * quien no está en ella.
 */
export function enExpoGo() {
  if (_previa !== null) return _previa;
  let r = !!CLIENTE_DE_TIENDA;
  if (!r) {
    try { r = Constants?.appOwnership === 'expo'; } catch (e) { r = false; }
  }
  _previa = r;
  return r;
}

/**
 * ¿Hay micrófono de verdad? No «¿debería haberlo?»: ¿cargó el nativo?
 *
 * Se repite aquí el require defensivo de FlotanteOG en vez de importarlo de
 * allí, y es a conciencia: FlotanteOG es el asistente entero —animaciones,
 * suscripciones, la burbuja que vive sobre toda la app—, y una pantalla que
 * solo quiere saber si pintar una píldora no puede arrastrar todo eso para
 * preguntarlo. El require es idempotente (Metro cachea el módulo) y va en
 * try porque en Expo Go LANZA: expo-speech-recognition hace
 * requireNativeModule en el ámbito del módulo y ahí no hay nativo que valga.
 */
export function hayVoz() {
  if (_voz !== null) return _voz;
  _voz = false;
  try {
    const m = require('expo-speech-recognition');
    _voz = !!(m && m.ExpoSpeechRecognitionModule);
  } catch (e) {
    _voz = false;
  }
  return _voz;
}

/**
 * ¿Hay lector de documentos?
 *
 * Se le pregunta a mrzOcr en vez de replicar la comprobación: allí está la
 * buena —el require Y el módulo nativo, porque en Expo Go el require NO
 * lanza y el paquete deja un objeto que parece vivo hasta que se le llama—.
 * Dos verdades distintas sobre el mismo lector es exactamente como se llega
 * a un botón que promete una lectura que nunca va a ocurrir.
 */
export function hayOcr() {
  return puedeEscanear();
}
