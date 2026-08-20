// Las sesiones se firman y se verifican a traves de lib/sesion.js, que
// entiende el secreto nuevo y el anterior mientras dura la rotacion de
// PASS_TOKEN. Las llamadas jwt.verify(...) y jwt.sign(...) no cambian.
import jwt from "../lib/sesion";
import Users from "../models/Users";

// Sesion para el puente con Genesis ID.
//
// `verifyToken.js` comprueba el token pero no deja al usuario en la peticion,
// asi que las rutas de abajo no sabrian de quien hablan. Este middleware hace
// lo mismo y ademas rellena `req.usuario`.
//
// Que la cuenta salga de AQUI y no del cuerpo de la peticion es lo que impide
// que alguien ate su Genesis ID a la cuenta de otra persona: el cliente no
// participa en decidir de quien es la identidad que esta tocando.
const sesionGenesis = async (req, res, next) => {
  try {
    const cabecera = req.headers.authorization;
    if (!cabecera) return res.status(401).json({ message: "missing token" });

    const datos = jwt.verify(cabecera.split(" ")[1], process.env.PASS_TOKEN, {
      algorithm: "HS256",
    });

    const usuario = await Users.findOne({ _id: datos.userId });
    if (!usuario || datos.address !== usuario.address) {
      return res.status(401).json({ message: "invalid user" });
    }

    req.usuario = {
      id: String(usuario._id),
      email: usuario.email,
      address: usuario.address,
    };
    next();
  } catch (error) {
    res.status(401).json({ message: "invalid token" });
  }
};

module.exports = sesionGenesis;
