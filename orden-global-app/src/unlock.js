import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';

// ============================================================
// Desbloqueo por Face ID / huella para las operaciones que exigen contraseña.
//
// El backend pide la contraseña de verdad en cada operación sensible: enviar
// dinero, ver el número de la tarjeta, ver la semilla, eliminar la cuenta. Eso
// no se puede cambiar desde la app, y tampoco conviene: es la última defensa
// si alguien te agarra el teléfono desbloqueado.
//
// Lo que sí se puede es dejar de TECLEARLA. La contraseña se guarda una vez en
// el llavero del sistema (Keychain en iPhone, Keystore en Android) con la
// bandera `requireAuthentication`: el sistema operativo se niega a devolverla
// sin una verificación biométrica válida. La app nunca ve la contraseña hasta
// que el dueño del dedo o de la cara la autoriza.
//
// Diferencia importante con el viejo "Recordarme": aquel guardaba la
// contraseña SIN esa bandera, así que en un teléfono comprometido se leía sin
// biometría. Este mecanismo la reemplaza por uno que el sistema protege.
//
// Si la biometría cambia (se agrega una huella nueva, se reconfigura Face ID),
// Android e iOS invalidan la llave a propósito. Eso hace que la lectura falle,
// y la app lo trata como "no hay desbloqueo": vuelve a pedir la contraseña
// escrita y ofrece volver a activarlo. Es el comportamiento correcto — una
// biometría nueva podría ser de otra persona.
// ============================================================

const CLAVE = 'veta-clave-biometrica';
// Marca sin protección, solo para saber si el desbloqueo está activo sin
// disparar el diálogo del sistema cada vez que se dibuja una pantalla.
const MARCA = 'veta-clave-biometrica-on';

export const TIPO = { FACE: 'face', HUELLA: 'huella', IRIS: 'iris' };

/** Qué ofrece este teléfono. `tipo` sirve para nombrarlo bien en pantalla. */
export async function capacidadBiometrica() {
  try {
    const [hw, enrolado, tipos] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
      LocalAuthentication.supportedAuthenticationTypesAsync(),
    ]);
    const T = LocalAuthentication.AuthenticationType;
    let tipo = TIPO.HUELLA;
    if (tipos?.includes(T.FACIAL_RECOGNITION)) tipo = TIPO.FACE;
    else if (tipos?.includes(T.IRIS)) tipo = TIPO.IRIS;
    return { disponible: !!(hw && enrolado), tipo };
  } catch (e) {
    return { disponible: false, tipo: TIPO.HUELLA };
  }
}

/** ¿El usuario ya dejó su contraseña guardada tras la biometría? */
export async function desbloqueoActivo() {
  try { return (await SecureStore.getItemAsync(MARCA)) === '1'; }
  catch (e) { return false; }
}

/**
 * Guarda la contraseña detrás de la biometría. Se llama DESPUÉS de que el
 * servidor haya aceptado esa contraseña, nunca antes: guardar una contraseña
 * equivocada dejaría al usuario con un desbloqueo que siempre falla.
 */
export async function activarDesbloqueo(password) {
  if (!password) return false;
  try {
    await SecureStore.setItemAsync(CLAVE, String(password), {
      requireAuthentication: true,
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
    await SecureStore.setItemAsync(MARCA, '1');
    return true;
  } catch (e) {
    // Teléfono sin pantalla de bloqueo segura, o el sistema rechazó la llave.
    await desactivarDesbloqueo();
    return false;
  }
}

/**
 * Pide la contraseña al llavero. El sistema muestra su propio diálogo de
 * Face ID / huella; si el usuario cancela o falla, devuelve null y quien
 * llama debe caer al campo de contraseña.
 */
export async function desbloquearClave() {
  try {
    const v = await SecureStore.getItemAsync(CLAVE, {
      requireAuthentication: true,
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
    return v || null;
  } catch (e) {
    // Puede ser cancelación del usuario o invalidación por cambio de
    // biometría. No se distingue de forma fiable entre plataformas, así que
    // se devuelve null y la pantalla ofrece la contraseña escrita.
    return null;
  }
}

/** Apaga el desbloqueo y borra la contraseña guardada. */
export async function desactivarDesbloqueo() {
  try { await SecureStore.deleteItemAsync(CLAVE); } catch (e) {}
  try { await SecureStore.deleteItemAsync(MARCA); } catch (e) {}
}

/** Claves que hay que limpiar al cerrar sesión o eliminar la cuenta. */
export const CLAVES_DESBLOQUEO = [CLAVE, MARCA];
