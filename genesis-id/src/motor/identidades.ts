// Motor de identidades personales.
//
// LO QUE CAMBIA RESPECTO DE LA VERSION ANTERIOR
//
// Antes existía `processIdentity(id)`: una ruta HTTP sin autenticar que ponía
// el estado en "verificada" y emitía un UID. Nada más. Ni documento, ni
// tamizado, ni persona que respondiera por la decisión. MyTokenPay la llamaba
// directamente desde el teléfono.
//
// Ahora `verificada` tiene UNA sola puerta, `aprobar()`, y esa puerta exige:
//
//   1. Un operador identificado, con permiso `identidad.aprobar`.
//   2. Que no queden bloqueos: documento válido, tamizado hecho contra listas
//      cargadas de verdad, biometría resuelta.
//   3. Si el operador decide aprobar a pesar de un bloqueo, tiene que escribir
//      por qué, y esa anulación queda marcada en la identidad y en la bitácora
//      para siempre.
//
// El GID no existe hasta ese momento. No hay identidad verificada sin decisión.

import { store } from '../store.js'
import { gidPersonal, id } from '../lib/uid.js'
import { registrar } from '../audit/bitacora.js'
import { revisarDocumento } from '../kyc/documento.js'
import { parecidoNombres } from '../lib/texto.js'
import { cotejar, sinProveedor, cotejoManual, biometriaConfigurada } from '../kyc/biometria.js'
import type { ResultadoVivacidad } from '../kyc/vivacidad.js'
import { tamizarPersona } from '../aml/tamiz.js'
import { evaluarRiesgo } from '../aml/riesgo.js'
import { abrirCasoPorTamiz } from '../aml/casos.js'
import type { Identidad, EstadoIdentidad, Operador, VinculoApp } from '../types.js'

const ahora = () => new Date().toISOString()

// ─────────────────────────────────────────────────────────────────────────────
// Búsqueda
// ─────────────────────────────────────────────────────────────────────────────

export const porEmail = (email: string): Identidad | undefined =>
  store.todo().identidades.find((i) => i.email === String(email || '').toLowerCase().trim())

export const porId = (idn: string): Identidad | undefined =>
  store.todo().identidades.find((i) => i.id === idn)

export const porGid = (gid: string): Identidad | undefined =>
  store.todo().identidades.find((i) => i.gid === String(gid || '').toUpperCase())

// ─────────────────────────────────────────────────────────────────────────────
// Alta y datos declarados
// ─────────────────────────────────────────────────────────────────────────────

export function iniciar(email: string, origen: string): Identidad {
  const correo = String(email).toLowerCase().trim()
  const existente = porEmail(correo)
  if (existente) return existente

  const identidad: Identidad = {
    id: id('idn'),
    tipo: 'personal',
    email: correo,
    nombreDeclarado: null,
    fechaNacimientoDeclarada: null,
    paisResidencia: null,
    telefono: null,
    direccion: null,
    ocupacion: null,
    origenFondos: null,
    propositoCuenta: null,
    volumenEsperadoUsd: null,
    pepDeclarado: null,
    fotoCredencial: null,
    nombreLegal: null,
    fechaNacimiento: null,
    nacionalidad: null,
    numeroDocumento: null,
    tipoDocumento: null,
    vencimientoDocumento: null,
    estado: 'iniciada',
    gid: null,
    documento: null,
    biometria: null,
    tamiz: null,
    riesgo: null,
    pep: false,
    vinculos: [],
    decisiones: [],
    creadaEn: ahora(),
    actualizadaEn: ahora(),
    verificadaEn: null,
  }
  store.todo().identidades.push(identidad)
  store.guardar()
  registrar(origen, 'identidad.iniciada', identidad.id, { email: correo })
  return identidad
}

export interface DatosDeclarados {
  nombreCompleto?: string
  fechaNacimiento?: string
  paisResidencia?: string
  telefono?: string
  direccion?: string
  ocupacion?: string
  origenFondos?: string
  propositoCuenta?: string
  volumenEsperadoUsd?: number
  pepDeclarado?: boolean
}

