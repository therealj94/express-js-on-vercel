// Rutas que consumen las aplicaciones del ecosistema.
//
// TODAS exigen clave de API con el alcance correspondiente. Ninguna de ellas
// puede verificar una identidad: lo máximo que hacen es dejarla lista para que
// un operador decida. Esa es la diferencia de fondo con la versión anterior,
// donde una app podía emitir un GID verificado por su cuenta.

import { Router } from 'express'
import { exigeApp, limite } from '../middleware/proteger.js'
import * as ids from '../motor/identidades.js'
import * as biz from '../motor/negocios.js'
import { registrarMovimientos } from '../aml/casos.js'
import { tamizarDireccion } from '../aml/tamiz.js'
import { firmarToken, verificarToken } from '../lib/cripto.js'
import { gidValido, normalizarGid } from '../lib/uid.js'
import { registrar } from '../audit/bitacora.js'
import type { Movimiento } from '../types.js'

export const appsRouter = Router()

const SECRETO_SSO = process.env.GENESIS_SSO_SECRETO || ''
const MINUTOS_TOKEN = Number(process.env.GENESIS_SSO_MINUTOS || 15)

// ─────────────────────────────────────────────────────────────────────────────
// Identidades
// ─────────────────────────────────────────────────────────────────────────────

/** Inicia o retoma la identidad de un usuario. */
appsRouter.post('/identidades', limite(60), exigeApp('identidad.crear'), (req, res) => {
  const { email } = req.body ?? {}
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return res.status(400).json({ error: 'Hace falta un correo válido' })
  }
  const identidad = ids.iniciar(email, `app:${req.app_ecosistema!.clave}`)
  res.json({ identidad: ids.estadoParaUsuario(identidad) })
})

appsRouter.post('/identidades/:id/datos', limite(60), exigeApp('identidad.crear'), (req, res) => {
  const { nombreCompleto, fechaNacimiento, paisResidencia, telefono } = req.body ?? {}
  const identidad = ids.declararDatos(req.params.id,
    { nombreCompleto, fechaNacimiento, paisResidencia, telefono },
    `app:${req.app_ecosistema!.clave}`)
  if (!identidad) return res.status(404).json({ error: 'Identidad no encontrada' })
  res.json({ identidad: ids.estadoParaUsuario(identidad) })
})

/**
 * Recibe la MRZ del documento.
 *
 * Se pide la MRZ ya leída y no la imagen porque el reconocimiento óptico se
 * hace en el teléfono: así la foto del documento no viaja ni se almacena aquí,
 * que es menos dato personal en riesgo por cada usuario.
 */
appsRouter.post('/identidades/:id/documento', limite(30), exigeApp('identidad.documento'), (req, res) => {
  const { mrz } = req.body ?? {}
  if (!mrz || typeof mrz !== 'string') {
    return res.status(400).json({ error: 'Hace falta el texto de la MRZ del documento' })
  }
  const identidad = ids.adjuntarDocumento(req.params.id, mrz, `app:${req.app_ecosistema!.clave}`)
  if (!identidad) return res.status(404).json({ error: 'Identidad no encontrada' })

  // A la app se le dice si el documento sirve y qué falla, pero no el resultado
  // del tamizado de sanciones: eso es información de cumplimiento y avisar al
  // interesado de que saltó una coincidencia es justamente lo que no se debe
  // hacer.
  res.json({
    identidad: ids.estadoParaUsuario(identidad),
    documento: {
      aceptable: identidad.documento?.aceptable ?? false,
      problemas: (identidad.documento?.hallazgos ?? [])
        .filter((h) => h.gravedad === 'grave')
        .map((h) => h.detalle),
    },
  })
})

appsRouter.post('/identidades/:id/biometria', limite(20), exigeApp('identidad.documento'), async (req, res) => {
  const { selfie, fotoDocumento } = req.body ?? {}
  if (!selfie) return res.status(400).json({ error: 'Hace falta el selfie' })
  const identidad = await ids.adjuntarBiometria(
    req.params.id, String(selfie), String(fotoDocumento || ''), `app:${req.app_ecosistema!.clave}`)
  if (!identidad) return res.status(404).json({ error: 'Identidad no encontrada' })
  res.json({
    identidad: ids.estadoParaUsuario(identidad),
    biometria: { estado: identidad.biometria?.estado, motivo: identidad.biometria?.motivo },
  })
})

appsRouter.get('/identidades/:id', limite(120), exigeApp('identidad.leer'), (req, res) => {
  const identidad = ids.porId(req.params.id)
  if (!identidad) return res.status(404).json({ error: 'Identidad no encontrada' })
  res.json({ identidad: ids.estadoParaUsuario(identidad) })
})

appsRouter.get('/identidades/por-email/:email', limite(120), exigeApp('identidad.leer'), (req, res) => {
  const identidad = ids.porEmail(req.params.email)
  if (!identidad) return res.status(404).json({ error: 'Identidad no encontrada' })
  res.json({ identidad: ids.estadoParaUsuario(identidad) })
})

