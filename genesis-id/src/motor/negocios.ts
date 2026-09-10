// Motor de identidades de negocio (KYB).
//
// La diferencia con el KYC personal es que una empresa no se puede "mirar a la
// cara": lo que hay que averiguar es QUIEN ESTA DETRAS. Una sociedad se
// constituye en un día y sirve perfectamente de pantalla, así que verificar la
// empresa sin identificar a sus dueños reales no verifica nada.
//
// De ahí que aquí lo central sean los beneficiarios finales, y que el motor se
// niegue a aprobar un negocio cuyos dueños no estén identificados.

import { store } from '../store.js'
import { gidNegocio, id } from '../lib/uid.js'
import { registrar } from '../audit/bitacora.js'
import { avisar, type Evento } from '../enganches/enganches.js'
import { validarIdentificadorFiscal } from '../kyb/fiscal.js'
import { tamizarEntidad, tamizarPersona } from '../aml/tamiz.js'
import { evaluarRiesgo, ACTIVIDADES_ALTO_RIESGO } from '../aml/riesgo.js'
import { abrirCasoPorNegocio } from '../aml/casos.js'
import { porGid as identidadPorGid, porEmail as identidadPorEmail } from './identidades.js'
import type { Negocio, Beneficiario, DocumentoNegocio, Operador, EstadoNegocio } from '../types.js'

const ahora = () => new Date().toISOString()

/** Umbral internacional de beneficiario final. */
export const UMBRAL_UBO = 25

/** Lo que hay que aportar para abrir un expediente de empresa. */
export const DOCUMENTOS_EXIGIDOS: { clave: string; nombre: string }[] = [
  { clave: 'constitucion', nombre: 'Escritura de constitución' },
  { clave: 'registro', nombre: 'Inscripción en el registro mercantil' },
  { clave: 'fiscal', nombre: 'Constancia de identificación fiscal' },
  { clave: 'poder', nombre: 'Poder del representante legal' },
  { clave: 'estructura', nombre: 'Estructura accionarial / declaración de beneficiarios' },
  { clave: 'domicilio', nombre: 'Comprobante de domicilio de la empresa' },
]

export const porId = (idn: string): Negocio | undefined =>
  store.todo().negocios.find((n) => n.id === idn)

export const porGidNegocio = (gid: string): Negocio | undefined =>
  store.todo().negocios.find((n) => n.gid === String(gid || '').toUpperCase())

export const porDueno = (email: string): Negocio[] =>
  store.todo().negocios.filter((n) => n.emailDueno === String(email || '').toLowerCase().trim())

function riesgoActividad(categoria: string): 'alta' | 'media' | 'baja' {
  const c = categoria.toLowerCase()
  if (ACTIVIDADES_ALTO_RIESGO.some((a) => c.includes(a.toLowerCase().split(' ')[0]))) return 'alta'
  if (/import|export|construc|joyer|arte|turismo|hotel/.test(c)) return 'media'
  return 'baja'
}

export interface AltaNegocio {
  emailDueno: string
  razonSocial: string
  nombreComercial: string
  identificadorFiscal: string
  categoria: string
  pais: string
  ciudad: string
  direccion: string
  sitioWeb?: string
}

export interface ResultadoAlta { ok: boolean; negocio?: Negocio; motivo?: string }

