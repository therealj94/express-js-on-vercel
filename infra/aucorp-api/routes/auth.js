// La puerta. Sin sesión: es donde se consigue.
const express = require('express');
const { sso, refresh } = require('../controllers/authController');

const router = express.Router();
router.post('/sso', sso);
router.post('/refresh', refresh);
module.exports = router;
