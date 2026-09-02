// La puerta de AuCorp: el SSO de Genesis y su refresco.
//
// Aqui no hay /login ni contraseñas, y no es una omision: es el contrato. Se
// entra con la cuenta de Veta Wallet — la wallet le pide a Genesis un token de
// paso (su POST /genesis/sso/token), la web de AuCorp lo trae a POST
// /auth/sso, y ESTE servidor lo comprueba contra Genesis con su propia
// GENESIS_API_KEY. Si Genesis dice que si, se emite la sesion PROPIA de la
// casa: JWT HS256 firmado con AUCORP_TOKEN — nunca el PASS_TOKEN de la
// wallet, porque compartir el secreto de firma seria compartir todas las
// sesiones, y un compromiso de AuCorp no puede volverse uno de la billetera.
//
// El refresco es el de la wallet, con tokenVersion: el refresh lleva el `tv`
// del momento en que se emitio y solo se canjea mientras el documento tenga el
// mismo. Subir tokenVersion en la base revoca todo lo emitido antes sin
// esperar a que caduque.

const jwt = require('jsonwebtoken');
const { Usuario } = require('../models');
const genesis = require('../lib/genesis');

// La misma respuesta opaca que middleware/sesion.js: a un token invalido no se
// le explica QUE le fallo.
const NO = { error: 'La sesion no es valida.', codigo: 'SESION_INVALIDA' };

/**
 * El par de la casa. El contrato pide { userId, gid } en el acceso; `tv` viaja
 * ademas porque middleware/sesion.js lo exige para poder revocar — un acceso
 * sin tv seria un token que ninguna subida de tokenVersion puede matar durante
 * sus 40 minutos de vida. El refresh lleva `tipo: 'refresh'` (en español, como
 * todo aqui: es la marca que el middleware rechaza para que un refresh robado
 * no pueda operar — solo canjearse, y el canje pasa por tokenVersion).
 */
function emitirPar(usuario, secreto) {
  const tv = usuario.tokenVersion || 0;
  const token = jwt.sign(
    { userId: String(usuario._id), gid: usuario.gid, tv },
    secreto,
    { algorithm: 'HS256', expiresIn: '40m' }
  );
  const refreshToken = jwt.sign(
    { userId: String(usuario._id), tipo: 'refresh', tv },
    secreto,
    { algorithm: 'HS256', expiresIn: '30d' }
  );
  return { token, refreshToken };
}

