// Modelo de datos de OrdenExchange.
//
// OrdenExchange es la casa de cambio P2P del ecosistema Orden Global: la gente
// compra y vende ORIGEN (y AUKA, AGKA) entre sí, en la moneda y con los bancos
// de su país, y la plataforma custodia el activo mientras el pago en moneda
// local viaja por fuera. Funciona como Binance P2P: anuncios, órdenes con
// temporizador, escrow, chat, apelaciones y comerciantes verificados (aquí,
// «agentes de cambio»).
//
// SOBRE LOS MONTOS
//
// Todos los montos son cadenas decimales («12.50», «0.00000001»), nunca
// números de coma flotante. Un saldo que se redondea solo en el tercer
// decimal de una suma de mil operaciones es una pérdida que nadie puede
// explicar. La aritmética vive en lib/decimal.ts y se hace con BigInt.

// ─────────────────────────────────────────────────────────────────────────────
// Activos y precios
// ─────────────────────────────────────────────────────────────────────────────

/** Lo que se compra y se vende. ORIGEN es la moneda nativa de la cadena 5550. */
export type Activo = 'ORIGEN' | 'AUKA' | 'AGKA'

export interface DefinicionActivo {
  simbolo: Activo
  nombre: string
  /** Decimales que se muestran y con los que se opera en la plataforma. */
  decimales: number
  /** Contrato en la cadena 5550; `null` para la moneda nativa. */
  contrato: string | null
  /** Decimales del contrato o de la moneda nativa (18 en toda la cadena). */
  decimalesCadena: number
  /** Cómo se ancla el precio de referencia: al oro o a la plata. */
  ancla: 'oro' | 'plata'
  /** Cuántas onzas troy del metal respalda UNA unidad. ORIGEN = 1/55 g. */
  onzasPorUnidad: number
}

/**
 * Precios de referencia.
 *
 * El precio del oro y de la plata los fija un operador (o la variable de
 * entorno), y las tasas USD→moneda local también. De ahí sale el precio de
 * referencia de cada activo en cada moneda, que es lo que usan los anuncios
 * de precio flotante y lo que el mercado enseña como «precio de mercado».
 */
export interface Precios {
  oroUsdOnza: number
  plataUsdOnza: number
  /** USD → moneda local. Ej: { HNL: 26.1, MXN: 18.4 }. USD siempre es 1. */
  fx: Record<string, number>
  actualizadoEn: string
  fuente: 'manual' | 'env' | 'auto' | 'semilla'
  actualizadoPor: string | null
}

// ─────────────────────────────────────────────────────────────────────────────
// Usuarios
// ─────────────────────────────────────────────────────────────────────────────

export type EstadoGid = 'sin-verificar' | 'en-revision' | 'verificada' | 'rechazada' | 'suspendida'
export type EstadoAgente = 'no' | 'solicitado' | 'aprobado' | 'suspendido'

/**
 * Lo que la plataforma sabe del desempeño de alguien. Es lo que ve la
 * contraparte antes de abrir una orden, igual que en Binance.
 */
export interface Reputacion {
  ordenesTotales: number
  ordenesCompletadas: number
  /** Órdenes abiertas en los últimos 30 días (completadas + canceladas por el usuario). */
  ordenes30d: number
  completadas30d: number
  /** 0–100. Completadas entre las que abrió (las canceladas por el sistema no cuentan en contra). */
  tasaFinalizacion30d: number
  positivas: number
  negativas: number
  tiempoPromedioLiberacionSeg: number | null
  tiempoPromedioPagoSeg: number | null
  apelacionesPerdidas: number
}

export interface Usuario {
  id: string
  email: string
  /** Sin confirmar el correo no se toca Genesis ID: es la puerta de la identidad. */
  emailVerificado: boolean
  /** Código pendiente de confirmación del correo: solo el hash, con caducidad e intentos. */
  codigoCorreo: { hash: string; expira: string; intentos: number } | null
  hashContrasena: string
  /** Cualquier sesión emitida antes de este instante no vale (cerrar sesión, cambio de contraseña, bloqueo). */
  sesionesDesde: string
  /** Nombre público, como el «nickname» de Binance. Único. */
  apodo: string
  /** Del documento, vía Genesis ID. Solo cuando la identidad está verificada. */
  nombreLegal: string | null
  /** ISO 3166-1 alfa-2 del país donde opera. */
  pais: string
  /** Moneda por defecto (la de su país). */
  moneda: string
  idioma: 'es' | 'en'
  telefono: string | null
  /** Dirección 0x en la cadena 5550, para depósitos y retiros. */
  direccionCadena: string | null
  /** Direcciones que tuvo antes: una dirección con depósitos acreditados no cambia de dueño. */
  direccionesAnteriores: string[]
  gid: string | null
  gidEstado: EstadoGid
  gidComprobadoEn: string | null
  agente: EstadoAgente
  /** Cuándo y por qué se suspendió como agente; solo un operador lo levanta. */
  agenteSuspendido: { en: string; motivo: string } | null
  /** Bloqueado por un operador: no puede operar ni retirar. */
  congelado: boolean
  motivoCongelado: string | null
  reputacion: Reputacion
  creadoEn: string
  ultimoAcceso: string | null
}

