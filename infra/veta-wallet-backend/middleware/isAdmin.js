// Las sesiones se firman y se verifican a traves de lib/sesion.js, que
// entiende el secreto nuevo y el anterior mientras dura la rotacion de
// PASS_TOKEN. Las llamadas jwt.verify(...) y jwt.sign(...) no cambian.
import jwt from "../lib/sesion";
import Users from "../models/Users";
import CryptoJS from 'crypto-js';
import { descifrarConToken } from "../lib/sesion";
require('dotenv').config();


const isAdmin = async (req, res, next) => {
    try {  
        const token = req.headers.authorization;
        if (!token) {
            return res.status(401).json({ message: "missing token" });
      }

    const decodedToken = jwt.verify(token.split(' ')[1], process.env.PASS_TOKEN, { algorithm: 'HS256' });
    const idUser = decodedToken.userId;
    const user = await Users.findOne({_id: idUser});

    /* Las mismas dos comprobaciones que `middleware/verifyToken.js`, y por el
       mismo motivo: la firma valida no es lo mismo que la sesion viva.
       Comparar contra `user.token` impone UNA sesion a la vez, que no es lo
       mismo que revocar — si el ladron fue el ultimo en entrar, el token
       guardado es el SUYO y la comparacion le da la razon. Sin estas dos
       lineas, las rutas de administracion serian el unico sitio del backend
       donde cambiar la contraseña no echa a nadie. */
    if (!user) {
      return res.status(401).json({ message: "invalid user" });
    }
    if (user.deletedAt) {
      return res.status(401).json({ message: "account deleted" });
    }
    if ((decodedToken.tv || 0) !== (user.tokenVersion || 0)) {
      return res.status(401).json({ message: "session revoked" });
    }
    // `user.token` esta cifrado con PASS_TOKEN, asi que se descifra probando el
    // secreto nuevo y el anterior mientras dure la rotacion. Sin esto, cambiar
    // PASS_TOKEN dejaria este campo ilegible y ningun administrador podria
    // volver a entrar por estas rutas.
    const tokenFromRequest = token.split(' ')[1];
    const decryptedToken = descifrarConToken(user.token);

    if (tokenFromRequest !== decryptedToken) {
      return res.status(401).json({ message: "invalid token db" });
    }

    if (decodedToken.address !== user.address) {
      return res.status(401).json({ message: "invalid user" });
    }

    if (user.role !== "admin") {
        return res.status(401).json({ message: "invalid role" });
      }

    // Quien es el admin, para que las operaciones que dejan rastro puedan
    // escribir un nombre y no un "admin" generico. Sin esto, el registro de un
    // borrado dice que lo hizo "un administrador" y no sirve para nada.
    req.adminEmail = user.email;
    req.adminId = String(user._id);

    next();
  } catch (error) {
    console.log(error)
    res.status(401).json({ message: "invalid token" });
  }
};

module.exports = isAdmin;