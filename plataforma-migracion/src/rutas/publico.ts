// Lo que cualquiera puede consultar: el estado de la migración y su propia dirección.
//
// No se publica la clase de cada dirección (usuario, tesorería…): cada quien ve
// lo suyo, y el panel interno ve el conjunto.

import { Router } from 'express'
import type { Contexto } from '../app.js'
import { CATALOGO, contratoV2 } from '../catalogo.js'
import { esDireccion } from '../cadena.js'
import { construir, prueba } from '../merkle.js'
import { aAcunar, entradasAcunacion, ErrorReclamo, mensajeReclamo, prepararReclamo } from '../foto.js'
import { activo as buscarActivo } from '../catalogo.js'
import { nuevoId, registrar } from '../almacen.js'
import { circulacion } from '../origen.js'
import { monedas } from '../monedas.js'
import * as OP from '../operaciones.js'

export function rutasPublicas(ctx: Contexto) {
  const r = Router()
  let cacheCirculacion: { hasta: number; valor: unknown } | null = null
  // Umbrales leídos de cada Safe: la página no promete un quórum que no es el de la cadena.
  let cacheQuorum: { hasta: number; valor: unknown } | null = null

  const ultimaPublicada = (activo: string) =>
    ctx.almacen.datos.fotos.filter((f) => f.activo === activo && f.estado === 'publicada').at(-1)

  /**
   * La lista única de monedas. La leen las apps desde sus propios dominios (y la app del teléfono,
   * que no tiene origen), así que es la única ruta con CORS abierto: es pública y no tiene nada privado.
   */
  r.get('/monedas', (_req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Cache-Control', 'public, max-age=60')
    res.json({ red: 5550, actualizado: new Date().toISOString(), monedas: monedas(ctx.entorno) })
  })

  async function quorum() {
    if (!ctx.safe) return null
    try {
      if (!cacheQuorum || cacheQuorum.hasta < Date.now()) {
        const leer = async (d: string) => { const e = await OP.estado(ctx.cadena, d); return { umbral: e.umbral, custodios: e.duenos.length } }
        cacheQuorum = { hasta: Date.now() + 60_000, valor: { operativa: await leer(ctx.safe.safe), administracion: ctx.safe.constitucional ? await leer(ctx.safe.constitucional) : null } }
      }
      return cacheQuorum.valor
    } catch { return null }
  }

  r.get('/estado', async (_req, res) => {
    const d = ctx.almacen.datos
    const activos = CATALOGO.map((a) => {
      const f = ultimaPublicada(a.clave)
      const c = d.conciliaciones.filter((x) => x.activo === a.clave).at(-1)
      const v2 = contratoV2(a.clave, ctx.entorno)
      const fase = !a.heredado ? 'nativo'
        : c?.cuadra ? 'conciliada'
        : v2 && f ? 'acunando'
        : f ? 'foto-publicada'
        : 'preparacion'
      return {
        clave: a.clave, nombre: a.nombre, simbolo: a.simbolo, serie: a.serie, nota: a.nota,
        heredado: a.heredado, v2, fase,
        foto: f ? { bloque: f.bloque, raiz: f.raiz, supply: f.supply, tenedores: f.tenedores?.length, publicada: f.publicada } : null,
        conciliacion: c ? { fecha: c.fecha, cuadra: c.cuadra, diferencias: c.diferencias.length } : null,
      }
    })
    let origen: unknown = null
    try {
      if (!cacheCirculacion || cacheCirculacion.hasta < Date.now()) {
        const c = await circulacion(ctx.cadena, d.listas.usuarios.direcciones, [...d.listas.tesoreria.direcciones, ...d.listas.sistema.direcciones, ...(ctx.safe ? [ctx.safe.safe, ctx.safe.constitucional ?? ''] : [])].filter(Boolean))
        cacheCirculacion = { hasta: Date.now() + 60_000, valor: { bloque: c.bloque, circulante: c.circulante, usuarios: c.usuarios, completa: c.completa } }
      }
      origen = cacheCirculacion.valor
    } catch { origen = { error: 'el nodo no respondió' } }
    const regalos = d.regalos
    res.json({
      activos, origen,
      regalo: { total: regalos.length, enviados: regalos.filter((x) => x.estado === 'enviado').length },
      // Transparencia: la firma múltiple y lo que ejecutó (sin las firmas).
      multifirma: ctx.safe ? {
        safe: ctx.safe.safe,
        constitucional: ctx.safe.constitucional ?? null,
        quorum: await quorum(),
        ejecutadas: d.operaciones.filter((o) => o.estado === 'ejecutada').map((o) => ({ titulo: o.titulo, tipo: o.tipo, nonce: o.safeTx.nonce, tx: o.tx, fecha: o.ejecutada })).reverse().slice(0, 50),
      } : null,
    })
  })

  r.get('/tenedor/:direccion', async (req, res) => {
    const dir = String(req.params.direccion || '').toLowerCase()
    if (!esDireccion(dir)) return res.status(400).json({ error: 'Dirección inválida' })
    const salida = []
    for (const a of CATALOGO.filter((x) => x.heredado)) {
      const f = ultimaPublicada(a.clave)
      const lista = f ? aAcunar(f, ctx.almacen.datos.reclamos) : []
      const t = f?.tenedores?.find((x) => x.direccion === dir)
      const aAc = lista.find((x) => x.direccion === dir)
      const rc = f ? ctx.almacen.datos.reclamos.filter((x) => x.fotoId === f.id && x.direccion === dir).at(-1) : undefined
      let enV2: string | null = null
      const v2 = contratoV2(a.clave, ctx.entorno)
      if (v2) {
        try { enV2 = (await ctx.cadena.saldos(v2, [dir], await ctx.cadena.ultimoBloque()))[0].toString() } catch { enV2 = null }
      }
      const arbol = f && aAc ? ctx.arbol(`${f.id}:${lista.length}`, () => construir(entradasAcunacion(lista))) : null
      salida.push({
        clave: a.clave, simbolo: a.simbolo,
        foto: f ? { bloque: f.bloque, raiz: arbol?.raiz ?? f.raiz, plazoReclamos: f.plazoReclamos ?? null } : null,
        saldoEnFoto: t?.saldo ?? rc?.saldo ?? (f ? '0' : null),
        aAcunar: aAc?.acunar ?? (f ? '0' : null),
        motivo: t?.motivo ?? rc?.motivo ?? null,
        reclamo: rc ? { estado: rc.estado } : null,
        prueba: arbol && aAc ? prueba(arbol, dir, BigInt(aAc.acunar)) : null,
        saldoV2: enV2,
        completo: aAc && enV2 != null ? enV2 === aAc.acunar : null,
      })
    }
    const regalo = ctx.almacen.datos.regalos.find((x) => x.direccion === dir)
    res.json({ direccion: dir, activos: salida, regaloGas: regalo ? { estado: regalo.estado, tx: regalo.tx ?? null } : null })
  })

  /** El mensaje exacto que hay que firmar para reclamar una dirección que la foto no encontró. */
  r.get('/reclamo/mensaje', (req, res) => {
    const a = buscarActivo(String(req.query.activo || ''))
    const dir = String(req.query.direccion || '').toLowerCase()
    const f = a ? ultimaPublicada(a.clave) : undefined
    if (!a || !f || !esDireccion(dir)) return res.status(400).json({ error: 'Moneda sin foto publicada o dirección inválida' })
    res.json({ mensaje: mensajeReclamo(a.clave, dir, f.bloque), plazo: f.plazoReclamos ?? null })
  })

  const intentos = new Map<string, number[]>()
  r.post('/reclamos', async (req, res) => {
    const ip = req.ip || '?'
    const ahora = Date.now()
    const recientes = (intentos.get(ip) || []).filter((t) => t > ahora - 3600_000)
    if (recientes.length >= 20) return res.status(429).json({ error: 'Demasiados reclamos. Intenta más tarde.' })
    intentos.set(ip, [...recientes, ahora])
    const a = buscarActivo(String(req.body?.activo || ''))
    const dir = String(req.body?.direccion || '').toLowerCase()
    const f = a?.heredado ? ultimaPublicada(a.clave) : undefined
    if (!a || !f || !esDireccion(dir)) return res.status(400).json({ error: 'Moneda sin foto publicada o dirección inválida' })
    try {
      const datos = await prepararReclamo(ctx.cadena, a, f, ctx.almacen.datos.reclamos, dir, String(req.body?.firma || ''), ctx.almacen.datos.listas)
      const rc = { id: nuevoId('rec'), creado: new Date().toISOString(), estado: 'pendiente' as const, ...datos }
      ctx.almacen.datos.reclamos.push(rc)
      registrar(ctx.almacen, dir, 'reclamo.recibido', { id: rc.id, activo: rc.activo, saldo: rc.saldo, acunar: rc.acunar })
      await ctx.almacen.guardar()
      res.status(201).json({ id: rc.id, estado: rc.estado, saldo: rc.saldo, acunar: rc.acunar, motivo: rc.motivo ?? null })
    } catch (e: any) {
      res.status(e instanceof ErrorReclamo ? 409 : 502).json({ error: String(e?.message || e).slice(0, 200) })
    }
  })

  return r
}
