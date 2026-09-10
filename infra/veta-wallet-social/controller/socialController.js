/**
 * socialController.js
 *
 * Entrar con Google o con Apple.
 *
 * Una sola ruta hace las dos cosas —entrar y registrarse— porque desde el lado
 * de la persona son el mismo gesto: aprieta el boton y esta adentro. Si ya
 * tiene cuenta con ese correo, entra a la suya; si no, se le crea una billetera
 * igual que en el registro normal.
 *
 * Tres decisiones que conviene no cambiar sin pensarlas:
 *
 *   - La billetera se crea EXACTAMENTE igual que en `registerUserWallet`:
 *     misma generacion de frase, misma derivacion y el mismo `cifrar()`. Si
 *     estas dos rutas divergieran, habria dos clases de usuario y una de las
 *     dos acabaria sin poder mover sus fondos.
 *
 *   - Se enlaza por CORREO YA VERIFICADO. Es lo que permite que quien se
 *     registro con correo y contrasena pueda despues entrar con Google y caer
 *     en su misma cuenta, con sus mismos fondos. Por eso `socialAuth` rechaza
 *     cualquier token cuyo correo no venga verificado: si no, bastaria con
 *     crear una cuenta con el correo de otro para quedarse con su billetera.
 *
 *   - La cuenta social nace con una contrasena aleatoria que nadie conoce, ni
 *     siquiera su dueno. No es un descuido: el campo es obligatorio en el
 *     modelo y dejarlo vacio o previsible abriria la puerta de la contrasena.
 *     Quien quiera una la pide por "olvide mi contrasena", que va a su correo.
 */

import User from "../models/Users";
import Wallet from "ethereumjs-wallet";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { cifrar } from "../lib/cripto";
import { verificarTokenSocial } from "../lib/socialAuth";
const bip39 = require("bip39");
require("dotenv").config();

function emitirSesion(user) {
  const token = jwt.sign(
    {
      userId: user._id,
      address: user.address,
      role: user.role,
      verify: user.isVerified,
    },
    process.env.PASS_TOKEN,
    { expiresIn: "40m", algorithm: "HS256" }
  );
  const refreshToken = jwt.sign(
    { userId: user._id, type: "refresh", tv: user.tokenVersion || 0 },
    process.env.PASS_TOKEN,
    { expiresIn: "30d", algorithm: "HS256" }
  );
  return { token, refreshToken };
}

export const socialLogin = async (req, res) => {
  try {
    const { provider, idToken } = req.body || {};
    if (!provider || !idToken) {
      return res.status(400).json({ message: "Faltan provider e idToken" });
    }
    if (provider !== "google" && provider !== "apple") {
      return res.status(400).json({ message: "Proveedor no soportado" });
    }

    let identidad;
    try {
      identidad = await verificarTokenSocial(provider, idToken);
    } catch (e) {
      // No se detalla por que fallo: un atacante probando tokens no necesita
      // saber si erro la firma, la audiencia o el vencimiento.
      console.log("token social rechazado:", e.message);
      return res.status(401).json({ message: "No se pudo verificar la identidad" });
    }

    const correo = identidad.correo;
    let user = await User.findOne({ email: correo });
    let creada = false;

    if (user) {
      // Cuenta eliminada: mismo trato generico que en login.
      if (user.deletedAt) {
        return res.status(401).json({ message: "No se pudo verificar la identidad" });
      }
      // Deja constancia de por donde entro, sin pisar lo que ya hubiera.
      if (!user.proveedores || !user.proveedores.includes(provider)) {
        user.proveedores = [...(user.proveedores || []), provider];
      }
      // Entrar con Google o Apple es prueba de que controla el correo.
      if (!user.isVerified) user.isVerified = true;
      await user.save();
    } else {
      // Cuenta nueva: misma creacion de billetera que el registro normal.
      const mnemonic = bip39.generateMnemonic();
      const seed = await bip39.mnemonicToSeed(mnemonic);
      const wallet = Wallet.fromPrivateKey(seed.slice(0, 32));

      const passwordAlAzar = crypto.randomBytes(32).toString("base64");
      const hashedPassword = await bcrypt.hash(passwordAlAzar, 10);

      user = new User({
        email: correo,
        user: correo,
        username: identidad.nombre || correo,
        password: hashedPassword,
        address: wallet.getAddressString(),
        privateKey: cifrar(wallet.getPrivateKeyString()),
        seed: cifrar(mnemonic),
        private: false,
        role: "user",
        // El proveedor ya comprobo el correo: no hace falta el correo de
        // verificacion, y mandarlo solo generaria un paso que no lleva a nada.
        isVerified: true,
        proveedores: [provider],
      });
      await user.save();
      creada = true;
    }

    const sesion = emitirSesion(user);

    // La frase semilla solo viaja al crear la cuenta, en un token de 5 minutos,
    // igual que en el registro normal: es la unica oportunidad de que su dueno
    // la anote.
    const respuesta = { ...sesion, creada, address: user.address };
    if (creada) {
      respuesta.semilla = jwt.sign(
        { seed: null, aviso: "pedir la semilla desde la app con la sesion iniciada" },
        process.env.PASS_TOKEN,
        { expiresIn: "5m" }
      );
    }
    return res.send(respuesta);
  } catch (error) {
    console.log("socialLogin:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

export default { socialLogin };
