// Los terminos y condiciones y el aviso de riesgo: la version vigente y la
// puerta que exige haberlos aceptado antes de la primera orden.
//
// EL TEXTO NO VIVE AQUI. Vive en la web (apps-web/ordenex/legal.html), que es
// donde la gente lo lee; aqui vive la VERSION, que es lo unico que el API
// necesita para saber si lo que alguien acepto es lo que hoy esta publicado.
// Cuando el texto cambie de fondo, se sube la fecha de abajo y la casa vuelve
// a pedir la aceptacion a todo el mundo — un consentimiento a un texto viejo
// no cubre el nuevo.
//
// QUE SE GUARDA. En el usuario: `terminosVersion` (la que acepto) y
// `terminosEn` (cuando). Nada mas: ni IP ni navegador — no hacen falta para
// probar que se acepto, y todo lo que se guarda de mas es lo que un dia se
// filtra.
//
// POR QUE ES UN MIDDLEWARE Y NO UNA CASILLA DE LA PANTALLA. La pantalla ya
// pide marcar la casilla en la confirmacion de la primera orden; eso esta bien
// y no basta, porque POST /ordenes se puede llamar con curl. La puerta que
// cuenta es esta, y se monta en las dos rutas que abren una operacion:
// colocar una orden y abrir una solicitud fiat.

const { Usuario } = require('../models');

// La version es la fecha de publicacion del texto, en ISO. Se compara por
// igualdad exacta: no hay «version mas nueva que»; o es la vigente o no.
const TERMINOS_VERSION = '2026-09-02';

// Donde leerlos. Rutas relativas a la web: la web sabe su propio origen.
const TERMINOS_RUTA = 'legal.html#terminos';
const RIESGO_RUTA = 'legal.html#riesgo';

/** Lo que se le contesta a quien pregunta que hay que aceptar. */
function publico(aceptada) {
  return { version: TERMINOS_VERSION, terminos: TERMINOS_RUTA, riesgo: RIESGO_RUTA, aceptada: aceptada === true };
}

/** ¿Este usuario tiene aceptada la version vigente? */
const aceptoVigente = (usuario) => Boolean(usuario) && usuario.terminosVersion === TERMINOS_VERSION;

/**
 * El middleware: va DESPUES de `sesion` (necesita req.usuario). Sin
 * aceptacion vigente, 403 TERMINOS_NO_ACEPTADOS con la version que hace
 * falta — el cliente sabe asi que tiene que enseñar el texto y pedir la
 * casilla, no que la sesion vencio.
 */
async function exigirTerminos(req, res, next) {
  try {
    const u = await Usuario.findById(req.usuario.id, { terminosVersion: 1 }).lean();
    if (!aceptoVigente(u)) {
      return res.status(403).json({
        error: 'Antes de operar hay que aceptar los terminos y condiciones y el aviso de riesgo vigentes.',
        codigo: 'TERMINOS_NO_ACEPTADOS',
        ...publico(false),
      });
    }
    next();
  } catch (e) {
    console.error(`[terminos] no se pudo comprobar la aceptacion: ${e.message}`);
    // Mongo caido: no se sabe si acepto, asi que no opera. Fail-closed.
    return res.status(503).json({ error: 'No se pudo comprobar la aceptacion de los terminos.', codigo: 'NO_SE_PUDO_COMPROBAR' });
  }
}

/** GET /auth/terminos 🔒 → { version, terminos, riesgo, aceptada } */
async function consultar(req, res) {
  try {
    const u = await Usuario.findById(req.usuario.id, { terminosVersion: 1 }).lean();
    return res.json(publico(aceptoVigente(u)));
  } catch (e) {
    return res.status(503).json({ error: 'No se pudo leer.', codigo: 'NO_SE_PUDO_LEER' });
  }
}

/** POST /auth/terminos {version} 🔒 → { version, aceptada: true }
 *
 *  La version viaja en el cuerpo y tiene que ser LA vigente: aceptar «lo que
 *  haya» no es aceptar nada. Un cliente con la pagina vieja manda la version
 *  vieja, recibe VERSION_VIEJA y recarga. */
async function aceptar(req, res) {
  const { version } = req.body || {};
  if (version !== TERMINOS_VERSION) {
    return res.status(409).json({
      error: 'Esa no es la version vigente de los terminos: recarga la pagina y volve a leerlos.',
      codigo: 'VERSION_VIEJA',
      ...publico(false),
    });
  }
  try {
    const u = await Usuario.findByIdAndUpdate(
      req.usuario.id,
      { $set: { terminosVersion: TERMINOS_VERSION, terminosEn: new Date() } },
      { new: true, projection: { terminosVersion: 1 } }
    ).lean();
    if (!u) return res.status(401).json({ error: 'La sesion no es valida.', codigo: 'SESION_INVALIDA' });
    console.log(`[terminos] ${req.usuario.gid} acepto la version ${TERMINOS_VERSION}`);
    return res.json(publico(true));
  } catch (e) {
    console.error(`[terminos] no se pudo guardar la aceptacion: ${e.message}`);
    return res.status(503).json({ error: 'No se pudo guardar la aceptacion.', codigo: 'NO_SE_PUDO_GUARDAR' });
  }
}

module.exports = { TERMINOS_VERSION, TERMINOS_RUTA, RIESGO_RUTA, publico, aceptoVigente, exigirTerminos, consultar, aceptar };
