// Comprar ORIGEN con USDT: congelar el precio, mirar cómo va, y decidir qué
// hacer si el plazo se acabó.
//
// El sondeo (GET /compras/:id) va cada ocho segundos desde la pantalla, así
// que NO lleva exigirTerminos: es una lectura, y un 409 a mitad de una compra
// en curso dejaría el riel congelado sin decir por qué. Los términos se piden
// donde nace el compromiso, que es al abrir.

const express = require('express');
const router = express.Router();
const { sesion } = require('../middleware/sesion');
const { exigirTerminos } = require('../lib/terminos');
const { abrir, ver, mias, confirmar, cancelar } = require('../controllers/comprasController');

router.post('/', sesion, exigirTerminos, abrir);
router.get('/', sesion, mias);
router.get('/:id', sesion, ver);
// Confirmar un recálculo es aceptar un precio nuevo: es un compromiso, y por
// eso vuelve a pasar por los términos.
router.post('/:id/confirmar', sesion, exigirTerminos, confirmar);
router.post('/:id/cancelar', sesion, cancelar);

module.exports = router;
