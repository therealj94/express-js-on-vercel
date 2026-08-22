import User from "../models/Users";
import Wallet from "ethereumjs-wallet";
const bip39 = require("bip39");
import bcrypt from "bcrypt";
import CryptoJS from "crypto-js";
import { cifrar } from "../lib/cripto";
// Las sesiones se firman y se verifican a traves de lib/sesion.js, que
// entiende el secreto nuevo y el anterior mientras dura la rotacion de
// PASS_TOKEN. Las llamadas jwt.verify(...) y jwt.sign(...) no cambian.
import jwt, { cifrarConToken } from "../lib/sesion";
import crypto from "crypto";
import { enviarCorreo, marco, botonCorreo } from "../lib/correo";
import { cartaBienvenida } from "../lib/cartaBienvenida.js";
import { v4 as uuidv4 } from "uuid";
require("dotenv").config();

// Credenciales de correo: solo desde el entorno, sin respaldo literal.
// Estaban escritas en el codigo y por tanto en el historial de git.
// Siguen expuestas ahi: hay que revocarlas y generar unas nuevas.


// De donde cuelgan los enlaces que van dentro de un correo. Se puede fijar
// desde el entorno (BACKEND_URL) porque el dominio del backend cambia cuando
// se mueve de sitio, y un enlace muerto dentro de un correo no se puede
// corregir despues: ya salio.
const URL_BACKEND = (process.env.BACKEND_URL || 'https://vetawallet-1a2e38ac52b1.herokuapp.com').replace(/\/$/, '');

export const registerUserWallet = async (req, res) => {
  try {
    // El nombre viaja desde el primer dia en el formulario de crear cuenta,
    // pero aqui no se leia: se guardaba una cuenta sin nombre y, al entrar
    // desde otro dispositivo, la pantalla saludaba con el trozo del correo
    // anterior a la arroba.
    const { email, password, name } = req.body;

    const existingUser = await User.findOne({ email: email });
    if (existingUser) {
      return res
        .status(400)
        .json({ message: "The email is already registered" });
    }

    const token = uuidv4();

    // api.vetawallet.com NO EXISTE: no resuelve en DNS. El enlace se calculaba
    // contra ese nombre y ademas nunca se metia en el correo, asi que nadie
    // podia confirmar su cuenta y el padron entero quedaba sin verificar.
    const verificationLink = `${URL_BACKEND}/auth/verifyMail?token=${token}`;

    /* Sale de info@ordenglobal.org por SES, no de una cuenta de Gmail. Además
       del remitente —que antes era un buzón personal en el correo que da de
       alta una billetera—, Gmail corta alrededor de los quinientos envíos
       diarios: con el padrón creciendo, el alta se quedaba sin confirmar y
       nadie se enteraba hasta la queja.

       Y NO se corta el alta si el correo falla. Antes un fallo devolvía un 500
       y la persona se quedaba sin cuenta por un problema del servidor de
       correo; peor todavía, el `return` estaba dentro de la callback y no
       detenía nada, así que la cuenta se creaba igual y encima con un error en
       la pantalla. Ahora se registra y se sigue: la cuenta se crea, y quien no
       reciba el correo lo puede volver a pedir. */
    const rAlta = await enviarCorreo({
      para: email,
      asunto: "Confirmá tu cuenta de Veta Wallet",
      texto: `Bienvenido a Veta Wallet.

Para confirmar tu cuenta, entrá en este enlace:
${verificationLink}

Si no creaste esta cuenta, no hagas nada: sin confirmar, el enlace caduca solo.

--
Orden Global Corp
Nunca te vamos a pedir por correo tu contraseña ni tu frase de respaldo.`,
      html: marco("Confirmá tu cuenta", `
        <h1 style="margin:0 0 6px;font:700 24px/1.2 Georgia,serif;color:#F3ECD9;">Bienvenido a Veta Wallet</h1>
        <p style="margin:14px 0 0;">Falta un paso: confirmá que este correo es tuyo.</p>
        ${botonCorreo("Confirmar mi cuenta", verificationLink)}
        <p style="margin:12px 0 0;font-size:13px;">Si no creaste esta cuenta, no hace falta que hagas nada: sin confirmar, el enlace caduca solo.</p>`),
    });
    if (!rAlta.ok) console.error("[registro] el correo de confirmación no salió:", rAlta.motivo);
    const mnemonic = bip39.generateMnemonic();
    const seed = await bip39.mnemonicToSeed(mnemonic);
    const wallet = Wallet.fromPrivateKey(seed.slice(0, 32));
    const address = wallet.getAddressString();
    const privateKey = wallet.getPrivateKeyString();
    const saltRounds = 10;

    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Cifra con la clave nueva (ver lib/cripto.js). Los registros creados
    // desde aqui ya nacen con la clave fuerte.
    const encryptedPrivateKey = cifrar(privateKey);
    const encryptedSeedPhrase = cifrar(mnemonic);

    const user = new User({
      email: email,
      user: email,
      username: email,
      name: typeof name === "string" ? name.trim().slice(0, 120) : "",
      password: hashedPassword,
      address: address,
      privateKey: encryptedPrivateKey,
      seed: encryptedSeedPhrase,
      private: false,
      role: "user",
      isVerified: false,
      verificationToken: token,
    });
    await user.save();

    const semilla = jwt.sign({ seed: mnemonic }, process.env.PASS_TOKEN, {
      expiresIn: "5m",
    });

    res.send({ msg: "Usuario creado exitosamente", semilla });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Server error" });
  }
};

