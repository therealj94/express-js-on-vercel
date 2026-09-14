// Guarda: verificar que aprender.catalogoParaElModelo existe antes de llamarla
const aprender = require('./aprender');

function obtenerCatalogo() {
  if (typeof aprender.catalogoParaElModelo === 'function') {
    return aprender.catalogoParaElModelo();
  }
  console.error('[equipo] aprender.catalogoParaElModelo no es una función. Módulos cargados:', Object.keys(aprender));
  return Promise.resolve('');
}

// Resto del archivo equipo.js sin cambios...