export function declararDatos(idn: string, datos: DatosDeclarados, origen: string): Identidad | null {
  const identidad = porId(idn)
  if (!identidad) return null
  if (identidad.estado === 'verificada') {
    // Una identidad ya verificada no se edita por la puerta de atrás: habría
    // que suspenderla y rehacer la verificación.
    return identidad
  }

  if (datos.nombreCompleto) identidad.nombreDeclarado = datos.nombreCompleto.trim()
  if (datos.fechaNacimiento) identidad.fechaNacimientoDeclarada = datos.fechaNacimiento
  if (datos.paisResidencia) identidad.paisResidencia = datos.paisResidencia.toUpperCase()
  if (datos.telefono) identidad.telefono = String(datos.telefono).trim()
  if (datos.direccion) identidad.direccion = String(datos.direccion).trim()
  if (datos.ocupacion) identidad.ocupacion = String(datos.ocupacion).trim()
  if (datos.origenFondos) identidad.origenFondos = String(datos.origenFondos).trim()
  if (datos.propositoCuenta) identidad.propositoCuenta = String(datos.propositoCuenta).trim()
  if (Number.isFinite(datos.volumenEsperadoUsd)) {
    identidad.volumenEsperadoUsd = Math.max(0, Number(datos.volumenEsperadoUsd))
  }
  if (typeof datos.pepDeclarado === 'boolean') {
    identidad.pepDeclarado = datos.pepDeclarado
    // Declararse PEP marca la identidad. Quitarla es decisión de un operador,
    // nunca de la propia persona: si no, bastaría con volver a declararse «no».
    if (datos.pepDeclarado) identidad.pep = true
  }

  if (identidad.estado === 'iniciada' && identidad.nombreDeclarado) identidad.estado = 'datos'

  // Tamizado preliminar con el nombre declarado, mientras no haya documento.
  // El que vale es el del documento —y por eso se rehace en `adjuntarDocumento`—
  // pero sin esto, quien declara su nombre y nunca sube el documento no se
  // tamiza nunca, y el equipo de cumplimiento pierde el aviso temprano de que
  // alguien de una lista está intentando entrar.
  if (identidad.nombreDeclarado && !identidad.nombreLegal) {
    identidad.tamiz = tamizarPersona(identidad.nombreDeclarado, {
      fechaNacimiento: identidad.fechaNacimientoDeclarada,
    })
    if (identidad.tamiz.fuertes > 0) abrirCasoPorTamiz(identidad)
    recalcularRiesgo(identidad)
  }

  identidad.actualizadaEn = ahora()
  store.guardar()
  registrar(origen, 'identidad.datos', identidad.id, {
    nombreDeclarado: identidad.nombreDeclarado,
    paisResidencia: identidad.paisResidencia,
  })
  return identidad
}

/**
 * Guarda la foto de la credencial.
 *
 * Es la única imagen que Genesis ID almacena, y lo hace por un motivo
 * concreto: el GID vale en todas las apps del ecosistema, y una credencial que
 * solo se ve completa en el teléfono que subió la foto no sirve para eso.
 *
 * Se acota el tamaño en serio. Una credencial necesita un cuadrado de 320 px;
 * aceptar más sería convertir el expediente en un álbum, y cada byte guardado
 * de una persona hay que justificarlo.
 */
export function guardarFotoCredencial(idn: string, base64: string, origen: string):
  { ok: boolean; error?: string; identidad?: Identidad } {
  const identidad = porId(idn)
  if (!identidad) return { ok: false, error: 'Identidad no encontrada' }

  const limpio = String(base64 || '').replace(/^data:image\/[a-z+]+;base64,/i, '').replace(/\s+/g, '')
  if (!limpio) {
    identidad.fotoCredencial = null
  } else {
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(limpio)) return { ok: false, error: 'La foto no es base64 válido' }
    const bytes = Math.floor((limpio.length * 3) / 4)
    if (bytes > 400 * 1024) {
      return { ok: false, error: `La foto pesa ${Math.round(bytes / 1024)} kB y el máximo son 400 kB` }
    }
    identidad.fotoCredencial = limpio
  }

  identidad.actualizadaEn = ahora()
  store.guardar()
  registrar(origen, 'identidad.fotoCredencial', identidad.id, { quitada: !limpio })
  return { ok: true, identidad }
}

// ─────────────────────────────────────────────────────────────────────────────
// Documento
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Recibe la MRZ del documento, la comprueba, tamiza contra sanciones con el
 * nombre REAL del documento (no con el declarado) y recalcula el riesgo.
 */