// ─────────────────────────────────────────────────────────────────────────────
// Billetera y custodia
// ─────────────────────────────────────────────────────────────────────────────

export interface Saldo {
  usuarioId: string
  activo: Activo
  disponible: string
  /** En custodia: órdenes abiertas, retiros pendientes y garantía de agente. */
  congelado: string
}

export type TipoMovimiento =
  | 'deposito'
  | 'retiro-solicitado'
  | 'retiro-enviado'
  | 'retiro-rechazado'
  | 'orden-congelar'        // el vendedor deja el activo en custodia
  | 'orden-descongelar'     // se cancela: vuelve al vendedor
  | 'orden-liberar'         // sale de la custodia del vendedor
  | 'orden-recibir'         // entra al comprador
  | 'comision'
  | 'garantia-agente'
  | 'garantia-devuelta'
  | 'ajuste'
  | 'faucet'

export interface Movimiento {
  id: string
  usuarioId: string
  activo: Activo
  tipo: TipoMovimiento
  /** Cambios con signo sobre cada bolsillo. */
  disponibleDelta: string
  congeladoDelta: string
  /** Orden, retiro, depósito o hash de transacción al que corresponde. */
  referencia: string | null
  detalle: string
  en: string
}

export interface Deposito {
  id: string
  usuarioId: string
  activo: Activo
  cantidad: string
  txHash: string
  desde: string
  bloque: number
  confirmaciones: number
  estado: 'acreditado' | 'rechazado'
  motivo: string | null
  en: string
}

export type EstadoRetiro = 'pendiente' | 'enviado' | 'rechazado' | 'cancelado'

export interface Retiro {
  id: string
  usuarioId: string
  activo: Activo
  cantidad: string
  direccion: string
  estado: EstadoRetiro
  txHash: string | null
  motivo: string | null
  solicitadoEn: string
  resueltoEn: string | null
  resueltoPor: string | null
}

// ─────────────────────────────────────────────────────────────────────────────
// Métodos de pago
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Una cuenta donde el usuario recibe (o desde donde paga) moneda local.
 *
 * `tipo` es la clave del método en data/latam.ts («transferencia», «pix»,
 * «nequi», «sinpe»…) y `campos` lleva lo que ese método pide: número de
 * cuenta, CLABE, CBU, llave PIX, teléfono. Los datos del método solo se
 * enseñan a la contraparte dentro de una orden abierta.
 */
export interface MetodoPago {
  id: string
  usuarioId: string
  pais: string
  moneda: string
  tipo: string
  nombreMetodo: string
  categoria: 'banco' | 'billetera' | 'efectivo' | 'otro'
  banco: string | null
  titular: string
  campos: Record<string, string>
  activo: boolean
  creadoEn: string
}

/** Copia del método tal como estaba al abrir la orden; no cambia si el usuario lo edita después. */
export type MetodoPagoEnOrden = Pick<MetodoPago, 'id' | 'tipo' | 'nombreMetodo' | 'categoria' | 'banco' | 'titular' | 'campos'>

// ─────────────────────────────────────────────────────────────────────────────
// Anuncios
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Lado del ANUNCIANTE. Un anuncio de `venta` es alguien que vende ORIGEN; en
 * el mercado aparece en la pestaña «Comprar» de los demás.
 */
export type Lado = 'compra' | 'venta'
export type TipoPrecio = 'fijo' | 'flotante'
export type EstadoAnuncio = 'activo' | 'pausado' | 'agotado' | 'cerrado'
export type VentanaPago = 15 | 30 | 45 | 60

/** Lo que el anunciante exige a quien tome su anuncio. */
export interface RequisitosAnuncio {
  ordenesMin: number
  /** 0–100. */
  tasaFinalizacionMin: number
  diasRegistroMin: number
  soloAgentes: boolean
}

export interface MetodoEnAnuncio {
  /** Id del método del anunciante (solo en anuncios de venta: ahí recibe). */
  id: string | null
  tipo: string
  nombre: string
  categoria: MetodoPago['categoria']
  banco: string | null
}