export function registrarNegocio(input: AltaNegocio, origen: string): ResultadoAlta {
  const pais = input.pais.toUpperCase()
  const fiscal = validarIdentificadorFiscal(pais, input.identificadorFiscal)
  if (!fiscal.valido) {
    return { ok: false, motivo: `Identificador fiscal inválido: ${fiscal.motivo}` }
  }

  // No se puede abrir un expediente de empresa si el dueño no tiene ni siquiera
  // iniciada su identidad personal: sin persona detrás no hay a quién atribuir
  // la responsabilidad.
  const dueno = identidadPorEmail(input.emailDueno)
  if (!dueno) {
    return { ok: false, motivo: 'El dueño debe tener primero su identidad personal en Genesis ID' }
  }

  const yaExiste = store.todo().negocios.find(
    (n) => n.identificadorFiscal === fiscal.normalizado && n.pais === pais && n.estado !== 'rechazado',
  )
  if (yaExiste) {
    return { ok: false, motivo: `Ya hay un expediente con ese identificador fiscal (${yaExiste.id})` }
  }

  const negocio: Negocio = {
    id: id('biz'),
    // Igual que en identidades: de dónde vino, para saber a quién avisar.
    creadaPor: origen.startsWith('app:') ? origen.slice(4) : null,
    emailDueno: input.emailDueno.toLowerCase().trim(),
    gidDueno: dueno.gid,
    razonSocial: input.razonSocial.trim(),
    nombreComercial: input.nombreComercial.trim(),
    identificadorFiscal: fiscal.normalizado,
    categoria: input.categoria,
    actividadRiesgo: riesgoActividad(input.categoria),
    pais,
    ciudad: input.ciudad,
    direccion: input.direccion,
    sitioWeb: input.sitioWeb ?? null,
    estado: 'iniciado',
    gid: null,
    beneficiarios: [],
    documentos: DOCUMENTOS_EXIGIDOS.map<DocumentoNegocio>((d) => ({
      clave: d.clave, nombre: d.nombre, referencia: null, recibidoEn: null,
    })),
    tamiz: tamizarEntidad(input.razonSocial),
    riesgo: null,
    decisiones: [],
    creadoEn: ahora(),
    actualizadoEn: ahora(),
    verificadoEn: null,
  }

  recalcular(negocio)
  store.todo().negocios.push(negocio)
  store.guardar()
  if ((negocio.tamiz?.fuertes ?? 0) > 0 || (negocio.tamiz?.posibles ?? 0) > 0) {
    abrirCasoPorNegocio(negocio)
  }
  registrar(origen, 'negocio.registrado', negocio.id, {
    razonSocial: negocio.razonSocial, pais, fiscal: fiscal.comprobacion,
  })
  return { ok: true, negocio }
}

// ─────────────────────────────────────────────────────────────────────────────
// Beneficiarios finales
// ─────────────────────────────────────────────────────────────────────────────

export function agregarBeneficiario(
  idn: string,
  input: { nombreCompleto: string; porcentaje: number; via?: Beneficiario['via']; fechaNacimiento?: string; nacionalidad?: string; gid?: string },
  origen: string,
): { ok: boolean; negocio?: Negocio; motivo?: string } {
  const negocio = porId(idn)
  if (!negocio) return { ok: false, motivo: 'Negocio no encontrado' }

  const suma = negocio.beneficiarios.reduce((s, b) => s + b.porcentaje, 0) + input.porcentaje
  if (suma > 100.01) {
    return { ok: false, motivo: `Los porcentajes suman ${suma.toFixed(2)} %, más de 100 %` }
  }

  const beneficiario: Beneficiario = {
    id: id('ubo'),
    nombreCompleto: input.nombreCompleto.trim(),
    porcentaje: input.porcentaje,
    via: input.via ?? 'participacion',
    fechaNacimiento: input.fechaNacimiento ?? null,
    nacionalidad: input.nacionalidad?.toUpperCase() ?? null,
    gid: input.gid ?? null,
    tamiz: tamizarPersona(input.nombreCompleto, {
      fechaNacimiento: input.fechaNacimiento,
      nacionalidades: input.nacionalidad ? [input.nacionalidad.toUpperCase()] : [],
    }),
    pep: false,
  }

  negocio.beneficiarios.push(beneficiario)
  if (negocio.estado === 'iniciado') negocio.estado = 'documentos'
  recalcular(negocio)
  negocio.actualizadoEn = ahora()
  store.guardar()
  registrar(origen, 'negocio.beneficiario', negocio.id, {
    nombre: beneficiario.nombreCompleto,
    porcentaje: beneficiario.porcentaje,
    coincidencias: beneficiario.tamiz?.coincidencias.length ?? 0,
  })
  return { ok: true, negocio }
}