export function adjuntarDocumento(
  idn: string, mrz: string, origen: string, textoAnverso?: string | null,
): Identidad | null {
  const identidad = porId(idn)
  if (!identidad) return null

  const revision = revisarDocumento(mrz, {
    nombreCompleto: identidad.nombreDeclarado,
    fechaNacimiento: identidad.fechaNacimientoDeclarada,
  }, textoAnverso)
  identidad.documento = revision

  // Los datos válidos del documento pasan a ser los oficiales de la identidad.
  if (revision.datos) {
    // EL NOMBRE COMPLETO, NO EL RECORTADO POR EL ANCHO DE LA MRZ.
    //
    // La zona de lectura mecánica corta: en una cédula hondureña «JOSE» sale
    // «JOS», y ese recorte acababa impreso en la credencial —«MEDARDO JOS
    // ORDONEZ ENAMORADO»— como si la persona se llamara así. Cuando el anverso
    // confirmó el nombre declarado y el del documento es su versión cortada, el
    // que vale es el entero: es el mismo nombre, sin la mutilación del formato.
    const declarado = identidad.nombreDeclarado
    const recortado = revision.datos.nombreCompleto
    const esRecorteDe = Boolean(
      declarado && revision.anverso.nombreConfirmado &&
      parecidoNombres(declarado, recortado) >= 0.95)
    identidad.nombreLegal = esRecorteDe ? declarado! : recortado
    identidad.fechaNacimiento = revision.datos.fechaNacimiento
    identidad.nacionalidad = revision.datos.nacionalidad
    identidad.numeroDocumento = revision.datos.numeroDocumento
    identidad.tipoDocumento = `${revision.datos.formato}/${revision.datos.tipoDocumento}`
    identidad.vencimientoDocumento = revision.datos.fechaVencimiento
  }

  // El tamizado se hace con el nombre del documento: es el que vale. Tamizar
  // con el declarado dejaría que cualquiera esquive las listas escribiendo mal
  // su propio nombre a propósito.
  if (identidad.nombreLegal) {
    identidad.tamiz = tamizarPersona(identidad.nombreLegal, {
      fechaNacimiento: identidad.fechaNacimiento,
      nacionalidades: identidad.nacionalidad ? [identidad.nacionalidad] : [],
    })
    if (identidad.tamiz.fuertes > 0 || identidad.tamiz.posibles > 0) {
      abrirCasoPorTamiz(identidad)
    }
  }

  if (identidad.estado !== 'verificada') identidad.estado = 'documento'
  recalcularRiesgo(identidad)
  identidad.actualizadaEn = ahora()
  store.guardar()

  registrar(origen, 'identidad.documento', identidad.id, {
    aceptable: revision.aceptable,
    hallazgos: revision.hallazgos.filter((h) => h.gravedad !== 'ok').map((h) => h.clave),
    coincidenciasTamiz: identidad.tamiz?.coincidencias.length ?? 0,
  })
  return identidad
}

// ─────────────────────────────────────────────────────────────────────────────
// Biometría
// ─────────────────────────────────────────────────────────────────────────────

export interface EntradaRostro {
  selfie: string
  fotoDocumento: string
  /** Reto de vivacidad ya resuelto, si lo hubo. */
  vivacidad?: ResultadoVivacidad | null
}

/**
 * Cotejo del rostro.
 *
 * Ni el selfie ni la foto del documento se guardan: se cotejan y se descartan.
 * Lo que queda en el expediente es el veredicto, la puntuación y —si hubo
 * reto— qué gesto se pidió y si se cumplió. Con eso un operador puede revisar
 * la decisión sin que Genesis ID se convierta en un depósito de fotos de
 * documentos, que es el peor dato que se puede acumular.
 */
export async function adjuntarBiometria(
  idn: string, entrada: EntradaRostro, origen: string,
): Promise<Identidad | null> {
  const identidad = porId(idn)
  if (!identidad) return null

  const v = entrada.vivacidad
  identidad.biometria = biometriaConfigurada()
    ? await cotejar({
        selfie: entrada.selfie,
        fotoDocumento: entrada.fotoDocumento,
        vivacidad: v ? v.puntuacion : null,
        pasosVivacidad: v?.pasos,
        avisosVivacidad: v?.avisos,
        notaVivacidad: v?.motivo,
      })
    : sinProveedor()

  if (identidad.estado === 'documento') identidad.estado = 'biometria'
  recalcularRiesgo(identidad)
  identidad.actualizadaEn = ahora()
  store.guardar()
  registrar(origen, 'identidad.biometria', identidad.id, {
    estado: identidad.biometria.estado,
    proveedor: identidad.biometria.proveedor,
    parecido: identidad.biometria.parecido,
    vivacidad: identidad.biometria.vivacidad,
  })
  return identidad
}

