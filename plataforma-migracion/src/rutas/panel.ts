// El panel interno: listas, fotos, conciliación, liberaciones de ORIGEN y regalo de gas.
//
// Toda acción queda en la bitácora con quién la hizo. Nada de aquí firma ni
// envía en la cadena: lo que hay que ejecutar lo ejecuta la firma múltiple, y
// la plataforma lo comprueba después.

import { Router, type Request, type Response } from 'express'
import type { Contexto } from '../app.js'
import { activo, contratoV2 } from '../catalogo.js'
import { esDireccion } from '../cadena.js'
import { aAcunar, barrido, candidatas, conciliar, entradasAcunacion, puedePublicar, tomarFoto } from '../foto.js'
import { construir, prueba } from '../merkle.js'
import { ErrorRegla, aprobar, circulacion, ejecutar, prepararRegalo, proponer, rechazar, registrarEnvioRegalo } from '../origen.js'
import { entrar, exige } from '../sesion.js'
import { ErrorFirma, llamada, llamadasDeArchivo } from '../multifirma.js'
import * as OP from '../operaciones.js'
import { nuevoId, registrar, type Foto, type TipoLista } from '../almacen.js'

const TIPOS: TipoLista[] = ['usuarios', 'tesoreria', 'sistema', 'inventario']

