// Pedir un retiro y ver a dónde depositar. Del lado del cliente.
const express = require('express');
const { sesion } = require('../middleware/sesion');
const { pedirRetiro, mias, instruccionesDeposito } = require('../controllers/solicitudesController');

const router = express.Router();
router.get('/solicitudes', sesion, mias);
router.post('/solicitudes/retiro', sesion, pedirRetiro);
router.get('/deposito/instrucciones', sesion, instruccionesDeposito);
module.exports = router;