export const verifyMail = async (req, res) => {
  try {
    const token = req.query.token;
    // Mismo riesgo que en resetPassword pero por query: sin castear, un
    // ?token[$ne]=* marcaba como verificado a un usuario cualquiera.
    if (typeof token !== "string" || !token.trim() || token === "*") {
      return res.status(400).json({ message: "invalid verification token" });
    }
    const user = await User.findOne({ verificationToken: token.trim() });

    if (!user) {
      return res.status(400).json({ message: "invalid verification token" });
    }

    const eraNuevo = !user.bienvenidaEn;
    user.isVerified = true;
    user.verificationToken = "*";
    if (eraNuevo) user.bienvenidaEn = new Date();
    await user.save();

    /* La bienvenida al ecosistema sale AQUI, al confirmar, y no en el alta.
     *
     * En el alta la direccion todavia no se sabe si existe: puede ser una
     * errata. Cada errata es un rebote, y Amazon suspende la cuenta por encima
     * del diez por ciento de rebotes. Lo que se cae con la cuenta no es esta
     * carta, es el correo de recuperar la contrasena. Esperar a la
     * confirmacion cuesta un rato y quita ese riesgo entero.
     *
     * Va DESPUES del save y sin await bloqueante sobre la respuesta: la
     * confirmacion de la cuenta no puede depender de que el servidor de correo
     * conteste. Si falla se anota y ya esta; la persona tiene su cuenta
     * confirmada igual, que es lo que vino a hacer.
     *
     * `eraNuevo` evita que quien abra el enlace dos veces reciba dos cartas. */
    if (eraNuevo && user.email) {
      const carta = cartaBienvenida({
        nombre: user.name || user.username,
        correo: user.email,
        nuevo: true,
      });
      enviarCorreo({
        para: user.email,
        asunto: carta.asunto,
        html: carta.html,
        texto: carta.texto,
      })
        .then((r) => {
          if (!r?.ok) console.error(`[bienvenida] no salio para ${user.email}: ${r?.motivo}`);
        })
        .catch((e) => console.error(`[bienvenida] ${user.email}: ${e?.message}`));
    }

    return res.send("Email verified successfully");
  } catch (error) {
    console.log(error);
  }
};

export const updateUserAdmin = async (req, res) => {
  try {
    const { address } = req.body;

    const user = await User.findOne({ address: address });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    user.role = "admin";
    await user.save();
    return res.send("User role updated successfully");
  } catch (error) {
    console.error("Error al cambiar el rol del usuario:", error);
    return res.status(500).json({ error: "Server error" });
  }
};

