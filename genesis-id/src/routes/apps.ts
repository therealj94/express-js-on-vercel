// Rutas que consumen las aplicaciones del ecosistema.
//
// TODAS exigen clave de API con el alcance correspondiente. Ninguna de ellas
// puede verificar una identidad: lo máximo que hacen es dejarla lista para que
// un operador decida. Esa es la diferencia de fondo con la versión anterior,
// donde una app podía emitir un GID verificado por su cuenta.

import { Router } from 'express'
import { exigeApp, limite, pesada } from '../middleware/proteger.js'
import * as ids from '../motor/identidades.js'
import * as biz from '../motor/negocios.js'
import { registrarMovimientos } from '../aml/casos.js'
import { tamizarDireccion } from '../aml/tamiz.js'
import { firmarToken, verificarToken } from '../lib/cripto.js'
import { gidValido, normalizarGid } from '../lib/uid.js'
import { registrar } from '../audit/bitacora.js'
import { emitirReto, comprobarReto } from '../kyc/vivacidad.js'
import { biometriaConfigurada } from '../kyc/biometria.js'
import type { Movimiento } from '../types.js'

export const appsRouter = Router()

const SECRETO_SSO = process.env.GENESIS_SSO_SECRETO || ''
const MINUTOS_TOKEN = Number(process.env.GENESIS_SSO_MINUTOS || 15)

// ─────────────────────────────────────────────────────────────────────────────
// Identidades
// ─────────────────────────────────────────────────────────────────────────────

/** Inicia o retoma la identidad de un usuario. */
appsRouter.post('/identidades', limite(60), exigeApp('identidad.crear'), async (req, res) => {
  const { email } = req.body ?? {}
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return res.status(400).json({ error: 'Hace falta un correo válido' })
  }
  const identidad = ids.iniciar(email, `app:${req.app_ecosistema!.clave}`)
  res.json({ identidad: await ids.estadoParaUsuarioConFoto(identidad) })
})

appsRouter.post('/identidades/:id/datos', limite(60), exigeApp('identidad.crear'), async (req, res) => {
  const b = req.body ?? {}
  // Se enumeran uno por uno a propósito: así el cuerpo de la petición no puede
  // escribir campos que no le corresponden —estado, gid, riesgo— por el simple
  // hecho de venir con ese nombre.
  const identidad = ids.declararDatos(req.params.id, {
    nombreCompleto: b.nombreCompleto,
    fechaNacimiento: b.fechaNacimiento,
    paisResidencia: b.paisResidencia,
    telefono: b.telefono,
    direccion: b.direccion,
    ocupacion: b.ocupacion,
    origenFondos: b.origenFondos,
    propositoCuenta: b.propositoCuenta,
    volumenEsperadoUsd: b.volumenEsperadoUsd,
    pepDeclarado: typeof b.pepDeclarado === 'boolean' ? b.pepDeclarado : undefined,
  }, `app:${req.app_ecosistema!.clave}`)
  if (!identidad) return res.status(404).json({ error: 'Identidad no encontrada' })
  res.json({ identidad: await ids.estadoParaUsuarioConFoto(identidad) })
})

/**
 * Recibe la MRZ del documento.
 *
 * Se pide la MRZ ya leída y no la imagen porque el reconocimiento óptico se
 * hace en el teléfono: así la foto del documento no viaja ni se almacena aquí,
 * que es menos dato personal en riesgo por cada usuario.
 */
appsRouter.post('/identidades/:id/documento', limite(30), pesada, exigeApp('identidad.documento'), async (req, res) => {
  const { mrz, textoAnverso } = req.body ?? {}
  if (!mrz || typeof mrz !== 'string') {
    return res.status(400).json({ error: 'Hace falta el texto de la MRZ del documento' })
  }
  // Del anverso llega TEXTO, nunca la imagen: el reconocimiento se hace en el
  // teléfono y aquí solo entran las palabras. Se acota el largo porque de una
  // cédula salen unas pocas líneas, no un documento entero.
  const anverso = typeof textoAnverso === 'string' ? textoAnverso.slice(0, 4000) : null
  const identidad = ids.adjuntarDocumento(
    req.params.id, mrz, `app:${req.app_ecosistema!.clave}`, anverso)
  if (!identidad) return res.status(404).json({ error: 'Identidad no encontrada' })

  // A la app se le dice si el documento sirve y qué falla, pero no el resultado
  // del tamizado de sanciones: eso es información de cumplimiento y avisar al
  // interesado de que saltó una coincidencia es justamente lo que no se debe
  // hacer.
  res.json({
    identidad: await ids.estadoParaUsuarioConFoto(identidad),
    documento: {
      aceptable: identidad.documento?.aceptable ?? false,
      anverso: identidad.documento?.anverso ?? null,
      problemas: (identidad.documento?.hallazgos ?? [])
        .filter((h) => h.gravedad === 'grave')
        .map((h) => h.detalle),
    },
  })
})

