import { Platform } from 'react-native';
import { cardApi } from './api';

// ============================================================
// Añadir la tarjeta a Google Wallet
//
// Lo que se consigue: la persona toca un botón, la tarjeta queda dentro de
// Google Wallet, y paga acercando el teléfono al datáfono. El NFC lo maneja
// Google; Veta Wallet no toca la antena ni las claves de pago.
//
// ── POR QUÉ ESTE ARCHIVO ESTÁ ESCRITO A LA DEFENSIVA ───────────────────────
//
// El módulo nativo que hace el trabajo (`@expensify/react-native-wallet`)
// depende del SDK TapAndPay de Google, y ese SDK **solo se entrega a apps que
// Google haya aprobado**: hay que pedir acceso a la Push Provisioning API,
// bajar el SDK, meterlo en `android/libs`, y registrar el nombre del paquete
// con su huella SHA-256 en la lista blanca de Google.
//
// Hasta que eso pase, el módulo no está instalado. Este archivo lo detecta y
// contesta "no disponible" a todo, sin reventar. Por eso la app se puede
// repartir HOY con este código dentro: el botón sencillamente no aparece, y
// aparece solo cuando el módulo esté y Google nos haya dado el alta.
//
// ── Y POR QUÉ NO SE PAGA DESDE DENTRO DE VETA WALLET ───────────────────────
//
// Que la propia app emule la tarjeta con el chip NFC (se llama Host Card
// Emulation) es técnicamente posible en Android, pero para que un datáfono
// acepte el pago la app tiene que presentar credenciales EMV reales, y eso
// exige certificación EMVCo y alcance PCI. Ninguna billetera de cripto lo
// hace: todas empujan la tarjeta a Google Wallet. El resultado para la persona
// es el mismo —acerca el teléfono y paga— por una fracción del trabajo.
// ============================================================

/* El módulo nativo, si está. `require` dentro de try no es una pereza: es la
   única forma de preguntar "¿existe?" sin que el paquete falte y se caiga el
   arranque entero de la app. */
let nativo = null;
try {
  // eslint-disable-next-line global-require
  nativo = require('@expensify/react-native-wallet');
} catch (e) {
  nativo = null;
}

const api = nativo?.default || nativo || null;

/** Google Wallet es de Android. En iPhone esto no aplica: Apple Pay va por
 *  otro camino y CryptoMate dice explícitamente que hoy no lo soporta. */
export function esAndroid() {
  return Platform.OS === 'android';
}

/** ¿Está el módulo nativo compilado dentro de este APK? */
export function hayModulo() {
  return esAndroid() && typeof api?.addCardToGoogleWallet === 'function';
}

/* Los estados que puede tener la tarjeta respecto de la billetera. Se
   devuelven como texto propio y no el del SDK para que la pantalla no tenga
   que conocer al proveedor. */
export const ESTADO = {
  NO_DISPONIBLE: 'no-disponible',   // ni módulo, ni Android, ni alta de Google
  SIN_BILLETERA: 'sin-billetera',   // el teléfono no tiene Google Wallet listo
  YA_ESTA: 'ya-esta',               // la tarjeta ya vive en la billetera
  SE_PUEDE: 'se-puede',             // se puede añadir
  EN_CURSO: 'en-curso',
};

/**
 * ¿Se le puede ofrecer el botón a esta persona, y qué debería decir?
 * Nunca lanza: cualquier fallo es "no disponible", porque un botón que no
 * sabemos si funciona es peor que ningún botón.
 */
export async function estado(last4) {
  if (!hayModulo()) return ESTADO.NO_DISPONIBLE;
  try {
    const lista = await api.checkWalletAvailability();
    if (!lista) return ESTADO.SIN_BILLETERA;
  } catch (e) {
    return ESTADO.NO_DISPONIBLE;
  }
  // Si ya está añadida, el botón tiene que decirlo en vez de volver a añadirla.
  if (last4 && typeof api.getCardStatusBySuffix === 'function') {
    try {
      const st = await api.getCardStatusBySuffix(String(last4));
      const texto = String(st?.status ?? st ?? '').toUpperCase();
      if (texto.includes('ACTIVE') || texto.includes('TOKEN')) return ESTADO.YA_ESTA;
    } catch (e) {
      // No saberlo no impide intentarlo: se sigue como si no estuviera.
    }
  }
  return ESTADO.SE_PUEDE;
}

/* Los fallos que la pantalla necesita distinguir. El resto se agrupa: para
   quien mira el teléfono, "no se pudo, probá de nuevo" es toda la información
   accionable que hay. */
export const FALLO = {
  NO_DISPONIBLE: 'no-disponible',
  PROGRAMA: 'programa',       // el emisor no habilita provisioning para este programa
  TARJETA: 'tarjeta',         // congelada, bloqueada o inexistente
  CANCELADO: 'cancelado',     // la persona cerró la pantalla de Google
  OTRO: 'otro',
};

