// El precio declarado se mira sin sesion, como el libro y las velas: es una
// resolucion publicada de la Junta, no un dato de cliente.

const express = require('express');
const router = express.Router();
const { declarado } = require('../controllers/preciosController');

router.get('/:token', declarado);

module.exports = router;
