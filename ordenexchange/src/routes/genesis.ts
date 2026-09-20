// El puente con Genesis ID.
//
// Mismo contrato que infra/genesis-proxy/genesis.router.js. La cuenta se toma
// SIEMPRE de la sesión: si viniera del cuerpo, alguien podría atar su GID a
// la cuenta de otro. Nada de aquí aprueba a nadie: eso lo decide un operador
// de cumplimiento en el panel de Genesis ID.
//
// Y el correo tiene que estar CONFIRMADO: la identidad se busca en Genesis por
// el correo de la cuenta, así que sin esa confirmación cualquiera que se
// registrara con el correo de otra persona se quedaría con su identidad.
//
// Cada respuesta que trae la identidad se REFLEJA en la cuenta (estado y GID):
// así la app ve «en revisión» en cuanto manda el rostro y «verificada» en
// cuanto sincroniza después de la aprobación, sin pasos aparte.

import express, { Router } from 'express'
import { seguro, noEncontrado, sinPermiso } from '../lib/errores.js'
import { limite } from '../lib/limite.js'
import { exigirSesion } from '../lib/sesion.js'
import { modoDemo } from '../lib/entorno.js'
import * as usuarios from '../motor/usuarios.js'
import * as genesis from '../motor/genesis.js'
import { store } from '../store.js'
import type { Request, Response, NextFunction } from 'express'
import type { Usuario } from '../types.js'

export const genesisRouter = Router()

/** Parser exclusivo de la ruta del rostro: los fotogramas no caben en el límite general. Va DESPUÉS de la sesión. */
const parserRostro = express.json({ limit: '25mb' })

genesisRouter.use(exigirSesion)

function exigirCorreoConfirmado(req: Request, res: Response, siguiente: NextFunction): void {
  if (!req.usuario!.emailVerificado) {
    res.status(403).json({ error: 'Confirme su correo antes de verificar su identidad', codigo: 'correo-no-verificado' })
    return
  }
  siguiente()
}

function exigirGenesis(_req: Request, res: Response, siguiente: NextFunction): void {
  if (!genesis.genesisConfigurado()) {
    res.status(503).json({ error: 'Genesis ID no está configurado en este servidor', codigo: 'genesis-no-configurado' })
    return
  }
  siguiente()
}

async function idDe(email: string): Promise<string> {
  const idn = await genesis.idIdentidad(email)
  if (!idn) throw noEncontrado('Identidad no encontrada en Genesis ID; abra primero el estado', 'identidad')
  return idn
}

/**
 * Lo que de la identidad se le enseña al propio usuario: su trámite, no el
 * expediente. Es lo que Genesis ID devuelve en `estadoParaUsuario` más el paso
 * del asistente; nunca el tamizado, el riesgo ni las notas del operador.
 */
function identidadParaUsuario(identidad: any) {
  if (!identidad || typeof identidad !== 'object') return null
  const permitidos = ['id', 'email', 'estado', 'gid', 'nombreLegal', 'documentoAceptable', 'rostroPendiente', 'fotoCredencial',
    'faltanDatos', 'umbralDiligenciaUsd', 'diligencia', 'faltan', 'siguientePaso',
    'nombreDeclarado', 'fechaNacimientoDeclarada', 'paisResidencia', 'creadaEn', 'actualizadaEn', 'verificadaEn']
  const salida: Record<string, unknown> = {}
  for (const k of permitidos) if (k in identidad) salida[k] = identidad[k]
  salida.paso = genesis.pasoSugerido(identidad)
  return salida
}

/**
 * Refleja en la cuenta lo que Genesis ID dice de la identidad: estado y GID.
 * Si está verificada y todavía no estaba atada, la ata (cuenta = id del usuario).
 *
 * Una cuenta que ya tiene un GID verificado (por sesión única, por ejemplo) no
 * se degrada porque el correo tenga otra identidad o ninguna: se avisa.
 */
async function reflejar(u: Usuario, identidad: any): Promise<string | null> {
  if (!identidad || typeof identidad !== 'object') return null
  const estado = genesis.estadoGidDe(identidad.estado)
  const gid = identidad.gid ? String(identidad.gid).toUpperCase() : null
  const nombre = identidad.nombreLegal ?? null
  if (u.gid && u.gidEstado === 'verificada' && gid !== u.gid) {
    return 'Su cuenta ya está verificada con un Genesis ID distinto al de este correo; no se cambió nada'
  }
  const sinAtar = estado === 'verificada' && gid && u.gid !== gid
  usuarios.sincronizarGenesis(u, estado, gid, nombre)
  if (sinAtar && identidad.id) await genesis.vincular(String(identidad.id), u.id, u.direccionCadena)
  return null
}

/** Devuelve la respuesta de Genesis con la identidad recortada y la cuenta ya sincronizada. */
async function responderConIdentidad(req: Request, res: Response, r: genesis.Respuesta): Promise<void> {
  const u = req.usuario!
  if (!r.ok) { res.status(r.estado).json(r.cuerpo); return }
  const cuerpo = (r.cuerpo && typeof r.cuerpo === 'object') ? r.cuerpo : {}
  const aviso = await reflejar(u, cuerpo.identidad)
  res.json({ ...cuerpo, identidad: identidadParaUsuario(cuerpo.identidad), usuario: usuarios.propio(u), aviso })
}

