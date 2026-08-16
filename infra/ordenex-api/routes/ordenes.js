// Las ordenes: colocar, listar las mias, cancelar. Todo con sesion — aqui ya
// se toca el ledger (colocar reserva, cancelar libera), y el ledger solo se
// toca sabiendo de quien es la mano.

const express = require('express');
const router = express.Router();
const { sesion } = require('../middleware/sesion');
const { colocar, listar, cancelar } = require('../controllers/ordenesController');

router.post('/', sesion, colocar);
router.get('/', sesion, listar);
router.delete('/:id', sesion, cancelar);

module.exports = router;
