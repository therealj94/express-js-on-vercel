// Las sesiones se firman y se verifican a traves de lib/sesion.js, que
// entiende el secreto nuevo y el anterior mientras dura la rotacion de
// PASS_TOKEN. Las llamadas jwt.verify(...) y jwt.sign(...) no cambian.
import jwt from "../lib/sesion";
import Users from "../models/Users";
import CryptoJS from "crypto-js";
require("dotenv").config();

// ─────────────────────────────────────────────────────────────────────────────
// LA FIRMA VALIDA NO ES LO MISMO QUE LA SESION VIVA.
//
// Esta guardia comprobaba dos cosas: que la firma cuadrara y que la direccion
// del token fuera la del usuario. Las dos miran el token; ninguna mira si esa
// sesion todavia tiene que existir. La consecuencia se cuenta en una frase:
// alguien sospecha que le robaron la contraseña, la cambia, y la sesion del
// ladron sigue moviendo su dinero hasta que venza sola.
//
// El mecanismo para cortarla ya estaba construido —`tokenVersion` en el modelo,
// que sube al cambiar la contraseña y al eliminar la cuenta— pero solo lo
// consultaba la renovacion (`authController.refresh`). O sea que subir la
// version cerraba la puerta de renovar y dejaba abierta la de usar: hasta 40
// minutos mas de acceso completo, y ese es justo el rato que importa.
//
// Ahora se comprueban tres cosas mas, en este orden:
//
//   1. Que el usuario exista. Antes, si no existia, `user.address` lanzaba un
//      TypeError que caia en el catch y salia como "invalid token": el
//      resultado era el correcto por accidente, y un accidente no es una
//      guardia.
//   2. Que la cuenta no este eliminada. El borrado de esta casa es marcado y
//      anonimizante, no destructivo: la fila sigue ahi con su direccion y su
//      material cifrado, para que los fondos sigan siendo recuperables con la
//      semilla. Por eso `deletedAt` hay que MIRARLO — la cuenta borrada no
//      desaparece de la base y sin esta linea su sesion seguiria entrando.
//   3. Que la version del token sea la de la cuenta. Es la revocacion.
//
// SOBRE LA TRANSICION
//
// Los tokens de acceso emitidos antes de este cambio no llevan `tv`, asi que
// aqui cuentan como version 0. A quien nunca subio de version no le pasa nada.
// A quien SI —porque cambio la contraseña alguna vez— se le rechaza el token
// viejo, que es exactamente lo que se buscaba: esa sesion tendria que haber
// muerto el dia del cambio. Y no lo echa de la aplicacion, porque su refresh
// token si lleva la version buena: el cliente recibe el 401, llama a
// /auth/refresh y sigue con un token nuevo y correcto.
//
// Por que aqui y no comparando contra `user.token` como hace isAdmin.js: ese
// campo guarda UNA sola sesion, y compararlo aqui impondria un solo
// dispositivo por persona para toda la billetera. Para un administrador eso es
// una decision tomada a proposito; para alguien que usa el telefono y el
// navegador seria echarlo de uno cada vez que entra en el otro. `tokenVersion`
// revoca todas las sesiones cuando hace falta revocarlas, y ninguna cuando no.
// ─────────────────────────────────────────────────────────────────────────────

const verifyTokenUser = async (req, res, next) => {
  try {
    const token = req.headers.authorization;
    if (!token) {
      return res.status(401).json({ message: "missing token" });
    }

    const decodedToken = jwt.verify(
      token.split(" ")[1],
      process.env.PASS_TOKEN,
      { algorithm: "HS256" }
    );
    const idUser = decodedToken.userId;
    const user = await Users.findOne({ _id: idUser });

    if (!user) {
      return res.status(401).json({ message: "invalid user" });
    }

    // Cuenta eliminada: la fila sigue existiendo a proposito, la sesion no.
    if (user.deletedAt) {
      return res.status(401).json({ message: "account deleted" });
    }

    // Revocacion. Un token de una version anterior es un token que alguien
    // decidio matar: cambiar la contraseña, cerrar sesion o borrar la cuenta.
    if ((decodedToken.tv || 0) !== (user.tokenVersion || 0)) {
      return res.status(401).json({ message: "session revoked" });
    }

    if (decodedToken.address !== user.address) {
      return res.status(401).json({ message: "invalid user" });
    }

    next();
  } catch (error) {
    console.log(error);
    res.status(401).json({ message: "invalid token" });
  }
};

module.exports = verifyTokenUser;
