// Lo que cualquiera puede consultar: el estado de la migración y su propia dirección.
//
// No se publica la clase de cada dirección (usuario, tesorería…): cada quien ve
// lo suyo, y el panel interno ve el conjunto.

import { Router } from 'express'
import type { Contexto } from '../app.js'
import { CATALOGO, contratoV2 } from '../catalogo.js'
import { esDireccion } from '../cadena.js'
import { construir, prueba } from '../merkle.js'
import { circulacion } from '../origen.js'

export function rutasPublicas(ctx: Contexto) {
  const r = Router()
  let cacheCirculacion: { hasta: number; valor: unknown } | null = null

  const ultimaPublicada = (activo: string) =>
    ctx.almacen.datos.fotos.filter((f) => f.activo === activo && f.estado === 'publicada').at(-1)

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
        const c = await circulacion(ctx.cadena, d.listas.tesoreria.direcciones)
        cacheCirculacion = { hasta: Date.now() + 60_000, valor: { bloque: c.bloque, circulante: c.circulante, completa: c.completa } }
      }
      origen = cacheCirculacion.valor
    } catch { origen = { error: 'el nodo no respondió' } }
    const regalos = d.regalos
    res.json({
      activos, origen,
      regalo: { total: regalos.length, enviados: regalos.filter((x) => x.estado === 'enviado').length },
    })
  })

  r.get('/tenedor/:direccion', async (req, res) => {
    const dir = String(req.params.direccion || '').toLowerCase()
    if (!esDireccion(dir)) return res.status(400).json({ error: 'Dirección inválida' })
    const salida = []
    for (const a of CATALOGO.filter((x) => x.heredado)) {
      const f = ultimaPublicada(a.clave)
      const t = f?.tenedores?.find((x) => x.direccion === dir)
      let enV2: string | null = null
      const v2 = contratoV2(a.clave, ctx.entorno)
      if (v2) {
        try { enV2 = (await ctx.cadena.saldos(v2, [dir], await ctx.cadena.ultimoBloque()))[0].toString() } catch { enV2 = null }
      }
      salida.push({
        clave: a.clave, simbolo: a.simbolo,
        foto: f ? { bloque: f.bloque, raiz: f.raiz } : null,
        saldoEnFoto: t?.saldo ?? (f ? '0' : null),
        prueba: t && f ? prueba(ctx.arbol(f.id, () => construir((f.tenedores || []).map((x) => ({ direccion: x.direccion, saldo: BigInt(x.saldo) })))), dir, BigInt(t.saldo)) : null,
        saldoV2: enV2,
        completo: t && enV2 != null ? enV2 === t.saldo : null,
      })
    }
    const regalo = ctx.almacen.datos.regalos.find((x) => x.direccion === dir)
    res.json({ direccion: dir, activos: salida, regaloGas: regalo ? { estado: regalo.estado, tx: regalo.tx ?? null } : null })
  })

  return r
}
