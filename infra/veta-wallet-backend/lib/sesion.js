import jwt from "jsonwebtoken";
import CryptoJS from "crypto-js";

// ─────────────────────────────────────────────────────────────────────────────
// Sesiones, con soporte de DOS secretos durante la rotacion.
//
// POR QUE EXISTE
// `PASS_TOKEN` firma TODAS las sesiones de la billetera y en algun momento de
// este proyecto fue una cadena de siete caracteres. Siete caracteres se prueban
// por fuerza bruta en un rato, y quien lo consiga puede FABRICARSE un token
// valido para cualquier usuario: entrar como quien quiera, sin contraseña.
//
// Cambiarlo de golpe echa a la calle a todo el mundo: cada sesion abierta deja
// de valer en el instante del despliegue, y el token de refresco dura treinta
// dias, asi que no es un tropiezo de un minuto — es todo el que tenga la app
// abierta teniendo que volver a escribir su contraseña, sin aviso.
//
// Por eso va en tres etapas, igual que se hizo con la clave de cifrado en
// `lib/cripto.js`:
//
//   1. Esta. La aplicacion entiende AMBOS secretos: firma siempre con el nuevo
//      y, al verificar, prueba el nuevo y cae al viejo si hace falta. Se pone
//      `PASS_TOKEN` = el nuevo (largo) y `PASS_TOKEN_VIEJO` = el que habia.
//      Nadie se entera de nada: las sesiones viejas siguen valiendo hasta que
//      venzan solas y las nuevas ya nacen firmadas con el secreto bueno.
//   2. Esperar. El token de refresco dura 30 dias: pasado ese plazo no queda
//      ninguna sesion firmada con el viejo.
//   3. Borrar `PASS_TOKEN_VIEJO` de la configuracion. Ahi termina la rotacion.
//
// COMO SE USA
// No hay que tocar ninguna llamada. Los ficheros que antes hacian
// `import jwt from "jsonwebtoken"` ahora importan de aqui, y `jwt.verify(...)`
// y `jwt.sign(...)` siguen escribiendose igual. La unica diferencia es que
// verify reintenta con el secreto viejo cuando el nuevo no cuadra.
//
// LO QUE NO SE REINTENTA
// - Un token VENCIDO esta vencido con cualquier secreto: reintentar solo
//   gastaria tiempo y podria confundir el error que se le devuelve al cliente.
// - `lib/socialAuth.js` verifica los tokens de Apple y Google con SU clave
//   publica, que no es ningun secreto nuestro. Por eso el reintento solo ocurre
//   cuando el secreto recibido es exactamente `PASS_TOKEN`, y ese fichero
//   sigue importando `jsonwebtoken` directamente.
// ─────────────────────────────────────────────────────────────────────────────

const NUEVO = process.env.PASS_TOKEN;
const VIEJO = process.env.PASS_TOKEN_VIEJO;

/** Errores que no dependen de la firma: reintentar con otro secreto no cambia nada. */
const NO_ES_LA_FIRMA = new Set(["TokenExpiredError", "NotBeforeError"]);

/**
 * Igual que `jwt.verify`, pero si el secreto es el nuestro y la firma no
 * cuadra, lo reintenta con el secreto anterior.
 */
export function verify(token, secreto, opciones) {
  try {
    return jwt.verify(token, secreto, opciones);
  } catch (error) {
    const nuestro = Boolean(NUEVO) && secreto === NUEVO;
    if (!VIEJO || !nuestro || NO_ES_LA_FIRMA.has(error && error.name)) throw error;
    return jwt.verify(token, VIEJO, opciones);
  }
}

/**
 * Descifra un dato guardado en la base que se cifro con `PASS_TOKEN`,
 * probando el secreto nuevo y despues el viejo.
 *
 * @returns el texto en claro, o "" si ninguno sirvio.
 */
export function descifrarConToken(cifrado) {
  if (!cifrado) return "";
  for (const clave of [NUEVO, VIEJO]) {
    if (!clave) continue;
    try {
      const claro = CryptoJS.AES.decrypt(String(cifrado), clave).toString(
        CryptoJS.enc.Utf8
      );
      if (claro) return claro;
    } catch (e) {
      // Con la clave equivocada el relleno no cuadra: se prueba la siguiente.
    }
  }
  return "";
}

/** Qué secretos hay puestos, para que `/healthz` y el arranque lo publiquen. */
export function estadoRotacion() {
  return {
    largo: NUEVO ? NUEVO.length : 0,
    quedaElViejo: Boolean(VIEJO),
  };
}

export const sign = jwt.sign;
export const decode = jwt.decode;

// Se exporta con la misma forma que `jsonwebtoken` para que las 44 llamadas
// que ya existen no cambien ni una letra.
export default { ...jwt, verify, sign, decode };