/**
 * Lo que se acepta por cara, medido sobre el texto base64 que llega.
 *
 * Estaba en 11 000 000 —unos 8 MB de foto— con un mensaje de error que hablaba
 * de 8 MB: ni el número ni el mensaje decían la verdad, y sobre todo el número
 * era una invitación a subir el álbum entero. Tres megas de base64 son unos
 * 2,2 MB de imagen: el doble de lo que produce la compresión del navegador
 * (~1,1 MB por cara) y de sobra para que un operador lea una cédula. Más que
 * eso no mejora la lectura; solo engorda lo que hay que guardar de una persona.
 *
 * El mensaje de error sale de esta misma constante para que no puedan volver a
 * separarse.
 */
const TOPE_POR_CARA = 3_000_000

/**
 * El documento como DOS FOTOS, para quien se verifica desde un navegador.
 *
 * En el navegador no hay lector de la zona mecánica —eso es ML Kit, y es
 * nativo—, así que entran el anverso y el reverso y los lee un operador. Ver
 * `adjuntarDocumentoPorFotos` para por qué esto no comprueba nada del
 * documento y qué sí se sigue comprobando igual.
 *
 * La respuesta dice `via: 'fotos'` a propósito: `aceptable` viene en falso
 * porque nadie lo ha mirado todavía, y un cliente que lea solo ese campo
 * pensaría que el documento fue rechazado. Las dos se leen juntas o ninguna.
 */
appsRouter.post('/identidades/:id/documento-fotos', limite(20), pesada, exigeApp('identidad.documento'), async (req, res) => {
  const { anverso, reverso } = req.body ?? {}
  const esImagen = (x: unknown) =>
    typeof x === 'string' && /^data:image\/(jpeg|jpg|png|webp);base64,/.test(x) && x.length > 1000
  if (!esImagen(anverso) || !esImagen(reverso)) {
    return res.status(400).json({ error: 'Hacen falta las dos caras del documento, como imagen' })
  }
  if (anverso.length > TOPE_POR_CARA || reverso.length > TOPE_POR_CARA) {
    return res.status(413).json({
      error: `Cada cara tiene que pesar menos de ${TOPE_POR_CARA / 1_000_000} MB. Reduzca la foto antes de enviarla.`,
    })
  }
  const r = await ids.adjuntarDocumentoPorFotos(
    req.params.id, anverso, reverso, `app:${req.app_ecosistema!.clave}`)
  // Dos fallos distintos: la identidad no existe, o las fotos no se pudieron
  // guardar. El segundo se puede reintentar y hay que decirlo así — el trámite
  // no avanzó, no es que el documento no sirva.
  if (!r.identidad) return res.status(404).json({ error: 'Identidad no encontrada' })
  if (!r.ok) return res.status(503).json({ error: r.motivo })
  res.json({
    identidad: await ids.estadoParaUsuarioConFoto(r.identidad),
    documento: { via: 'fotos', aceptable: false, pendienteDeLectura: true, problemas: [] },
  })
})

/**
 * Pide un reto de vivacidad.
 *
 * La secuencia la sortea el servidor en este instante y vale dos minutos: es lo
 * que impide responder con un vídeo preparado de antemano. La app la muestra
 * gesto a gesto y graba un fotograma por cada uno.
 */
appsRouter.post('/identidades/:id/vivacidad', limite(20), pesada, exigeApp('identidad.documento'), async (req, res) => {
  const identidad = ids.porId(req.params.id)
  if (!identidad) return res.status(404).json({ error: 'Identidad no encontrada' })
  if (!biometriaConfigurada()) {
    return res.status(503).json({
      error: 'No hay proveedor de biometría configurado; el cotejo lo resuelve un operador',
      reto: null,
    })
  }
  res.json({ reto: emitirReto(identidad.id) })
})

/**
 * Recibe el rostro.
 *
 * Dos formas, y la primera es la buena:
 *
 *   { reto, fotogramas: [...], fotoDocumento }   con prueba de vida
 *   { selfie, fotoDocumento }                    sin ella — queda en revisión
 *
 * La segunda se mantiene porque hay clientes publicados que la usan y cortarla
 * dejaría a esos usuarios sin poder avanzar; pero nunca aprueba sola.
 */
