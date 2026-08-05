import { Router } from "express";

const router = Router();

var {
  allBlocks,
  idBlock,
  totalBlock,
} = require("../controller/Blocks.controller");

router.get("/allBlocks", allBlocks);
router.get("/totalBlock", totalBlock);
router.get("/block/:id", idBlock);

module.exports = router;
