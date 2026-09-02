// Pedir un retiro, avisar un depósito y ver a dónde depositar. Del lado del
// cliente. Ninguna de estas rutas acredita dinero: el retiro lo paga
// operaciones y el depósito lo acredita operaciones, las dos con comprobante.
const express = require('express');
const { sesion } = require('../middleware/sesion');
const { pedirRetiro, avisarDeposito, mias, una, instruccionesDeposito } = require('../controllers/solicitudesController');

const router = express.Router();
router.get('/solicitudes', sesion, mias);
router.get('/solicitudes/:id', sesion, una);
router.post('/solicitudes/retiro', sesion, pedirRetiro);
router.post('/solicitudes/deposito', sesion, avisarDeposito);
router.get('/deposito/instrucciones', sesion, instruccionesDeposito);
module.exports = router;
