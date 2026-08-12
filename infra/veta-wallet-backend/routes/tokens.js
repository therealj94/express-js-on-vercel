var express = require("express");
var router = express.Router();

var {
  allTokens,
  allNFT,
  tokenAddre2,
  getTokenData,
} = require("../controller/tokenController");
var verifyTokenUser = require("../middleware/verifyToken");

/* GET home page. */
router.get("/allTokens/:chain_id", verifyTokenUser, allTokens);
router.get("/allTokens/:chain_id/:addr", verifyTokenUser, getTokenData);
router.get("/allTokensTransfer/:chain_id/:addr", verifyTokenUser, tokenAddre2);
router.get("/allNFT/:chain_id", verifyTokenUser, allNFT);

module.exports = router;
