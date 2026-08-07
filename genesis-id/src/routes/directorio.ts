// El directorio de usuarios: ingesta desde las apps, y consulta desde el panel.
//
// Son datos personales, así que las dos puertas están más cerradas que las de
// analítica: la ingesta exige la clave SECRETA de la app (nunca la pública,
// que viaja dentro de los APK), y la consulta exige un permiso propio y deja
// rastro en la bitácora.

import { Router } from 'express'
import { exigeApp, exigeOperador, exigePermiso, limite } from '../middleware/proteger.js'
import { sincronizar, consultar, resumenDirectorio, fichaPorEmail, refrescarSaldos } from '../directorio/padron.js'
import { registrar } from '../audit/bitacora.js'

export const directorioAppsRouter = Router()
export const directorioPanelRouter = Router()

// ── Ingesta ──────────────────────────────────────────────────────────────────

directorioAppsRouter.post('/sincronizar', limite(120), exigeApp('directorio.enviar'), async (req, res) => {
  const lote = Array.isArray(req.body) ? req.body : req.body?.usuarios
  if (!Array.isArray(lote)) {
    return res.status(400).json({ error: 'Se espera { usuarios: [...] }' })
  }
  const r = await sincronizar(req.app_ecosistema!.clave, lote)
  res.json({ ok: true, ...r })
})

// ── Consulta ─────────────────────────────────────────────────────────────────

directorioPanelRouter.use(exigeOperador, exigePermiso('usuarios.ver'))

directorioPanelRouter.get('/resumen', async (_req, res) => {
  res.json(await resumenDirectorio())
})

directorioPanelRouter.get('/', async (req, res) => {
  const q = req.query as Record<string, string>
  const bool = (v?: string) => v === '1' ? true : v === '0' ? false : undefined

  const filtro = {
    texto: q.texto?.slice(0, 120),
    app: q.app && q.app !== 'todas' ? q.app : undefined,
    pais: q.pais || undefined,
    kyc: q.kyc || undefined,
    conWallet: bool(q.conWallet),
    conGid: bool(q.conGid),
    conSaldo: bool(q.conSaldo),
    moneda: q.moneda || undefined,
    inactivosDias: Number(q.inactivosDias) || undefined,
    orden: (q.orden as any) || undefined,
    limite: Math.min(500, Number(q.limite) || 100),
    desde: Number(q.desde) || 0,
  }

  const r = await consultar(filtro)

  // Buscar por nombre o por correo en un padrón de clientes es una consulta de
  // datos personales, y queda escrita. No se registran las páginas siguientes
  // de una misma búsqueda: llenarían la bitácora sin decir nada nuevo.
  if (filtro.texto && !filtro.desde) {
    registrar(req.operador!.email, 'directorio.buscar', filtro.texto, { resultados: r.total })
  }
  res.json(r)
})

/** La ficha completa de una persona, con sus cuentas en todas las apps. */
directorioPanelRouter.get('/persona/:email', async (req, res) => {
  const ficha = await fichaPorEmail(req.params.email)
  if (!ficha) return res.status(404).json({ error: 'No hay nadie con ese correo en el directorio' })
  registrar(req.operador!.email, 'directorio.ficha', req.params.email, {})
  res.json(ficha)
})

/**
 * Vuelve a preguntarle a la cadena cuánto tiene cada dirección.
 *
 * Se dispara a mano desde el panel porque son cientos de consultas al RPC y no
 * tiene sentido hacerlas en cada carga de la pantalla. Corre en segundo plano:
 * la respuesta vuelve enseguida y el trabajo sigue.
 */
directorioPanelRouter.post('/saldos', exigePermiso('usuarios.ver'), (req, res) => {
  registrar(req.operador!.email, 'directorio.saldos', 'cadena-8532', {})
  refrescarSaldos().then((r) =>
    console.log(`[directorio] saldos: ${r.consultadas} direcciones · ${r.conSaldo} con algo · ` +
      `${r.monedas} monedas · ${r.perdidas} lecturas perdidas`))
  res.json({ ok: true, mensaje: 'Consultando la cadena. Refrescá en un minuto.' })
})
