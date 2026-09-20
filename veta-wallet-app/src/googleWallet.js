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
