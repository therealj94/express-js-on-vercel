// La revisión de comercios: quién puede cobrar y quién no.
//
// POR QUE HIZO FALTA ESTO
//
// Desde que cobrar exige el KYB aprobado, alguien tiene que poder aprobarlo — y
// no había forma. `ADMIN_EMAIL` y `ADMIN_PASSWORD` llevaban puestas en Heroku
// sin que ninguna línea de código las leyera, exactamente igual que `MONGODB_URI`.
// Un comercio podía mandar sus documentos y quedarse esperando para siempre.
//
// DONDE VIVE DE VERDAD LA VERDAD
//
// El sistema de cumplimiento del ecosistema es Genesis ID: ahí está el módulo
// de negocios con sus documentos exigidos, sus beneficiarios finales, la
// decisión firmada por un operador y la bitácora encadenada. Esto de aquí NO
// pretende reemplazarlo: cuando un comercio manda su KYB, se registra también
// como negocio en Genesis para que aparezca donde un operador lo revisa junto
// con todo lo demás.
//
// Lo de aquí es la palanca operativa mínima —aprobar o rechazar, con
// credenciales de administrador— para que el mostrador no dependa de terminar
// primero la integración completa. Cuando esa integración esté, este archivo se
// reduce a leer el estado que diga Genesis.

import { Router } from 'express'
import { envolver } from '../lib/asincrono.js'
import { db } from '../lib/db.js'
import { registrarNegocio, contar } from '../lib/genesis.js'
import type { KycStatus } from '../types.js'

export const adminRouter = Router()

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || '').trim().toLowerCase()
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || ''

/**
 * La puerta del administrador.
 *
 * Compara en tiempo CONSTANTE. Una comparación normal de cadenas se corta en la
 * primera letra distinta, y esa diferencia de microsegundos deja adivinar la
 * contraseña carácter a carácter con suficientes intentos. Es barato hacerlo
 * bien y caro descubrir que no se hizo.
 */
function igualSinFiltrarTiempo(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let d = 0
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return d === 0
}

adminRouter.use((req, res, next) => {
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    // Sin credenciales configuradas la puerta no existe, en vez de quedar
    // abierta con un valor por omisión que alguien pueda adivinar.
    return res.status(503).json({ error: 'La revisión de comercios no está configurada en el servidor' })
  }
  const cabecera = String(req.headers.authorization || '')
  if (!cabecera.startsWith('Basic ')) {
    return res.status(401).json({ error: 'Hacen falta credenciales de administrador' })
  }
  const [correo, clave] = Buffer.from(cabecera.slice(6), 'base64').toString('utf8').split(':')
  const bien = igualSinFiltrarTiempo(String(correo || '').trim().toLowerCase(), ADMIN_EMAIL) &&
    igualSinFiltrarTiempo(String(clave || ''), ADMIN_PASSWORD)
  if (!bien) return res.status(401).json({ error: 'Credenciales de administrador incorrectas' })
  next()
})

/** Los comercios que esperan revisión. */
adminRouter.get('/comercios', envolver(async (req, res) => {
  const estado = String(req.query.estado || 'pending') as KycStatus
  const todos = await db.listCompanies({})
  const lista = todos
    .filter((c) => c.kyc.status === estado)
    .map((c) => ({
      id: c.id, tradeName: c.tradeName, legalName: c.legalName, taxId: c.taxId,
      countrySlug: c.countrySlug, citySlug: c.citySlug, address: c.address,
      kyc: {
        status: c.kyc.status,
        submittedAt: c.kyc.submittedAt,
        // Se dice CUANTOS documentos hay y sus etiquetas, nunca las imágenes:
        // un listado no es el sitio para repartir cédulas.
        documentos: c.kyc.documents.map((d) => ({ id: d.id, label: d.label, uploadedAt: d.uploadedAt })),
      },
      verified: c.verified,
      createdAt: c.createdAt,
    }))
  res.json({ comercios: lista, total: lista.length })
}))

/** Un comercio entero, con sus documentos, para poder mirarlos y decidir. */
adminRouter.get('/comercios/:id', envolver(async (req, res) => {
  const c = await db.findCompanyById(req.params.id)
  if (!c) return res.status(404).json({ error: 'Comercio no encontrado' })
  const dueno = await db.findUserById(c.ownerId)
  res.json({
    comercio: c,
    dueno: dueno ? { id: dueno.id, email: dueno.email, fullName: dueno.fullName, gid: dueno.gid ?? null } : null,
  })
}))

/**
 * Aprueba o rechaza.
 *
 * Exige un motivo escrito en los dos casos, no solo al rechazar: dentro de seis
 * meses, «por qué se aprobó a este» es una pregunta tan legítima como «por qué
 * se rechazó a aquel», y la respuesta tiene que estar escrita.
 */
adminRouter.post('/comercios/:id/decidir', envolver(async (req, res) => {
  const { decision, motivo } = req.body ?? {}
  if (decision !== 'aprobar' && decision !== 'rechazar') {
    return res.status(400).json({ error: 'La decisión tiene que ser «aprobar» o «rechazar»' })
  }
  const nota = String(motivo ?? '').trim()
  if (nota.length < 8) {
    return res.status(400).json({ error: 'Hace falta un motivo escrito de al menos 8 caracteres' })
  }

  const c = await db.findCompanyById(req.params.id)
  if (!c) return res.status(404).json({ error: 'Comercio no encontrado' })
  if (c.kyc.status === 'unsubmitted') {
    return res.status(409).json({ error: 'Ese comercio todavía no mandó documentos' })
  }

  const aprobado = decision === 'aprobar'
  const actualizado = await db.updateCompany(c.id, {
    verified: aprobado,
    kyc: {
      ...c.kyc,
      status: aprobado ? 'verified' : 'rejected',
      reviewedAt: new Date().toISOString(),
      note: nota,
    },
  })
  contar('accion', `comercio.${decision}`)
  res.json({ comercio: actualizado })
}))

/**
 * Manda el comercio a Genesis ID para que lo revise un operador de verdad.
 *
 * Se llama solo desde la ruta de KYB, en segundo plano. Si Genesis no contesta,
 * el comercio sigue su curso aquí: el trámite no se cae porque el sistema de
 * cumplimiento esté ocupado.
 */
export async function anunciarEnGenesis(companyId: string): Promise<void> {
  try {
    const c = await db.findCompanyById(companyId)
    if (!c) return
    const dueno = await db.findUserById(c.ownerId)
    if (!dueno) return
    await registrarNegocio({
      emailDueno: dueno.email,
      razonSocial: c.legalName,
      nombreComercial: c.tradeName,
      identificadorFiscal: c.taxId,
      categoria: c.categorySlug,
      pais: c.countrySlug,
      ciudad: c.citySlug,
      direccion: c.address,
    })
  } catch (e: any) {
    console.error('[admin] no se pudo anunciar el comercio en Genesis:', e?.message)
  }
}
