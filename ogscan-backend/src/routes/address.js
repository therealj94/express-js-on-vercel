import { Router } from "express";

const router = Router();
var {
  getTransactionsByAddress,
  getTokenData,
  listaTokens,
} = require("../controller/Address.controllers");

// Las rutas concretas van antes que la de parametro. `/tokens` encaja tambien
// en `/:address`, y en Express gana la primera que se registra.
router.get("/tokens", listaTokens);
router.get("/token/:token", getTokenData);
router.get("/:address", getTransactionsByAddress);

module.exports = router;
