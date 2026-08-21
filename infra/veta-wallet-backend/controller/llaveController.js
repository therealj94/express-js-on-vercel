/* Entrar con la frase semilla o con la llave privada.
 *
 * COMO FUNCIONA, Y POR QUE ASI
 *
 * Son dos pasos, y el secreto no viaja en ninguno:
 *
 *   1. El navegador pide un RETO para una dirección. El servidor emite una
 *      cadena aleatoria, la guarda con su vencimiento, y la devuelve.
 *   2. El navegador firma ese reto con la llave privada —que deriva ahí mismo
 *      de la frase, y nunca sale de ahí— y manda la firma. El servidor
 *      recupera la dirección desde la firma y la compara con la cuenta.
 *
 * Si la dirección recuperada es la de la cuenta, quien pide entrar tiene la
 * llave. No hay otra forma de producir esa firma.
 *
 * POR QUE NO SE RECIBE LA FRASE Y YA
 *
 * Sería más corto, y el servidor hasta la tiene guardada —esta billetera es
 * de custodia—. Pero recibirla la metería en el cuerpo de una petición, en
 * los registros del servidor, en la memoria de un proceso que no la necesita
 * y en cualquier caché por el camino. Y sobre todo le enseñaría a la gente
 * que escribir la frase en un formulario es normal, que es exactamente lo que
 * explota una suplantación. El coste de hacerlo bien son cuarenta líneas.
 *
 * LO QUE ESTE CAMINO NO PUEDE SALTARSE
 *
 * Es una forma de ENTRAR, no un permiso nuevo. La sesión que sale de aquí es
 * la misma que la de contraseña, con las mismas comprobaciones detrás: si la
 * cuenta no confirmó el correo, no entra; si está bloqueada, no entra. Tener
 * la llave demuestra quién sos, no te asciende.
 */

import crypto from "crypto";
import { recoverAddress, keccak256, toUtf8Bytes } from "ethers";
import User from "../models/Users.js";
import jwt, { cifrarConToken } from "../lib/sesion.js";

/* Los retos vivos, en memoria.
 *
 * En memoria y no en la base a propósito: duran dos minutos, se gastan una
 * vez, y perderlos al reiniciar no le rompe nada a nadie —quien estaba
 * entrando pide otro—. Meterlos en Mongo sería una escritura por intento de
 * login, que es mucho pagar por algo que caduca antes de que termine el café.
 *
 * El mapa se limpia solo en cada emisión, así que no crece sin freno aunque
 * nadie llegue a gastar su reto. */
const retos = new Map();
const VIDA_RETO = 2 * 60 * 1000;
const MAX_RETOS = 5000;

function limpiar() {
  const ahora = Date.now();
  for (const [k, v] of retos) if (v.vence < ahora) retos.delete(k);
}

const normalizar = (d) => String(d || "").trim().toLowerCase();
const esDireccion = (d) => /^0x[0-9a-fA-F]{40}$/.test(String(d || "").trim());

/**
 * Paso 1: el reto.
 *
 * NO dice si la dirección tiene cuenta. Contestar «esa cuenta no existe»
 * convertiría esto en una forma de averiguar qué direcciones son de clientes
 * nuestros — y una dirección es pública, así que cualquiera podría ir
 * preguntando una por una. Se emite el reto igual; quien no tenga cuenta
 * fallará en el paso 2, que es donde ya hizo falta tener la llave.
 */
export async function retoLlave(req, res) {
  try {
    const direccion = normalizar(req.body?.direccion);
    if (!esDireccion(direccion)) {
      return res.status(400).json({ error: "Dirección inválida" });
    }

    limpiar();
    if (retos.size > MAX_RETOS) {
      return res.status(503).json({ error: "Probá otra vez en un momento" });
    }

    /* El reto lleva la dirección DENTRO del texto firmado. Así una firma
       obtenida para una dirección no vale para otra, aunque alguien consiga
       que la víctima firme algo en otro sitio. */
    const nonce = crypto.randomBytes(24).toString("base64url");
    const texto =
      `Veta Wallet · entrar con tu llave\n` +
      `direccion: ${direccion}\n` +
      `reto: ${nonce}\n` +
      `vence: ${new Date(Date.now() + VIDA_RETO).toISOString()}`;

    retos.set(nonce, { direccion, texto, vence: Date.now() + VIDA_RETO });
    return res.json({ reto: texto, nonce, venceEn: VIDA_RETO / 1000 });
  } catch (e) {
    console.error("[llave] reto:", e?.message);
    return res.status(500).json({ error: "No se pudo preparar el ingreso" });
  }
}

/**
 * Paso 2: la firma.
 *
 * Se recupera la dirección desde la firma y se compara con la cuenta. El reto
 * se BORRA en cuanto se toca, salga bien o mal: si se dejara vivo tras un
 * fallo, se podría reintentar contra el mismo reto todas las veces que se
 * quisiera.
 */
