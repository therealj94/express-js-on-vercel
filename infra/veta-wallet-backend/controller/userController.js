import Users from "../models/Users";
import bcrypt from "bcrypt";
import CryptoJS from "crypto-js";
import { descifrarLlavePrivada, descifrarFraseSemilla } from "../lib/cripto";
// Las sesiones se firman y se verifican a traves de lib/sesion.js, que
// entiende el secreto nuevo y el anterior mientras dura la rotacion de
// PASS_TOKEN. Las llamadas jwt.verify(...) y jwt.sign(...) no cambian.
import jwt from "../lib/sesion";
import crypto from "crypto";
import { saldosDe, decidirBorrado } from "../lib/saldos";

// ============================================================
// Vista publica de un usuario.
//
// El documento de Mongo lleva el hash de la contrasena, la clave privada y la
// seed —las tres cifradas, pero cifradas con una clave que vive en el mismo
// servidor—. Devolverlo entero convierte cualquier endpoint tonto (bloquear a
// alguien, cambiar un flag) en una filtracion del material con el que se
// firman transacciones.
//
// Todo lo que salga hacia el cliente pasa por aqui.
// ============================================================
function vistaPublica(user) {
  if (!user) return null;
  return {
    _id: user._id,
    email: user.email,
    address: user.address,
    username: user.username,
    name: user.name,
    phone: user.phone,
    country: user.country,
    private: user.private,
    tokens: user.tokens,
    nfts: user.nfts,
    blocked_users: user.blocked_users,
    role: user.role,
    createdAt: user.createdAt,
  };
}


export const getUserPublic = async (req, res) => {
  try {
    const token = req.headers.authorization;
    const decodedToken = jwt.verify(
      token.split(" ")[1],
      process.env.PASS_TOKEN,
      { algorithms: ["HS256"] }
    );
    const address = decodedToken.address;

    const user = await Users.findOne({ address: address });
    if (!user) {
      return res.status(400).json({ message: "User does not exist" });
    }

    res.json(user.private);
  } catch (error) {
    console.log(error);
  }
};

export const getDateUser = async (req, res) => {
  try {
    const token = req.headers.authorization;
    const decodedToken = jwt.verify(
      token.split(" ")[1],
      process.env.PASS_TOKEN,
      { algorithms: ["HS256"] }
    );
    const address = decodedToken.address;

    const user = await Users.findOne({ address: address });
    if (!user) {
      return res.status(400).json({ message: "User does not exist" });
    }

    const date = {
      username: user.username,
      email: user.email,
      phone: user.phone,
      country: user.country,
      name: user.name,
    };

    res.json(date);
  } catch (error) {
    console.log(error);
  }
};

export const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const token = req.headers.authorization;
    const decodedToken = jwt.verify(
      token.split(" ")[1],
      process.env.PASS_TOKEN,
      { algorithms: ["HS256"] }
    );
    const address = decodedToken.address;

    const user = await Users.findOne({ address: address });
    if (!user) {
      return res.status(400).json({ message: "User does not exist" });
    }

    const isPasswordValid = await bcrypt.compare(
      currentPassword,
      user.password
    );
    if (!isPasswordValid) {
      return res
        .status(401)
        .json({ message: "The current password is incorrect" });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    // Cambiar la contrasena cierra la sesion en los demas telefonos. Si
    // alguien la cambia porque sospecha que le entraron, dejar vivos los
    // refresh tokens viejos hace que el cambio no sirva de nada.
    user.tokenVersion = (user.tokenVersion || 0) + 1;

    await user.save();

    res.send("contraseña cambiada exitosamente");
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Server error" });
  }
};

export const decryptedPrivateKey = async (req, res) => {
  try {
    const { password } = req.body;
    const token = req.headers.authorization;
    const decodedToken = jwt.verify(
      token.split(" ")[1],
      process.env.PASS_TOKEN,
      { algorithms: ["HS256"] }
    );
    const address = decodedToken.address;

    const user = await Users.findOne({ address: address });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res.status(401).json({ message: "Incorrect password" });
    }

    const decryptedPrivateKey = descifrarLlavePrivada(user.privateKey);
    res.send({ privateKey: decryptedPrivateKey });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Server error" });
  }
};

