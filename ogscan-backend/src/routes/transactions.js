import { Router } from "express";

const router = Router();
var {
  allTransactions,
  idTransaction,
  totalTranscations,
  resumen,
} = require("../controller/Transactions.controllers");

router.get("/totalTransactions", totalTranscations);
router.get("/allTransactions", allTransactions);
router.get("/resumen", resumen);
router.get("/transaction/:hash", idTransaction);

module.exports = router;
