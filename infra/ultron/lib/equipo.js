// Guarda: verificar que aprender.catalogoParaElModelo existe antes de llamarla
const aprender = require('./aprender');

function obtenerCatalogo() {
  if (typeof aprender.catalogoParaElModelo === 'function') {
    return aprender.catalogoParaElModelo();
  }
  console.error('[equipo] aprender.catalogoParaElModelo no es una función. Módulos cargados:', Object.keys(aprender));
  return Promise.resolve('');
}

/* ── ESTADO DEL EQUIPO ───────────────────────────────────────────────────────
   Devuelve el catálogo de bots/agentes que la casa tiene corriendo.
   salud.js llama equipo.estado() en cada ronda; sin esta exportación el
   require devolvía {} y la llamada fallaba con "is not a function". */
async function estado() {
  const catalogo = await obtenerCatalogo();
  return { catalogo, ok: true };
}

module.exports = { estado, obtenerCatalogo };
