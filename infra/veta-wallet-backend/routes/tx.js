var express = require('express');
var router = express.Router();
var verifyTokenUser = require("../middleware/verifyToken")

var {getTxForChainIdScan, allTx, txForId, txForChainId, txForChainIdForIndex} = require("../controller/txController")


/* GET home page. */
router.get('/allTxa/:id',verifyTokenUser, getTxForChainIdScan);

router.get("/allTx",verifyTokenUser, allTx);
router.get("/allTx/:id",verifyTokenUser, txForId);
router.get("/allTxForChainId",verifyTokenUser, txForChainId);
router.get("/allTxForChainId/:id",verifyTokenUser, txForChainIdForIndex);




module.exports = router;