export function recibirDocumento(idn: string, clave: string, referencia: string, origen: string): Negocio | null {
  const negocio = porId(idn)
  if (!negocio) return null
  const doc = negocio.documentos.find((d) => d.clave === clave)
  if (!doc) return null
  doc.referencia = referencia
  doc.recibidoEn = ahora()
  if (negocio.estado === 'iniciado') negocio.estado = 'documentos'
  recalcular(negocio)
  negocio.actualizadoEn = ahora()
  store.guardar()
  registrar(origen, 'negocio.documento', negocio.id, { documento: clave })
  return negocio
}

// ─────────────────────────────────────────────────────────────────────────────
// Riesgo y bloqueos propios del KYB
// ─────────────────────────────────────────────────────────────────────────────

/** Lo que impide aprobar un negocio, además de lo que ya mira `evaluarRiesgo`. */
export function bloqueosKyb(negocio: Negocio): string[] {
  const bloqueos: string[] = []

  const faltan = negocio.documentos.filter((d) => !d.recibidoEn)
  if (faltan.length) {
    bloqueos.push(`Faltan ${faltan.length} documento(s): ${faltan.map((d) => d.nombre).join(', ')}`)
  }

  if (!negocio.beneficiarios.length) {
    bloqueos.push('No se ha declarado ningún beneficiario final')
  } else {
    const mayores = negocio.beneficiarios.filter((b) => b.porcentaje >= UMBRAL_UBO)
    // Si nadie llega al 25 %, la normativa obliga a identificar igualmente a
    // quien controle por otra vía, o a la administración.
    if (!mayores.length && !negocio.beneficiarios.some((b) => b.via !== 'participacion')) {
      bloqueos.push(
        `Ningún beneficiario alcanza el ${UMBRAL_UBO} %. Hay que identificar a quien ejerza el control ` +
        'por otros medios, o a la administración de la sociedad.',
      )
    }
    // Todo beneficiario relevante necesita su propio KYC verificado.
    for (const b of negocio.beneficiarios.filter((x) => x.porcentaje >= UMBRAL_UBO || x.via !== 'participacion')) {
      if (!b.gid) {
        bloqueos.push(`El beneficiario "${b.nombreCompleto}" (${b.porcentaje} %) no tiene identidad verificada`)
      } else {
        const identidad = identidadPorGid(b.gid)
        if (!identidad || identidad.estado !== 'verificada') {
          bloqueos.push(`El GID del beneficiario "${b.nombreCompleto}" no corresponde a una identidad verificada`)
        }
      }
      if ((b.tamiz?.fuertes ?? 0) > 0) {
        bloqueos.push(`El beneficiario "${b.nombreCompleto}" tiene coincidencia fuerte en listas de sanciones`)
      }
    }
    const suma = negocio.beneficiarios.reduce((s, b) => s + b.porcentaje, 0)
    if (suma < 75) {
      bloqueos.push(`Los beneficiarios declarados solo cubren el ${suma.toFixed(1)} % de la propiedad`)
    }
  }

  const dueno = negocio.gidDueno ? identidadPorGid(negocio.gidDueno) : identidadPorEmail(negocio.emailDueno)
  if (!dueno || dueno.estado !== 'verificada') {
    bloqueos.push('El representante legal no tiene su identidad personal verificada')
  }

  return bloqueos
}

