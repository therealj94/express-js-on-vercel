// Lo que MyTokenPay le dice a Genesis ID.
//
// Tres cosas, y ninguna puede tumbar un cobro:
//
//   1. ATAR la cuenta a una identidad verificada (el GID). Sin esto un pago no
//      se puede atribuir a nadie: el monitoreo del ecosistema es POR IDENTIDAD.
//      Genesis exige el correo de la persona para atar una cuenta —es la prueba
//      de que esta app la autenticó— y aquí se manda el de su sesión, nunca uno
//      que venga en el cuerpo de la petición.
//
//   2. REPORTAR cada pago al monitoreo antilavado. Se reportan los DOS lados
//      cuando ambos tienen identidad: para quien paga es una salida y para el
//      comercio una entrada. Reportar solo un lado dejaría al otro invisible en
//      los umbrales acumulados, que es medio motor apagado.
//
//   3. Telemetría de uso, para que MyTokenPay aparezca en el panel de analítica
//      —hoy solo aparece la billetera, porque es la única que reporta.
//
// TODO VA DESPUES DEL HECHO, SIN AWAIT Y SIN PODER LANZAR
//
// Un cobro que ya se registró no puede deshacerse porque Genesis tosa, y una
// caída de Genesis no puede convertirse en una caída del mostrador. Si el
// reporte falla queda un `console.error` y sigue la vida: llegar tarde al
// monitoreo es un problema; dejar a un comercio sin poder cobrar, uno peor.

const BASE = () => (process.env.GENESIS_URL || 'https://genesis-id.onrender.com').replace(/\/$/, '')
const CLAVE = () => (process.env.GENESIS_API_KEY || '').trim()

export const genesisConfigurado = () => Boolean(CLAVE())

async function pedir(ruta: string, opciones: RequestInit = {}, ms = 8000): Promise<any> {
  const clave = CLAVE()
  if (!clave) return null
  const control = new AbortController()
  const reloj = setTimeout(() => control.abort(), ms)
  try {
    const r = await fetch(BASE() + ruta, {
      ...opciones,
      headers: { 'Content-Type': 'application/json', 'X-API-Key': clave, ...(opciones.headers || {}) },
      signal: control.signal,
    })
    const cuerpo = await r.json().catch(() => null)
    return { ok: r.ok, estado: r.status, cuerpo }
  } catch (e: any) {
    console.error('[genesis] no se pudo hablar con Genesis ID:', e?.message)
    return null
  } finally {
    clearTimeout(reloj)
  }
}

/** La identidad de una persona por su correo. null si no tiene o no se pudo. */
export async function identidadPorCorreo(email: string): Promise<{
  id: string; gid: string | null; estado: string; nombreLegal: string | null
} | null> {
  const r = await pedir(`/api/v1/identidades/por-email/${encodeURIComponent(email)}`)
  if (!r?.ok) return null
  const i = r.cuerpo?.identidad
  return i ? { id: i.id, gid: i.gid ?? null, estado: i.estado, nombreLegal: i.nombreLegal ?? null } : null
}

/**
 * Ata la cuenta de MyTokenPay al GID de la persona.
 *
 * El correo va SIEMPRE: Genesis lo exige desde el 20-ago y comprueba que sea el
 * de esa identidad. Es lo que impide que una clave de API filtrada ate cuentas
 * ajenas y luego pida tokens de sesión única a nombre de otro.
 */
export async function vincularCuenta(
  identidadId: string, cuenta: string, email: string, direccion: string | null,
): Promise<boolean> {
  const r = await pedir('/api/v1/vinculos', {
    method: 'POST',
    body: JSON.stringify({ identidadId, cuenta, email, direccion }),
  })
  if (!r?.ok) console.error('[genesis] no se pudo atar la cuenta:', r?.estado, r?.cuerpo?.error)
  return Boolean(r?.ok)
}

export interface MovimientoPago {
  gid: string
  /** `entrada` para el comercio que cobra, `salida` para quien paga. */
  direccion: 'entrada' | 'salida'
  /** Id del cobro. Es el mismo para los dos lados, con sufijo: ver abajo. */
  idCobro: string
  contraparte: string
  montoOrigen: number
  montoUsd: number
  hash: string | null
  fecha: string
}

/**
 * Reporta un pago al monitoreo. No espera a nadie y no lanza nunca.
 *
 * El id del movimiento lleva el sufijo del lado (`-e` / `-s`) porque un mismo
 * cobro genera DOS movimientos —la entrada del comercio y la salida de quien
 * paga— y Genesis deduplica por id: sin el sufijo, el segundo se descartaría
 * como repetido y un lado del pago quedaría sin registrar para siempre.
 */
export function reportarPago(m: MovimientoPago): void {
  ;(async () => {
    try {
      const sufijo = m.direccion === 'entrada' ? '-e' : '-s'
      await pedir('/api/v1/movimientos', {
        method: 'POST',
        body: JSON.stringify({
          gid: m.gid,
          movimientos: [{
            id: `mtp-${m.idCobro}${sufijo}`,
            direccion: m.direccion,
            contraparte: m.contraparte,
            monto: m.montoOrigen,
            activo: 'ORIGEN',
            montoUsd: m.montoUsd,
            fecha: m.fecha,
            hash: m.hash,
          }],
        }),
      })
    } catch (e: any) {
      console.error('[genesis] reporte de pago fallido:', e?.message)
    }
  })()
}

// ── Telemetría ───────────────────────────────────────────────────────────────

/**
 * Un evento de uso, sin un solo dato que identifique a nadie.
 *
 * Se manda desde el servidor y no desde el teléfono porque estos eventos nacen
 * de operaciones que ocurren aquí —se emitió un cobro, se pagó uno— y el
 * servidor es el único que sabe con certeza que ocurrieron. Los eventos de
 * pantalla y navegación sí son del cliente, y esos van aparte.
 */
export function contar(
  tipo: 'sesion' | 'accion' | 'transaccion' | 'error',
  nombre: string,
  extra: { valor?: number; moneda?: string; usuario?: string } = {},
): void {
  ;(async () => {
    try {
      await pedir('/api/v1/telemetria/eventos', {
        method: 'POST',
        body: JSON.stringify({
          eventos: [{
            tipo, nombre,
            plataforma: 'servidor',
            // El «usuario» es una marca opaca, nunca el correo ni el id real:
            // la analítica cuenta gente sin saber quién es, a propósito.
            usuario: extra.usuario,
            valor: extra.valor,
            moneda: extra.moneda,
          }],
        }),
      })
    } catch {
      // La telemetría nunca se queja: si molesta, no sirve.
    }
  })()
}

/**
 * Registra un comercio como negocio en Genesis ID.
 *
 * Es donde vive el KYB de verdad del ecosistema: documentos exigidos,
 * beneficiarios finales por encima del umbral, decisión firmada por un operador
 * y bitácora encadenada. Duplicar todo eso dentro de MyTokenPay habría creado
 * una segunda superficie de cumplimiento que se contradice con la primera.
 *
 * Devuelve el id del negocio en Genesis, o null si no se pudo. Nunca lanza.
 */
export async function registrarNegocio(n: {
  emailDueno: string; razonSocial: string; nombreComercial: string
  identificadorFiscal: string; categoria: string; pais: string; ciudad: string; direccion: string
}): Promise<string | null> {
  const r = await pedir('/api/v1/negocios', { method: 'POST', body: JSON.stringify(n) })
  if (!r?.ok) {
    console.error('[genesis] no se pudo registrar el negocio:', r?.estado, r?.cuerpo?.error)
    return null
  }
  return r.cuerpo?.id ?? null
}
