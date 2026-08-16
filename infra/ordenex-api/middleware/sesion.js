// La sesion de Ordenex.
//
// El JWT lo emitio POST /auth/sso (o /auth/refresh) firmado HS256 con
// ORDENEX_TOKEN — el secreto es de esta casa, no el PASS_TOKEN de la wallet:
// compartir el secreto de firma seria compartir todas las sesiones, y un
// compromiso de Ordenex no puede volverse un compromiso de la billetera.
//
// Ademas de verificar la firma se hacen tres comprobaciones, y las tres son
// fail-closed:
//
//  1. Que el usuario exista y su gid sea el del token: un token viejo de una
//     cuenta borrada no abre nada.
//  2. Que `tv` (tokenVersion) coincida con el documento. Es el interruptor de
//     revocacion: subir tokenVersion en la base mata TODAS las sesiones vivas
//     sin esperar a que caduquen. Un token sin `tv` tambien se rechaza —
//     un claim ausente no es un claim valido.
//  3. Que no sea un refresh token: el refresh solo sirve en /auth/refresh.
//     Un refresh robado no debe poder operar; solo pedir un par nuevo, y ese
//     pedido ya pasa por tokenVersion.
//
// Cualquier duda es un 401 con el mismo mensaje: a un token invalido no se le
// explica QUE le fallo.

const jwt = require('jsonwebtoken');
const { Usuario } = require('../models');

const NO = { error: 'La sesion no es valida.', codigo: 'SESION_INVALIDA' };

async function sesion(req, res, next) {
  const secreto = process.env.ORDENEX_TOKEN;
  if (!secreto) {
    // Sin secreto no hay forma de distinguir un token bueno de uno malo, asi
    // que no entra nadie. Es un fallo NUESTRO de configuracion, no del
    // cliente, y se dice: un 401 aqui mandaria a la gente a re-loguearse
    // contra un servidor que jamas los va a dejar pasar.
    console.error('[sesion] ORDENEX_TOKEN no esta puesto: no se puede verificar ninguna sesion');
    return res.status(503).json({ error: 'El servicio no esta configurado.', codigo: 'SIN_CONFIGURAR' });
  }

  const cabecera = req.headers.authorization || '';
  if (!cabecera.startsWith('Bearer ')) return res.status(401).json(NO);

  let datos;
  try {
    datos = jwt.verify(cabecera.slice(7), secreto, { algorithms: ['HS256'] });
  } catch {
    return res.status(401).json(NO);
  }

  if (datos.tipo === 'refresh') return res.status(401).json(NO);

  try {
    const usuario = await Usuario.findById(datos.userId);
    if (!usuario || usuario.gid !== datos.gid) return res.status(401).json(NO);
    if (typeof datos.tv !== 'number' || datos.tv !== usuario.tokenVersion) {
      return res.status(401).json(NO);
    }

    // Solo id y gid: lo que las rutas necesitan para saber DE QUIEN hablan.
    // Que el usuario salga de aqui y no del cuerpo de la peticion es lo que
    // impide operar la cuenta de otro.
    req.usuario = { id: String(usuario._id), gid: usuario.gid };
    next();
  } catch (e) {
    // Mongo caido: no se pudo comprobar la sesion, asi que no hay sesion.
    console.error(`[sesion] no se pudo consultar el usuario: ${e.message}`);
    return res.status(503).json({ error: 'No se pudo comprobar la sesion.', codigo: 'NO_SE_PUDO_COMPROBAR' });
  }
}

module.exports = { sesion };
