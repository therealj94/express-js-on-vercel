var express = require("express");
var router = express.Router();
var verifyTokenUser = require("../middleware/verifyToken");
var {
  depositInfo,
  checkDeposit,
  origenBalance,
  listDeposits,
} = require("../controller/depositController");

// Pasarela de entrada: depositar USDT en Polygon y recibir ORIGEN.
router.get("/deposit-info", verifyTokenUser, depositInfo);      // direccion + saldo, y revisa de paso
router.post("/deposit/check", verifyTokenUser, checkDeposit);   // fuerza una revision (lo sondea la pantalla)
router.get("/origen-balance", verifyTokenUser, origenBalance);  // solo el saldo, sin tocar la cadena
router.get("/deposits", verifyTokenUser, listDeposits);         // historial de acreditaciones

module.exports = router;
