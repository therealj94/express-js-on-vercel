// Modelo de datos de Genesis ID.

import type { RevisionDocumento } from './kyc/documento.js'
import type { ResultadoBiometria } from './kyc/biometria.js'
import type { ResultadoTamiz } from './aml/tamiz.js'
import type { EvaluacionRiesgo } from './aml/riesgo.js'
import type { Alerta, Movimiento } from './aml/monitoreo.js'

// ─────────────────────────────────────────────────────────────────────────────
// Identidad personal (KYC)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Estados por los que pasa una identidad.
 *
 * `verificada` solo se alcanza por decisión de un operador. No hay ninguna ruta
 * que lo ponga automáticamente, y eso es a propósito: la versión anterior de
 * este motor emitía identidades verificadas con una simple llamada HTTP sin
 * autenticar, que es exactamente lo que este estado impide ahora.
 */
export type EstadoIdentidad =
  | 'iniciada'        // existe el correo, no hay nada más
  | 'datos'           // declaró nombre y fecha de nacimiento
  | 'documento'       // subió el documento y pasó (o no) las comprobaciones
  | 'biometria'       // subió el selfie
  | 'en-revision'     // esperando decisión humana
  | 'verificada'      // aprobada por un operador
  | 'rechazada'
  | 'suspendida'      // estaba verificada y se le retiró

export interface Decision {
  estado: EstadoIdentidad
  operador: string
  motivo: string
  fecha: string
}

export interface Identidad {
  id: string
  tipo: 'personal'
  email: string
  /** Lo que la persona declara de sí misma, antes de contrastarlo. */
  nombreDeclarado: string | null
  fechaNacimientoDeclarada: string | null
  paisResidencia: string | null
  telefono: string | null
  direccion: string | null

  /**
   * Perfil de cumplimiento.
   *
   * Estos cuatro no son burocracia: son el ÚNICO patrón contra el que se puede
   * comparar un movimiento. Sin saber de qué vive alguien y cuánto espera
   * mover, una alerta de monitoreo no dice nada — cualquier cifra parece
   * normal o parece sospechosa según quien la mire. Con ellos, «recibió
   * 40 000 dólares» se convierte en una pregunta contestable.
   */
  ocupacion: string | null
  origenFondos: string | null
  propositoCuenta: string | null
  volumenEsperadoUsd: number | null
  /** Lo que la persona declara sobre cargos públicos, suyos o de allegados. */
  pepDeclarado: boolean | null

  /**
   * Foto de la credencial, en base64.
   *
   * La elige la persona y viaja con el GID a todas las apps del ecosistema:
   * sin ella la credencial se ve a medias en cualquier teléfono que no sea el
   * que la subió. Es la ÚNICA imagen que Genesis ID almacena — las del
   * documento y las del reto de vivacidad se comparan y se descartan.
   */
  fotoCredencial: string | null

  /** Lo que dice el documento, que es lo que vale. */
  nombreLegal: string | null
  fechaNacimiento: string | null
  nacionalidad: string | null
  numeroDocumento: string | null
  tipoDocumento: string | null
  vencimientoDocumento: string | null

  estado: EstadoIdentidad
  /** El UID solo existe cuando la identidad está verificada. */
  gid: string | null

  documento: RevisionDocumento | null
  biometria: ResultadoBiometria | null
  tamiz: ResultadoTamiz | null
  riesgo: EvaluacionRiesgo | null
  /** Marcada a mano por cumplimiento. */
  pep: boolean

  /** Cuentas de las apps del ecosistema atadas a esta identidad. */
  vinculos: VinculoApp[]

  decisiones: Decision[]
  creadaEn: string
  actualizadaEn: string
  verificadaEn: string | null
}

/** Una cuenta concreta de una app, atada al GID. */
export interface VinculoApp {
  app: string
  /** Identificador de la cuenta dentro de esa app. */
  cuenta: string
  /** Dirección on-chain, cuando la app la tiene. */
  direccion?: string | null
  vinculadaEn: string
  ultimoAcceso: string | null
}

// ─────────────────────────────────────────────────────────────────────────────
// Negocio (KYB)
// ─────────────────────────────────────────────────────────────────────────────

export type EstadoNegocio = 'iniciado' | 'documentos' | 'en-revision' | 'verificado' | 'rechazado' | 'suspendido'

/**
 * Beneficiario final: quien de verdad controla la empresa.
 *
 * El umbral del 25 % es el que fija la normativa internacional. Si nadie llega
 * al 25 %, hay que identificar igualmente a quien ejerza el control por otros
 * medios, y en último término a la administración — por eso `via`.
 */
