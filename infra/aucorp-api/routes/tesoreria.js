// La frontera del dinero. Todo detrás de X-Admin-Key, sin excepciones.
const express = require('express');
const { soloOperaciones, deposito, retiro, revisar,
        corresponsalGuardar, corresponsalListar, nivelPoner,
        solicitudesAtascadas, sancionesEstado, sancionesImportar,
        sancionesAlertas, sancionesResolver } = require('../controllers/tesoreriaController');
const { cola, ejecutar, rechazar } = require('../controllers/solicitudesController');

const router = express.Router();
router.use(soloOperaciones);
router.post('/deposito', deposito);
router.post('/retiro', retiro);
router.get('/reconciliar', revisar);
// La cola de retiros que esperan que una persona los pague, y de depósitos
// avisados que esperan que alguien los encuentre en el extracto.
router.get('/solicitudes', cola);
// El barrido: las que llevan más de N horas sin cambio. Sólo avisa. Va ANTES
// de /:id para que «atascadas» no se lea como un id.
router.get('/solicitudes/atascadas', solicitudesAtascadas);
router.post('/solicitudes/:id/ejecutar', ejecutar);
router.post('/solicitudes/:id/rechazar', rechazar);
// Las cuentas reales de la casa en cada plaza, y los límites de cada cliente.
router.get('/corresponsales', corresponsalListar);
router.post('/corresponsal', corresponsalGuardar);
router.post('/nivel', nivelPoner);
// La lista de sanciones: su estado, su importación, y las alertas que dejó.
router.get('/sanciones', sancionesEstado);
router.post('/sanciones/importar', sancionesImportar);
router.get('/sanciones/alertas', sancionesAlertas);
router.post('/sanciones/alertas/:id/resolver', sancionesResolver);
module.exports = router;