/** Ata una cuenta de la app al GID. Es la base del inicio de sesión único. */
appsRouter.post('/vinculos', limite(60), exigeApp('vinculo.crear'), (req, res) => {
  const { identidadId, cuenta, direccion } = req.body ?? {}
  if (!identidadId || !cuenta) {
    return res.status(400).json({ error: 'Hacen falta identidadId y cuenta' })
  }
  const identidad = ids.vincular(
    String(identidadId), req.app_ecosistema!.clave, String(cuenta),
    direccion ? String(direccion) : null, `app:${req.app_ecosistema!.clave}`)
  if (!identidad) return res.status(404).json({ error: 'Identidad no encontrada' })
  res.json({ ok: true, vinculos: identidad.vinculos.map((v) => ({ app: v.app, cuenta: v.cuenta })) })
})

// ─────────────────────────────────────────────────────────────────────────────
// Consulta de GID — lo que usa el resto del ecosistema
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ¿Está verificado este GID?
 *
 * Devuelve lo mínimo: sí o no, y el nivel de riesgo. Un explorador de bloques
 * no necesita saber el nombre ni la nacionalidad de nadie.
 */
appsRouter.get('/gid/:gid', limite(300), exigeApp('gid.verificar'), (req, res) => {
  const gid = normalizarGid(req.params.gid)
  if (!gidValido(gid)) {
    return res.status(400).json({ error: 'GID mal formado (falla el dígito verificador)' })
  }
  const identidad = ids.porGid(gid)
  const negocio = biz.porGidNegocio(gid)
  if (!identidad && !negocio) return res.status(404).json({ error: 'GID no encontrado' })

  const puedeVerPerfil = req.app_ecosistema!.alcances.includes('gid.perfil')
  if (identidad) {
    return res.json(puedeVerPerfil
      ? { tipo: 'personal', ...ids.perfilPublico(identidad) }
      : { tipo: 'personal', gid, verificada: identidad.estado === 'verificada' })
  }
  res.json({ tipo: 'negocio', ...biz.perfilNegocio(negocio!) })
})

/** ¿Hay identidad verificada detrás de esta dirección on-chain? */
appsRouter.get('/direccion/:direccion', limite(300), exigeApp('gid.verificar'), (req, res) => {
  const identidad = ids.porDireccion(req.params.direccion)
  if (!identidad) return res.json({ verificada: false, gid: null })
  res.json({ verificada: identidad.estado === 'verificada', gid: identidad.gid })
})