export interface Beneficiario {
  id: string
  nombreCompleto: string
  porcentaje: number
  via: 'participacion' | 'control' | 'administracion'
  fechaNacimiento: string | null
  nacionalidad: string | null
  /** GID de su identidad personal: todo UBO debe pasar su propio KYC. */
  gid: string | null
  tamiz: ResultadoTamiz | null
  pep: boolean
}

export interface DocumentoNegocio {
  clave: string
  nombre: string
  /** Referencia al archivo; el binario no vive en este registro. */
  referencia: string | null
  recibidoEn: string | null
}

export interface Negocio {
  id: string
  /** Correo del dueño, que debe tener su propia identidad personal. */
  emailDueno: string
  gidDueno: string | null
  razonSocial: string
  nombreComercial: string
  identificadorFiscal: string
  categoria: string
  actividadRiesgo: 'alta' | 'media' | 'baja'
  pais: string
  ciudad: string
  direccion: string
  sitioWeb: string | null

  estado: EstadoNegocio
  gid: string | null

  beneficiarios: Beneficiario[]
  documentos: DocumentoNegocio[]
  tamiz: ResultadoTamiz | null
  riesgo: EvaluacionRiesgo | null

  decisiones: Decision[]
  creadoEn: string
  actualizadoEn: string
  verificadoEn: string | null
}

// ─────────────────────────────────────────────────────────────────────────────
// Operadores del panel
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Los roles siguen el principio de separación de funciones: quien revisa no es
 * necesariamente quien aprueba, y el auditor no puede cambiar nada.
 */
export type Rol = 'admin' | 'cumplimiento' | 'revisor' | 'auditor'

export interface Operador {
  id: string
  email: string
  nombre: string
  rol: Rol
  hashContrasena: string
  activo: boolean
  creadoEn: string
  ultimoAcceso: string | null
  /** Para forzar el cambio de la contraseña inicial. */
  debeCambiarContrasena: boolean
}

export interface Sesion {
  token: string
  operadorId: string
  creadaEn: string
  expiraEn: string
  ip: string | null
}

// ─────────────────────────────────────────────────────────────────────────────
// Aplicaciones del ecosistema
// ─────────────────────────────────────────────────────────────────────────────

export interface Aplicacion {
  id: string
  /** Identificador corto: veta-wallet, ordenscan, mytokenpay… */
  clave: string
  nombre: string
  /** Solo se guarda el hash de la clave de API. */
  hashClave: string
  /** Últimos caracteres, para poder reconocerla en el panel. */
  pistaClave: string
  /**
   * Clave pública de ingesta de telemetría, en claro.
   *
   * Va dentro de la app —un APK se descomprime— así que no es un secreto y no
   * se guarda como tal. Solo abre `POST /api/v1/telemetria/eventos`: escribe
   * métricas y no lee absolutamente nada.
   */
  clavePublica?: string
  alcances: string[]
  activa: boolean
  creadaEn: string
  ultimoUso: string | null
}

// ─────────────────────────────────────────────────────────────────────────────
// Casos de cumplimiento
// ─────────────────────────────────────────────────────────────────────────────

export type EstadoCaso = 'abierto' | 'en-analisis' | 'reportado' | 'cerrado-sin-accion' | 'cerrado-con-reporte'

export interface Caso {
  id: string
  gid: string | null
  identidadId: string | null
  negocioId: string | null
  origen: 'tamiz' | 'monitoreo' | 'manual'
  titulo: string
  estado: EstadoCaso
  gravedad: 'informativa' | 'media' | 'alta' | 'critica'
  alertas: Alerta[]
  notas: { operador: string; texto: string; fecha: string }[]
  asignadoA: string | null
  abiertoEn: string
  cerradoEn: string | null
  /** Referencia del reporte al supervisor, cuando se presenta. */
  referenciaReporte: string | null
}

// ─────────────────────────────────────────────────────────────────────────────
// Bitácora
// ─────────────────────────────────────────────────────────────────────────────

export interface EntradaBitacora {
  id: string
  fecha: string
  actor: string
  accion: string
  objeto: string
  detalle: Record<string, unknown>
  /** Hash encadenado con la entrada anterior. */
  hash: string
  hashAnterior: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Raíz
// ─────────────────────────────────────────────────────────────────────────────

export interface DatosGenesis {
  identidades: Identidad[]
  negocios: Negocio[]
  operadores: Operador[]
  sesiones: Sesion[]
  aplicaciones: Aplicacion[]
  casos: Caso[]
  movimientos: Movimiento[]
  bitacora: EntradaBitacora[]
  version: number
}

export type { Movimiento, Alerta }
