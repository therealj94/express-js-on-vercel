import { Router } from "express";

const router = Router();
var {
  allTransactions,
  idTransaction,
  totalTranscations,
} = require("../controller/Transactions.controllers");

router.get("/totalTransactions", totalTranscations);
router.get("/allTransactions", allTransactions);
router.get("/transaction/:hash", idTransaction);

module.exports = router;
