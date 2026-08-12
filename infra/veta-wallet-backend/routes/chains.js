var express = require('express');
var router = express.Router();
var verifyTokenUser = require("../middleware/verifyToken")

var {addChain, getAllChain, getChainForId} = require("../controller/chainController")
var crypto = require("crypto")

// Comparacion en tiempo constante contra ADMIN_SECRET.
function soloAdmin(req, res, next) {
  const enviada = String(req.headers["x-admin-key"] || "");
  const esperada = String(process.env.ADMIN_SECRET || "");
  const a = Buffer.from(enviada), b = Buffer.from(esperada);
  if (!esperada || a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(403).json({ message: "Forbidden" });
  }
  next();
}

// /allChains era publico y devolvia el documento completo, con provider y
// api_key adentro: un curl sin credenciales entregaba las claves de Infura,
// Alchemy y los exploradores, facturadas a la empresa.
router.get('/allChains', verifyTokenUser, getAllChain);
// getChainForId valida el JWT dentro del controlador.
router.get('/getChainsForId/:chain_id', getChainForId);
// addChain no tenia NINGUNA autenticacion: cualquiera podia insertar una
// chain con su propio `provider`, que es el RPC con el que el backend firma
// transacciones. Ahora exige la clave de administracion.
router.post("/addChain", soloAdmin, addChain);

module.exports = router;
