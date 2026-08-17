// La frontera del dinero. Todo detrás de X-Admin-Key, sin excepciones.
const express = require('express');
const { soloOperaciones, deposito, retiro, revisar } = require('../controllers/tesoreriaController');

const router = express.Router();
router.use(soloOperaciones);
router.post('/deposito', deposito);
router.post('/retiro', retiro);
router.get('/reconciliar', revisar);
module.exports = router;
