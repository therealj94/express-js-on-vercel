// Casos de cumplimiento.
//
// Una alerta que nadie mira no sirve de nada. El caso es lo que convierte una
// alerta en trabajo con dueño, plazo y desenlace escrito.
//
// Los casos NO se cierran solos y no se borran nunca. Un caso cerrado sin
// acción sigue en el expediente con el motivo por el que se cerró y quién lo
// firmó: si mañana esa misma persona aparece en una investigación, lo primero
// que se pregunta es qué se vio y qué se decidió, y hay que poder responder.

import { store } from '../store.js'
import { id } from '../lib/uid.js'
import { registrar } from '../audit/bitacora.js'
import { evaluarMovimientos, consolidar, type Alerta, type Movimiento } from './monitoreo.js'
import type { Caso, EstadoCaso, Identidad, Negocio, Operador } from '../types.js'

const ahora = () => new Date().toISOString()

/** Evita duplicar el caso si la misma alerta ya está abierta. */
function casoAbiertoPara(identidadId: string | null, origen: Caso['origen']): Caso | undefined {
  return store.todo().casos.find(
    (c) => c.identidadId === identidadId && c.origen === origen &&
      (c.estado === 'abierto' || c.estado === 'en-analisis'),
  )
}

export function abrirCasoPorTamiz(identidad: Identidad): Caso | null {
  const tamiz = identidad.tamiz
  if (!tamiz || (!tamiz.fuertes && !tamiz.posibles)) return null

  const yaAbierto = casoAbiertoPara(identidad.id, 'tamiz')
  if (yaAbierto) return yaAbierto

  const alertas: Alerta[] = tamiz.coincidencias.slice(0, 10).map((c) => ({
    regla: 'tamiz.sancion',
    gravedad: c.fuerza === 'fuerte' ? 'critica' : 'media',
    titulo: `${c.fuerza === 'fuerte' ? 'Coincidencia fuerte' : 'Posible coincidencia'} con ${c.registro.nombre}`,
    detalle: `${c.razones.join('. ')}. Lista ${c.registro.lista}, programa ${c.registro.programa || 'no indicado'}.`,
    movimientos: [],
    montoUsd: 0,
    reportable: c.fuerza === 'fuerte',
  }))

  const caso: Caso = {
    id: id('cas'),
    gid: identidad.gid,
    identidadId: identidad.id,
    negocioId: null,
    origen: 'tamiz',
    titulo: `Coincidencia en listas: ${identidad.nombreLegal ?? identidad.email}`,
    estado: 'abierto',
    gravedad: tamiz.fuertes > 0 ? 'critica' : 'media',
    alertas,
    notas: [],
    asignadoA: null,
    abiertoEn: ahora(),
    cerradoEn: null,
    referenciaReporte: null,
  }
  store.todo().casos.push(caso)
  store.guardar()
  registrar('sistema', 'caso.abierto', caso.id, {
    origen: 'tamiz', identidad: identidad.id, coincidencias: tamiz.coincidencias.length,
  })
  return caso
}

export function abrirCasoPorNegocio(negocio: Negocio): Caso | null {
  const tamiz = negocio.tamiz
  if (!tamiz || (!tamiz.fuertes && !tamiz.posibles)) return null
  const caso: Caso = {
    id: id('cas'),
    gid: negocio.gid,
    identidadId: null,
    negocioId: negocio.id,
    origen: 'tamiz',
    titulo: `Coincidencia en listas: ${negocio.razonSocial}`,
    estado: 'abierto',
    gravedad: tamiz.fuertes > 0 ? 'critica' : 'media',
    alertas: tamiz.coincidencias.slice(0, 10).map((c) => ({
      regla: 'tamiz.sancion',
      gravedad: c.fuerza === 'fuerte' ? 'critica' : 'media',
      titulo: `Coincidencia con ${c.registro.nombre}`,
      detalle: c.razones.join('. '),
      movimientos: [],
      montoUsd: 0,
      reportable: c.fuerza === 'fuerte',
    })),
    notas: [],
    asignadoA: null,
    abiertoEn: ahora(),
    cerradoEn: null,
    referenciaReporte: null,
  }
  store.todo().casos.push(caso)
  store.guardar()
  registrar('sistema', 'caso.abierto', caso.id, { origen: 'tamiz', negocio: negocio.id })
  return caso
}

