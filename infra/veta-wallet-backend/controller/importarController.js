/* Traer una billetera creada en otra parte.
 *
 * QUE ES ESTO, Y QUE NO ES
 *
 * Es el alta de una cuenta cuya llave NO la generamos nosotros: la trae su
 * dueño desde MetaMask, Trust o donde sea. A partir de ahí es una cuenta como
 * cualquier otra —correo, contraseña, confirmación, Genesis ID, tarjeta— con
 * una sola diferencia: la llave existía antes y existe también fuera de aquí.
 *
 * POR QUE LA LLAVE VIAJA, SI EN /auth/entrar-con-llave NO
 *
 * Porque son dos cosas distintas. Para ENTRAR basta demostrar que se tiene la
 * llave, y eso se hace firmando un reto sin enseñarla. Para IMPORTAR hay que
 * poder USARLA: Veta Wallet firma las transacciones en el servidor
 * —`transactionController` descifra la llave privada para enviar—, así que
 * una billetera traída de afuera solo sirve de verdad si el servidor la
 * tiene. No hay forma de importar a una billetera de custodia y a la vez
 * prometer que la llave no sale del teléfono.
 *
 * Eso NO se disimula: la pantalla lo dice con estas palabras antes de que
 * nadie escriba nada, y dice también que quien no quiera eso debe quedarse en
 * su billetera de siempre. Una promesa rota en silencio vale menos que una
 * limitación dicha en voz alta.
 *
 * LO QUE SE COMPRUEBA ANTES DE GUARDAR NADA
 *
 *   · Que la llave es una llave: 32 bytes en hexadecimal.
 *   · Que la dirección que dice el navegador es LA QUE SALE de esa llave. Si
 *     no cuadra, algo está mal en el camino y no se guarda.
 *   · Que esa dirección no tiene ya cuenta aquí. Si la tiene, se dice, y su
 *     dueño entra con la frase por /auth/entrar-con-llave en vez de abrir una
 *     segunda cuenta sobre el mismo dinero.
 *   · Que el correo está libre. El índice único de la base es lo que de
 *     verdad lo impide; esta comprobación solo da un mensaje entendible.
 */

import bcrypt from "bcrypt";
import { computeAddress } from "ethers";
import { v4 as uuidv4 } from "uuid";
import User from "../models/Users";
import { cifrar } from "../lib/cripto";
import { enviarCorreo, marco, botonCorreo } from "../lib/correo";

const esLlave = (t) => /^0x[0-9a-fA-F]{64}$/.test(String(t || ""));
const normalizar = (d) => String(d || "").trim().toLowerCase();

export async function importarBilletera(req, res) {
  try {
    const { email, password, name, llavePrivada, direccion } = req.body || {};

    if (!email || !password || !llavePrivada || !direccion) {
      return res.status(400).json({ message: "Faltan datos para traer la billetera" });
    }
    if (String(password).length < 8) {
      return res.status(400).json({ message: "La contraseña debe tener al menos 8 caracteres" });
    }
    if (!esLlave(llavePrivada)) {
      return res.status(400).json({ message: "Esa no es una llave privada válida" });
    }

    /* La dirección NO se cree por venir en la petición: se recalcula desde la
       llave. Si no cuadran, o el navegador tiene un fallo o alguien está
       intentando atar una llave a una dirección que no es suya — en los dos
       casos, no se guarda. */
    let salida;
    try {
      salida = normalizar(computeAddress(llavePrivada));
    } catch {
      return res.status(400).json({ message: "Esa no es una llave privada válida" });
    }
    if (salida !== normalizar(direccion)) {
      return res.status(400).json({
        message: "La llave y la dirección no coinciden. Volvé a intentarlo desde la app.",
      });
    }

    const correo = normalizar(email);

    const yaEstaLaBilletera = await User.findOne({
      address: { $regex: `^${salida}$`, $options: "i" },
    }).select("_id");
    if (yaEstaLaBilletera) {
      return res.status(409).json({
        message: "Esa billetera ya tiene cuenta en Veta Wallet. Entrá con tu frase semilla desde la pantalla de acceso.",
        motivo: "billetera-existente",
      });
    }

    const yaEstaElCorreo = await User.findOne({ email: correo }).select("_id");
    if (yaEstaElCorreo) {
      return res.status(409).json({ message: "Ya hay una cuenta con ese correo" });
    }

    const verificationToken = uuidv4();
    let user;
    try {
      user = await User.create({
        email: correo,
        user: correo,
        username: correo,
        name: typeof name === "string" ? name.trim().slice(0, 120) : "",
        password: await bcrypt.hash(String(password), 10),
        address: salida,
        privateKey: cifrar(llavePrivada),
        /* El campo `seed` se OMITE, no se pone en null.
           La frase de su dueño manda sobre TODAS las cuentas de esa frase y
           no solo sobre la que trajo: guardarla nos daría mando sobre
           billeteras que nadie nos entregó. Y omitir no es lo mismo que
           null — el índice disperso deja fuera lo que no existe, no lo que
           vale null, y escribir null haría chocar la segunda importación con
           la primera. */
        importada: true,
        private: false,
        role: "user",
        isVerified: false,
        verificationToken,
      });
    } catch (e) {
      /* El índice único es lo que de verdad decide, y gana la carrera que las
         comprobaciones de arriba pierden cuando llegan dos peticiones juntas. */
      if (e?.code === 11000) {
        const cual = Object.keys(e.keyPattern || {})[0];
        return res.status(409).json({
          message: cual === "address"
            ? "Esa billetera ya tiene cuenta en Veta Wallet."
            : "Ya hay una cuenta con ese correo",
        });
      }
      throw e;
    }

    const enlace = `${process.env.API_PUBLICA || "https://vetawallet-1a2e38ac52b1.herokuapp.com"}/auth/verifyMail?token=${verificationToken}`;
    const r = await enviarCorreo({
      para: correo,
      asunto: "Confirmá tu cuenta de Veta Wallet",
      texto: `Trajiste tu billetera a Veta Wallet.\n\nConfirmá tu correo para terminar: ${enlace}\n\n` +
        `La dirección que trajiste es ${salida}.\n\n` +
        `Si no fuiste vos, no hace falta que hagas nada: sin confirmar, el enlace caduca solo.`,
      html: marco("Confirmá tu cuenta", `
        <p style="margin:0 0 12px;">Trajiste tu billetera a Veta Wallet. Confirmá tu correo para terminar.</p>
        ${botonCorreo("Confirmar mi correo", enlace)}
        <p style="margin:0 0 10px;font-size:13px;">La dirección que trajiste es
          <span style="font-family:ui-monospace,monospace;color:#F3ECD9;">${salida}</span>.</p>
        <p style="margin:12px 0 0;font-size:13px;">Si no fuiste vos, no hace falta que hagas nada: sin confirmar, el enlace caduca solo.</p>`),
    });
    if (!r?.ok) console.error("[importar] el correo de confirmación no salió:", r?.motivo);

    return res.status(201).json({
      message: "Billetera traída. Confirmá tu correo para entrar.",
      address: salida,
      correoEnviado: Boolean(r?.ok),
    });
  } catch (e) {
    console.error("[importar]", e?.message);
    return res.status(500).json({ message: "No se pudo traer la billetera" });
  }
}
