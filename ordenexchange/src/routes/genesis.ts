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

import express, { Router } from 'express'
import { seguro, noEncontrado, sinPermiso } from '../lib/errores.js'
import { limite } from '../lib/limite.js'
import { exigirSesion } from '../lib/sesion.js'
import { modoDemo } from '../lib/entorno.js'
import * as usuarios from '../motor/usuarios.js'
import * as genesis from '../motor/genesis.js'
import { store } from '../store.js'
import type { Request, Response, NextFunction } from 'express'

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

const responder = (res: express.Response) => (r: genesis.Respuesta) => res.status(r.estado).json(r.cuerpo)

async function idDe(email: string): Promise<string> {
  const idn = await genesis.idIdentidad(email)
  if (!idn) throw noEncontrado('Identidad no encontrada en Genesis ID; abra primero el estado', 'identidad')
  return idn
}

/** Lo que de la identidad se le enseña al propio usuario: su trámite, no el expediente. */
function identidadParaUsuario(identidad: any) {
  if (!identidad || typeof identidad !== 'object') return null
  const permitidos = ['id', 'email', 'estado', 'gid', 'pendientes', 'documento', 'biometria', 'rostroPendiente',
    'nombreDeclarado', 'fechaNacimientoDeclarada', 'paisResidencia', 'creadaEn', 'actualizadaEn', 'verificadaEn', 'fotoCredencial']
  const salida: Record<string, unknown> = {}
  for (const k of permitidos) if (k in identidad) salida[k] = identidad[k]
  return salida
}

/**
 * Estado del trámite. Crea la identidad si no existe y refleja en la cuenta
 * lo que Genesis ID diga: estado y GID. Si está verificada y todavía no
 * estaba atada, la ata (cuenta = id del usuario).
 *
 * Una cuenta que ya tiene un GID verificado (por sesión única, por ejemplo)
 * no se degrada porque el correo no tenga identidad en Genesis: se avisa.
 */
genesisRouter.get('/estado', limite(30), exigirCorreoConfirmado, seguro(async (req, res) => {
  const u = req.usuario!
  if (!genesis.genesisConfigurado()) {
    res.status(503).json({ error: 'Genesis ID no está configurado en este servidor', codigo: 'genesis-no-configurado', usuario: usuarios.propio(u) })
    return
  }
  let r = await genesis.identidadPorEmail(u.email)
  if (!r.ok && r.estado === 404) r = await genesis.crearIdentidad(u.email)
  if (!r.ok) { res.status(r.estado).json(r.cuerpo); return }
  const identidad = r.cuerpo?.identidad ?? {}
  const estado = genesis.estadoGidDe(identidad.estado)
  const gid = identidad.gid ? String(identidad.gid).toUpperCase() : null
  const nombre = identidad.nombreLegal ?? identidad.nombre ?? null

  let aviso: string | null = null
  if (u.gid && u.gidEstado === 'verificada' && gid !== u.gid) {
    // El GID de la cuenta vino por otra vía y sigue mandando; la identidad
    // por correo es otra (o todavía no existe).
    aviso = 'Su cuenta ya está verificada con un Genesis ID distinto al de este correo; no se cambió nada'
  } else {
    const sinAtar = estado === 'verificada' && gid && u.gid !== gid
    usuarios.sincronizarGenesis(u, estado, gid, nombre)
    if (sinAtar && identidad.id) await genesis.vincular(String(identidad.id), u.id, u.direccionCadena)
  }
  res.json({ identidad: identidadParaUsuario(identidad), usuario: usuarios.propio(u), aviso })
}))

genesisRouter.post('/foto', limite(10), exigirCorreoConfirmado, seguro(async (req, res) => {
  const idn = await idDe(req.usuario!.email)
  responder(res)(await genesis.enviarFoto(idn, req.body?.foto))
}))

genesisRouter.post('/datos', limite(20), exigirCorreoConfirmado, seguro(async (req, res) => {
  const idn = await idDe(req.usuario!.email)
  const b = req.body ?? {}
  responder(res)(await genesis.declararDatos(idn, {
    nombreCompleto: b.nombreCompleto, fechaNacimiento: b.fechaNacimiento, paisResidencia: b.paisResidencia,
    telefono: b.telefono, direccion: b.direccion, ocupacion: b.ocupacion, origenFondos: b.origenFondos,
    propositoCuenta: b.propositoCuenta, volumenEsperadoUsd: b.volumenEsperadoUsd, pepDeclarado: b.pepDeclarado,
  }))
}))

genesisRouter.post('/documento', limite(10), exigirCorreoConfirmado, seguro(async (req, res) => {
  const idn = await idDe(req.usuario!.email)
  responder(res)(await genesis.enviarDocumento(idn, String(req.body?.mrz || ''), req.body?.textoAnverso))
}))

genesisRouter.post('/vivacidad', limite(10), exigirCorreoConfirmado, seguro(async (req, res) => {
  const idn = await idDe(req.usuario!.email)
  responder(res)(await genesis.pedirVivacidad(idn))
}))

genesisRouter.post('/biometria', limite(10), exigirCorreoConfirmado, parserRostro, seguro(async (req, res) => {
  const idn = await idDe(req.usuario!.email)
  const b = req.body ?? {}
  responder(res)(await genesis.enviarBiometria(idn, { selfie: b.selfie, fotoDocumento: b.fotoDocumento, reto: b.reto, fotogramas: b.fotogramas }))
}))

genesisRouter.post('/vincular', limite(10), exigirCorreoConfirmado, seguro(async (req, res) => {
  const u = req.usuario!
  const idn = await idDe(u.email)
  responder(res)(await genesis.vincular(idn, u.id, u.direccionCadena))
}))

genesisRouter.post('/sso/token', limite(20), seguro(async (req, res) => {
  const u = req.usuario!
  if (!u.gid || u.gidEstado !== 'verificada') throw sinPermiso('Todavía no hay una identidad verificada', 'no-verificado')
  responder(res)(await genesis.tokenSso(u.gid, u.id))
}))

genesisRouter.get('/tamiz/:direccion', limite(60), seguro(async (req, res) => {
  responder(res)(await genesis.tamizDireccion(req.params.direccion))
}))

/** Solo en demostración: marca la cuenta como verificada con un GID de prueba. */
genesisRouter.post('/demo/verificar', limite(10), seguro((req, res) => {
  if (!modoDemo()) throw noEncontrado('Solo en modo demostración', 'demo-solamente')
  const u = usuarios.verificarDemo(req.usuario!, req.body?.nombre ? String(req.body.nombre).slice(0, 80) : undefined)
  store.guardar()
  res.json({ usuario: usuarios.propio(u) })
}))