export const decryptedSeed = async (req, res) => {
  try {
    const { password } = req.body;
    const token = req.headers.authorization;
    const decodedToken = jwt.verify(
      token.split(" ")[1],
      process.env.PASS_TOKEN,
      { algorithms: ["HS256"] }
    );
    const address = decodedToken.address;

    const user = await Users.findOne({ address: address });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    const passwordMatch = await bcrypt.compare(password, user.password);

    if (!passwordMatch) {
      return res.status(401).json({ message: "Incorrect password" });
    }

    const decryptedSeed = descifrarFraseSemilla(user.seed);
    res.send({ seed: decryptedSeed });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Server error" });
  }
};

export const updateUser = async (req, res) => {
  try {
    const { phone, country, username, name } = req.body;
    const token = req.headers.authorization;
    const decodedToken = jwt.verify(
      token.split(" ")[1],
      process.env.PASS_TOKEN,
      { algorithms: ["HS256"] }
    );
    const address = decodedToken.address;

    const existingUser = await Users.findOne({ username: username });
    if (existingUser && existingUser.address !== address) {
      return res.status(400).json({ message: "Username already exists" });
    }

    const user = await Users.findOne({ address: address });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    user.phone = phone || user.phone;
    user.country = country || user.country;
    user.username = username || user.username;
    user.name = name || user.name;

    await user.save();

    res.json("cambio echo");
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error updating user" });
  }
};

export const noPrivate = async (req, res) => {
  try {
    const token = req.headers.authorization;

    const decodedToken = jwt.verify(
      token.split(" ")[1],
      process.env.PASS_TOKEN,
      { algorithms: ["HS256"] }
    );
    const address = decodedToken.address;
    const user = await Users.findOne({ address: address });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    user.private = false;

    await user.save();

    res.json(vistaPublica(user));
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error updating user" });
  }
};

export const yesPrivate = async (req, res) => {
  try {
    const token = req.headers.authorization;
    const decodedToken = jwt.verify(
      token.split(" ")[1],
      process.env.PASS_TOKEN,
      { algorithms: ["HS256"] }
    );
    const address = decodedToken.address;
    console.log(address);
    const user = await Users.findOne({ address: address });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    user.private = true;

    await user.save();

    res.json(vistaPublica(user));
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error updating user" });
  }
};

export const addUserBloqued = async (req, res) => {
  try {
    const { userBlocked } = req.body;
    const token = req.headers.authorization;
    const decodedToken = jwt.verify(
      token.split(" ")[1],
      process.env.PASS_TOKEN,
      { algorithms: ["HS256"] }
    );
    const address = decodedToken.address;

    const user = await Users.findOne({ address: address });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.blocked_users.includes(userBlocked)) {
      return res.status(400).json({ message: "User already blocked" });
    }

    user.blocked_users.push(userBlocked);

    await user.save();

    res.json(vistaPublica(user));
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error blocking user" });
  }
};

export const getUserBloqued = async (req, res) => {
  try {
    const token = req.headers.authorization;
    const decodedToken = jwt.verify(
      token.split(" ")[1],
      process.env.PASS_TOKEN,
      { algorithms: ["HS256"] }
    );
    const address = decodedToken.address;

    const user = await Users.findOne({ address: address });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    const blockedUsers = user.blocked_users;
    res.json(blockedUsers);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error retrieving blocked users" });
  }
};

export const removeUserBloqued = async (req, res) => {
  try {
    const { userUnblocked } = req.body;
    const token = req.headers.authorization;
    const decodedToken = jwt.verify(
      token.split(" ")[1],
      process.env.PASS_TOKEN,
      { algorithms: ["HS256"] }
    );
    const address = decodedToken.address;

    const user = await Users.findOne({ address: address });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const index = user.blocked_users.indexOf(userUnblocked);
    if (index === -1) {
      return res.status(400).json({ message: "User is not blocked" });
    }

    user.blocked_users.splice(index, 1);

    await user.save();

    res.json(vistaPublica(user));
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error unblocking user" });
  }
};

