import { Router } from "express";

const router = Router();
var {
  getTransactionsByAddress,
  getTokenData,
} = require("../controller/Address.controllers");

router.get("/:address", getTransactionsByAddress);
router.get("/token/:token", getTokenData);

module.exports = router;
