// Mover dinero. Todo con sesión, sin excepciones.
const express = require('express');
const { sesion } = require('../middleware/sesion');
const { transferir, cotizacion, cambiar, historial } = require('../controllers/movimientosController');

const router = express.Router();
router.get('/movimientos', sesion, historial);
router.get('/movimientos/cotizar', sesion, cotizacion);
router.post('/movimientos/transferir', sesion, transferir);
router.post('/movimientos/cambiar', sesion, cambiar);
module.exports = router;
