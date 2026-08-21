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


  /* ── LA DERIVACION ESTANDAR, PARA TRAER UNA BILLETERA DE AFUERA ──────────
   *
   * MetaMask, Trust y las demas usan BIP-44: m/44'/60'/0'/0/N. Esta casa usa
   * los primeros 32 bytes de la semilla. La MISMA frase da direcciones
   * distintas en cada sitio, y por eso alguien que trae su frase de MetaMask
   * no se reconoce en la direccion que le sale aqui.
   *
   * Para ENTRAR se usa la de la casa —es la unica con la que se crearon las
   * cuentas—. Para TRAER una billetera de afuera se usa la estandar, que es
   * la que da la direccion que su dueño ya conoce y donde estan sus fondos.
   */

  /** La semilla BIP-39 entera (64 bytes), que es lo que pide BIP-32. */
  async function semillaDeFrase(frase) {
    const cod = new TextEncoder();
    const base = await crypto.subtle.importKey(
      'raw', cod.encode(normalizar(frase)), { name: 'PBKDF2' }, false, ['deriveBits'],
    );
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt: cod.encode('mnemonic'), iterations: 2048, hash: 'SHA-512' },
      base, 512,
    );
    return new Uint8Array(bits);
  }

  /** La llave de la cuenta N por la ruta estándar. */
  async function llaveEstandar(frase, indice = 0) {
    const { HDKey } = globalThis.LLAVECRIPTO;
    const raiz = HDKey.fromMasterSeed(await semillaDeFrase(frase));
    const hijo = raiz.derive(`m/44'/60'/0'/0/${indice}`);
    if (!hijo.privateKey) throw new Error('no se pudo derivar');
    return new Uint8Array(hijo.privateKey);
  }

  /**
   * Todas las direcciones que esa frase puede querer decir.
   *
   * Se devuelven las cuatro primeras de la ruta estándar —que es lo que
   * enseña MetaMask cuando alguien tiene varias cuentas en la misma frase— y
   * ademas la de la casa. Quien importa elige mirando el saldo, que es lo
   * unico que de verdad le dice cual es la suya; adivinar por él sería
   * mandarlo a una billetera vacía sin que sepa por qué.
   */
  async function candidatas(secreto) {
    const t = String(secreto || '').trim();
    const fuera = [];

    if (esLlavePrivada(t)) {
      const llave = deHex(t);
      try { fuera.push({ ruta: 'llave privada', indice: 0, direccion: direccionDe(llave) }); }
      finally { llave.fill(0); }
      return fuera;
    }
    if (!esFraseSemilla(t)) return null;

    for (let i = 0; i < 4; i++) {
      const llave = await llaveEstandar(t, i);
      try { fuera.push({ ruta: `m/44'/60'/0'/0/${i}`, indice: i, direccion: direccionDe(llave), estandar: true }); }
      finally { llave.fill(0); }
    }
    const propia = await llaveDesdeFrase(t);
    try { fuera.push({ ruta: 'Veta Wallet', indice: -1, direccion: direccionDe(propia), casa: true }); }
    finally { propia.fill(0); }
    return fuera;
  }

  /**
   * La llave privada elegida, en hexadecimal, para mandarla al servidor.
   *
   * ESTO SI SALE DEL NAVEGADOR, y es la unica funcion de este archivo de la
   * que eso es cierto. No es un descuido: Veta Wallet firma las transacciones
   * en el servidor —descifra la llave para enviar— asi que una billetera
   * traida de afuera solo se puede usar de verdad si el servidor la tiene. Se
   * dice en la pantalla con estas mismas palabras, para que nadie lo importe
   * creyendo otra cosa.
   */
  async function llaveParaImportar(secreto, indice) {
    const t = String(secreto || '').trim();
    if (esLlavePrivada(t)) return t.startsWith('0x') ? t : '0x' + t;
    if (!esFraseSemilla(t)) return null;
    const llave = indice === -1 ? await llaveDesdeFrase(t) : await llaveEstandar(t, indice);
    try { return '0x' + hex(llave); } finally { llave.fill(0); }
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

  return { credencial, candidatas, llaveParaImportar, esLlavePrivada, esFraseSemilla, _llaveDesdeFrase: llaveDesdeFrase,
           _direccionDe: direccionDe, _hex: hex };
})();

if (typeof window !== 'undefined') window.LLAVES = LLAVES;
