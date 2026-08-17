// La frontera del dinero. Todo detrás de X-Admin-Key, sin excepciones.
const express = require('express');
const { soloOperaciones, deposito, retiro, revisar,
        corresponsalGuardar, corresponsalListar, nivelPoner } = require('../controllers/tesoreriaController');
const { cola, ejecutar, rechazar } = require('../controllers/solicitudesController');

const router = express.Router();
router.use(soloOperaciones);
router.post('/deposito', deposito);
router.post('/retiro', retiro);
router.get('/reconciliar', revisar);
// La cola de retiros que esperan que una persona los pague.
router.get('/solicitudes', cola);
router.post('/solicitudes/:id/ejecutar', ejecutar);
router.post('/solicitudes/:id/rechazar', rechazar);
// Las cuentas reales de la casa en cada plaza, y los límites de cada cliente.
router.get('/corresponsales', corresponsalListar);
router.post('/corresponsal', corresponsalGuardar);
router.post('/nivel', nivelPoner);
module.exports = router;
