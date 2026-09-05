// Vender ORIGEN por USDT: cotizar, vender, y ver las propias.
//
// Cotizar NO exige términos: es una lectura y no compromete nada, y un 409 a
// mitad de una pantalla que solo enseña un número no le dice nada a nadie.
// Vender SÍ los exige, porque ahí nace el compromiso y sale dinero de la casa.

const express = require('express');
const router = express.Router();
const { sesion } = require('../middleware/sesion');
const { exigirTerminos } = require('../lib/terminos');
const { cotizar, vender, mias, limites } = require('../controllers/ventasController');

// Sin sesion: el techo que la casa puede pagar es de quien va a vender.
router.get('/limites', limites);
router.post('/cotizar', sesion, cotizar);
router.post('/', sesion, exigirTerminos, vender);
router.get('/', sesion, mias);

module.exports = router;
