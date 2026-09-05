// Lo mio: saldos, retiros y movimientos. Este router se monta en la raiz
// porque sus tres rutas son de primer nivel en el contrato — no cuelgan de
// /portafolio — pero viven juntas porque son la misma pregunta con tres
// formas: ¿que tengo, como lo saco, y que paso con ello?

const express = require('express');
const router = express.Router();
const { sesion } = require('../middleware/sesion');
const { portafolio, retirar, movimientos } = require('../controllers/portafolioController');
const { misTratos } = require('../controllers/ordenesController');

router.get('/portafolio', sesion, portafolio);
// El retiro firma desde la caliente: el circuito entero (tamiz → debitar →
// firmar → anotar → AML, con retiroKey idempotente) vive en el controller.
router.post('/retiros', sesion, retirar);
router.get('/movimientos', sesion, movimientos);
// Mis tratos: la cuarta forma de la misma pregunta —que se me calzo, a que
// precio— y la que un exchange enseña como «historial de operaciones».
router.get('/tratos', sesion, misTratos);

module.exports = router;
