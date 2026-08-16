// Las rutas de operacion de la casa: alta y baja de agentes, resolver
// disputas, barrer depositos a la caliente y mirar el estado.
//
// No usan la sesion de usuario sino X-Admin-Key contra ORDENEX_ADMIN_KEY.
// El middleware vive aqui mismo y no en middleware/ a proposito: es de estas
// cinco rutas y de nadie mas, y tenerlo pegado a ellas hace imposible que
// alguien lo importe por comodidad en una ruta de usuario.

const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const {
  crearAgente,
  borrarAgente,
  resolverSolicitud,
  barrer,
  estado,
} = require('../controllers/adminController');

function admin(req, res, next) {
  const clave = process.env.ORDENEX_ADMIN_KEY;
  if (!clave) {
    // Sin clave configurada NO hay admin — fail-closed. La alternativa (dejar
    // pasar todo mientras "no este configurado") es exactamente como se
    // termina con un /admin/barrer abierto al mundo en produccion.
    console.error('[admin] ORDENEX_ADMIN_KEY no esta puesta: el panel esta cerrado');
    return res.status(503).json({ error: 'El panel no esta configurado.', codigo: 'SIN_CONFIGURAR' });
  }
  const dada = Buffer.from(String(req.get('X-Admin-Key') || ''));
  const buena = Buffer.from(clave);
  // Comparacion en tiempo constante: un === sobre la clave del panel deja que
  // el tiempo de respuesta cuente cuantos caracteres van acertados.
  if (dada.length !== buena.length || !crypto.timingSafeEqual(dada, buena)) {
    return res.status(401).json({ error: 'La clave no es valida.', codigo: 'ADMIN_INVALIDA' });
  }
  next();
}

router.post('/agentes', admin, crearAgente);
router.delete('/agentes/:id', admin, borrarAgente);
router.post('/solicitudes/:id/resolver', admin, resolverSolicitud);
router.post('/barrer', admin, barrer);
router.get('/estado', admin, estado);

module.exports = router;
