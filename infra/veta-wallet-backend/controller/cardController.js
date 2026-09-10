import axios from "axios";
// Las sesiones se firman y se verifican a traves de lib/sesion.js, que
// entiende el secreto nuevo y el anterior mientras dura la rotacion de
// PASS_TOKEN. Las llamadas jwt.verify(...) y jwt.sign(...) no cambian.
import jwt from "../lib/sesion";
import crypto from "crypto";
import bcrypt from "bcrypt";
import { enviarCorreo } from "../lib/correo";
import Users from "../models/Users";
import Card from "../models/Card";
import CardEvent from "../models/CardEvent";
// La coleccion de sellos de los envios. Aca se usa, en un espacio de nombres
// propio, para no aplicar dos veces el mismo evento de webhook: ver
// `eventoYaAplicado` mas abajo.
import Idempotencia from "../models/Idempotencia";
import CardPurchase from "../models/CardPurchase";
import OrigenBalance from "../models/OrigenBalance";
import { getOrigenPriceUsd } from "../lib/origenPrice";
import { descifrarLlavePrivada } from "../lib/cripto";
import { precioDeGas } from "../lib/gas";
import { ethers } from "ethers";
import * as venta from "../lib/ventaTarjeta";

const CRYPTOMATE_BASE_URL = "https://api.cryptomate.me";

// Cliente axios preconfigurado para CryptoMate
const cryptomateClient = axios.create({
  baseURL: CRYPTOMATE_BASE_URL,
  headers: {
    "x-api-key": process.env.CRYPTOMATE_API_KEY,
    "Content-Type": "application/json",
  },
});

// CryptoMate responde NOT_FOUND tanto cuando un recurso no existe como cuando
// simplemente esta vacio: una tarjeta sin consumos, un PIN sin asignar. Para
// las lecturas eso NO es un fallo del servidor y devolverlo como 500 manda a
// buscar una averia que no existe (paso con el PIN y con el estado de cuenta).
function esNoEncontrado(error) {
  return error?.response?.data?.code === "NOT_FOUND" || error?.response?.status === 404;
}

// Extrae el usuario autenticado del JWT y lo retorna
async function getAuthUser(req) {
  const token = req.headers.authorization;
  const decoded = jwt.verify(token.split(" ")[1], process.env.PASS_TOKEN, {
    algorithms: ["HS256"],
  });
  return Users.findById(decoded.userId);
}

// La cadena de Orden Global, donde vive el ORIGEN con el que se paga.
const OG_RPC_TARJETA = process.env.OG_CHAIN_PROVIDER || "https://www.ordenglobal-rpc.com";

/* Cuánto se espera a que el pago entre al bloque. Heroku corta la petición a

[...recortado...]