export function recalcular(negocio: Negocio): Negocio {
  const base = evaluarRiesgo({
    // El KYB no tiene documento de identidad personal ni biometría; se le pasan
    // resueltos para que no los cuente como bloqueo, porque los bloqueos del
    // negocio son otros y se añaden abajo.
    documento: {
      aceptable: true, datos: null, hallazgos: [], edad: null,
      anverso: { aportado: false, nombreConfirmado: null, fechaConfirmada: null },
    },
    tamiz: negocio.tamiz,
    biometria: {
      estado: 'ok', parecido: null, vivacidad: null,
      proveedor: 'no-aplica', motivo: 'Una persona jurídica no tiene biometría',
      evaluadoEn: ahora(),
    },
    pais: negocio.pais,
    pep: negocio.beneficiarios.some((b) => b.pep),
    actividadRiesgo: negocio.actividadRiesgo,
  })
  base.bloqueos = [...base.bloqueos, ...bloqueosKyb(negocio)]
  if (base.bloqueos.length && base.recomendacion === 'aprobar') base.recomendacion = 'revision'
  negocio.riesgo = base
  return negocio
}

// ─────────────────────────────────────────────────────────────────────────────
// Decisiones
// ─────────────────────────────────────────────────────────────────────────────

function anotar(negocio: Negocio, estado: EstadoNegocio, operador: string, motivo: string) {
  negocio.decisiones.push({ estado: estado as any, operador, motivo, fecha: ahora() })
  negocio.estado = estado
  negocio.actualizadoEn = ahora()

  /* Mismo motivo que en identidades: es el único sitio por el que pasan todas
     las decisiones de un negocio. */
  avisar(`negocio.${estado}` as Evento, { ...negocio, vinculos: [] }, { motivo })
}

export async function aprobarNegocio(
  idn: string, operador: Operador, motivo: string, anulacion?: string,
): Promise<{ ok: boolean; negocio?: Negocio; motivo?: string; bloqueos?: string[] }> {
  const negocio = porId(idn)
  if (!negocio) return { ok: false, motivo: 'Negocio no encontrado' }
  if (!motivo || motivo.trim().length < 5) return { ok: false, motivo: 'Hay que escribir el motivo' }

  recalcular(negocio)
  const bloqueos = negocio.riesgo?.bloqueos ?? []

  if (bloqueos.length && (!anulacion || anulacion.trim().length < 20)) {
    return {
      ok: false,
      motivo: 'No se puede aprobar con comprobaciones sin resolver. Hace falta una justificación escrita de al menos 20 caracteres.',
      bloqueos, negocio,
    }
  }
  if (negocio.riesgo?.nivel === 'inaceptable') {
    return { ok: false, motivo: 'Riesgo inaceptable: no se puede aprobar por esta vía', bloqueos, negocio }
  }

  negocio.gid = negocio.gid ?? gidNegocio()
  negocio.verificadoEn = ahora()
  anotar(negocio, 'verificado', operador.email,
    anulacion ? `${motivo} — ANULACION: ${anulacion}` : motivo)
  await store.guardarYa()
  registrar(operador.email, 'negocio.aprobado', negocio.id, {
    gid: negocio.gid, motivo, anulacion: anulacion ?? null, bloqueosAnulados: anulacion ? bloqueos : [],
  })
  return { ok: true, negocio }
}

export async function rechazarNegocio(idn: string, operador: Operador, motivo: string) {
  const negocio = porId(idn)
  if (!negocio) return { ok: false, motivo: 'Negocio no encontrado' }
  if (!motivo || motivo.trim().length < 5) return { ok: false, motivo: 'Hay que escribir el motivo' }
  anotar(negocio, 'rechazado', operador.email, motivo)
  await store.guardarYa()
  registrar(operador.email, 'negocio.rechazado', negocio.id, { motivo })
  return { ok: true, negocio }
}

/** Vista para las apps: sin documentos ni datos de los beneficiarios. */
export const perfilNegocio = (n: Negocio) => ({
  gid: n.gid,
  verificado: n.estado === 'verificado',
  estado: n.estado,
  nombreComercial: n.nombreComercial,
  razonSocial: n.estado === 'verificado' ? n.razonSocial : null,
  pais: n.pais,
  categoria: n.categoria,
  verificadoEn: n.verificadoEn,
})