/** Cotejo hecho por una persona, mientras no haya proveedor automático. */
export function resolverBiometriaManual(
  idn: string, operador: Operador, coincide: boolean, nota?: string,
): Identidad | null {
  const identidad = porId(idn)
  if (!identidad) return null
  identidad.biometria = cotejoManual(operador.email, coincide, nota)
  recalcularRiesgo(identidad)
  identidad.actualizadaEn = ahora()
  store.guardar()
  registrar(operador.email, 'identidad.biometriaManual', identidad.id, { coincide, nota })
  return identidad
}

// ─────────────────────────────────────────────────────────────────────────────
// Riesgo
// ─────────────────────────────────────────────────────────────────────────────

export function recalcularRiesgo(identidad: Identidad): Identidad {
  identidad.riesgo = evaluarRiesgo({
    documento: identidad.documento,
    tamiz: identidad.tamiz,
    biometria: identidad.biometria,
    pais: identidad.nacionalidad || identidad.paisResidencia,
    pep: identidad.pep,
    faltanDatos: [
      !identidad.telefono && 'telefono',
      !identidad.direccion && 'direccion',
      !identidad.ocupacion && 'ocupacion',
      !identidad.origenFondos && 'origenFondos',
      !identidad.propositoCuenta && 'propositoCuenta',
      identidad.pepDeclarado === null && 'pepDeclarado',
    ].filter(Boolean) as string[],
  })
  return identidad
}

/** Vuelve a tamizar. Se llama cuando se cargan listas nuevas. */
export function retamizar(identidad: Identidad): Identidad {
  if (!identidad.nombreLegal) return identidad
  identidad.tamiz = tamizarPersona(identidad.nombreLegal, {
    fechaNacimiento: identidad.fechaNacimiento,
    nacionalidades: identidad.nacionalidad ? [identidad.nacionalidad] : [],
  })
  recalcularRiesgo(identidad)
  identidad.actualizadaEn = ahora()
  if (identidad.tamiz.fuertes > 0) abrirCasoPorTamiz(identidad)
  return identidad
}

/** Vuelve a tamizar TODAS las identidades verificadas. */
export function retamizarTodas(actor: string): { revisadas: number; conCoincidencias: number } {
  const identidades = store.todo().identidades.filter((i) => i.nombreLegal)
  let conCoincidencias = 0
  for (const i of identidades) {
    retamizar(i)
    if ((i.tamiz?.fuertes ?? 0) > 0) conCoincidencias++
  }
  store.guardar()
  registrar(actor, 'tamiz.masivo', 'identidades', { revisadas: identidades.length, conCoincidencias })
  return { revisadas: identidades.length, conCoincidencias }
}

// ─────────────────────────────────────────────────────────────────────────────
// Decisiones
// ─────────────────────────────────────────────────────────────────────────────

function anotar(identidad: Identidad, estado: EstadoIdentidad, operador: string, motivo: string) {
  identidad.decisiones.push({ estado, operador, motivo, fecha: ahora() })
  identidad.estado = estado
  identidad.actualizadaEn = ahora()
}

export function enviarARevision(idn: string, actor: string, motivo = 'Pendiente de revisión'): Identidad | null {
  const identidad = porId(idn)
  if (!identidad) return null
  anotar(identidad, 'en-revision', actor, motivo)
  store.guardar()
  registrar(actor, 'identidad.enRevision', identidad.id, { motivo })
  return identidad
}

export interface ResultadoAprobacion {
  ok: boolean
  identidad?: Identidad
  motivo?: string
  bloqueos?: string[]
}

/**
 * La ÚNICA vía para que una identidad quede verificada y reciba su GID.
 *
 * @param anulacion  justificación escrita para aprobar pese a los bloqueos.
 *                   Sin ella, con bloqueos presentes, la aprobación se rechaza.
 */
