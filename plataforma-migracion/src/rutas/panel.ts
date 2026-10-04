// El panel interno: listas, fotos, conciliación, liberaciones de ORIGEN y regalo de gas.
//
// Toda acción queda en la bitácora con quién la hizo. Nada de aquí firma ni
// envía en la cadena: lo que hay que ejecutar lo ejecuta la firma múltiple, y
// la plataforma lo comprueba después.

import { Router, type Request, type Response } from 'express'
import type { Contexto } from '../app.js'
import { activo, contratoV2 } from '../catalogo.js'
import { esDireccion } from '../cadena.js'
import { barrido, candidatas, conciliar, puedePublicar, tomarFoto } from '../foto.js'
import { construir, prueba } from '../merkle.js'
import { ErrorRegla, aprobar, circulacion, ejecutar, prepararRegalo, proponer, rechazar, registrarEnvioRegalo } from '../origen.js'
import { entrar, exige } from '../sesion.js'
import { nuevoId, registrar, type Foto, type TipoLista } from '../almacen.js'

const TIPOS: TipoLista[] = ['usuarios', 'tesoreria', 'sistema', 'inventario']

export function rutasPanel(ctx: Contexto) {
  const r = Router()
  const a = ctx.almacen
  const intentos = new Map<string, { n: number; hasta: number }>()

  const quien = (req: Request) => req.operador!.correo
  const fallo = (res: Response, e: unknown) =>
    e instanceof ErrorRegla ? res.status(409).json({ error: e.message })
      : res.status(502).json({ error: String((e as any)?.message || e).slice(0, 300) })

  r.post('/entrar', (req, res) => {
    const ip = req.ip || '?'
    const i = intentos.get(ip)
    if (i && i.hasta > Date.now() && i.n >= 8) return res.status(429).json({ error: 'Demasiados intentos. Espera unos minutos.' })
    const token = entrar(req.body?.correo, req.body?.clave)
    if (!token) {
      intentos.set(ip, { n: (i && i.hasta > Date.now() ? i.n : 0) + 1, hasta: Date.now() + 15 * 60_000 })
      return res.status(401).json({ error: 'Correo o clave incorrectos' })
    }
    intentos.delete(ip)
    res.json({ token })
  })

  r.get('/yo', exige(), (req, res) => res.json(req.operador))

  // ─── Listas ──────────────────────────────────────────────────────────────
  r.get('/listas', exige(), (_req, res) => {
    res.json(Object.fromEntries(TIPOS.map((t) => [t, { total: a.datos.listas[t].direcciones.length, actualizada: a.datos.listas[t].actualizada, autor: a.datos.listas[t].autor }])))
  })

  r.put('/listas/:tipo', exige('operador'), async (req, res) => {
    const tipo = req.params.tipo as TipoLista
    if (!TIPOS.includes(tipo)) return res.status(400).json({ error: `Tipo de lista desconocido. Usa: ${TIPOS.join(', ')}` })
    const entrada: unknown[] = Array.isArray(req.body?.direcciones) ? req.body.direcciones : []
    const validas = [...new Set(entrada.filter(esDireccion).map((d) => d.toLowerCase()))].sort()
    const invalidas = entrada.length - entrada.filter(esDireccion).length
    a.datos.listas[tipo] = { direcciones: validas, actualizada: new Date().toISOString(), autor: quien(req) }
    registrar(a, quien(req), 'lista.cargada', { tipo, total: validas.length, invalidas })
    await a.guardar()
    res.json({ tipo, total: validas.length, invalidas })
  })

  // ─── Fotos ───────────────────────────────────────────────────────────────
  const resumen = (f: Foto) => ({ ...f, tenedores: undefined, totalTenedores: f.tenedores?.length ?? null })

  r.get('/fotos', exige(), (_req, res) => res.json(a.datos.fotos.map(resumen).reverse()))

  r.get('/fotos/:id', exige(), (req, res) => {
    const f = a.datos.fotos.find((x) => x.id === req.params.id)
    if (!f) return res.status(404).json({ error: 'No existe esa foto' })
    res.json(f)
  })

  r.get('/fotos/:id/tenedores.csv', exige(), (req, res) => {
    const f = a.datos.fotos.find((x) => x.id === req.params.id)
    if (!f) return res.status(404).json({ error: 'No existe esa foto' })
    res.type('text/csv').attachment(`${f.activo}-bloque-${f.bloque}.csv`)
    res.send(['direccion,saldo_wei,clase', ...(f.tenedores || []).map((t) => `${t.direccion},${t.saldo},${t.clase}`)].join('\n'))
  })

  /** Lo que necesita la acuñación de la v2: cada tenedor con su saldo y su prueba, y la raíz. */
  r.get('/fotos/:id/acunacion.json', exige('operador'), (req, res) => {
    const f = a.datos.fotos.find((x) => x.id === req.params.id)
    if (!f || f.estado !== 'publicada') return res.status(409).json({ error: 'Solo una foto publicada se acuña' })
    const arbol = ctx.arbol(f.id, () => construir((f.tenedores || []).map((t) => ({ direccion: t.direccion, saldo: BigInt(t.saldo) }))))
    res.json({
      activo: f.activo, bloque: f.bloque, raiz: f.raiz, supply: f.supply,
      tenedores: (f.tenedores || []).map((t) => ({ direccion: t.direccion, saldo: t.saldo, prueba: prueba(arbol, t.direccion, BigInt(t.saldo)) })),
    })
  })

  r.post('/fotos', exige('operador'), async (req, res) => {
    const act = activo(String(req.body?.activo || ''))
    if (!act) return res.status(400).json({ error: 'Activo desconocido' })
    let bloque: number
    try { bloque = Number(req.body?.bloque) || await ctx.cadena.ultimoBloque() } catch (e) { return fallo(res, e) }
    if (a.datos.fotos.some((f) => f.estado === 'en-curso')) return res.status(409).json({ error: 'Ya hay una foto en curso' })
    const f: Foto = { id: nuevoId('foto'), activo: act.clave, bloque, creada: new Date().toISOString(), autor: quien(req), estado: 'en-curso' }
    a.datos.fotos.push(f)
    registrar(a, quien(req), 'foto.iniciada', { id: f.id, activo: f.activo, bloque })
    await a.guardar()
    res.status(202).json(resumen(f))
    // El barrido de la cadena tarda minutos: sigue en segundo plano y la foto cambia de estado al terminar.
    ;(async () => {
      try {
        const nativas = req.body?.barrerNativas !== false
        const barridas = await ctx.barrido(`${bloque}:${nativas}`, () => barrido(ctx.cadena, bloque, nativas))
        const dirs = candidatas(barridas, a.datos.listas)
        Object.assign(f, await tomarFoto(ctx.cadena, act, bloque, dirs, a.datos.listas), { estado: 'lista' })
      } catch (e: any) {
        Object.assign(f, { estado: 'fallida', error: String(e?.message || e).slice(0, 300) })
      }
      registrar(a, 'plataforma', 'foto.terminada', { id: f.id, estado: f.estado, sinUbicar: f.sinUbicar })
      await a.guardar()
    })()
  })

  r.post('/fotos/:id/publicar', exige('operador'), async (req, res) => {
    const f = a.datos.fotos.find((x) => x.id === req.params.id)
    if (!f) return res.status(404).json({ error: 'No existe esa foto' })
    const motivo = puedePublicar(f)
    if (motivo) return res.status(409).json({ error: `No se puede publicar: ${motivo}` })
    f.estado = 'publicada'
    f.publicada = new Date().toISOString()
    registrar(a, quien(req), 'foto.publicada', { id: f.id, activo: f.activo, bloque: f.bloque, raiz: f.raiz })
    await a.guardar()
    res.json(resumen(f))
  })

  // ─── Conciliación ────────────────────────────────────────────────────────
  r.post('/conciliar/:activo', exige('operador'), async (req, res) => {
    const act = activo(req.params.activo)
    if (!act?.heredado) return res.status(400).json({ error: 'Activo desconocido o no migrable' })
    const v2 = contratoV2(act.clave, ctx.entorno)
    if (!v2) return res.status(409).json({ error: `Falta configurar V2_${act.clave} con el contrato v2` })
    const f = a.datos.fotos.filter((x) => x.activo === act.clave && x.estado === 'publicada').at(-1)
    if (!f) return res.status(409).json({ error: 'No hay foto publicada de ese activo' })
    try {
      const c = { ...(await conciliar(ctx.cadena, f, v2)), fecha: new Date().toISOString() }
      a.datos.conciliaciones.push(c)
      registrar(a, quien(req), 'conciliacion', { activo: act.clave, cuadra: c.cuadra, diferencias: c.diferencias.length })
      await a.guardar()
      res.json(c)
    } catch (e) { fallo(res, e) }
  })

  // ─── ORIGEN ──────────────────────────────────────────────────────────────
  r.get('/origen', exige(), async (_req, res) => {
    try {
      res.json({ ...(await circulacion(ctx.cadena, a.datos.listas.tesoreria.direcciones)), umbral: ctx.umbral, liberaciones: [...a.datos.liberaciones].reverse() })
    } catch (e) { fallo(res, e) }
  })

  r.post('/liberaciones', exige('operador'), async (req, res) => {
    try {
      const l = proponer(a, quien(req), req.body || {})
      await a.guardar()
      res.status(201).json(l)
    } catch (e) { fallo(res, e) }
  })

  r.post('/liberaciones/:id/aprobar', exige('firmante'), async (req, res) => {
    try {
      const l = aprobar(a, req.params.id, quien(req), ctx.umbral)
      await a.guardar()
      res.json(l)
    } catch (e) { fallo(res, e) }
  })

  r.post('/liberaciones/:id/rechazar', exige('firmante'), async (req, res) => {
    try {
      const l = rechazar(a, req.params.id, quien(req), String(req.body?.motivo || ''))
      await a.guardar()
      res.json(l)
    } catch (e) { fallo(res, e) }
  })

  r.post('/liberaciones/:id/ejecutar', exige('operador'), async (req, res) => {
    try {
      const l = await ejecutar(a, ctx.cadena, req.params.id, String(req.body?.tx || ''), quien(req))
      await a.guardar()
      res.json(l)
    } catch (e) { fallo(res, e) }
  })

  // ─── Regalo de gas ───────────────────────────────────────────────────────
  r.get('/regalo', exige(), (_req, res) => res.json(a.datos.regalos))

  r.post('/regalo/preparar', exige('operador'), async (req, res) => {
    const p = prepararRegalo(a, quien(req))
    await a.guardar()
    res.json(p)
  })

  r.post('/regalo/envios', exige('operador'), async (req, res) => {
    const envios: { direccion: string; tx: string }[] = Array.isArray(req.body?.envios) ? req.body.envios : []
    const resultado = []
    for (const e of envios) {
      try {
        await registrarEnvioRegalo(a, ctx.cadena, String(e.direccion || ''), String(e.tx || ''), quien(req))
        resultado.push({ direccion: e.direccion, ok: true })
      } catch (err: any) {
        resultado.push({ direccion: e.direccion, ok: false, error: String(err?.message || err) })
      }
    }
    await a.guardar()
    res.json(resultado)
  })

  r.get('/bitacora', exige(), (_req, res) => res.json([...a.datos.bitacora].reverse().slice(0, 500)))

  return r
}
