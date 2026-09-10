// Tipos del cliente de telemetría de Genesis ID.
//
// El cliente es JavaScript a propósito —el mismo archivo sirve en React Native,
// en el navegador y aquí— así que sus tipos viven aparte, en este archivo.

export interface OpcionesTelemetria {
  url: string
  /** Clave secreta. Solo en backends. */
  clave?: string
  /** Clave pública de ingesta. La que va dentro de las apps. */
  clavePublica?: string
  app: string
  version?: string
  plataforma?: string
  pais?: string
  cada?: number
  maxCola?: number
  maxLote?: number
  activa?: boolean
  muestreo?: number
}

export interface ExtraEvento {
  nombre?: string
  gravedad?: 'info' | 'aviso' | 'error' | 'critico'
  ruta?: string
  meta?: Record<string, unknown>
}

declare const telemetria: {
  iniciar(opciones: OpcionesTelemetria): unknown
  identificar(id: string | null): void
  olvidar(): void
  sesionAbierta(nombre?: string, extra?: ExtraEvento): void
  registro(nombre?: string, extra?: ExtraEvento): void
  pantalla(nombre: string, extra?: ExtraEvento): void
  accion(nombre: string, extra?: ExtraEvento): void
  transaccion(nombre: string, valor: number, moneda?: string, extra?: ExtraEvento): void
  rendimiento(nombre: string, duracionMs: number, extra?: ExtraEvento): void
  error(e: unknown, extra?: ExtraEvento): void
  medir<T>(nombre: string, fn: () => Promise<T> | T, extra?: ExtraEvento): Promise<T>
  cerrar(): Promise<void>
  express(): (req: any, res: any, siguiente: any) => void
  expressErrores(): (err: any, req: any, res: any, siguiente: any) => void
  readonly pendientes: number
  readonly activa: boolean
}

export default telemetria