/**
 * Estado del trámite. Crea la identidad en Genesis ID si no existe (por el
 * correo confirmado de la cuenta) y refleja en la cuenta lo que Genesis diga.
 */
genesisRouter.get('/estado', limite(30), exigirCorreoConfirmado, seguro(async (req, res) => {
  const u = req.usuario!
  if (!genesis.genesisConfigurado()) {
    res.status(503).json({ error: 'Genesis ID no está configurado en este servidor', codigo: 'genesis-no-configurado', usuario: usuarios.propio(u) })
    return
  }
  let r = await genesis.identidadPorEmail(u.email)
  if (!r.ok && r.estado === 404) r = await genesis.crearIdentidad(u.email)
  await responderConIdentidad(req, res, r)
}))

/** Paso 1 del asistente: datos y perfil de cumplimiento (ocupación, origen de fondos…). */
genesisRouter.post('/datos', limite(20), exigirCorreoConfirmado, exigirGenesis, seguro(async (req, res) => {
  const idn = await idDe(req.usuario!.email)
  const b = req.body ?? {}
  const volumen = b.volumenEsperadoUsd === undefined || b.volumenEsperadoUsd === null || b.volumenEsperadoUsd === '' ? undefined : Number(b.volumenEsperadoUsd)
  await responderConIdentidad(req, res, await genesis.declararDatos(idn, {
    nombreCompleto: b.nombreCompleto, fechaNacimiento: b.fechaNacimiento, paisResidencia: b.paisResidencia,
    telefono: b.telefono, direccion: b.direccion, ocupacion: b.ocupacion, origenFondos: b.origenFondos,
    propositoCuenta: b.propositoCuenta, volumenEsperadoUsd: Number.isFinite(volumen) ? volumen : undefined,
    pepDeclarado: typeof b.pepDeclarado === 'boolean' ? b.pepDeclarado : undefined,
  }))
}))

/** Paso 2: la MRZ del documento (leída en el teléfono; la imagen no viaja). */
genesisRouter.post('/documento', limite(10), exigirCorreoConfirmado, exigirGenesis, seguro(async (req, res) => {
  const idn = await idDe(req.usuario!.email)
  await responderConIdentidad(req, res, await genesis.enviarDocumento(idn, String(req.body?.mrz || ''), req.body?.textoAnverso))
}))

genesisRouter.post('/vivacidad', limite(10), exigirCorreoConfirmado, exigirGenesis, seguro(async (req, res) => {
  const idn = await idDe(req.usuario!.email)
  const r = await genesis.pedirVivacidad(idn)
  res.status(r.estado).json(r.cuerpo)
}))

/** Paso 3: el rostro. Con proveedor se coteja solo; sin él, lo coteja un operador de Genesis ID. */
genesisRouter.post('/biometria', limite(10), exigirCorreoConfirmado, exigirGenesis, parserRostro, seguro(async (req, res) => {
  const idn = await idDe(req.usuario!.email)
  const b = req.body ?? {}
  await responderConIdentidad(req, res, await genesis.enviarBiometria(idn, { selfie: b.selfie, fotoDocumento: b.fotoDocumento, reto: b.reto, fotogramas: b.fotogramas }))
}))

genesisRouter.post('/foto', limite(10), exigirCorreoConfirmado, exigirGenesis, seguro(async (req, res) => {
  const idn = await idDe(req.usuario!.email)
  await responderConIdentidad(req, res, await genesis.enviarFoto(idn, req.body?.foto))
}))

/** Ata la cuenta a la identidad (cuenta = id del usuario). Se hace solo al verificarse; esto lo permite antes. */
genesisRouter.post('/vincular', limite(10), exigirCorreoConfirmado, exigirGenesis, seguro(async (req, res) => {
  const u = req.usuario!
  const idn = await idDe(u.email)
  const r = await genesis.vincular(idn, u.id, u.direccionCadena)
  res.status(r.estado).json(r.cuerpo)
}))

genesisRouter.post('/sso/token', limite(20), exigirGenesis, seguro(async (req, res) => {
  const u = req.usuario!
  if (!u.gid || u.gidEstado !== 'verificada') throw sinPermiso('Todavía no hay una identidad verificada', 'no-verificado')
  const r = await genesis.tokenSso(u.gid, u.id)
  res.status(r.estado).json(r.cuerpo)
}))

genesisRouter.get('/tamiz/:direccion', limite(60), exigirGenesis, seguro(async (req, res) => {
  const r = await genesis.tamizDireccion(req.params.direccion)
  res.status(r.estado).json(r.cuerpo)
}))

/** Solo en demostración: marca la cuenta como verificada con un GID de prueba. */
genesisRouter.post('/demo/verificar', limite(10), seguro((req, res) => {
  if (!modoDemo()) throw noEncontrado('Solo en modo demostración', 'demo-solamente')
  const u = usuarios.verificarDemo(req.usuario!, req.body?.nombre ? String(req.body.nombre).slice(0, 80) : undefined)
  store.guardar()
  res.json({ usuario: usuarios.propio(u) })
}))
