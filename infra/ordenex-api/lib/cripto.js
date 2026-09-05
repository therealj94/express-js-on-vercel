// Cifrado de las llaves privadas de las direcciones de deposito.
//
// POR QUE EXISTE
//
// Cada usuario tiene una direccion de deposito propia (la genera el
// portafolio la primera vez) y su llave privada es lo UNICO que permite
// barrer esos fondos a la caliente: no hay otra copia. Esa llave no puede
// vivir en claro en Mongo — un volcado de la base no puede ser un volcado
// de las bovedas — asi que aqui se cifra con AES-256 (crypto-js, el mismo
// esquema que lib/cripto.js de la wallet) usando ORDENEX_ADM, y se descifra
// SOLO en el servidor, solo en el momento de firmar.
//
// A diferencia de la wallet, aqui hay UNA sola clave y no dos: Ordenex nace
// nueva, sin registros heredados que migrar, y la leccion de alla es
// justamente no empezar con una clave debil que despues haya que rotar en
// dos etapas. ORDENEX_ADM se pone larga desde el dia uno.
//
// SOBRE LA VERIFICACION POR FORMATO
//
// Descifrar con la clave equivocada normalmente falla (el relleno PKCS7 no
// cuadra, o el resultado no es UTF-8 valido), pero no esta garantizado: con
// baja probabilidad sale basura que parece texto. Firmar con esa basura
// seria firmar desde una direccion que no es la del usuario. Por eso todo
// descifrado pasa por la forma estricta del dato — una llave privada es
// `0x` + 64 hexadecimales, siempre — y lo que no la cumpla se trata como
// clave equivocada, no como llave.

const CryptoJS = require('crypto-js');

const CLAVE = () => process.env.ORDENEX_ADM;

/** Una llave privada de Ethereum: 0x + 64 caracteres hexadecimales. */
const esLlavePrivada = (t) => /^0x[0-9a-fA-F]{64}$/.test(String(t || ''));

/**
 * La misma llave, escrita como la escribe cualquiera.
 *
 * MetaMask exporta la llave privada SIN el `0x` delante; ethers y este codigo
 * la quieren CON el. El 5 de septiembre eso dejo la casa sin poder entregar
 * ORIGEN, y desde fuera se veia igual que no tener llave: 64 hexadecimales
 * son una llave privada y nada mas, asi que aceptarlos no relaja nada.
 *
 * Se normaliza SOLO lo que viene del entorno o de una persona. Lo que sale
 * descifrado de la base sigue pasando por `esLlavePrivada` tal cual, porque
 * ahi un formato raro no es un dedazo: es una senal de que algo se toco.
 *
 * Devuelve la llave con `0x`, o null si eso no es una llave.
 */
function normalizarLlave(t) {
  const s = String(t == null ? '' : t).trim();
  if (!s) return null;
  const cuerpo = s.startsWith('0x') || s.startsWith('0X') ? s.slice(2) : s;
  if (!/^[0-9a-fA-F]{64}$/.test(cuerpo)) return null;
  return '0x' + cuerpo.toLowerCase();
}

/**
 * Cifra un texto con ORDENEX_ADM. Sin la clave configurada NO se cifra
 * nada: devolver el texto en claro "mientras tanto" es exactamente como una
 * llave termina desnuda en la base, asi que se lanza y quien llama decide
 * que hacer sin la direccion.
 */
function cifrar(texto) {
  const clave = CLAVE();
  if (!clave) {
    const e = new Error('ORDENEX_ADM no esta puesta: no se puede cifrar.');
    e.codigo = 'SIN_CONFIGURAR';
    throw e;
  }
  return CryptoJS.AES.encrypt(String(texto), clave).toString();
}

/**
 * Descifra un blob guardado en la base.
 *
 * @param cifrado  el texto cifrado
 * @param validar  funcion opcional que comprueba la forma del resultado; si
 *                 no cuadra se devuelve "", nunca la basura
 * @returns el texto en claro, o "" si no se pudo (clave ausente, clave
 *          equivocada o formato invalido). Quien recibe "" tiene que
 *          negarse a seguir — jamas adivinar.
 */
function descifrar(cifrado, validar) {
  const clave = CLAVE();
  if (!cifrado || !clave) return '';
  try {
    const claro = CryptoJS.AES.decrypt(String(cifrado), clave).toString(CryptoJS.enc.Utf8);
    if (!claro) return '';
    if (validar && !validar(claro)) return '';
    return claro;
  } catch (e) {
    // Relleno que no cuadra o bytes que no son UTF-8: la clave no era esta.
    return '';
  }
}

/** Atajo con la validacion de formato ya puesta. */
const descifrarLlavePrivada = (c) => descifrar(c, esLlavePrivada);

module.exports = { esLlavePrivada, normalizarLlave, cifrar, descifrar, descifrarLlavePrivada };