// ── POST /auth/sso ──────────────────────────────────────────────────────────
// { token } → { token, refreshToken, usuario }
async function sso(req, res) {
  const secreto = process.env.AUCORP_TOKEN;
  if (!secreto) {
    // Sin secreto no se puede emitir nada. Es un fallo NUESTRO y se dice como
    // tal: un 401 aqui mandaria a la gente a sacar otro token de SSO contra un
    // servidor que jamas va a poder abrirles.
    console.error('[auth] AUCORP_TOKEN no esta puesto: no se puede emitir ninguna sesion');
    return res.status(503).json({ error: 'El servicio no esta configurado.', codigo: 'SIN_CONFIGURAR' });
  }

  const token = req.body?.token;
  if (typeof token !== 'string' || !token.trim()) {
    return res.status(400).json({ error: 'Falta el token del SSO.', codigo: 'TOKEN_FALTA', campo: 'token' });
  }
  // Un token de paso de Genesis es un JWT corto. Cuatro mil caracteres es
  // más de lo que mide cualquiera; lo que pase de ahí no es un token.
  if (token.length > 4096) {
    return res.status(400).json({ error: 'El token del SSO no tiene la forma esperada.', codigo: 'TOKEN_INVALIDO', campo: 'token' });
  }

  // 1. Genesis decide. Si no contesta, no se adivina: sin comprobacion no hay
  // sesion (fail-closed), y el 503 le dice al cliente "reintenta", que no es
  // lo mismo que el 401 de "ese token no vale, saca otro".
  let acceso;
  try {
    acceso = await genesis.verificarSso(token.trim());
  } catch (e) {
    console.error(`[auth] no se pudo verificar el SSO contra Genesis: ${e.message}`);
    return res.status(503).json({ error: 'No se pudo comprobar el acceso.', codigo: 'GENESIS_NO_DISPONIBLE' });
  }
  if (!acceso.valido || !acceso.gid) {
    return res.status(401).json({ error: 'El acceso no es valido o ya vencio.', codigo: 'SSO_INVALIDO' });
  }

  // 2. El perfil tiene que venir: de ahi salen `verificada` y la direccion
  // custodiada. Genesis solo lo manda a las apps con alcance gid.perfil, asi
  // que si falta es que a la clave de esta casa le falta ese alcance — un
  // fallo NUESTRO de configuracion, no del usuario, y no se le cobra a el.
  const perfil = acceso.perfil;
  if (!perfil || typeof perfil !== 'object') {
    console.error('[auth] Genesis verifico el token pero no mando perfil: a la clave de aucorp le falta el alcance gid.perfil');
    return res.status(503).json({ error: 'El servicio no esta bien configurado.', codigo: 'SIN_CONFIGURAR' });
  }

  // 3. La direccion custodiada del usuario en Veta Wallet, de perfil.apps[].
  // Puede faltar (un vinculo viejo sin direccion): eso no cierra la puerta —
  // la direccion se enseña y se consulta, pero no hace falta para entrar; lo
  // que si exige direccion (retiros, fiat) tiene sus propias guardas.
  const vinculo = Array.isArray(perfil.apps)
    ? perfil.apps.find((a) => a && a.app === 'veta-wallet' && a.direccion)
    : null;
  const direccionWallet = vinculo ? String(vinculo.direccion) : null;

  // 4. Upsert por gid. Lo que Genesis afirma HOY pisa lo guardado — es la
  // fuente de la identidad, no un formulario del usuario — con dos cuidados:
  // un nombre ausente no borra el que ya sabiamos (el perfil trae null si la
  // identidad dejo de estar verificada) y una direccion ausente tampoco — la
  // custodiada de la wallet no cambia, y borrarla por un vinculo a medias
  // dejaria al usuario sin poder verla.
  const cambios = { verificada: perfil.verificada === true };
  if (typeof perfil.nombre === 'string' && perfil.nombre.trim()) cambios.nombre = perfil.nombre.trim();
  if (direccionWallet) cambios.direccionWallet = direccionWallet;

  let usuario = null;
  try {
    usuario = await Usuario.findOneAndUpdate(
      { gid: acceso.gid },
      { $set: cambios },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  } catch (e) {
    if (e && e.code === 11000) {
      // Dos SSO del mismo gid a la vez: el indice unico corta a uno de los
      // dos upserts. El documento ya existe, asi que se reintenta una vez y
      // ahora es un update normal.
      try {
        usuario = await Usuario.findOneAndUpdate({ gid: acceso.gid }, { $set: cambios }, { new: true });
      } catch (e2) {
        console.error(`[auth] el upsert de ${acceso.gid} fallo dos veces: ${e2.message}`);
      }
    } else {
      console.error(`[auth] no se pudo guardar el usuario del gid ${acceso.gid}: ${e.message}`);
    }
  }
  if (!usuario) {
    return res.status(503).json({ error: 'No se pudo abrir la sesion.', codigo: 'NO_SE_PUDO' });
  }

  // 5. La respuesta del contrato. El `usuario` va sin nada interno — ni
  // tokenVersion ni direccion de deposito ni _id suelto: lo que la web
  // necesita para saludar y decidir que enseñar, nada mas.
  return res.json({
    ...emitirPar(usuario, secreto),
    usuario: {
      gid: usuario.gid,
      nombre: usuario.nombre || '',
      verificada: usuario.verificada === true,
      direccionWallet: usuario.direccionWallet || null,
      nivel: usuario.nivel || 1,
    },
  });
}

// ── POST /auth/refresh ──────────────────────────────────────────────────────
// { refreshToken } → { token, refreshToken } (el par nuevo)
async function refresh(req, res) {
  const secreto = process.env.AUCORP_TOKEN;
  if (!secreto) {
    console.error('[auth] AUCORP_TOKEN no esta puesto: no se puede canjear ningun refresh');
    return res.status(503).json({ error: 'El servicio no esta configurado.', codigo: 'SIN_CONFIGURAR' });
  }

  const refreshToken = req.body?.refreshToken;
  if (typeof refreshToken !== 'string' || !refreshToken || refreshToken.length > 4096) {
    return res.status(400).json({ error: 'Falta refreshToken.', codigo: 'REFRESH_FALTA', campo: 'refreshToken' });
  }

  let datos;
  try {
    datos = jwt.verify(refreshToken, secreto, { algorithms: ['HS256'] });
  } catch {
    return res.status(401).json(NO);
  }
  // Solo un refresh se canjea aqui: un token de acceso robado no debe poder
  // alargarse a si mismo 30 dias por esta ventanilla.
  if (datos.tipo !== 'refresh') return res.status(401).json(NO);

  try {
    const usuario = await Usuario.findById(datos.userId);
    if (!usuario) return res.status(401).json(NO);
    // Revocacion, como en la wallet pero estricta: un `tv` ausente no es un
    // `tv` que coincide — un claim que falta no es un claim valido.
    if (typeof datos.tv !== 'number' || datos.tv !== (usuario.tokenVersion || 0)) {
      return res.status(401).json(NO);
    }
    return res.json(emitirPar(usuario, secreto));
  } catch (e) {
    // Mongo caido: no se pudo comprobar, asi que no se canjea. El cliente
    // reintenta con el mismo refresh — que sigue siendo valido — mas tarde.
    console.error(`[auth] no se pudo canjear el refresh: ${e.message}`);
    return res.status(503).json({ error: 'No se pudo comprobar la sesion.', codigo: 'NO_SE_PUDO_COMPROBAR' });
  }
}

module.exports = { sso, refresh };
