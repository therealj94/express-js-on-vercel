var express = require('express');
var router = express.Router();
var {send, sendToken} = require("../controller/transactionController")
var verifyTokenUser = require("../middleware/verifyToken")
/* GET home page. */
router.post('/send',verifyTokenUser, send  ) 
router.post('/sendToken',verifyTokenUser, sendToken  ) 
module.exports = router;
