// ═══ PANTALLA COMPLETA ═════════════════════════════════════════════════
// Segunda queja de José: «que la app se vea en full screen, los botones de
// atrás de Android están siempre». Se esconde la barra de navegación del
// sistema y se deja que vuelva SOLA al deslizar desde el borde
// ('overlay-swipe'): oculta, pero nunca atrapada. Un inmersivo que no deja
// salir es una app rota, no una app bonita.
//
// REGLA DEL AIRE ── 'expo-navigation-bar' es un módulo NATIVO y NO está en
// package.json, así que el binario que la gente YA tiene instalado no lo
// lleva dentro. Un `import` normal lo resolvería al cargar el paquete y la
// app reventaría al abrir en cuanto esto viajara por aire. Por eso se pide
// con require dentro de try/catch, igual que Nucleo.js hace con
// react-native-webview: si el módulo está, la barra se esconde; si no está,
// la app arranca exactamente igual y la barra se queda donde estaba. El día
// que se compile un APK nuevo con el módulo dentro, esto empieza a hacer
// efecto solo, sin tocar una línea de aquí.
import { Platform, AppState } from 'react-native';

let BarraNav = null;
try {
  BarraNav = require('expo-navigation-bar');
} catch (e) {
  BarraNav = null;
}

// Para que quien quiera pueda preguntar sin volver a arriesgarse al require.
export const hayBarraNav = !!BarraNav;

export async function activarInmersivo() {
  // En iOS no existe la barra de navegación del sistema: el gesto es la
  // rayita de casa y ni se puede ni se debe esconder.
  if (Platform.OS !== 'android' || !BarraNav) return false;
  try {
    // El orden importa. Primero el comportamiento, para que al deslizar la
    // barra reaparezca FLOTANDO encima y se vuelva a esconder sola sin
    // recolocar el contenido; si se pone después de ocultarla, el primer
    // deslizamiento la deja fija y hay que salir y entrar para recuperarlo.
    if (typeof BarraNav.setBehaviorAsync === 'function') {
      await BarraNav.setBehaviorAsync('overlay-swipe');
    }
    if (typeof BarraNav.setVisibilityAsync === 'function') {
      await BarraNav.setVisibilityAsync('hidden');
    }
    return true;
  } catch (e) {
    // Un fallo aquí es puramente estético: jamás debe tumbar el arranque.
    return false;
  }
}

// Android vuelve a sacar la barra por su cuenta en varias situaciones: al
// volver del segundo plano, tras un diálogo del sistema o al cerrarse el
// teclado. Sin esto la app se ve completa solo hasta la primera vez que
// alguien mira una notificación, y la queja vuelve.
export function vigilarInmersivo() {
  if (Platform.OS !== 'android' || !BarraNav) return () => {};
  let sub = null;
  try {
    sub = AppState.addEventListener('change', (estado) => {
      if (estado === 'active') activarInmersivo();
    });
  } catch (e) {
    sub = null;
  }
  return () => { try { sub && sub.remove(); } catch (e) {} };
}

export default activarInmersivo;