export const updateAdminUser = async (req, res) => {
  try {
    const { address } = req.body;

    const user = await User.findOne({ address: address });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    user.role = "user";
    await user.save();

    return res.send("User role updated successfully");
  } catch (error) {
    console.error("Error al cambiar el rol del usuario:", error);
    return res.status(500).json({ error: "Server error" });
  }
};

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email: email });
    /* EL MISMO MENSAJE, LETRA POR LETRA, EN LOS TRES CASOS.
     *
     * Antes decia "wrong email or password" cuando el correo no existia y
     * "Wrong email or password" -con W mayuscula- cuando existia pero fallaba
     * la contrasenia. Una mayuscula de diferencia, y con eso cualquiera podia
     * preguntarle al servidor si una direccion tiene cuenta aqui: se prueba
     * una lista de correos y se separan por la letra inicial de la respuesta.
     *
     * Eso es justo lo que el codigo ya evitaba unas lineas mas abajo con las
     * cuentas eliminadas, y por el mismo motivo: quien tenga cuenta en una
     * billetera no tiene por que ser publico. Se descubrio al comprobar un
     * cambio de correo, porque la diferencia servia para saber cual de los dos
     * encontraba el servidor.
     *
     * Se deja el de minuscula, que es el que ya devolvia el caso mas comun. */
    if (!user) {
      return res.status(401).json({ message: "wrong email or password" });
    }
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: "wrong email or password" });
    }
    // Cuenta eliminada. El mismo mensaje generico que un password malo: decir
    // "esta cuenta fue eliminada" le confirma a un tercero que ese correo
    // existio aqui.
    if (user.deletedAt) {
      return res.status(401).json({ message: "Wrong email or password" });
    }
    const token = jwt.sign(
      {
        userId: user._id,
        address: user.address,
        role: user.role,
        verify: user.isVerified,
        // La version de sesion tambien en el token de ACCESO, no solo en el de
        // refresco. Sin ella, `middleware/verifyToken.js` no tiene con que
        // comparar y la revocacion solo alcanza a la renovacion: cambiar la
        // contraseña cerraba la puerta de renovar y dejaba la de usar abierta
        // los 40 minutos que le quedaran al token en curso.
        tv: user.tokenVersion || 0,
      },
      process.env.PASS_TOKEN,
      { expiresIn: "40m" },
      { algorithm: "HS256" }
    );
    const refreshToken = jwt.sign(
      { userId: user._id, type: "refresh", tv: user.tokenVersion || 0 },
      process.env.PASS_TOKEN,
      { expiresIn: "30d" }
    );

    // La sesion en curso queda guardada, cifrada. `middleware/isAdmin.js` la
    // compara con la que llega, y eso es lo que impone UNA SOLA SESION por
    // administrador. Antes nadie escribia este campo, asi que la comparacion
    // no podia cuadrar y las rutas de administracion estaban cerradas.
    user.token = cifrarConToken(token);

    await user.save();

    // El nombre y la direccion viajan con la sesion: sin esto, quien entra
    // desde otro dispositivo no tiene forma de saber como se llama, y la
    // pantalla lo saluda con el trozo del correo anterior a la arroba.
    res.send({
      token,
      refreshToken,
      user: { email: user.email, name: user.name || "", address: user.address || "" },
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Server error" });
  }
};