/** Tamizado de una dirección contra listas de sanciones. */
appsRouter.get('/tamiz/direccion/:direccion', limite(300), exigeApp('tamiz.direccion'), (req, res) => {
  const r = tamizarDireccion(req.params.direccion)
  res.json({
    tamizado: r.tamizado,
    sancionada: r.sancionada,
    // Si no hay listas cargadas se dice claramente, para que la app no
    // interprete un "false" como "está limpia".
    aviso: r.tamizado ? undefined : 'No hay listas cargadas: la dirección NO ha sido tamizada',
    ficha: r.registro ? { nombre: r.registro.nombre, lista: r.registro.lista, programa: r.registro.programa } : null,
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Inicio de sesión único del ecosistema
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Emite un token para que el usuario de una app entre en otra sin repetir el
 * KYC.
 *
 * MODELO DE CONFIANZA: la app que pide el token ya autenticó al usuario por su
 * cuenta, y responde por ello con su clave de API. Genesis ID comprueba que esa
 * cuenta esté efectivamente atada a ese GID, pero no vuelve a autenticar a la
 * persona. Es un modelo de cliente de confianza, válido porque las tres apps
 * son del mismo ecosistema; no sería aceptable para aplicaciones de terceros.
 */
appsRouter.post('/sso/token', limite(60), exigeApp('gid.verificar'), (req, res) => {
  if (!SECRETO_SSO) {
    return res.status(503).json({ error: 'El inicio de sesión único no está configurado (falta GENESIS_SSO_SECRETO)' })
  }
  const { gid, cuenta } = req.body ?? {}
  const g = normalizarGid(String(gid || ''))
  if (!gidValido(g) || !cuenta) {
    return res.status(400).json({ error: 'Hacen falta un GID válido y la cuenta' })
  }

  const identidad = ids.porGid(g)
  if (!identidad || identidad.estado !== 'verificada') {
    return res.status(403).json({ error: 'El GID no corresponde a una identidad verificada' })
  }
  const atada = identidad.vinculos.some(
    (v) => v.app === req.app_ecosistema!.clave && v.cuenta === String(cuenta))
  if (!atada) {
    return res.status(403).json({ error: 'Esa cuenta no está atada a este GID en esta aplicación' })
  }

  const emitido = Math.floor(Date.now() / 1000)
  const token = firmarToken({
    sub: g,
    app: req.app_ecosistema!.clave,
    alcances: ['perfil'],
    iat: emitido,
    exp: emitido + MINUTOS_TOKEN * 60,
  }, SECRETO_SSO)

  registrar(`app:${req.app_ecosistema!.clave}`, 'sso.token', g, { cuenta })
  res.json({ token, expiraEnSegundos: MINUTOS_TOKEN * 60 })
})

/** Cualquier app del ecosistema valida aquí un token emitido por otra. */
appsRouter.post('/sso/verificar', limite(300), exigeApp('gid.verificar'), (req, res) => {
  if (!SECRETO_SSO) return res.status(503).json({ error: 'El inicio de sesión único no está configurado' })
  const reclamos = verificarToken(String(req.body?.token || ''), SECRETO_SSO)
  if (!reclamos) return res.status(401).json({ valido: false, error: 'Token inválido o vencido' })

  const identidad = ids.porGid(reclamos.sub)
  if (!identidad || identidad.estado !== 'verificada') {
    // La identidad puede haberse suspendido después de emitir el token.
    return res.status(403).json({ valido: false, error: 'La identidad ya no está verificada' })
  }
  res.json({
    valido: true,
    gid: reclamos.sub,
    emitidoPor: reclamos.app,
    expira: new Date(reclamos.exp * 1000).toISOString(),
    perfil: req.app_ecosistema!.alcances.includes('gid.perfil') ? ids.perfilPublico(identidad) : undefined,
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Negocios
// ─────────────────────────────────────────────────────────────────────────────

appsRouter.post('/negocios', limite(30), exigeApp('negocio.crear'), (req, res) => {
  const b = req.body ?? {}
  const faltan = ['emailDueno', 'razonSocial', 'nombreComercial', 'identificadorFiscal', 'categoria', 'pais', 'ciudad', 'direccion']
    .filter((c) => !b[c])
  if (faltan.length) return res.status(400).json({ error: `Faltan campos: ${faltan.join(', ')}` })

  const r = biz.registrarNegocio(b, `app:${req.app_ecosistema!.clave}`)
  if (!r.ok) return res.status(400).json({ error: r.motivo })
  res.json({
    negocio: biz.perfilNegocio(r.negocio!),
    id: r.negocio!.id,
    documentosPendientes: r.negocio!.documentos.filter((d) => !d.recibidoEn).map((d) => d.nombre),
  })
})

appsRouter.post('/negocios/:id/beneficiarios', limite(30), exigeApp('negocio.crear'), (req, res) => {
  const { nombreCompleto, porcentaje, via, fechaNacimiento, nacionalidad, gid } = req.body ?? {}
  if (!nombreCompleto || typeof porcentaje !== 'number') {
    return res.status(400).json({ error: 'Hacen falta nombreCompleto y porcentaje' })
  }
  const r = biz.agregarBeneficiario(req.params.id,
    { nombreCompleto, porcentaje, via, fechaNacimiento, nacionalidad, gid },
    `app:${req.app_ecosistema!.clave}`)
  if (!r.ok) return res.status(400).json({ error: r.motivo })
  res.json({ ok: true, pendientes: r.negocio!.riesgo?.bloqueos ?? [] })
})

appsRouter.get('/negocios/:id', limite(120), exigeApp('negocio.crear'), (req, res) => {
  const negocio = biz.porId(req.params.id)
  if (!negocio) return res.status(404).json({ error: 'Negocio no encontrado' })
  res.json({
    negocio: biz.perfilNegocio(negocio),
    documentosPendientes: negocio.documentos.filter((d) => !d.recibidoEn).map((d) => d.nombre),
    pendientes: negocio.riesgo?.bloqueos ?? [],
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Monitoreo
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Las apps mandan aquí los movimientos para que se evalúen las reglas AML.
 *
 * La respuesta NO dice si saltó una alerta. Que el usuario sepa que disparó una
 * regla de monitoreo es contraproducente —le enseña a esquivarla— y en muchas
 * jurisdicciones está expresamente prohibido avisarle.
 */
appsRouter.post('/movimientos', limite(120), exigeApp('movimiento.enviar'), (req, res) => {
  const { gid, movimientos } = req.body ?? {}
  const g = normalizarGid(String(gid || ''))
  if (!gidValido(g) || !Array.isArray(movimientos)) {
    return res.status(400).json({ error: 'Hacen falta un GID válido y la lista de movimientos' })
  }

  const limpios: Movimiento[] = movimientos
    .filter((m: any) => m && m.id && typeof m.montoUsd === 'number')
    .map((m: any) => ({
      id: String(m.id),
      gid: g,
      direccion: m.direccion === 'salida' ? 'salida' : 'entrada',
      contraparte: String(m.contraparte || ''),
      monto: Number(m.monto) || 0,
      activo: String(m.activo || ''),
      montoUsd: Number(m.montoUsd),
      fecha: m.fecha || new Date().toISOString(),
      app: req.app_ecosistema!.clave,
      paisContraparte: m.paisContraparte ?? null,
      hash: m.hash ?? null,
    }))

  registrarMovimientos(g, limpios, `app:${req.app_ecosistema!.clave}`)
  res.json({ ok: true, recibidos: limpios.length })
})
