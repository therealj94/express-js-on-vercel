// Las dos puertas de entrada. Ninguna lleva `sesion`: son las que la emiten.
//
// /sso recibe el token de un solo uso que trajo el usuario desde Veta Wallet
// (el backend lo verifica contra Genesis con SU GENESIS_API_KEY) y /refresh
// canjea el refresh de 30 dias por un par nuevo, contra tokenVersion.
// Ordenex no tiene /login: no hay contraseñas que recibir.

const express = require('express');
const router = express.Router();
const { sso, refresh } = require('../controllers/authController');

router.post('/sso', sso);
router.post('/refresh', refresh);

module.exports = router;
