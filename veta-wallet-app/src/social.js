/**
 * social.js — entrar con Google y con Apple.
 *
 * El telefono no le manda al servidor ningun dato de la persona: le manda un
 * token firmado por Google o por Apple, y el servidor comprueba esa firma
 * contra las llaves publicas del proveedor. Por eso aca no hay nada secreto y
 * los identificadores de cliente pueden viajar en el paquete de la app: no
 * sirven para suplantar a nadie.
 *
 * Apple solo existe en iPhone. Y hay una regla de la tienda que conviene tener
 * presente: si la aplicacion ofrece entrar con Google en iOS, Apple EXIGE
 * ofrecer tambien entrar con Apple. No es una recomendacion, es motivo de
 * rechazo (directriz 4.8).
 */

import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import * as Google from 'expo-auth-session/providers/google';
import Constants from 'expo-constants';

// Cierra la ventana del navegador al volver a la app.
WebBrowser.maybeCompleteAuthSession();

// Apple solo se carga en iPhone: en Android el modulo no existe y pedirlo
// tumbaria la pantalla de acceso entera.
let AppleAuth = null;
if (Platform.OS === 'ios') {
  try { AppleAuth = require('expo-apple-authentication'); } catch (e) { AppleAuth = null; }
}

const extra = Constants.expoConfig?.extra || {};

export const GOOGLE_IDS = {
  // El cliente "web" es el que fija la audiencia del token que verifica el
  // servidor. Los otros dos son los que cada sistema necesita para abrir la
  // ventana de Google.
  webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || extra.googleWebClientId || null,
  iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || extra.googleIosClientId || null,
  androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || extra.googleAndroidClientId || null,
};

/** ¿Se puede ofrecer el botón? Si falta la configuración, no se muestra. */
export const googleDisponible = () => !!GOOGLE_IDS.webClientId;

export async function appleDisponible() {
  if (Platform.OS !== 'ios' || !AppleAuth) return false;
  try { return await AppleAuth.isAvailableAsync(); } catch (e) { return false; }
}

/**
 * Engancha el flujo de Google. Devuelve [pedir, listo] para usar en la
 * pantalla: `listo` dice si ya se puede apretar el botón.
 */
export function useGoogle() {
  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    clientId: GOOGLE_IDS.webClientId,
    iosClientId: GOOGLE_IDS.iosClientId || undefined,
    androidClientId: GOOGLE_IDS.androidClientId || undefined,
  });
  return { request, response, promptAsync, listo: !!request };
}

/** Saca el token de identidad de lo que devolvió Google. */
export function idTokenDeGoogle(response) {
  if (!response) return null;
  if (response.type !== 'success') return null;
  return response.params?.id_token || response.authentication?.idToken || null;
}

/**
 * Pide a Apple que identifique a la persona. Devuelve el token de identidad.
 * Si cancela, devuelve null en lugar de lanzar: cancelar no es un error.
 */
export async function entrarConApple() {
  if (!AppleAuth) throw new Error('Apple no disponible en este dispositivo');
  try {
    const cred = await AppleAuth.signInAsync({
      requestedScopes: [
        AppleAuth.AppleAuthenticationScope.FULL_NAME,
        AppleAuth.AppleAuthenticationScope.EMAIL,
      ],
    });
    return {
      idToken: cred.identityToken,
      // Apple manda el nombre UNA sola vez, en el primer ingreso. Si hiciera
      // falta guardarlo, es ahora o nunca.
      nombre: cred.fullName?.givenName
        ? `${cred.fullName.givenName} ${cred.fullName.familyName || ''}`.trim()
        : null,
    };
  } catch (e) {
    if (e?.code === 'ERR_REQUEST_CANCELED' || e?.code === 'ERR_CANCELED') return null;
    throw e;
  }
}

export default { useGoogle, idTokenDeGoogle, entrarConApple, googleDisponible, appleDisponible };
