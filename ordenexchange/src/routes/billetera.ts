// Billetera: saldos, movimientos, depósitos y retiros.

import { Router } from 'express'
import { seguro, noEncontrado, sinPermiso } from '../lib/errores.js'
import { limite } from '../lib/limite.js'
import { exigirSesion } from '../lib/sesion.js'
import { store } from '../store.js'
import * as billetera from '../motor/billetera.js'
import * as usuarios from '../motor/usuarios.js'
import { RPC, CADENA_ID, EXPLORADOR } from '../motor/cadena.js'
import { modoDemo } from '../motor/demo.js'

export const billeteraRouter = Router()
billeteraRouter.use(exigirSesion)

billeteraRouter.get('/', (req, res) => {
  const u = req.usuario!
  res.json({
    saldos: billetera.saldos(u.id),
    direccionDeposito: store.todo().configuracion.tesoreria,
    direccionCadena: u.direccionCadena,
    cadena: { id: CADENA_ID, rpc: RPC, explorador: EXPLORADOR },
    confirmaciones: store.todo().configuracion.confirmacionesDeposito,
  })
})

billeteraRouter.get('/movimientos', (req, res) => {
  const q = req.query as Record<string, string>
  res.json(billetera.movimientos(req.usuario!.id, { activo: q.activo, pagina: Number(q.pagina), porPagina: Number(q.porPagina) }))
})

billeteraRouter.get('/depositos', (req, res) => {
  res.json({ depositos: billetera.depositosDe(req.usuario!.id) })
})

billeteraRouter.post('/depositos', limite(10), seguro(async (req, res) => {
  const deposito = await billetera.acreditarDeposito(req.usuario!, req.body ?? {})
  res.status(201).json({ deposito, saldos: billetera.saldos(req.usuario!.id) })
}))

billeteraRouter.get('/retiros', (req, res) => {
  res.json({ retiros: billetera.retirosDe(req.usuario!.id) })
})

billeteraRouter.post('/retiros', limite(10), seguro(async (req, res) => {
  const u = req.usuario!
  const b = req.body ?? {}
  if (!usuarios.contrasenaValida(u, b.contrasena)) throw sinPermiso('Contraseña incorrecta', 'contrasena')
  const retiro = await billetera.solicitarRetiro(u, b)
  res.status(201).json({ retiro, saldos: billetera.saldos(u.id) })
}))

billeteraRouter.post('/retiros/:id/cancelar', seguro((req, res) => {
  const retiro = billetera.cancelarRetiro(req.usuario!, req.params.id)
  res.json({ retiro, saldos: billetera.saldos(req.usuario!.id) })
}))

billeteraRouter.post('/faucet', limite(10), seguro((req, res) => {
  if (!modoDemo()) throw noEncontrado('Solo en modo demostración', 'demo-solamente')
  res.json({ saldos: billetera.grifo(req.usuario!, req.body ?? {}) })
}))
