// Los mercados son publicos, todos: la lista, el libro, las velas y los
// tratos se miran sin sesion. Un exchange que esconde su libro detras de un
// login no esta protegiendo nada — solo esta impidiendo que alguien mire el
// precio antes de decidir si entra. La sesion se pide al OPERAR, no al mirar.

const express = require('express');
const router = express.Router();
const { listar, libro, velas, tratos } = require('../controllers/mercadosController');

router.get('/', listar);
router.get('/:par/libro', libro);
router.get('/:par/velas', velas);
router.get('/:par/tratos', tratos);

module.exports = router;