export function rutasPanel(ctx: Contexto) {
  const r = Router()
  const a = ctx.almacen
  const intentos = new Map<string, { n: number; hasta: number }>()

  const quien = (req: Request) => req.operador!.correo
  const safe = ctx.safe
  // La Safe también es tesorería: lo que tiene no circula y no recibe el regalo.
  const sinSafe = (res: Response) => (res.status(409).json({ error: 'La firma múltiple no está configurada (SAFE_DIRECCION)' }), null)
  const conSafe = (res: Response, que: string) => (res.status(409).json({ error: `Con la firma múltiple activa, ${que}` }), null)
  const fallo = (res: Response, e: unknown) =>
    e instanceof ErrorRegla || e instanceof ErrorFirma ? res.status(409).json({ error: e.message })
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

  /** Lo que necesita la acuñación de la v2: cada dirección con su monto y su prueba, y la raíz. Incluye los reclamos aprobados. */
  r.get('/fotos/:id/acunacion.json', exige('operador'), (req, res) => {
    const f = a.datos.fotos.find((x) => x.id === req.params.id)
    if (!f || f.estado !== 'publicada') return res.status(409).json({ error: 'Solo una foto publicada se acuña' })
    const lista = aAcunar(f, a.datos.reclamos)
    const arbol = ctx.arbol(`${f.id}:${lista.length}`, () => construir(entradasAcunacion(lista)))
    res.json({
      activo: f.activo, bloque: f.bloque, raiz: arbol.raiz, supplyHeredado: f.supply,
      totalAcunar: lista.reduce((s, t) => s + BigInt(t.acunar), 0n).toString(),
      reclamosAprobados: a.datos.reclamos.filter((x) => x.fotoId === f.id && x.estado === 'aprobado').length,
      tenedores: lista.map((t) => ({ direccion: t.direccion, acunar: t.acunar, prueba: prueba(arbol, t.direccion, BigInt(t.acunar)) })),
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
    const plazo = req.body?.plazoReclamos ? String(req.body.plazoReclamos) : undefined
    const motivo = puedePublicar(f, plazo)
    if (motivo) return res.status(409).json({ error: `No se puede publicar: ${motivo}` })
    // Solo una foto publicada por moneda: la anterior deja de ser la que se acuña.
    if (a.datos.fotos.some((x) => x.activo === f.activo && x.estado === 'publicada')) {
      return res.status(409).json({ error: `Ya hay una foto publicada de ${f.activo}` })
    }
    f.estado = 'publicada'
    f.publicada = new Date().toISOString()
    if (BigInt(f.sinUbicar || '0') > 0n) f.plazoReclamos = new Date(plazo!).toISOString()
    registrar(a, quien(req), 'foto.publicada', { id: f.id, activo: f.activo, bloque: f.bloque, raiz: f.raiz, plazoReclamos: f.plazoReclamos })
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
      const c = { ...(await conciliar(ctx.cadena, f, a.datos.reclamos, v2)), fecha: new Date().toISOString() }
      a.datos.conciliaciones.push(c)
      registrar(a, quien(req), 'conciliacion', { activo: act.clave, cuadra: c.cuadra, diferencias: c.diferencias.length })
      await a.guardar()
      res.json(c)
    } catch (e) { fallo(res, e) }
  })

  // ─── ORIGEN ──────────────────────────────────────────────────────────────
  r.get('/origen', exige(), async (_req, res) => {
    try {
      const umbral = safe ? (await OP.estado(ctx.cadena, safe)).umbral : ctx.umbral
      res.json({ ...(await circulacion(ctx.cadena, a.datos.listas.tesoreria.direcciones, safe ? [safe.safe] : [])), umbral, multifirma: !!safe, liberaciones: [...a.datos.liberaciones].reverse() })
    } catch (e) { fallo(res, e) }
  })

  r.post('/liberaciones', exige('operador'), async (req, res) => {
    try {
      const l = proponer(a, quien(req), req.body || {})
      // Con la firma múltiple, la liberación nace con su transacción de la Safe para firmar.
      const op = safe && l.tipo === 'liberacion' ? await OP.crearDeLiberacion(a, ctx.cadena, safe, l) : null
      await a.guardar()
      res.status(201).json({ ...l, operacion: op?.id ?? null })
    } catch (e) { fallo(res, e) }
  })

  r.post('/liberaciones/:id/aprobar', exige('firmante'), async (req, res) => {
    if (safe) return conSafe(res, 'se aprueba firmando su operación con la billetera de custodio (Firma múltiple)')
    try {
      const l = aprobar(a, req.params.id, quien(req), ctx.umbral)
      await a.guardar()
      res.json(l)
    } catch (e) { fallo(res, e) }
  })

  r.post('/liberaciones/:id/rechazar', exige('firmante'), async (req, res) => {
    try {
      // Con la firma múltiple, rechazar es anular su operación (y, si ya tenía firmas, reemplazarla).
      const op = safe && a.datos.operaciones.find((o) => o.liberacion === req.params.id && (o.estado === 'en-firma' || o.estado === 'lista'))
      if (op) {
        const r2 = await OP.anular(a, ctx.cadena, safe!, op.id, quien(req), String(req.body?.motivo || ''))
        await a.guardar()
        return res.json({ ...a.datos.liberaciones.find((l) => l.id === req.params.id), reemplazo: r2.reemplazo?.id ?? null })
      }
      const l = rechazar(a, req.params.id, quien(req), String(req.body?.motivo || ''))
      await a.guardar()
      res.json(l)
    } catch (e) { fallo(res, e) }
  })

  r.post('/liberaciones/:id/ejecutar', exige('operador'), async (req, res) => {
    if (safe) return conSafe(res, 'la ejecución se registra en su operación (Firma múltiple)')
    try {
      const l = await ejecutar(a, ctx.cadena, req.params.id, String(req.body?.tx || ''), quien(req))
      await a.guardar()
      res.json(l)
    } catch (e) { fallo(res, e) }
  })

  // ─── Regalo de gas ───────────────────────────────────────────────────────
  r.get('/regalo', exige(), (_req, res) => res.json(a.datos.regalos))

  r.post('/regalo/preparar', exige('operador'), async (req, res) => {
    try {
      const p = await prepararRegalo(a, ctx.cadena, quien(req), safe ? { excluir: [safe.safe], porTanda: OP.POR_TANDA } : {})
      // Con la firma múltiple, cada tanda es una transacción de la Safe: un solo par de firmas por tanda.
      const operaciones = []
      if (safe) for (const l of p.liberaciones) operaciones.push((await OP.crearDeRegalo(a, ctx.cadena, safe, l)).id)
      await a.guardar()
      res.json({ ...p, operaciones })
    } catch (e) { fallo(res, e) }
  })

  // ─── Reclamos de lo no ubicado ───────────────────────────────────────────
  r.get('/reclamos', exige(), (_req, res) => res.json([...a.datos.reclamos].reverse()))

  const revisar = (estado: 'aprobado' | 'rechazado') => async (req: Request, res: Response) => {
    const rc = a.datos.reclamos.find((x) => x.id === req.params.id)
    if (!rc) return res.status(404).json({ error: 'No existe ese reclamo' })
    if (rc.estado !== 'pendiente') return res.status(409).json({ error: `El reclamo ya está ${rc.estado}` })
    Object.assign(rc, { estado, revisor: quien(req), revisado: new Date().toISOString(), nota: String(req.body?.nota || '') })
    registrar(a, quien(req), `reclamo.${estado}`, { id: rc.id, activo: rc.activo, direccion: rc.direccion, acunar: rc.acunar })
    await a.guardar()
    res.json(rc)
  }
  r.post('/reclamos/:id/aprobar', exige('operador'), revisar('aprobado'))
  r.post('/reclamos/:id/rechazar', exige('operador'), revisar('rechazado'))

  r.post('/regalo/envios', exige('operador'), async (req, res) => {
    if (safe) return conSafe(res, 'el regalo sale por tandas: se registra la ejecución de cada operación')
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

  // ─── Firma múltiple ──────────────────────────────────────────────────────
  r.get('/multifirma', exige(), async (_req, res) => {
    if (!safe) return res.json({ configurada: false })
    try {
      const [e, saldo] = await Promise.all([OP.estado(ctx.cadena, safe), ctx.cadena.llamar('eth_getBalance', [safe.safe, 'latest'])])
      res.json({ configurada: true, safe: safe.safe, multisend: safe.multisend ?? null, ...e, saldo: BigInt(saldo).toString() })
    } catch (e) { fallo(res, e) }
  })

  r.get('/operaciones', exige(), async (_req, res) => {
    if (!safe) return sinSafe(res)
    try {
      if (await OP.refrescar(a, ctx.cadena, safe)) await a.guardar()
      res.json([...a.datos.operaciones].reverse().map((o) => ({ ...o, llamadas: undefined, totalLlamadas: o.llamadas.length })))
    } catch (e) { fallo(res, e) }
  })

  r.get('/operaciones/:id', exige(), (req, res) => {
    const o = a.datos.operaciones.find((x) => x.id === req.params.id)
    if (!o) return res.status(404).json({ error: 'No existe esa operación' })
    res.json(OP.detalle(o))
  })

  /** Llamadas a los contratos (abrir una migración, fijar el registro, roles), o un archivo de lotes-safe.ts. */
  r.post('/operaciones', exige('operador'), async (req, res) => {
    if (!safe) return sinSafe(res)
    try {
      const b = req.body || {}
      const llamadas = b.archivo ? llamadasDeArchivo(b.archivo) : (Array.isArray(b.llamadas) ? b.llamadas : []).map((l: any) => llamada(l))
      const o = await OP.crear(a, ctx.cadena, safe, quien(req), { tipo: 'contratos', titulo: String(b.titulo || b.archivo?.meta?.name || ''), llamadas })
      await a.guardar()
      res.status(201).json(OP.detalle(o))
    } catch (e) { fallo(res, e) }
  })

  r.post('/operaciones/:id/firmar', exige('firmante'), async (req, res) => {
    if (!safe) return sinSafe(res)
    try {
      const o = await OP.firmar(a, ctx.cadena, safe, req.params.id, quien(req), String(req.body?.firma || ''))
      await a.guardar()
      res.json(OP.detalle(o))
    } catch (e) { await a.guardar(); fallo(res, e) }
  })

  r.post('/operaciones/:id/ejecutada', exige('operador', 'firmante'), async (req, res) => {
    if (!safe) return sinSafe(res)
    try {
      const o = await OP.ejecutada(a, ctx.cadena, safe, req.params.id, String(req.body?.tx || ''), quien(req))
      await a.guardar()
      res.json(OP.detalle(o))
    } catch (e) { fallo(res, e) }
  })

  r.post('/operaciones/:id/anular', exige('firmante'), async (req, res) => {
    if (!safe) return sinSafe(res)
    try {
      const r2 = await OP.anular(a, ctx.cadena, safe, req.params.id, quien(req), String(req.body?.motivo || ''))
      await a.guardar()
      res.json({ anulada: r2.anulada.id, reemplazo: r2.reemplazo ? OP.detalle(r2.reemplazo) : null })
    } catch (e) { fallo(res, e) }
  })

  r.get('/bitacora', exige(), (_req, res) => res.json([...a.datos.bitacora].reverse().slice(0, 500)))

  return r
}
