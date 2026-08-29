import jwt from "jsonwebtoken";
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
      // PLURAL Y EN LISTA. `algorithm` en singular es la opcion de `sign`:
      // `verify` no la conoce y la ignora sin avisar, asi que la restriccion
      // no se aplica. Este fichero es un EJEMPLO para copiar, y el singular
      // llego a estar copiado en 38 llamadas del backend por venir de aqui.
      algorithms: ["HS256"],
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
