// Las cuentas en moneda local.
//
// GET /monedas va sin sesión a propósito: la web necesita la lista para pintar
// la portada, y no hay nada privado en decir que la casa maneja el quetzal.
const express = require('express');
const { sesion } = require('../middleware/sesion');
const { monedas, listar, abrir } = require('../controllers/cuentasController');

const router = express.Router();
router.get('/monedas', monedas);
router.get('/cuentas', sesion, listar);
router.post('/cuentas', sesion, abrir);
module.exports = router;