/* ── LO QUE SE PUEDE PEDIRLE A GOOGLE, Y LO QUE NO ──────────────────────────
   Tres capacidades que el SDK TapAndPay sí expone, y que cambian el
   recorrido de verdad. Van todas condicionadas a que el módulo nativo las
   traiga: hay varios envoltorios de ese SDK y no todos exponen lo mismo, así
   que se pregunta antes de llamar y, si no está, se sigue sin ella.

   Y lo que NO existe, para que nadie lo vuelva a buscar:

     · No hay ningún aviso en el teléfono de que se hizo un pago. Ni callback,
       ni broadcast, ni listener. `registerDataChangedListener` existe pero
       avisa de cambios en las TARJETAS del wallet —una añadida, una borrada,
       otra puesta por defecto—, no de cobros. Enterarse de un pago es cosa
       del emisor, y por eso la pantalla de pago pregunta a nuestro backend.
     · No hay forma de volver a la app después de pagar. El tap no lo origina
       nuestra app: lo enruta el sistema operativo a quien tenga el papel de
       billetera, y no hay a quién devolverle el control. Por eso la app se
       queda esperando en vez de irse. */

/** Abrir Google Wallet directamente en NUESTRA tarjeta. Solo funciona con
 *  tokens que provisionó una app con el mismo paquete que llama, o sea la
 *  nuestra: no se puede fisgonear la tarjeta de nadie. Devuelve false si el
 *  módulo no trae esta capacidad, y entonces la pantalla abre la app a secas. */
export async function abrirEnWallet(last4) {
  if (!hayModulo() || typeof api.viewToken !== 'function') return false;
  try {
    await api.viewToken(String(last4 || ''));
    return true;
  } catch (e) {
    return false;
  }
}

/** Pedirle a la persona que Veta sea la tarjeta con la que se paga al acercar
 *  el teléfono. Abre un diálogo del sistema y decide ella: no se puede fijar
 *  a la fuerza, y está bien que no se pueda. */
export async function pedirSerLaPredeterminada(last4) {
  if (!hayModulo()) return false;
  const fn = api.requestSelectToken || api.setDefaultToken;
  if (typeof fn !== 'function') return false;
  try {
    await fn.call(api, String(last4 || ''));
    return true;
  } catch (e) {
    return false;
  }
}

/** ¿Trae el módulo la capacidad de elegir tarjeta? Se pregunta aparte para no
 *  pintar un botón que al tocarlo no va a hacer nada. */
export async function sePuedeElegirTarjeta() {
  if (!hayModulo()) return false;
  return typeof api.requestSelectToken === 'function' || typeof api.setDefaultToken === 'function';
}

/** ¿Es Google Wallet la app que contesta cuando se acerca el teléfono? Si no
 *  lo es, el tap no va a hacer nada y conviene decirlo ANTES de que la persona
 *  esté de pie en la caja con el brazo estirado. `null` = no se pudo saber. */
export async function googleEsLaAppDePago() {
  if (!hayModulo() || typeof api.isGPayDefaultNFCApp !== 'function') return null;
  try {
    return Boolean(await api.isGPayDefaultNFCApp());
  } catch (e) {
    return null;
  }
}

/**
 * El flujo entero, en orden:
 *
 *   1. Se le piden a Google los dos identificadores del aparato. No se pueden
 *      calcular desde el servidor; tienen que salir de aquí.
 *   2. Se le piden al backend a cambio de la credencial cifrada (la OPC). El
 *      backend habla con CryptoMate; la clave del emisor no baja nunca al
 *      teléfono.
 *   3. Se le entrega la credencial al SDK, que abre la pantalla de Google.
 *
 * La credencial no se guarda en ningún estado, ni se escribe en consola, ni
 * se reintenta con la misma: es de un solo uso y dura poco. Si hay que
 * reintentar, se pide otra desde el paso 1.
 */
export async function anadir({ last4, titular } = {}) {
  if (!hayModulo()) return { ok: false, fallo: FALLO.NO_DISPONIBLE };

  let info;
  try {
    info = await api.getSecureWalletInfo();
  } catch (e) {
    return { ok: false, fallo: FALLO.NO_DISPONIBLE };
  }
  const walletAccountId = info?.walletAccountID;
  const deviceId = info?.deviceID;
  if (!walletAccountId || !deviceId) return { ok: false, fallo: FALLO.SIN_BILLETERA };

  let credencial;
  try {
    credencial = await cardApi.googleWalletProvisioning({
      walletAccountId,
      deviceId,
    });
  } catch (e) {
    if (e?.codigoServidor === 'PROVISIONING_NO_DISPONIBLE' || e?.status === 501) {
      return { ok: false, fallo: FALLO.PROGRAMA };
    }
    if (e?.codigoServidor === 'CLAVE_SIN_NIVEL') return { ok: false, fallo: FALLO.PROGRAMA };
    if (e?.status === 409 || e?.status === 404) return { ok: false, fallo: FALLO.TARJETA };
    return { ok: false, fallo: FALLO.OTRO };
  }
  if (!credencial?.opc) return { ok: false, fallo: FALLO.OTRO };

  try {
    const resultado = await api.addCardToGoogleWallet({
      opaquePaymentCard: credencial.opc,
      lastDigits: String(credencial.last4 || last4 || ''),
      cardHolderName: titular || '',
      network: 'VISA',
      tokenServiceProvider: 'TOKEN_PROVIDER_VISA',
    });
    const texto = String(resultado?.status ?? resultado ?? '').toUpperCase();
    if (texto.includes('CANCEL')) return { ok: false, fallo: FALLO.CANCELADO };
    return { ok: true };
  } catch (e) {
    const texto = String(e?.message || '').toUpperCase();
    if (texto.includes('CANCEL')) return { ok: false, fallo: FALLO.CANCELADO };
    return { ok: false, fallo: FALLO.OTRO };
  }
}
