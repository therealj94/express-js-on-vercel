const express = require('express');

const { sesion } = require('../middleware/sesion');
const c = require('../controllers/p2pController');

const router = express.Router();

/* La lista es PÚBLICA a propósito: quien todavía no tiene cuenta tiene que
   poder ver a qué precio se está cambiando antes de decidir si entra. La
   sesión se pide al TOMAR, que es cuando hay dinero de por medio. */
router.get('/anuncios', c.anuncios);

router.post('/ordenes', sesion, express.json({ limit: '8kb' }), c.crearOrden);
router.get('/ordenes', sesion, c.misOrdenes);
router.get('/ordenes/:id', sesion, c.unaOrden);
router.post('/ordenes/:id/pagado', sesion, express.json({ limit: '4kb' }), c.pagado);
router.post('/ordenes/:id/liberar', sesion, c.liberar);
router.post('/ordenes/:id/cancelar', sesion, express.json({ limit: '4kb' }), c.cancelar);

module.exports = router;
