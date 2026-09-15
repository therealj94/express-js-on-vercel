// Guarda: verificar que aprender.catalogoParaElModelo existe antes de llamarla
const aprender = require('./aprender');

function obtenerCatalogo() {
  if (typeof aprender.catalogoParaElModelo === 'function') {
    return aprender.catalogoParaElModelo();
  }
  console.error('[equipo] aprender.catalogoParaElModelo no es una función. Módulos cargados:', Object.keys(aprender));
  return Promise.resolve('');
}

// Estado del signo "equipo": true si el módulo aprender expone la función esperada.
function estado() {
  return typeof aprender.catalogoParaElModelo === 'function';
}

module.exports = { obtenerCatalogo, estado };
