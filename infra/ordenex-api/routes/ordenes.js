// Las ordenes: colocar, listar las mias, cancelar. Todo con sesion — aqui ya
// se toca el ledger (colocar reserva, cancelar libera), y el ledger solo se
// toca sabiendo de quien es la mano.
//
// Colocar lleva ademas la puerta de los terminos (lib/terminos.js): la primera
// orden de una cuenta no entra sin haber aceptado los terminos y el aviso de
// riesgo vigentes. Listar y cancelar no la llevan a proposito: cancelar
// LIBERA dinero, y una puerta delante de la salida es dinero atrapado.

const express = require('express');
const router = express.Router();
const { sesion } = require('../middleware/sesion');
const { exigirTerminos } = require('../lib/terminos');
const { colocar, listar, cancelar } = require('../controllers/ordenesController');

router.post('/', sesion, exigirTerminos, colocar);
router.get('/', sesion, listar);
router.delete('/:id', sesion, cancelar);

module.exports = router;