export interface Anuncio {
  id: string
  /** Legible, para soporte: «A-7K2Q9M». */
  numero: string
  usuarioId: string
  lado: Lado
  activo: Activo
  moneda: string
  pais: string
  tipoPrecio: TipoPrecio
  /** Precio por unidad en moneda local. Solo en precio fijo. */
  precio: string | null
  /** Porcentaje sobre la referencia. 100 = al precio de mercado; 102.5 = 2,5 % arriba. */
  margen: number | null
  cantidadTotal: string
  cantidadDisponible: string
  /** Límites por orden, en moneda local. */
  limiteMin: string
  limiteMax: string
  metodos: MetodoEnAnuncio[]
  ventanaPagoMin: VentanaPago
  terminos: string | null
  /** Mensaje que aparece solo en el chat al abrir la orden. */
  respuestaAutomatica: string | null
  requisitos: RequisitosAnuncio
  estado: EstadoAnuncio
  ordenesAbiertas: number
  ordenesCompletadas: number
  creadoEn: string
  actualizadoEn: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Órdenes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Vida de una orden, como en Binance:
 *
 *   pendiente-pago  el activo del vendedor queda en custodia; el comprador
 *                   tiene la ventana de pago para transferir y marcar «pagado»
 *   pagado          el comprador dice que pagó; el vendedor comprueba y libera
 *   apelacion       una de las partes pidió la intervención de un operador
 *   completada      el activo pasó al comprador
 *   cancelada       por el comprador antes de pagar, por vencimiento o por un
 *                   operador; el activo vuelve al vendedor
 */
export type EstadoOrden = 'pendiente-pago' | 'pagado' | 'apelacion' | 'completada' | 'cancelada'

export type Calificacion = 'positiva' | 'negativa'

export interface Mensaje {
  id: string
  /** Id del usuario, «sistema» para los avisos automáticos u «operador:<id>». */
  de: string
  texto: string
  /**
   * Comprobante adjunto. En el almacén va el identificador de la imagen (vive
   * aparte, ver motor/imagenes.ts); por la API sale como URL firmada
   * (`/api/ordenes/<orden>/imagenes/<id>?f=…`) que el navegador pone en <img src>.
   */
  imagen: string | null
  en: string
}

export interface Apelacion {
  abiertaPor: string
  motivo: string
  detalle: string
  abiertaEn: string
  estado: 'abierta' | 'resuelta' | 'retirada'
  /** `liberar` = el activo va al comprador; `devolver` = vuelve al vendedor. */
  resolucion: 'liberar' | 'devolver' | null
  resueltaPor: string | null
  resueltaEn: string | null
  nota: string | null
}

export interface Orden {
  id: string
  /** Número largo y legible, como el de Binance. */
  numero: string
  anuncioId: string
  anuncioNumero: string
  /** Lado del anuncio que la originó. */
  ladoAnuncio: Lado
  compradorId: string
  vendedorId: string
  anuncianteId: string
  tomadorId: string
  activo: Activo
  moneda: string
  pais: string
  /** Precio por unidad en moneda local, fijado al abrir la orden. */
  precio: string
  cantidadActivo: string
  montoFiat: string
  /** En unidades del activo; se descuenta al vendedor al liberar. */
  comision: string
  /** Del vendedor: donde el comprador tiene que pagar. */
  metodoPago: MetodoPagoEnOrden
  estado: EstadoOrden
  /** Estado previo a la apelación, para saber a dónde volver si se retira. */
  estadoAntesApelacion: EstadoOrden | null
  ventanaPagoMin: VentanaPago
  /** Hasta cuándo puede el comprador marcar «pagado». */
  venceEn: string
  referenciaPago: string | null
  creadaEn: string
  pagadaEn: string | null
  completadaEn: string | null
  canceladaEn: string | null
  canceladaPor: 'comprador' | 'sistema' | 'operador' | null
  motivoCancelacion: string | null
  apelacion: Apelacion | null
  /** Apelaciones anteriores (retiradas o resueltas); cada parte puede abrir una sola. */
  apelacionesPrevias: Apelacion[]
  /** Cuántas imágenes lleva el chat: hay tope por orden. */
  imagenesChat: number
  calificaciones: {
    delComprador: { tipo: Calificacion; comentario: string | null; en: string } | null
    delVendedor: { tipo: Calificacion; comentario: string | null; en: string } | null
  }
  mensajes: Mensaje[]
  /** `true` mientras el activo del vendedor esté congelado por esta orden. */
  enCustodia: boolean
  /** Última vez que cada parte abrió la orden (para «no leídos»). */
  vistaPor: Record<string, string>
}

// ─────────────────────────────────────────────────────────────────────────────
// Agentes de cambio
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Un agente de cambio es un comerciante verificado: deja una garantía en
 * ORIGEN en custodia, lo aprueba un operador y lleva insignia en el mercado.
 */
export interface SolicitudAgente {
  id: string
  usuarioId: string
  garantia: string
  descripcion: string
  estado: 'pendiente' | 'aprobada' | 'rechazada' | 'retirada'
  solicitadaEn: string
  resueltaEn: string | null
  resueltaPor: string | null
  nota: string | null
}

// ─────────────────────────────────────────────────────────────────────────────
// Operadores del panel
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `admin` lo puede todo; `soporte` resuelve apelaciones, cancela órdenes,
 * decide retiros y agentes y bloquea cuentas; `auditor` lo lee todo y no
 * toca nada. Los precios y la configuración son solo de `admin`: mueven el
 * mercado entero.
 */
export type RolOperador = 'admin' | 'soporte' | 'auditor'

export interface Operador {
  id: string
  email: string
  nombre: string
  rol: RolOperador
  hashContrasena: string
  activo: boolean
  creadoEn: string
  ultimoAcceso: string | null
  debeCambiarContrasena: boolean
}

export interface SesionOperador {
  token: string
  operadorId: string
  creadaEn: string
  expiraEn: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Bitácora y configuración
// ─────────────────────────────────────────────────────────────────────────────

/** Cada entrada lleva el hash de la anterior: alterar una vieja se nota. */
export interface EntradaBitacora {
  n: number
  hashAnterior: string
  hash: string
  actor: string
  accion: string
  objeto: string
  detalle: Record<string, unknown>
  en: string
}

export interface Configuracion {
  /** Comisión sobre el activo, cobrada al vendedor al liberar. 0.1 = 0,1 %. */
  comisionPct: number
  /** Garantía en ORIGEN para ser agente de cambio. */
  garantiaAgente: string
  /** Máximo de órdenes abiertas a la vez por usuario. */
  maxOrdenesAbiertas: number
  /** Mínimo por orden, en USD equivalentes. */
  minOrdenUsd: number
  /** Máximo por orden para quien no es agente, en USD equivalentes. */
  maxOrdenUsdSinAgente: number
  /** Confirmaciones exigidas a un depósito en la cadena. */
  confirmacionesDeposito: number
  /** Cuenta tesorería de la plataforma en la cadena 5550 (a dónde se deposita). */
  tesoreria: string | null
}

export interface DatosOrdenExchange {
  usuarios: Usuario[]
  saldos: Saldo[]
  movimientos: Movimiento[]
  depositos: Deposito[]
  retiros: Retiro[]
  metodosPago: MetodoPago[]
  anuncios: Anuncio[]
  ordenes: Orden[]
  solicitudesAgente: SolicitudAgente[]
  operadores: Operador[]
  sesionesOperador: SesionOperador[]
  precios: Precios
  configuracion: Configuracion
  bitacora: EntradaBitacora[]
  version: number
}

// ─────────────────────────────────────────────────────────────────────────────
// Vistas públicas (lo que sale por la API)
// ─────────────────────────────────────────────────────────────────────────────

/** Lo que cualquiera ve de un usuario: nunca el correo ni el nombre legal entero. */
export interface UsuarioPublico {
  id: string
  apodo: string
  /** Iniciales o nombre abreviado del documento («Juan P.»), solo si está verificado. */
  nombreAbreviado: string | null
  pais: string
  agente: boolean
  verificado: boolean
  reputacion: Reputacion
  registradoHaceDias: number
  enLinea: boolean
}

/** Lo que el dueño ve de sí mismo. */
export interface UsuarioPropio extends Omit<UsuarioPublico, 'enLinea'> {
  email: string
  emailVerificado: boolean
  nombreLegal: string | null
  moneda: string
  idioma: 'es' | 'en'
  telefono: string | null
  direccionCadena: string | null
  gid: string | null
  gidEstado: EstadoGid
  estadoAgente: EstadoAgente
  congelado: boolean
  motivoCongelado: string | null
  creadoEn: string
  /** Si puede abrir anuncios y órdenes ahora mismo, y si no, por qué. */
  puedeOperar: boolean
  motivoNoOpera: string | null
}

export interface AnuncioPublico {
  id: string
  numero: string
  lado: Lado
  activo: Activo
  moneda: string
  pais: string
  tipoPrecio: TipoPrecio
  /** Precio efectivo ahora mismo (fijo, o referencia × margen). */
  precio: string
  margen: number | null
  cantidadDisponible: string
  limiteMin: string
  limiteMax: string
  metodos: Omit<MetodoEnAnuncio, 'id'>[]
  ventanaPagoMin: VentanaPago
  terminos: string | null
  requisitos: RequisitosAnuncio
  anunciante: UsuarioPublico
  /** Si el usuario que consulta cumple los requisitos; `null` sin sesión. */
  cumpleRequisitos: boolean | null
  motivoNoCumple: string | null
}
