// Las cuentas en moneda local.
//
// GET /monedas va sin sesión a propósito: la web necesita la lista para pintar
// la portada, y no hay nada privado en decir que la casa maneja el quetzal.
const express = require('express');
const { sesion } = require('../middleware/sesion');
const { monedas, listar, abrir, misLimites, perfil } = require('../controllers/cuentasController');

const router = express.Router();
router.get('/monedas', monedas);
router.get('/cuentas', sesion, listar);
router.post('/cuentas', sesion, abrir);
router.get('/limites', sesion, misLimites);
router.get('/perfil', sesion, perfil);
module.exports = router;