// ============================================================
// DELETE /users/me — eliminar la cuenta.
//
// Obligatorio en ambas tiendas: Apple lo exige desde 2022 y Google desde
// 2024. Sin esto la app se rechaza en revision, sin discusion.
//
// Lo que NO se hace: borrar la fila y listo. Esta es una wallet custodia —
// si el usuario todavia tiene fondos on-chain y borramos la clave privada
// cifrada, ese dinero queda inaccesible para siempre, para el y para
// nosotros. Por eso:
//
//   1. Se exige la contrasena. Una cuenta no se borra por un toque mal dado.
//   2. Se exige confirmacion explicita de que entendio lo de los fondos.
//   3. Se anonimiza en vez de destruir: se borran los datos personales
//      (email, nombre, telefono, pais) y se conserva la direccion con su
//      material cifrado, marcada como eliminada.
//
// El punto 3 es lo que permite cumplir con la tienda sin convertir un
// arrepentimiento en una perdida irreversible. El email se libera para que
// pueda registrarse de nuevo; la wallet vieja queda huerfana pero recuperable
// con la seed, que el usuario ya tenia.
// ============================================================
export const deleteAccount = async (req, res) => {
  try {
    const { password, confirm } = req.body;

    const token = req.headers.authorization;
    const decodedToken = jwt.verify(token.split(" ")[1], process.env.PASS_TOKEN, {
      algorithms: ["HS256"],
    });

    const user = await Users.findOne({ address: decodedToken.address });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (typeof password !== "string" || !password) {
      return res.status(400).json({ code: "PASSWORD_REQUIRED", message: "Falta la contraseña." });
    }

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) {
      return res.status(401).json({ code: "BAD_PASSWORD", message: "Contraseña incorrecta." });
    }

    // Confirmacion explicita: la app manda la palabra que el usuario escribio.
    if (confirm !== "ELIMINAR") {
      return res.status(400).json({
        code: "CONFIRM_REQUIRED",
        message: "Escribí ELIMINAR para confirmar.",
      });
    }

    if (user.deletedAt) {
      return res.status(409).json({ code: "ALREADY_DELETED", message: "La cuenta ya fue eliminada." });
    }

    const sufijo = String(user._id);

    // Datos personales fuera. La direccion y su material cifrado se conservan
    // para que los fondos sigan siendo recuperables con la seed.
    user.email = `eliminado+${sufijo}@vetawallet.invalid`;
    // Un valor unico, no nulo. En Mongo sobrevive un indice unico
    // `username_1` de un esquema anterior --el actual declara unique:false-- y
    // con `undefined` la segunda cuenta que se borrara chocaria contra el nulo
    // que dejo la primera. Se sigue el mismo patron que el correo de arriba.
    user.username = `eliminado+${sufijo}`;
    user.name = undefined;
    user.phone = undefined;
    user.country = undefined;
    user.token = undefined;
    // Invalida de golpe todos los refresh tokens ya emitidos.
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    user.blocked_users = [];
    user.deletedAt = new Date();

    // Contrasena a un valor imposible de adivinar: la cuenta no vuelve a
    // abrirse ni por accidente ni con la contrasena vieja.
    user.password = await bcrypt.hash(crypto.randomBytes(32).toString("hex"), 10);

    await user.save();

    console.log(`[delete-account] cuenta ${sufijo} anonimizada`);

    return res.json({
      deleted: true,
      message: "Tu cuenta fue eliminada. Tus fondos siguen siendo recuperables con tu frase de respaldo.",
    });
  } catch (error) {
    console.error("[delete-account]", error);
    return res.status(500).json({ message: "No se pudo eliminar la cuenta" });
  }
};


