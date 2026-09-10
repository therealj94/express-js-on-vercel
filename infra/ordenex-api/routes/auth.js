// Las dos puertas de entrada. Ninguna lleva `sesion`: son las que la emiten.
//
// /sso recibe el token de un solo uso que trajo el usuario desde Veta Wallet
// (el backend lo verifica contra Genesis con SU GENESIS_API_KEY) y /refresh
// canjea el refresh de 30 dias por un par nuevo, contra tokenVersion.
// Ordenex no tiene /login: no hay contraseñas que recibir.
//
// /terminos SI lleva sesion: es la aceptacion de los terminos y el aviso de
// riesgo por parte de una cuenta concreta. Cuelga de /auth porque es parte
// de lo que hace a alguien un usuario que puede operar, y no de /ordenes: se
// acepta una vez por version, no una vez por orden.

const express = require('express');
const router = express.Router();
const { sso, refresh } = require('../controllers/authController');
const { sesion } = require('../middleware/sesion');
const terminos = require('../lib/terminos');

router.post('/sso', sso);
router.post('/refresh', refresh);
router.get('/terminos', sesion, terminos.consultar);
router.post('/terminos', sesion, terminos.aceptar);

module.exports = router;