/**
 * Registra movimientos y evalúa las reglas de monitoreo.
 * Si salen alertas, abre o actualiza el caso de esa identidad.
 */
export function registrarMovimientos(gid: string, nuevos: Movimiento[], origen: string): {
  alertas: Alerta[]; caso: Caso | null
} {
  const datos = store.todo()
  const conocidos = new Set(datos.movimientos.map((m) => m.id))
  for (const m of nuevos) {
    if (!conocidos.has(m.id)) datos.movimientos.push(m)
  }

  const delUsuario = datos.movimientos.filter((m) => m.gid === gid)
  const alertas = consolidar(evaluarMovimientos(delUsuario))
  store.guardar()

  if (!alertas.length) return { alertas: [], caso: null }

  const identidad = datos.identidades.find((i) => i.gid === gid)
  const existente = datos.casos.find(
    (c) => c.gid === gid && c.origen === 'monitoreo' && (c.estado === 'abierto' || c.estado === 'en-analisis'),
  )

  const gravedad = alertas.some((a) => a.gravedad === 'critica') ? 'critica'
    : alertas.some((a) => a.gravedad === 'alta') ? 'alta' : 'media'

  if (existente) {
    existente.alertas = alertas
    existente.gravedad = gravedad
    store.guardar()
    return { alertas, caso: existente }
  }

  const caso: Caso = {
    id: id('cas'),
    gid,
    identidadId: identidad?.id ?? null,
    negocioId: null,
    origen: 'monitoreo',
    titulo: `${alertas.length} alerta(s) de monitoreo — ${identidad?.nombreLegal ?? gid}`,
    estado: 'abierto',
    gravedad,
    alertas,
    notas: [],
    asignadoA: null,
    abiertoEn: ahora(),
    cerradoEn: null,
    referenciaReporte: null,
  }
  datos.casos.push(caso)
  store.guardar()
  registrar(origen, 'caso.abierto', caso.id, { origen: 'monitoreo', gid, reglas: alertas.map((a) => a.regla) })
  return { alertas, caso }
}

// ─────────────────────────────────────────────────────────────────────────────
// Gestión
// ─────────────────────────────────────────────────────────────────────────────

export const listarCasos = (filtro: { estado?: EstadoCaso; gravedad?: string } = {}): Caso[] =>
  store.todo().casos
    .filter((c) => (!filtro.estado || c.estado === filtro.estado) &&
                   (!filtro.gravedad || c.gravedad === filtro.gravedad))
    .sort((a, b) => b.abiertoEn.localeCompare(a.abiertoEn))

export const porIdCaso = (idc: string): Caso | undefined =>
  store.todo().casos.find((c) => c.id === idc)

export function asignar(idc: string, operador: Operador, aQuien: string): Caso | null {
  const caso = porIdCaso(idc)
  if (!caso) return null
  caso.asignadoA = aQuien
  if (caso.estado === 'abierto') caso.estado = 'en-analisis'
  store.guardar()
  registrar(operador.email, 'caso.asignado', caso.id, { a: aQuien })
  return caso
}

export function anotar(idc: string, operador: Operador, texto: string): Caso | null {
  const caso = porIdCaso(idc)
  if (!caso || !texto?.trim()) return null
  caso.notas.push({ operador: operador.email, texto: texto.trim(), fecha: ahora() })
  store.guardar()
  registrar(operador.email, 'caso.nota', caso.id, { largo: texto.length })
  return caso
}

export interface CierreCaso { ok: boolean; caso?: Caso; motivo?: string }

/**
 * Cierra un caso. Exige una conclusión escrita: es lo que un supervisor va a
 * leer si algún día pregunta por qué se descartó esta alerta.
 */