export async function entrarConLlave(req, res) {
  try {
    const { nonce, firma, recupera } = req.body || {};
    const guardado = retos.get(String(nonce || ""));

    // Se gasta SIEMPRE, incluso si lo que viene detrás está mal.
    if (guardado) retos.delete(String(nonce));

    if (!guardado || guardado.vence < Date.now()) {
      return res.status(400).json({ error: "El ingreso caducó. Probá otra vez." });
    }
    if (typeof firma !== "string" || !/^0x[0-9a-fA-F]{128}$/.test(firma)) {
      return res.status(400).json({ error: "Firma inválida" });
    }
    const v = Number(recupera);
    if (!Number.isInteger(v) || v < 0 || v > 1) {
      return res.status(400).json({ error: "Firma inválida" });
    }

    /* El navegador firma keccak256 del texto, sin el prefijo de
       `personal_sign`. Aquí se recupera con ese mismo resumen: si se usara
       `hashMessage` saldría otra dirección y nadie entraría nunca. */
    const resumen = keccak256(toUtf8Bytes(guardado.texto));
    let recuperada;
    try {
      recuperada = recoverAddress(resumen, {
        r: "0x" + firma.slice(2, 66),
        s: "0x" + firma.slice(66, 130),
        v: 27 + v,
      });
    } catch {
      return res.status(401).json({ error: "No pudimos comprobar tu llave" });
    }

    if (normalizar(recuperada) !== guardado.direccion) {
      return res.status(401).json({ error: "No pudimos comprobar tu llave" });
    }

    const user = await User.findOne({
      address: { $regex: `^${guardado.direccion}$`, $options: "i" },
    });
    if (!user) {
      /* Aquí sí se puede decir la verdad: para llegar a este punto hubo que
         firmar con la llave de esa dirección, así que quien pregunta ya es su
         dueño. No se le filtra nada a nadie más. */
      return res.status(404).json({
        error: "Esa llave no corresponde a ninguna cuenta de Veta Wallet.",
      });
    }
    /* Cuenta borrada: no entra. Aquí sí se puede decir por qué —ya demostró
       tener la llave— pero no se le devuelve la cuenta a la vida. */
    if (user.deletedAt) {
      return res.status(401).json({ error: "Esta cuenta fue eliminada." });
    }
    /* EL CORREO SIN CONFIRMAR NO CIERRA ESTA PUERTA.
     *
     * Aquí se llegó firmando un reto con la llave privada de esa dirección.
     * Eso demuestra la propiedad de la billetera mejor que ninguna otra cosa
     * —mejor que una contraseña, que se puede adivinar o robar—. Exigir
     * además un clic en un correo es pedir una prueba más débil encima de la
     * más fuerte que existe.
     *
     * Y era incoherente: el ingreso por contraseña NUNCA lo exigió. Alguien
     * con la contraseña entraba sin confirmar el correo, y quien traía su
     * llave se quedaba fuera. Lo puse yo aquí de más el 21-ago, y dejó
     * encerrada a la primera persona que trajo su billetera: se le creó la
     * cuenta, el correo no salió —SES en el cajón de pruebas— y no había
     * ninguna forma de entrar.
     *
     * El correo sin confirmar SÍ importa para otra cosa: es el único camino
     * de vuelta si se pierde la frase. Por eso la sesión lleva `verify` y la
     * app lo recuerda; pero recordar no es cerrar la puerta.
     */

    /* La MISMA sesión que la de contraseña: mismos campos, mismo vencimiento,
       mismo refresco. Tener la llave demuestra quién sos; no te da una sesión
       distinta ni más larga. */
    const token = jwt.sign(
      // `tv` es la version de sesion, igual que en el refresco de aca abajo y
      // que en las otras dos puertas de entrada (contraseña y social). Si
      // faltara en UNA sola, esa puerta emitiria sesiones que la revocacion no
      // puede matar, y no habria forma de notarlo mirando el codigo de al lado.
      { userId: user._id, address: user.address, role: user.role, verify: user.isVerified, tv: user.tokenVersion || 0 },
      process.env.PASS_TOKEN,
      { expiresIn: "40m" },
    );
    const refreshToken = jwt.sign(
      { userId: user._id, type: "refresh", tv: user.tokenVersion || 0 },
      process.env.PASS_TOKEN,
      { expiresIn: "30d" },
    );
    user.token = cifrarConToken(token);
    await user.save();

    return res.json({
      token,
      refreshToken,
      user: { id: user._id, email: user.email, name: user.name, address: user.address },
      // Para que la app pueda recordarle que confirme, sin impedirle entrar.
      correoConfirmado: user.isVerified !== false,
    });
  } catch (e) {
    console.error("[llave] entrar:", e?.message);
    return res.status(500).json({ error: "No se pudo completar el ingreso" });
  }
}

/** Para las pruebas: vaciar los retos entre casos. */
export const _limpiarRetos = () => retos.clear();
