/* Entrar con la frase semilla o con la llave privada.
 *
 * LA FRASE NUNCA SALE DE ESTE NAVEGADOR
 *
 * Es la regla entera de este archivo. Lo que viaja al servidor es una FIRMA
 * sobre un reto que el servidor mismo acaba de emitir, más la dirección. Con
 * eso el servidor comprueba que quien pide entrar tiene la llave, sin llegar
 * a verla nunca. La frase y la llave se quedan aquí, se usan un instante, y
 * se borran de memoria antes de pintar nada.
 *
 * Mandar la frase al servidor —aunque el servidor ya la tenga guardada,
 * porque esta billetera es de custodia— la metería en registros, en cachés y
 * en la memoria de un proceso que no la necesita, y sobre todo le enseñaría a
 * la gente que escribir su frase en una web es normal. Es justo lo que
 * aprovecha una suplantación.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *
 * LA DERIVACION NO ES LA ESTANDAR, Y HAY QUE RESPETARLA
 *
 * El backend crea las cuentas así (controller/authController.js):
 *
 *     const seed   = await bip39.mnemonicToSeed(mnemonic)
 *     const wallet = Wallet.fromPrivateKey(seed.slice(0, 32))
 *
 * Es decir: la llave privada son los PRIMEROS 32 BYTES de la semilla BIP-39,
 * directamente. NO es BIP-32/BIP-44, no hay ruta de derivación, no hay
 * m/44'/60'/0'/0/0. Una frase de esta billetera puesta en MetaMask da OTRA
 * dirección — la que MetaMask deriva por la ruta estándar— y esa dirección no
 * tiene saldo aquí.
 *
 * Así que aquí se replica ESA derivación y no la de los libros. Si algún día
 * el alta cambia a BIP-44, este archivo tiene que cambiar el mismo día o la
 * gente dejará de poder entrar con su propia frase.
 *
 * `mnemonicToSeed` de BIP-39 es PBKDF2(frase, "mnemonic" + contraseña, 2048
 * vueltas, SHA-512, 64 bytes). Eso lo sabe hacer el propio navegador con
 * WebCrypto, así que no hace falta traer bip39 entero: solo secp256k1 para
 * firmar y keccak para la dirección, que es lo que hay en vendor/.
 */

const LLAVES = (() => {
  'use strict';

  const hex = (b) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  const deHex = (s) => {
    const t = String(s || '').replace(/^0x/i, '');
    const b = new Uint8Array(t.length / 2);
    for (let i = 0; i < b.length; i++) b[i] = parseInt(t.substr(i * 2, 2), 16);
    return b;
  };

  /** Una llave privada es 32 bytes en hexadecimal, con o sin 0x. */
  const esLlavePrivada = (t) => /^(0x)?[0-9a-fA-F]{64}$/.test(String(t || '').trim());

  /**
   * Una frase semilla: 12, 15, 18, 21 o 24 palabras.
   *
   * No se comprueba la suma de verificación de BIP-39 porque eso exigiría
   * traer las 2048 palabras del diccionario —otros 20 KB— para dar un error
   * que la propia entrada ya da: si la frase está mal, la dirección que sale
   * no existe, y el servidor contesta que no hay cuenta. El aviso es el mismo
   * y el peso es menor.
   */
  const esFraseSemilla = (t) => {
    const p = String(t || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
    return [12, 15, 18, 21, 24].includes(p.length) && p.every((x) => /^[a-zà-ÿ]+$/.test(x));
  };

  /** La frase, tal como la espera BIP-39: minúsculas, un espacio, NFKD. */
  const normalizar = (frase) =>
    String(frase || '').trim().toLowerCase().replace(/\s+/g, ' ').normalize('NFKD');

  /**
   * De la frase a la llave privada, igual que el alta.
   *
   * PBKDF2-SHA512, 2048 vueltas, sal "mnemonic" — BIP-39 puro— y de los 64
   * bytes que salen se toman los 32 PRIMEROS, que es lo que hace el backend.
   */
  async function llaveDesdeFrase(frase) {
    const cod = new TextEncoder();
    const base = await crypto.subtle.importKey(
      'raw', cod.encode(normalizar(frase)), { name: 'PBKDF2' }, false, ['deriveBits'],
    );
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt: cod.encode('mnemonic'), iterations: 2048, hash: 'SHA-512' },
      base, 512,
    );
    return new Uint8Array(bits).slice(0, 32);
  }

  /** La dirección de una llave: keccak256 de la pública sin el 0x04, últimos 20. */
  function direccionDe(llave) {
    const { secp, keccak_256 } = globalThis.LLAVECRIPTO;
    const pub = secp.getPublicKey(llave, false).slice(1); // 64 bytes, sin la marca
    return '0x' + hex(keccak_256(pub).slice(-20));
  }

  /**
   * Firma el reto del servidor.
   *
   * Se firma keccak256 del texto del reto. No se usa el formato de
   * `personal_sign` de Ethereum a propósito: esto no es una transacción ni un
   * mensaje de una dapp, y darle esa forma invitaría a que una firma pedida
   * en otro sitio pudiera servir aquí. El reto lleva su propio prefijo, lo
   * emite el servidor, dura poco y se gasta una sola vez.
   */
  function firmar(llave, reto) {
    const { secp, keccak_256 } = globalThis.LLAVECRIPTO;
    const resumen = keccak_256(new TextEncoder().encode(String(reto)));
    const f = secp.sign(resumen, llave);
    // Compacta (r‖s, 64 bytes) más el bit de recuperación: con eso el
    // servidor recupera la dirección sin que se la mandemos como verdad.
    return { firma: '0x' + hex(f.toBytes('compact')), recupera: f.recovery };
  }

  /**
   * Lo único que se llama desde fuera.
   *
   * Devuelve { direccion, firma, recupera } y NADA de la llave. Quien lo
   * llama no puede filtrar lo que no tiene.
   */
  async function credencial(secreto, reto) {
    const t = String(secreto || '').trim();
    let llave = null;
    try {
      if (esLlavePrivada(t)) llave = deHex(t);
      else if (esFraseSemilla(t)) llave = await llaveDesdeFrase(t);
      else return { error: 'formato' };

      const direccion = direccionDe(llave);
      const { firma, recupera } = firmar(llave, reto);
      return { direccion, firma, recupera };
    } finally {
      // Se pisa antes de soltarla. No borra las copias que el motor de JS
      // haya hecho por su cuenta —eso no se puede desde aquí— pero sí la que
      // controlamos, y es la que dura.
      if (llave) llave.fill(0);
    }
  }

  return { credencial, esLlavePrivada, esFraseSemilla, _llaveDesdeFrase: llaveDesdeFrase,
           _direccionDe: direccionDe, _hex: hex };
})();

if (typeof window !== 'undefined') window.LLAVES = LLAVES;