export async function aprobar(
  idn: string, operador: Operador, motivo: string, anulacion?: string,
): Promise<ResultadoAprobacion> {
  const identidad = porId(idn)
  if (!identidad) return { ok: false, motivo: 'Identidad no encontrada' }
  if (identidad.estado === 'verificada') {
    return { ok: false, motivo: 'La identidad ya está verificada', identidad }
  }
  if (!motivo || motivo.trim().length < 5) {
    return { ok: false, motivo: 'Hay que escribir el motivo de la aprobación' }
  }

  recalcularRiesgo(identidad)
  const bloqueos = identidad.riesgo?.bloqueos ?? []

  if (bloqueos.length && !anulacion) {
    return {
      ok: false,
      motivo: 'No se puede aprobar: hay comprobaciones sin resolver. Para aprobar igualmente hace falta una justificación escrita.',
      bloqueos,
      identidad,
    }
  }
  if (bloqueos.length && anulacion && anulacion.trim().length < 20) {
    return {
      ok: false,
      motivo: 'La justificación para anular los bloqueos tiene que explicar el porqué (mínimo 20 caracteres)',
      bloqueos,
      identidad,
    }
  }
  // El nivel inaceptable no se anula con un texto: es país prohibido o
  // sanción integral, y aprobarlo sería un incumplimiento directo.
  if (identidad.riesgo?.nivel === 'inaceptable') {
    return {
      ok: false,
      motivo: 'Riesgo inaceptable (jurisdicción prohibida o sanción integral). No se puede aprobar por esta vía.',
      bloqueos,
      identidad,
    }
  }

  identidad.gid = identidad.gid ?? gidPersonal()
  identidad.verificadaEn = ahora()
  anotar(identidad, 'verificada', operador.email,
    anulacion ? `${motivo} — ANULACION DE BLOQUEOS: ${anulacion}` : motivo)

  await store.guardarYa()
  registrar(operador.email, 'identidad.aprobada', identidad.id, {
    gid: identidad.gid,
    motivo,
    riesgo: identidad.riesgo?.nivel,
    puntuacion: identidad.riesgo?.puntuacion,
    anulacion: anulacion ?? null,
    bloqueosAnulados: anulacion ? bloqueos : [],
  })
  return { ok: true, identidad }
}

export async function rechazar(idn: string, operador: Operador, motivo: string): Promise<ResultadoAprobacion> {
  const identidad = porId(idn)
  if (!identidad) return { ok: false, motivo: 'Identidad no encontrada' }
  if (!motivo || motivo.trim().length < 5) {
    return { ok: false, motivo: 'Hay que escribir el motivo del rechazo' }
  }
  anotar(identidad, 'rechazada', operador.email, motivo)
  await store.guardarYa()
  registrar(operador.email, 'identidad.rechazada', identidad.id, { motivo })
  return { ok: true, identidad }
}

/** Retira una identidad ya verificada. El GID se conserva para la trazabilidad. */
export async function suspender(idn: string, operador: Operador, motivo: string): Promise<ResultadoAprobacion> {
  const identidad = porId(idn)
  if (!identidad) return { ok: false, motivo: 'Identidad no encontrada' }
  anotar(identidad, 'suspendida', operador.email, motivo)
  await store.guardarYa()
  registrar(operador.email, 'identidad.suspendida', identidad.id, { gid: identidad.gid, motivo })
  return { ok: true, identidad }
}

/**
 * Devuelve una identidad al principio para que la persona la rehaga.
 *
 * NO es un borrado, y no puede serlo: un expediente de cumplimiento no se
 * elimina, porque el registro de que alguien intentó verificarse —y qué se
 * encontró— es justamente lo que hay que conservar. Lo que se hace es limpiar
 * lo que la persona tiene que volver a aportar (documento, rostro, riesgo) y
 * dejar los datos declarados, para que no reescriba su nombre.
 *
 * Queda en la bitácora quién lo reinició y por qué. Una identidad ya verificada
 * no entra por aquí: para eso hay que suspenderla primero, que es una decisión
 * distinta y más seria.
 */
export function reiniciar(idn: string, operador: Operador, motivo: string): Identidad | null {
  const identidad = porId(idn)
  if (!identidad) return null
  if (identidad.estado === 'verificada') return null

  identidad.documento = null
  identidad.biometria = null
  identidad.nombreLegal = null
  identidad.estado = identidad.nombreDeclarado ? 'datos' : 'iniciada'
  recalcularRiesgo(identidad)
  identidad.actualizadaEn = ahora()
  store.guardar()
  registrar(operador.email, 'identidad.reiniciar', identidad.id, { motivo })
  return identidad
}

export function marcarPep(idn: string, operador: Operador, pep: boolean, nota: string): Identidad | null {
  const identidad = porId(idn)
  if (!identidad) return null
  identidad.pep = pep
  recalcularRiesgo(identidad)
  identidad.actualizadaEn = ahora()
  store.guardar()
  registrar(operador.email, 'identidad.pep', identidad.id, { pep, nota })
  return identidad
}

