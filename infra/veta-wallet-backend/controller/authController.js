import User from "../models/Users";
import Wallet from "ethereumjs-wallet";
const bip39 = require("bip39");
import bcrypt from "bcrypt";
import CryptoJS from "crypto-js";
import { cifrar } from "../lib/cripto";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import nodemailer from "nodemailer";
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
    const transporter = nodemailer.createTransport({
      service: "gmail",

      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_PASS,
      },
    });

    const mailOptions = {
      from: process.env.GMAIL_USER,
      to: email,
      subject: "Confirma tu cuenta de Veta Wallet",
      text: `Bienvenido a Veta Wallet.

Para confirmar tu cuenta, entra en este enlace:
${verificationLink}

Si no creaste esta cuenta, no hagas nada: sin confirmar, el enlace caduca solo.

--
Orden Global`,
    };

    transporter.sendMail(mailOptions, async (error, info) => {
      if (error) {
        console.log(error);
        return res.status(500).json({
          message: "Failed to send verification email",
        });
      }
    });
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

    user.isVerified = true;
    user.verificationToken = "*";
    await user.save();

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
    if (!user) {
      return res.status(401).json({ message: "wrong email or password" });
    }
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Wrong email or password" });
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

    const verificationLink = `https://www.vetawallet.com/changePassword?token=${resetToken}`;
    // Se guarda el hash, nunca el token en claro, y con vencimiento.
    user.verificationTokenPassword = hashToken(resetToken);
    user.verificationTokenPasswordExp = new Date(Date.now() + VIGENCIA_RESET_MS);

    await user.save();

    const transporter = nodemailer.createTransport({
      service: "Outlook",
      auth: {
        user: process.env.OUTLOOK_USER,
        pass: process.env.OUTLOOK_PASS, // poner tu pass , es para que desde ahi se envien los mail de confirmacion.
      },
    });

    // Crear el cuerpo del correo electrónico
    const mailOptions = {
      from: process.env.OUTLOOK_USER,
      to: user.email,
      subject: "Restablecimiento de contraseña",
      text: `Para restablecer tu contraseña, haz clic en el siguiente enlace: ${verificationLink}`,
    };

    // Enviar el correo electrónico
    await transporter.sendMail(mailOptions);

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
