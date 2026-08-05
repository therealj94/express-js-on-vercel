import CryptoJS from "crypto-js";

// ─────────────────────────────────────────────────────────────────────────────
// Cifrado de llaves privadas y frases semilla, con soporte de DOS claves.
//
// POR QUE EXISTE
// `PASS_ADM` tenia 7 caracteres. Esa clave cifra la llave privada y la frase
// semilla de cada usuario, y esos datos son lo unico que permite mover sus
// fondos: no hay otra copia. Siete caracteres se rompen por fuerza bruta, asi
// que quien consiguiera un volcado de la base podia vaciar todas las cuentas.
//
// Rotarla de golpe era peligroso: si la migracion se cortaba a la mitad, o si
// alguien se registraba mientras corria, quedaban registros cifrados con una
// clave y una aplicacion configurada con la otra — y esos usuarios perdian el
// acceso a sus fondos de forma irreversible.
//
// Por eso el cambio va en dos etapas. Esta es la primera: la aplicacion pasa a
// entender AMBAS claves. Cifra siempre con la nueva, y al descifrar prueba
// primero la nueva y cae a la vieja si hace falta. Con eso, registros viejos y
// nuevos conviven sin problema, la migracion puede correr sin ventana de
// mantenimiento, y si se interrumpe no rompe nada: lo que falte sigue
// funcionando con la clave vieja.
//
// La segunda etapa es recifrar los registros. La tercera, borrar la clave
// vieja de la configuracion cuando no quede ninguno.
//
// SOBRE LA VERIFICACION POR FORMATO
// Descifrar con la clave equivocada normalmente falla (el relleno PKCS7 no
// cuadra, o el resultado no es UTF-8 valido), pero no esta garantizado: con
// baja probabilidad puede devolver basura que parezca valida. Si eso pasara al
// probar la clave nueva, se devolveria basura en vez de caer a la vieja.
//
// Se evita comprobando el formato de lo que sale. Ambos datos tienen una forma
// estricta, y se verifico contra los 403 registros reales que TODOS la cumplen:
// 402 llaves privadas con `0x` + 64 hexadecimales y 402 semillas de exactamente
// 12 palabras en minusculas. (El registro 403 esta corrupto desde antes: no se
// descifra ni con la clave actual.)
// ─────────────────────────────────────────────────────────────────────────────

const CLAVE_NUEVA = process.env.PASS_ADM_NUEVA;
const CLAVE_VIEJA = process.env.PASS_ADM;

/** Una llave privada de Ethereum: 0x + 64 caracteres hexadecimales. */
export const esLlavePrivada = (t) => /^0x[0-9a-fA-F]{64}$/.test(String(t || ""));

/** Una frase semilla BIP39: 12 o 24 palabras en minusculas. */
export const esFraseSemilla = (t) => {
  const p = String(t || "").trim().split(/\s+/);
  return (p.length === 12 || p.length === 24) && p.every((w) => /^[a-z]+$/.test(w));
};

/**
 * Cifra con la clave nueva. Si todavia no esta configurada, usa la vieja para
 * que la aplicacion siga funcionando en vez de romper los registros nuevos.
 */
export function cifrar(texto) {
  const clave = CLAVE_NUEVA || CLAVE_VIEJA;
  if (!clave) throw new Error("No hay ninguna clave de cifrado configurada");
  return CryptoJS.AES.encrypt(String(texto), clave).toString();
}

/**
 * Descifra probando la clave nueva y despues la vieja.
 *
 * @param cifrado  el texto cifrado guardado en la base
 * @param validar  funcion opcional que comprueba la forma del resultado; si no
 *                 cuadra, se considera que esa clave no era la correcta y se
 *                 sigue con la siguiente
 * @returns el texto en claro, o "" si ninguna clave sirvio
 */
export function descifrar(cifrado, validar) {
  if (!cifrado) return "";
  for (const clave of [CLAVE_NUEVA, CLAVE_VIEJA]) {
    if (!clave) continue;
    try {
      const claro = CryptoJS.AES.decrypt(String(cifrado), clave).toString(CryptoJS.enc.Utf8);
      if (!claro) continue;
      if (validar && !validar(claro)) continue;
      return claro;
    } catch (e) {
      // Clave equivocada: el relleno no cuadra o no es UTF-8. Se prueba la otra.
    }
  }
  return "";
}

/** Atajos con la validacion de formato ya puesta. */
export const descifrarLlavePrivada = (c) => descifrar(c, esLlavePrivada);
export const descifrarFraseSemilla = (c) => descifrar(c, esFraseSemilla);

/** Con que clave esta cifrado un valor. Lo usa el script de migracion. */
export function claveDe(cifrado, validar) {
  const intentos = [["nueva", CLAVE_NUEVA], ["vieja", CLAVE_VIEJA]];
  for (const [nombre, clave] of intentos) {
    if (!clave) continue;
    try {
      const claro = CryptoJS.AES.decrypt(String(cifrado), clave).toString(CryptoJS.enc.Utf8);
      if (claro && (!validar || validar(claro))) return nombre;
    } catch (e) {}
  }
  return null;
}