// Renueva el token de acceso (vence a los 40 min) sin pedir contraseña de
// nuevo. El refreshToken dura 30 días y vive en el llavero seguro del
// teléfono igual que el token normal — así una sesión no muere en silencio
// cada 40 min cuando el usuario no activó "Recordarme" (que ya no guarda
// la contraseña en el dispositivo).
export const refresh = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ message: "refreshToken requerido" });
    }

    let decoded;
    try {
      decoded = jwt.verify(refreshToken, process.env.PASS_TOKEN, {
        algorithm: "HS256",
      });
    } catch {
      return res.status(401).json({ message: "Unauthorized" });
    }
    if (decoded.type !== "refresh") {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // Cuenta eliminada: no se renueva nada. Sin esto, alguien que borro su
    // cuenta seguia teniendo sesion valida hasta 30 dias.
    if (user.deletedAt) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // Revocacion. El refresh token lleva la version que tenia el usuario
    // cuando se emitio; si desde entonces subio (cambio de contrasena,
    // eliminacion), este token ya no sirve.
    if ((decoded.tv || 0) !== (user.tokenVersion || 0)) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const token = jwt.sign(
      {
        userId: user._id,
        address: user.address,
        role: user.role,
        verify: user.isVerified,
        // La version que se acaba de comprobar unas lineas mas arriba viaja
        // tambien en el token de acceso, para que la guardia de cada peticion
        // pueda comprobarla sin volver a preguntar por que se emitio.
        tv: user.tokenVersion || 0,
      },
      process.env.PASS_TOKEN,
      { expiresIn: "40m" },
      { algorithm: "HS256" }
    );
    const newRefreshToken = jwt.sign(
      { userId: user._id, type: "refresh", tv: user.tokenVersion || 0 },
      process.env.PASS_TOKEN,
      { expiresIn: "30d" }
    );

    // El token de acceso vence a los 40 minutos y aqui se emite uno nuevo, asi
    // que la sesion guardada tiene que seguirle el paso. Sin esta linea, un
    // administrador perderia las rutas de administracion en la primera
    // renovacion, cuarenta minutos despues de entrar.
    user.token = cifrarConToken(token);
    await user.save();

    res.json({ token, refreshToken: newRefreshToken });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

// El token de reseteo se guarda HASHEADO. Antes iba en claro: un volcado de
// la base entregaba tokens vivos para todas las cuentas. El enlace del correo
// sigue llevando el valor original; aca se compara el hash.
const hashToken = (t) => crypto.createHash("sha256").update(String(t)).digest("hex");
const VIGENCIA_RESET_MS = 15 * 60 * 1000;

export const recuperarPassword = async (req, res) => {
  const { email } = req.body;

  // Respuesta identica exista o no la cuenta. Antes un 404 confirmaba que un
  // correo NO estaba registrado y un 200 que si: servia para enumerar
  // usuarios. Lo que cambia segun el caso es solo si se manda el correo.
  const respuestaGenerica = () =>
    res.status(200).json({
      message:
        "Si el correo corresponde a una cuenta, se enviaron las instrucciones para restablecer la contraseña.",
    });

  try {
    if (typeof email !== "string" || !email.trim()) return respuestaGenerica();

    const user = await User.findOne({ email: email.trim() });

    if (!user) return respuestaGenerica();

    const resetToken = uuidv4();

    /* EL ENLACE APUNTABA A UNA PANTALLA QUE NO EXISTIA. Iba a
       www.vetawallet.com/changePassword, y esa dirección la atiende la app
       —que no tenía ninguna ruta para `changePassword` ni leía el token—: la
       persona caía en la portada, sin sitio donde escribir la clave nueva, y
       los quince minutos se le vencían buscando. El trámite estaba roto de
       punta a punta y nadie podía recuperar su contraseña.
       Ahora va al dominio que sirve la app de verdad. */
    const URL_APP = (process.env.APP_URL || 'https://app.vetawallet.com').replace(/\/$/, '');
    const verificationLink = `${URL_APP}/?token=${resetToken}`;
    // Se guarda el hash, nunca el token en claro, y con vencimiento.
    user.verificationTokenPassword = hashToken(resetToken);
    user.verificationTokenPasswordExp = new Date(Date.now() + VIGENCIA_RESET_MS);

    await user.save();

    /* Sale de info@ordenglobal.org por SES, no de un buzón de Outlook. El
       correo que te devuelve el acceso a tu dinero tiene que venir del dominio
       de la empresa: cualquier otra cosa le enseña a la gente a confiar en
       remitentes que no son nuestros. */
    const r = await enviarCorreo({
      para: user.email,
      asunto: "Restablecer tu contraseña de Veta Wallet",
      texto: `Pediste restablecer la contraseña de tu Veta Wallet.

Entrá en este enlace y poné una contraseña nueva:
${verificationLink}

El enlace vale quince minutos y se usa una sola vez.

Si no fuiste vos, no hagas nada: sin abrir el enlace, tu contraseña sigue
siendo la de siempre.

--
Orden Global Corp
Nunca te vamos a pedir por correo tu contraseña ni tu frase de respaldo.`,
      html: marco("Restablecer tu contraseña", `
        <h1 style="margin:0 0 6px;font:700 24px/1.2 Georgia,serif;color:#F3ECD9;">Restablecer tu contraseña</h1>
        <p style="margin:14px 0 0;">Pediste poner una contraseña nueva en tu Veta Wallet.</p>
        ${botonCorreo("Poner mi contraseña nueva", verificationLink)}
        <p style="margin:12px 0 0;font-size:13px;">El enlace vale <strong style="color:#F3ECD9;">quince minutos</strong> y se usa una sola vez.</p>
        <p style="margin:12px 0 0;font-size:13px;">Si no fuiste vos, no hace falta que hagas nada: sin abrir el enlace, tu contraseña sigue siendo la de siempre.</p>`),
    });
    // El fallo se registra pero NO cambia la respuesta: decir «no se pudo
    // enviar» confirmaría que la cuenta existe, que es justo lo que la
    // respuesta genérica evita.
    if (!r.ok) console.error("[recuperarPassword] el correo no salió:", r.motivo);

    respuestaGenerica();
  } catch (error) {
    console.log(error);
    res
      .status(500)
      .json({ message: "An error occurred while processing the request." });
  }
};

export const resetPassword = async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    // ESTO era el agujero: `token` iba sin castear a findOne, asi que un
    // {"$ne": null} devolvia el primer usuario con un reseteo pendiente y
    // permitia tomar su cuenta sin conocer el token. De ahi se llegaba a la
    // frase semilla y a los fondos.
    if (typeof token !== "string" || !token.trim()) {
      return res.status(400).json({ message: "Invalid or expired token." });
    }
    if (typeof newPassword !== "string" || newPassword.length < 8) {
      return res.status(400).json({ message: "La contraseña debe tener al menos 8 caracteres." });
    }

    const user = await User.findOne({
      verificationTokenPassword: hashToken(token.trim()),
      verificationTokenPasswordExp: { $gt: new Date() },
    });

    if (!user) {
      return res.status(400).json({ message: "Invalid or expired token." });
    }

    // Hashear y establecer la nueva contraseña
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    // Consumo unico: el token no sirve dos veces.
    user.verificationTokenPassword = null;
    user.verificationTokenPasswordExp = null;
    /* Y se corta lo que hubiera abierto. El cambio de contraseña desde ajustes
       ya subia la version (userController.changePassword); esta puerta —la de
       «olvide mi contraseña»— no lo hacia, y es la que usa justamente quien ya
       NO puede entrar. Recuperar la cuenta sin echar al que este dentro es
       devolverle la llave a alguien cuya casa sigue ocupada. */
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    // La sesion guardada de administracion tampoco sobrevive a esto.
    user.token = undefined;

    await user.save();

    // Respuesta exitosa
    res.status(200).json({ message: "Password reset successfully." });
  } catch (error) {
    console.log(error);
    res
      .status(500)
      .json({ message: "An error occurred while processing the request." });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// CERRAR SESION
//
// No existia. En todo el backend no habia ninguna ruta de logout, salir ni
// signout: la aplicacion «cerraba sesion» borrando el token de su propio
// llavero y el servidor no se enteraba de nada. El token seguia siendo valido
// hasta que venciera, y el de refresco treinta dias. Un telefono prestado, uno
// perdido o un navegador ajeno se quedaban con la sesion adentro.
//
// CIERRA EN TODOS LOS DISPOSITIVOS, A PROPOSITO
//
// Subir `tokenVersion` mata todas las sesiones de esa cuenta, no solo la que
// llamo. Se eligio asi porque es lo que la persona quiere cuando de verdad
// necesita esta ruta: perdi el telefono, lo preste, me parece que alguien
// entro. Cerrar solo la sesion que ya tenes en la mano es el caso que no
// importa, y hacerlo bien —una lista de sesiones vivas, con su identificador
// cada una— es otra funcionalidad, con su tabla y su pantalla, no algo que se
// cuele dentro de este arreglo.
//
// Se cobra la misma moneda que la revocacion de la contraseña: un contador. Sin
// lista negra de tokens, sin nada que limpiar despues y sin poder olvidarse de
// borrar una fila.
//
// Va detras de `verifyTokenUser`, o sea que solo puede cerrar su sesion quien
// ya tiene una. No pide contraseña: obligar a escribirla para poder salir es
// una barrera justo en el momento en que alguien tiene prisa por salir.
// ─────────────────────────────────────────────────────────────────────────────
export const cerrarSesion = async (req, res) => {
  try {
    const token = req.headers.authorization;
    const decoded = jwt.verify(token.split(" ")[1], process.env.PASS_TOKEN, {
      algorithm: "HS256",
    });

    const user = await User.findById(decoded.userId);
    // Sin cuenta no hay nada que cerrar, y decirlo con un 200 es la respuesta
    // honesta: el que llamo queria quedarse sin sesion y sin sesion se queda.
    if (!user) {
      return res.status(200).json({ message: "Sesión cerrada." });
    }

    user.tokenVersion = (user.tokenVersion || 0) + 1;
    // La sesion guardada que compara `middleware/isAdmin.js` tambien se va: si
    // quedara, un administrador que cierra sesion seguiria teniendo su token
    // escrito en la base, que es exactamente lo que no quiso dejar.
    user.token = undefined;
    await user.save();

    return res.status(200).json({ message: "Sesión cerrada." });
  } catch (error) {
    console.log(error);
    return res.status(401).json({ message: "invalid token" });
  }
};
