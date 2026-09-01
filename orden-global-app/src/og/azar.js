/* EL AZAR DEL TELÉFONO · lo que @noble espera encontrar y en Android no está.
 *
 * ══ EL FALLO QUE ESTO ARREGLA ═════════════════════════════════════════════
 *
 * `@noble/hashes` saca sus bytes al azar así:
 *
 *     if (crypto && typeof crypto.getRandomValues === 'function') …
 *     throw new Error('crypto.getRandomValues must be defined');
 *
 * Ese `crypto` es el GLOBAL. En un navegador existe; en node existe; en
 * Hermes —el motor de JavaScript de la app en Android— NO EXISTE. Así que
 * `p256.utils.randomPrivateKey()` no devolvía una llave mala: TIRABA.
 *
 * Y como tirar en `mias()` cae en un `catch` que vuelve a llamar a lo mismo,
 * el plan B moría del mismo golpe que el plan A. El candado entero quedaba
 * muerto en el teléfono, en silencio: no publicaba la llave del aparato, no
 * podía cifrar al mandar —los mensajes salían EN CLARO— y no podía abrir
 * nada de lo que llegaba. En pantalla se leía «Cifrado para otro de tus
 * aparatos» en cada mensaje de cada conversación, que suena a un problema de
 * aparatos y no era eso.
 *
 * ══ POR QUÉ NO SE VIO ANTES ═══════════════════════════════════════════════
 *
 * `pruebas/probar-candado.cjs` corre en node, y node SÍ trae
 * `globalThis.crypto.getRandomValues` desde la 19. La prueba se ejecutaba en
 * un sitio MÁS CAPAZ que el teléfono, así que pasaba en verde mientras el
 * teléfono no cifraba una sola letra. Es el mismo error de método que el
 * almacén falso que aceptaba nombres que el de verdad rechaza: un doble más
 * permisivo que la pieza real no prueba nada. Por eso la prueba de al lado
 * ahora BORRA `globalThis.crypto` antes de cargar el candado.
 *
 * ══ POR QUÉ AQUÍ Y NO RETOCANDO CADA LLAMADA ══════════════════════════════
 *
 * Se podría cambiar cada `randomPrivateKey()` por `Crypto.getRandomBytes()`.
 * Pero entonces cualquier otra parte de @noble que pida azar —hoy o cuando se
 * suba de versión— volvería a tirar, y volvería a hacerlo en silencio. Se
 * pone el suelo una vez, en el sitio donde @noble lo busca.
 *
 * Los bytes salen de `expo-crypto`, que en Android va al generador del
 * sistema. No se inventa azar en JavaScript: un azar flojo aquí es una llave
 * privada adivinable, que es peor que no cifrar, porque parece que sí.
 */
import * as Crypto from 'expo-crypto';

/* Se respeta lo que ya haya. Si un día Expo trae WebCrypto de verdad, o
   alguien mete `react-native-get-random-values`, esto no se mete en medio:
   dos generadores compitiendo es una fuente de fallos rarísimos. */
export function ponerElAzar() {
  const g = globalThis;
  if (!g.crypto) {
    // `crypto` es de sólo lectura en algunos motores: si no deja, se sigue.
    try { g.crypto = {}; } catch { return false; }
  }
  if (typeof g.crypto.getRandomValues === 'function') return true;
  try {
    g.crypto.getRandomValues = (arr) => {
      /* Tiene que servir para CUALQUIER vista tipada, no sólo Uint8Array:
         @noble usa Uint8Array, pero el contrato de WebCrypto es más ancho y
         el día que algo pida un Uint32Array no puede devolver ceros — ceros
         silenciosos son exactamente la clase de fallo que trajo hasta aquí. */
      if (!ArrayBuffer.isView(arr)) throw new TypeError('se esperaba una vista tipada');
      const bytes = Crypto.getRandomBytes(arr.byteLength);
      new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength).set(bytes);
      return arr;
    };
    return true;
  } catch {
    return false;
  }
}

export default ponerElAzar;
