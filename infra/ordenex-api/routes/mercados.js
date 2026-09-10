// Los mercados son publicos, todos: la lista, el libro, las velas y los
// tratos se miran sin sesion. Un exchange que esconde su libro detras de un
// login no esta protegiendo nada — solo esta impidiendo que alguien mire el
// precio antes de decidir si entra. La sesion se pide al OPERAR, no al mirar.

const express = require('express');
const router = express.Router();
const { listar, libro, velas, tratos, referencia } = require('../controllers/mercadosController');

router.get('/', listar);
router.get('/:par/libro', libro);
router.get('/:par/velas', velas);
router.get('/:par/tratos', tratos);
// Puerta aparte para la otra clase de vela: /velas son TRATOS de esta casa en
// ORIGEN, /referencia es el metal REAL en dolares y rotulado. Dos rutas para
// que ni un descuido las sirva mezcladas.
router.get('/:par/referencia', referencia);

module.exports = router;
