// El circuito fiat entre personas. La casa no toca lempiras ni dolares —
// principio 1 del contrato —: aqui solo se abre la solicitud, se custodia el
// ORIGEN en garantia y se arbitra.
//
// GET /agentes es publico a proposito: quien todavia no tiene cuenta necesita
// ver que SI hay agentes antes de molestarse en entrar. Lo que jamas sale por
// ahi son los numeros de cuenta bancaria — esos solo los ve el usuario con
// una solicitud abierta contra ese agente, y eso lo decide el controller.
//
// Que /tomar sea de agente (y /confirmar dependa de quien confirma segun el
// tipo de solicitud) lo comprueba el controller contra la coleccion de
// agentes: la ruta solo garantiza que hay UNA sesion detras.

const express = require('express');
const router = express.Router();
const { sesion } = require('../middleware/sesion');
// La misma puerta de los terminos que en /ordenes: abrir una solicitud es
// abrir una operacion. Tomar, avisar, confirmar y cancelar siguen sin ella —
// son pasos de una solicitud que ya existe, y frenar una confirmacion o una
// cancelacion es dejar ORIGEN en garantia sin salida.
const { exigirTerminos } = require('../lib/terminos');
const {
  agentes,
  crearSolicitud,
  listarSolicitudes,
  tomar,
  avisar,
  confirmar,
  cancelar,
  disputar,
} = require('../controllers/fiatController');

router.get('/agentes', agentes);

router.post('/solicitudes', sesion, exigirTerminos, crearSolicitud);
router.get('/solicitudes', sesion, listarSolicitudes);

router.post('/solicitudes/:id/tomar', sesion, tomar);
router.post('/solicitudes/:id/avisar', sesion, avisar);
router.post('/solicitudes/:id/confirmar', sesion, confirmar);
router.post('/solicitudes/:id/cancelar', sesion, cancelar);
router.post('/solicitudes/:id/disputar', sesion, disputar);

module.exports = router;
