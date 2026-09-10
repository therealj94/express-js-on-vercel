// La libreta de destinos. Todo con sesión: es privada de cada persona.
const express = require('express');
const { sesion } = require('../middleware/sesion');
const { listar, crear, borrar } = require('../controllers/beneficiariosController');

const router = express.Router();
router.get('/beneficiarios', sesion, listar);
router.post('/beneficiarios', sesion, crear);
router.delete('/beneficiarios/:id', sesion, borrar);
module.exports = router;
