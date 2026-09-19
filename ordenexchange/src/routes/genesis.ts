// El puente con Genesis ID.
//
// Mismo contrato que infra/genesis-proxy/genesis.router.js. La cuenta se toma
// SIEMPRE de la sesión: si viniera del cuerpo, alguien podría atar su GID a
// la cuenta de otro. Nada de aquí aprueba a nadie: eso lo decide un operador
// de cumplimiento en el panel de Genesis ID.

import express, { Router } from 'express'
import { seguro, noEncontrado, sinPermiso, Falla } from '../lib/errores.js'
import { limite } from '../lib/limite.js'
import { exigirSesion } from '../lib/sesion.js'
import * as usuarios from '../motor/usuarios.js'
import * as genesis from '../motor/genesis.js'
import { modoDemo } from '../motor/demo.js'
import { store } from '../store.js'

export const genesisRouter = Router()

/** Parser exclusivo de la ruta del rostro: los fotogramas no caben en el límite general. */
export const parserRostro = express.json({ limit: '25mb' })

genesisRouter.use(exigirSesion)

const responder = (res: express.Response) => (r: genesis.Respuesta) => res.status(r.estado).json(r.cuerpo)

async function idDe(email: string): Promise<string> {
  const idn = await genesis.idIdentidad(email)
  if (!idn) throw noEncontrado('Identidad no encontrada en Genesis ID; abra primero el estado', 'identidad')
  return idn
}

/**
 * Estado del trámite. Crea la identidad si no existe y refleja en la cuenta
 * lo que Genesis ID diga: estado y GID. Si está verificada y todavía no
 * estaba atada, la ata (cuenta = id del usuario).
 */
genesisRouter.get('/estado', limite(30), seguro(async (req, res) => {
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
  const gid = identidad.gid ? String(identidad.gid) : null
  const nombre = identidad.nombreLegal ?? identidad.nombre ?? null
  const sinAtar = estado === 'verificada' && gid && u.gid !== gid.toUpperCase()
  usuarios.sincronizarGenesis(u, estado, gid, nombre)
  if (sinAtar && identidad.id) {
    await genesis.vincular(String(identidad.id), u.id, u.direccionCadena)
  }
  res.json({ identidad, usuario: usuarios.propio(u) })
}))

genesisRouter.post('/foto', limite(10), seguro(async (req, res) => {
  const idn = await idDe(req.usuario!.email)
  responder(res)(await genesis.enviarFoto(idn, req.body?.foto))
}))

genesisRouter.post('/datos', limite(20), seguro(async (req, res) => {
  const idn = await idDe(req.usuario!.email)
  const b = req.body ?? {}
  responder(res)(await genesis.declararDatos(idn, {
    nombreCompleto: b.nombreCompleto, fechaNacimiento: b.fechaNacimiento, paisResidencia: b.paisResidencia,
    telefono: b.telefono, direccion: b.direccion, ocupacion: b.ocupacion, origenFondos: b.origenFondos,
    propositoCuenta: b.propositoCuenta, volumenEsperadoUsd: b.volumenEsperadoUsd, pepDeclarado: b.pepDeclarado,
  }))
}))

genesisRouter.post('/documento', limite(10), seguro(async (req, res) => {
  const idn = await idDe(req.usuario!.email)
  responder(res)(await genesis.enviarDocumento(idn, String(req.body?.mrz || ''), req.body?.textoAnverso))
}))

genesisRouter.post('/vivacidad', limite(10), seguro(async (req, res) => {
  const idn = await idDe(req.usuario!.email)
  responder(res)(await genesis.pedirVivacidad(idn))
}))

genesisRouter.post('/biometria', limite(10), seguro(async (req, res) => {
  const idn = await idDe(req.usuario!.email)
  const b = req.body ?? {}
  responder(res)(await genesis.enviarBiometria(idn, { selfie: b.selfie, fotoDocumento: b.fotoDocumento, reto: b.reto, fotogramas: b.fotogramas }))
}))

genesisRouter.post('/vincular', limite(10), seguro(async (req, res) => {
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

export { Falla }
