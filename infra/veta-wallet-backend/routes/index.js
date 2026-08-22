var express = require('express');
var router = express.Router();

/* GET home page.
 *
 * Esto es una prueba de VIDA, no de salud, y la diferencia importa: contesta
 * 200 siempre que el proceso este en pie, sin mirar la base de datos ni la
 * cadena. Sirve para saber que el dyno arranco —el guion de despliegue la
 * usa justo para eso— y para nada mas.
 *
 * Puesta en un monitor daria verde con Mongo muerto. Por eso apunta a la que
 * si comprueba: `/salud`.
 */
router.get('/', function (req, res) {
  res.status(200).json({ ok: true, service: 'vetawallet-backend', salud: '/salud' });
});
module.exports = router;