appsRouter.post('/identidades/:id/biometria', limite(20), pesada, exigeApp('identidad.documento'), async (req, res) => {
  const { selfie, fotoDocumento, reto, fotogramas } = req.body ?? {}
  const identidad = ids.porId(req.params.id)
  if (!identidad) return res.status(404).json({ error: 'Identidad no encontrada' })

  let vivacidad = null
  let cara = String(selfie || '')

  if (reto) {
    if (!Array.isArray(fotogramas) || !fotogramas.length) {
      return res.status(400).json({ error: 'Con un reto hacen falta los fotogramas' })
    }
    vivacidad = await comprobarReto(String(reto), identidad.id, fotogramas.map(String))
    // El fotograma de frente es el selfie: se comprobó que ahí hay un rostro
    // vivo, mirando a la cámara. Aceptar otra imagen distinta como selfie
    // dejaría el reto de adorno.
    if (vivacidad.frenteSelfie) cara = vivacidad.frenteSelfie
    else if (!cara) cara = String(fotogramas[0] || '')
  }

  if (!cara) return res.status(400).json({ error: 'Hace falta el selfie' })

  const actualizada = await ids.adjuntarBiometria(
    identidad.id,
    { selfie: cara, fotoDocumento: String(fotoDocumento || ''), vivacidad },
    `app:${req.app_ecosistema!.clave}`)
  if (!actualizada) return res.status(404).json({ error: 'Identidad no encontrada' })

  res.json({
    identidad: await ids.estadoParaUsuarioConFoto(actualizada),
    biometria: {
      estado: actualizada.biometria?.estado,
      motivo: actualizada.biometria?.motivo,
      // La puntuación de parecido no se devuelve a la app: es un número que
      // ayuda a afinar un intento de suplantación. El detalle de la vivacidad
      // sí, porque es lo que permite decirle a la persona qué gesto repetir.
      vivacidad: actualizada.biometria?.vivacidad ?? null,
      gestos: vivacidad?.pasos.map((p) => ({ gesto: p.gesto, ok: p.ok, motivo: p.motivo })) ?? [],
    },
  })
})

/**
 * Foto de la credencial.
 *
 * Es la única imagen que Genesis ID guarda, y va aparte del cotejo: aquella se
 * compara y se descarta, esta se conserva porque la credencial tiene que verse
 * completa en cualquier app del ecosistema, no solo en el teléfono que la subió.
 */
appsRouter.post('/identidades/:id/foto', limite(20), pesada, exigeApp('identidad.documento'), async (req, res) => {
  const r = await ids.guardarFotoCredencial(
    req.params.id, String(req.body?.foto || ''), `app:${req.app_ecosistema!.clave}`)
  if (!r.ok) {
    // «No se pudo guardar ahora mismo» es un tropiezo del almacen, no una foto
    // mal formada: se contesta 503 para que el cliente reintente en vez de
    // ensenarle a la persona que su foto no vale.
    const codigo = /no se pudo guardar/i.test(r.error || '') ? 503
      : /pesa/i.test(r.error || '') ? 413 : 400
    return res.status(codigo).json({ error: r.error })
  }
  res.json({ ok: true, identidad: await ids.estadoParaUsuarioConFoto(r.identidad!) })
})

appsRouter.get('/identidades/:id', limite(120), exigeApp('identidad.leer'), async (req, res) => {
  const identidad = ids.porId(req.params.id)
  if (!identidad) return res.status(404).json({ error: 'Identidad no encontrada' })
  res.json({ identidad: await ids.estadoParaUsuarioConFoto(identidad) })
})

appsRouter.get('/identidades/por-email/:email', limite(120), exigeApp('identidad.leer'), async (req, res) => {
  const identidad = ids.porEmail(req.params.email)
  if (!identidad) return res.status(404).json({ error: 'Identidad no encontrada' })
  res.json({ identidad: await ids.estadoParaUsuarioConFoto(identidad) })
})

/** Ata una cuenta de la app al GID. Es la base del inicio de sesión único. */
appsRouter.post('/vinculos', limite(60), exigeApp('vinculo.crear'), async (req, res) => {
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
appsRouter.get('/gid/:gid', limite(300), exigeApp('gid.verificar'), async (req, res) => {
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
appsRouter.get('/direccion/:direccion', limite(300), exigeApp('gid.verificar'), async (req, res) => {
  const identidad = ids.porDireccion(req.params.direccion)
  if (!identidad) return res.json({ verificada: false, gid: null })
  res.json({ verificada: identidad.estado === 'verificada', gid: identidad.gid })
})

/** Tamizado de una dirección contra listas de sanciones. */
appsRouter.get('/tamiz/direccion/:direccion', limite(300), exigeApp('tamiz.direccion'), async (req, res) => {
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
appsRouter.post('/sso/token', limite(60), exigeApp('gid.verificar'), async (req, res) => {
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
appsRouter.post('/sso/verificar', limite(300), exigeApp('gid.verificar'), async (req, res) => {
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

appsRouter.post('/negocios', limite(30), exigeApp('negocio.crear'), async (req, res) => {
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

appsRouter.post('/negocios/:id/beneficiarios', limite(30), exigeApp('negocio.crear'), async (req, res) => {
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

appsRouter.get('/negocios/:id', limite(120), exigeApp('negocio.crear'), async (req, res) => {
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
appsRouter.post('/movimientos', limite(120), exigeApp('movimiento.enviar'), async (req, res) => {
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