export async function cerrar(
  idc: string, operador: Operador, conReporte: boolean, conclusion: string, referencia?: string,
): Promise<CierreCaso> {
  const caso = porIdCaso(idc)
  if (!caso) return { ok: false, motivo: 'Caso no encontrado' }
  if (!conclusion || conclusion.trim().length < 20) {
    return { ok: false, motivo: 'La conclusión debe explicar el análisis (mínimo 20 caracteres)' }
  }
  if (conReporte && !referencia) {
    return { ok: false, motivo: 'Hace falta la referencia del reporte presentado' }
  }

  caso.notas.push({ operador: operador.email, texto: conclusion.trim(), fecha: ahora() })
  caso.estado = conReporte ? 'cerrado-con-reporte' : 'cerrado-sin-accion'
  caso.referenciaReporte = referencia ?? null
  caso.cerradoEn = ahora()
  await store.guardarYa()
  registrar(operador.email, 'caso.cerrado', caso.id, {
    conReporte, referencia: referencia ?? null, conclusion: conclusion.slice(0, 200),
  })
  return { ok: true, caso }
}

/**
 * Arma el borrador del reporte de operación sospechosa.
 *
 * No lo presenta ante nadie —eso depende del organismo de cada país y de sus
 * formularios— pero deja reunido todo lo que hay que declarar, para que quien
 * lo presente no tenga que reconstruirlo a mano desde cero.
 */
export function borradorReporte(idc: string): Record<string, unknown> | null {
  const caso = porIdCaso(idc)
  if (!caso) return null
  const datos = store.todo()
  const identidad = datos.identidades.find((i) => i.id === caso.identidadId || i.gid === caso.gid)
  const negocio = datos.negocios.find((n) => n.id === caso.negocioId)
  const movimientos = datos.movimientos.filter((m) =>
    caso.alertas.some((a) => a.movimientos.includes(m.id)))

  return {
    generadoEn: ahora(),
    caso: { id: caso.id, titulo: caso.titulo, origen: caso.origen, gravedad: caso.gravedad, abiertoEn: caso.abiertoEn },
    sujeto: identidad
      ? {
          gid: identidad.gid,
          nombreLegal: identidad.nombreLegal,
          fechaNacimiento: identidad.fechaNacimiento,
          nacionalidad: identidad.nacionalidad,
          documento: identidad.numeroDocumento,
          tipoDocumento: identidad.tipoDocumento,
          paisResidencia: identidad.paisResidencia,
          verificadaEn: identidad.verificadaEn,
          pep: identidad.pep,
        }
      : negocio
        ? {
            gid: negocio.gid,
            razonSocial: negocio.razonSocial,
            identificadorFiscal: negocio.identificadorFiscal,
            pais: negocio.pais,
            actividad: negocio.categoria,
            beneficiarios: negocio.beneficiarios.map((b) => ({
              nombre: b.nombreCompleto, porcentaje: b.porcentaje, pep: b.pep,
            })),
          }
        : null,
    alertas: caso.alertas.map((a) => ({
      regla: a.regla, gravedad: a.gravedad, titulo: a.titulo, detalle: a.detalle,
      montoUsd: a.montoUsd, reportable: a.reportable,
    })),
    operaciones: movimientos.map((m) => ({
      fecha: m.fecha, direccion: m.direccion, monto: m.monto, activo: m.activo,
      montoUsd: m.montoUsd, contraparte: m.contraparte, hash: m.hash, app: m.app,
    })),
    totalUsd: movimientos.reduce((s, m) => s + m.montoUsd, 0),
    analisis: caso.notas,
    aviso:
      'Borrador generado automáticamente. Debe revisarlo y completarlo el oficial de cumplimiento ' +
      'antes de presentarlo ante el organismo supervisor que corresponda.',
  }
}

export function resumenCasos() {
  const casos = store.todo().casos
  return {
    total: casos.length,
    abiertos: casos.filter((c) => c.estado === 'abierto').length,
    enAnalisis: casos.filter((c) => c.estado === 'en-analisis').length,
    criticos: casos.filter((c) => c.gravedad === 'critica' && c.cerradoEn === null).length,
    reportados: casos.filter((c) => c.estado === 'cerrado-con-reporte').length,
    cerrados: casos.filter((c) => c.cerradoEn !== null).length,
  }
}
