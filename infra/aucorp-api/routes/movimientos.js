// Mover dinero y leerlo. Todo con sesión, sin excepciones.
const express = require('express');
const { sesion } = require('../middleware/sesion');
const { transferir, cotizacion, cambiar, historial, comprobante, extracto } = require('../controllers/movimientosController');

const router = express.Router();
router.get('/movimientos', sesion, historial);
router.get('/movimientos/cotizar', sesion, cotizacion);
// El comprobante de un movimiento, por su número (la ref sin el gid).
router.get('/movimientos/:numero/comprobante', sesion, comprobante);
router.post('/movimientos/transferir', sesion, transferir);
router.post('/movimientos/cambiar', sesion, cambiar);
// El extracto de un mes: JSON para la pantalla, CSV para descargar.
router.get('/extracto', sesion, extracto);
module.exports = router;