// ─────────────────────────────────────────────────────────────────────────────
// Vínculos con las apps
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Ata una cuenta de una app del ecosistema a la identidad.
 *
 * Es lo que hace que el mismo GID sirva en Veta Wallet, MyTokenPay y ordenscan:
 * cada app guarda su propia cuenta, pero todas apuntan a la misma persona
 * verificada una sola vez.
 */
export function vincular(
  idn: string, app: string, cuenta: string, direccion: string | null, origen: string,
): Identidad | null {
  const identidad = porId(idn)
  if (!identidad) return null

  const existente = identidad.vinculos.find((v) => v.app === app && v.cuenta === cuenta)
  if (existente) {
    existente.ultimoAcceso = ahora()
    if (direccion) existente.direccion = direccion
  } else {
    const vinculo: VinculoApp = {
      app, cuenta, direccion, vinculadaEn: ahora(), ultimoAcceso: ahora(),
    }
    identidad.vinculos.push(vinculo)
    registrar(origen, 'identidad.vinculada', identidad.id, { app, cuenta, direccion })
  }
  identidad.actualizadaEn = ahora()
  store.guardar()
  return identidad
}

export const porDireccion = (direccion: string): Identidad | undefined => {
  const d = String(direccion || '').toLowerCase()
  return store.todo().identidades.find((i) =>
    i.vinculos.some((v) => (v.direccion || '').toLowerCase() === d))
}

// ─────────────────────────────────────────────────────────────────────────────
// Vistas
// ─────────────────────────────────────────────────────────────────────────────

/** Lo que se le puede contar a una app: nunca el documento ni la biometría. */
export function perfilPublico(identidad: Identidad) {
  return {
    gid: identidad.gid,
    verificada: identidad.estado === 'verificada',
    estado: identidad.estado,
    nombre: identidad.estado === 'verificada' ? identidad.nombreLegal : null,
    nacionalidad: identidad.estado === 'verificada' ? identidad.nacionalidad : null,
    nivelRiesgo: identidad.riesgo?.nivel ?? null,
    verificadaEn: identidad.verificadaEn,
    apps: identidad.vinculos.map((v) => ({ app: v.app, direccion: v.direccion ?? null })),
  }
}

/** Lo que ve el usuario dueño de la identidad sobre su propio trámite. */
export function estadoParaUsuario(identidad: Identidad) {
  const pendientes = (identidad.riesgo?.bloqueos ?? []).length

  // Un cotejo FALLIDO no es lo mismo que uno pendiente de revisión. Casi
  // siempre es mala luz o un gesto a medias, y la persona puede repetirlo en
  // veinte segundos. Sin esta señal, la app la mandaba a esperar días por una
  // foto mal tomada — y al volver a entrar tampoco le dejaba reintentar.
  const rostroPendiente = identidad.biometria?.estado === 'fallida'

  return {
    id: identidad.id,
    email: identidad.email,
    estado: identidad.estado,
    gid: identidad.gid,
    nombreLegal: identidad.nombreLegal,
    documentoAceptable: identidad.documento?.aceptable ?? null,
    rostroPendiente,
    // La credencial viaja con la identidad: sin esto se ve a medias en
    // cualquier teléfono que no sea el que subió la foto.
    fotoCredencial: identidad.fotoCredencial
      ? `data:image/jpeg;base64,${identidad.fotoCredencial}` : null,
    // Qué falta del perfil de cumplimiento, para que la app lo pida.
    faltanDatos: [
      !identidad.telefono && 'telefono',
      !identidad.direccion && 'direccion',
      !identidad.ocupacion && 'ocupacion',
      !identidad.origenFondos && 'origenFondos',
      !identidad.propositoCuenta && 'propositoCuenta',
      identidad.pepDeclarado === null && 'pepDeclarado',
    ].filter(Boolean) as string[],
    // Al usuario se le dice qué le falta, no el detalle del análisis interno.
    faltan: identidad.estado === 'verificada' ? 0 : pendientes,
    siguientePaso:
      identidad.estado === 'iniciada' ? 'Completar nombre y fecha de nacimiento'
        : identidad.estado === 'datos' ? 'Escanear el documento de identidad'
        : identidad.estado === 'documento' ? 'Tomarse la foto de rostro'
        : rostroPendiente ? 'Repetir la comprobación del rostro'
        : identidad.estado === 'biometria' || identidad.estado === 'en-revision' ? 'En revisión'
        : identidad.estado === 'verificada' ? 'Listo'
        : identidad.estado === 'rechazada' ? 'Verificación rechazada'
        : 'Identidad suspendida',
    actualizadaEn: identidad.actualizadaEn,
  }
}