// ============================================================
// Borrado por un administrador, con la cadena de por medio.
//
// POR QUE NO BASTA CON EL BORRADO DE ARRIBA
//
// `deleteAccount` lo hace la propia persona: entra con su contrasena, escribe
// ELIMINAR y sabe lo que tiene. Un administrador borrando la cuenta de otro no
// sabe nada de eso, y la cuenta que borra puede tener oro dentro.
//
// El borrado NO quema fondos —la direccion y su material cifrado se conservan,
// igual que en el borrado propio, para que la seed siga abriendo la direccion—
// pero deja a esa persona sin la puerta por la que entraba. Si tiene saldo, eso
// no es limpieza: es encerrar a alguien fuera de su dinero.
//
// Asi que se le pregunta a la cadena, y se pregunta por TODO: el ORIGEN nativo
// y los catorce tokens del ecosistema. Con cualquier cantidad, se niega y dice
// exactamente que encontro.
//
// Y SI NO SE PUEDE PREGUNTAR, TAMPOCO SE BORRA
//
// Un nodo caido no es una cuenta vacia. `saldosDe` nunca devuelve cero por
// averia —devuelve que no se pudo comprobar— y aqui eso corta la operacion con
// un 503. Es la diferencia entre «esta vacia» y «no lo se», y es justo la
// diferencia que se paga con el dinero de otro.
// ============================================================
export const adminDeleteAccount = async (req, res) => {
  try {
    const { email, confirm, motivo } = req.body || {};

    if (typeof email !== "string" || !email.includes("@")) {
      return res.status(400).json({ code: "EMAIL_REQUIRED", message: "Falta el correo de la cuenta." });
    }
    // La misma confirmacion escrita que en el borrado propio: nadie borra la
    // cuenta de otro por un dedo mal puesto en una consola.
    if (confirm !== "ELIMINAR") {
      return res.status(400).json({ code: "CONFIRM_REQUIRED", message: 'Mandá confirm:"ELIMINAR".' });
    }
    if (typeof motivo !== "string" || motivo.trim().length < 10) {
      return res.status(400).json({
        code: "MOTIVO_REQUIRED",
        message: "Hace falta un motivo: queda escrito en el registro del servidor.",
      });
    }

    const user = await Users.findOne({ email: String(email).trim().toLowerCase() });
    // Solo se consulta la cadena si hay una cuenta que mirar.
    const saldo = user ? await saldosDe(user.address) : null;

    // Toda la decision vive en una funcion pura y comprobable. Aqui solo se
    // obedece: si dice que no, no se toca nada.
    const veredicto = decidirBorrado({ user, saldo });
    if (!veredicto.permitido) {
      return res.status(veredicto.http).json({
        code: veredicto.codigo,
        message: veredicto.mensaje,
        ...(veredicto.codigo === "TIENE_FONDOS" ? { saldos: saldo.saldos } : {}),
        ...(veredicto.codigo === "NO_SE_PUDO_COMPROBAR" ? { detalle: saldo?.error } : {}),
      });
    }

    const sufijo = String(user._id);

    // A partir de aqui, exactamente el mismo trato que el borrado propio: fuera
    // los datos personales, y la direccion con su material cifrado intactos
    // para que los fondos —si algun dia llegan— sigan siendo recuperables con
    // la seed.
    user.email = `eliminado+${sufijo}@vetawallet.invalid`;
    user.username = `eliminado+${sufijo}`;
    user.name = undefined;
    user.phone = undefined;
    user.country = undefined;
    user.token = undefined;
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    user.blocked_users = [];
    user.deletedAt = new Date();
    user.password = await bcrypt.hash(crypto.randomBytes(32).toString("hex"), 10);

    await user.save();

    // Quien lo hizo y por que: si manana alguien pregunta por esta cuenta, la
    // respuesta tiene que estar en algun sitio.
    console.log(
      `[admin-delete] cuenta ${sufijo} anonimizada por ${req.adminEmail || "admin"} · motivo: ${motivo.trim()}`
    );

    return res.json({
      deleted: true,
      cuenta: sufijo,
      direccion: user.address,
      message: "Cuenta eliminada. Estaba vacia en la cadena y su direccion se conserva.",
    });
  } catch (error) {
    console.error("[admin-delete]", error);
    return res.status(500).json({ message: "No se pudo eliminar la cuenta" });
  }
};

// ============================================================
// Mirar sin tocar: que tiene una cuenta en la cadena.
//
// Existe para poder responder «¿esta vacia?» antes de decidir un borrado, sin
// tener que intentarlo para averiguarlo.
// ============================================================
export const adminSaldoCuenta = async (req, res) => {
  try {
    const email = String(req.query.email || "").trim().toLowerCase();
    if (!email.includes("@")) {
      return res.status(400).json({ code: "EMAIL_REQUIRED", message: "Falta el correo." });
    }
    const user = await Users.findOne({ email });
    if (!user) return res.status(404).json({ code: "NOT_FOUND", message: "No hay ninguna cuenta con ese correo." });

    const saldo = await saldosDe(user.address);
    if (!saldo.ok) {
      return res.status(503).json({ code: "NO_SE_PUDO_COMPROBAR", detalle: saldo.error });
    }
    return res.json({
      direccion: user.address,
      eliminada: Boolean(user.deletedAt),
      vacia: saldo.vacia,
      saldos: saldo.saldos,
    });
  } catch (error) {
    console.error("[admin-saldo]", error);
    return res.status(500).json({ message: "Server error" });
  }
};
