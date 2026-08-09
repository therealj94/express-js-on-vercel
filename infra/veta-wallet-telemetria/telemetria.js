// Reporte de telemetría a Genesis ID desde el backend de una app.
//
// QUE HACE
//
// Manda a Genesis ID lo que pasa en el servidor —quién entró, qué movió, qué
// se rompió— para que el panel de analítica pueda responder «a quién le falló
// el pago de anoche» en vez de solo «hubo 6 fallos».
//
// LA REGLA QUE MANDA SOBRE TODAS LAS DEMAS
//
// Esto NO PUEDE romper ni frenar la billetera. Un módulo de métricas que tira
// el servicio que venía a vigilar es peor que no tener métricas: se pierde el
// dinero de la gente por mirar un gráfico. De ahí salen todas las decisiones
// de este archivo:
//
//   · nada se manda en la ruta caliente. Los eventos van a una cola en memoria
//     y salen cada pocos segundos en lote, en segundo plano;
//   · la cola tiene tope. Si Genesis ID está caído y la cola se llena, se tiran
//     los eventos MÁS VIEJOS y se sigue. Crecer sin freno es quedarse sin
//     memoria en el proceso que firma transacciones;
//   · nada de aquí lanza nunca. Cada función pública está envuelta y el peor
//     caso posible es que no se reporte;
//   · sin `GENESIS_TELEMETRIA_KEY` el módulo queda dormido: no hace peticiones
//     ni gasta memoria. Un servidor sin configurar no debe cambiar de conducta.
//
// EL IDENTIFICADOR DEL USUARIO — Y POR QUE IMPORTA TANTO CUAL SE MANDA
//
// Genesis ID nunca guarda quién es nadie: guarda `HMAC(sal, app|usuario)`. El
// panel puede volver a poner el nombre porque calcula esa misma huella sobre
// el padrón que este mismo backend le sincroniza (ver `directorio.js`).
//
// Para que ese cruce funcione, el `usuario` que se manda aquí TIENE QUE SER
// EXACTAMENTE el mismo `idExterno` que se manda en el padrón. Si aquí va el
// correo y allá el `_id` de Mongo, las huellas no coinciden y el panel dirá
// «fuera del padrón» para todo el mundo, sin que nada falle a la vista. Por eso
// los dos módulos usan la misma función, `idDeUsuario`, y no se debe cambiar
// en uno solo.

const BASE = (process.env.GENESIS_URL || 'https://genesis-id.onrender.com').replace(/\/$/, '')
const CLAVE = (process.env.GENESIS_TELEMETRIA_KEY || '').trim()

/** Cada cuánto sale un lote, en milisegundos. */
const CADA_MS = Number(process.env.GENESIS_TELEMETRIA_INTERVALO_MS || 8000)
/** Cuántos eventos como mucho por petición. Genesis ID acota el lote también. */
const POR_LOTE = Number(process.env.GENESIS_TELEMETRIA_LOTE || 100)
/** Tope de la cola. Al pasarse se tiran los más viejos. */
const TOPE_COLA = Number(process.env.GENESIS_TELEMETRIA_COLA || 2000)
/** Cuánto se espera a Genesis ID antes de rendirse con un lote. */
const TIEMPO_MS = Number(process.env.GENESIS_TELEMETRIA_TIMEOUT_MS || 8000)

const APP_VERSION = process.env.APP_VERSION || process.env.HEROKU_RELEASE_VERSION || 'servidor'

export const activa = () => Boolean(CLAVE)

const cola = []
let temporizador = null
let enVuelo = false
let apagado = false
const cuenta = { encolados: 0, enviados: 0, descartados: 0, fallos: 0 }

/**
 * El identificador estable de una persona dentro de esta app.
 *
 * Se usa en los dos sitios —telemetría y padrón— y por eso vive aquí solo.
 * El `_id` de Mongo es el único que no cambia: el correo se puede editar, y
 * el día que alguien lo cambie su historial se partiría en dos personas.
 */
export function idDeUsuario(u) {
  if (!u) return null
  const bruto = u.idExterno ?? u._id ?? u.id ?? u.email
  if (!bruto) return null
  return String(bruto)
}

/** Encola un evento. Nunca lanza, nunca espera. */
export function registrar(evento) {
  if (!CLAVE || apagado) return
  try {
    const e = limpiar(evento)
    if (!e) return
    cola.push(e)
    cuenta.encolados++
    // Se tira por delante: los eventos viejos ya no ayudan a nadie a entender
    // lo que está pasando AHORA, que es cuando se mira el panel.
    while (cola.length > TOPE_COLA) { cola.shift(); cuenta.descartados++ }
    arrancar()
  } catch (_) { /* la telemetría jamás rompe la petición */ }
}

/** Recorta y normaliza. Lo que no cuadre se cae en vez de viajar sucio. */
function limpiar(e) {
  const tipo = String(e?.tipo || '').trim()
  const nombre = String(e?.nombre || '').trim()
  if (!tipo || !nombre) return null

  const texto = (v, max) => {
    const s = v === undefined || v === null ? '' : String(v).trim()
    return s ? s.slice(0, max) : undefined
  }
  const numero = (v) => (Number.isFinite(Number(v)) ? Number(v) : undefined)

  return {
    tipo: tipo.slice(0, 20),
    nombre: nombre.slice(0, 80),
    usuario: e.usuario ? String(e.usuario).slice(0, 120) : undefined,
    sesion: texto(e.sesion, 64),
    pais: texto(e.pais, 2)?.toUpperCase(),
    // El backend es una plataforma más, y distinguirla importa: un error del
    // servidor y uno del teléfono se arreglan en sitios distintos.
    plataforma: texto(e.plataforma, 20) || 'servidor',
    version: texto(e.version, 30) || APP_VERSION,
    gravedad: texto(e.gravedad, 10),
    mensaje: texto(e.mensaje, 300),
    pila: texto(e.pila, 1200),
    ruta: texto(e.ruta, 120),
    duracionMs: numero(e.duracionMs),
    valor: numero(e.valor),
    moneda: texto(e.moneda, 12)?.toUpperCase(),
    en: new Date().toISOString(),
  }
}

function arrancar() {
  if (temporizador || apagado) return
  temporizador = setTimeout(() => { temporizador = null; vaciar() }, CADA_MS)
  // No mantiene vivo el proceso: un servidor que no puede apagarse porque el
  // reloj de las métricas sigue corriendo es un servidor que no se despliega.
  if (typeof temporizador.unref === 'function') temporizador.unref()
}

/** Manda lo que haya. Se llama sola; se puede llamar a mano al apagar. */
export async function vaciar() {
  if (!CLAVE || enVuelo || !cola.length) return
  enVuelo = true
  try {
    while (cola.length) {
      const lote = cola.splice(0, POR_LOTE)
      const ok = await mandar(lote)
      if (!ok) {
        // No se pierde: se devuelve al principio para el próximo intento. Si
        // esto pasa muchas veces seguidas, el tope de la cola hace su trabajo.
        cola.unshift(...lote)
        cuenta.fallos++
        break
      }
      cuenta.enviados += lote.length
    }
  } catch (_) {
    /* ya está contado como fallo */
  } finally {
    enVuelo = false
    if (cola.length) arrancar()
  }
}

async function mandar(eventos) {
  const corte = new AbortController()
  const reloj = setTimeout(() => corte.abort(), TIEMPO_MS)
  try {
    const r = await fetch(`${BASE}/api/v1/telemetria/eventos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Telemetria-Key': CLAVE },
      body: JSON.stringify({ eventos }),
      signal: corte.signal,
    })
    // 4xx que no sea 429 es culpa del lote —mal formado, clave revocada— y
    // reintentarlo es repetir el error para siempre. Se da por perdido.
    if (r.status >= 400 && r.status < 500 && r.status !== 429) {
      cuenta.descartados += eventos.length
      return true
    }
    return r.ok || r.status === 202
  } catch (_) {
    return false
  } finally {
    clearTimeout(reloj)
  }
}

export const estadisticas = () => ({ ...cuenta, enCola: cola.length, activa: activa() })

/** Para el apagado ordenado: manda lo que queda y deja de aceptar. */
export async function cerrar() {
  apagado = true
  if (temporizador) { clearTimeout(temporizador); temporizador = null }
  await vaciar()
}

// ─────────────────────────────────────────────────────────────────────────────
// Atajos con nombre
//
// Existen para que quien instrumente no tenga que acordarse de los tipos ni de
// cómo se llama cada campo. Un `registrar({tipo:'transaccion', ...})` suelto en
// diez sitios distintos acaba con diez formas distintas del mismo evento, y
// entonces el panel no puede agruparlos.
// ─────────────────────────────────────────────────────────────────────────────

export const ingreso = (usuario, extra = {}) =>
  registrar({ tipo: 'sesion', nombre: 'ingreso', usuario, ...extra })

export const alta = (usuario, extra = {}) =>
  registrar({ tipo: 'registro', nombre: 'alta', usuario, ...extra })

export const transaccion = (usuario, { nombre = 'envio', valor, moneda, ...extra } = {}) =>
  registrar({ tipo: 'transaccion', nombre, usuario, valor, moneda, ...extra })

export const accion = (usuario, nombre, extra = {}) =>
  registrar({ tipo: 'accion', nombre, usuario, ...extra })

export const fallo = (nombre, error, extra = {}) =>
  registrar({
    tipo: 'error',
    nombre,
    gravedad: extra.gravedad || 'error',
    mensaje: error?.message ? String(error.message) : String(error ?? 'error'),
    pila: error?.stack,
    ...extra,
  })

// ─────────────────────────────────────────────────────────────────────────────
// Middleware de Express
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Mide cada petición y reporta las que fallan.
 *
 * NO reporta un evento por petición correcta: un backend con tráfico real
 * mandaría millones de eventos idénticos que no dicen nada y llenarían la
 * retención de 90 días en una tarde. Se reporta lo que sirve: los errores
 * (con quién los sufrió) y las peticiones anormalmente lentas.
 *
 * Va DESPUÉS del middleware de sesión, para que `req.usuario` ya exista.
 */
export function medidor({ lentaMs = 3000, ignorar = ['/healthz', '/health', '/favicon.ico'] } = {}) {
  return function medir(req, res, siguiente) {
    if (!CLAVE || ignorar.includes(req.path)) return siguiente()
    const arranque = Date.now()

    res.on('finish', () => {
      try {
        const duracionMs = Date.now() - arranque
        // La ruta con plantilla (`/users/:id`), no la concreta: si no, cada
        // identificador crearía su propio grupo y no se agruparía nada.
        const ruta = (req.route?.path && req.baseUrl !== undefined)
          ? `${req.baseUrl}${req.route.path}`
          : req.path
        const comun = {
          ruta: `${req.method} ${ruta}`,
          usuario: idDeUsuario(req.usuario || req.user),
          pais: req.headers['cf-ipcountry'] || req.headers['x-vercel-ip-country'] || undefined,
        }

        if (res.statusCode >= 500) {
          registrar({
            tipo: 'error', nombre: `http.${res.statusCode}`, gravedad: 'critico',
            mensaje: `${res.statusCode} en ${comun.ruta}`, duracionMs, ...comun,
          })
        } else if (res.statusCode >= 400 && res.statusCode !== 401 && res.statusCode !== 404) {
          // El 401 y el 404 son ruido de fondo en cualquier API pública; los
          // demás 4xx sí dicen que algo está mal del lado de quien llama.
          registrar({
            tipo: 'error', nombre: `http.${res.statusCode}`, gravedad: 'aviso',
            mensaje: `${res.statusCode} en ${comun.ruta}`, duracionMs, ...comun,
          })
        } else if (duracionMs >= lentaMs) {
          registrar({ tipo: 'rendimiento', nombre: 'peticion.lenta', duracionMs, ...comun })
        }
      } catch (_) { /* nunca romper la respuesta ya enviada */ }
    })

    siguiente()
  }
}

/**
 * Captura las excepciones de Express con su pila entera.
 *
 * Se monta como manejador de errores (cuatro argumentos) DESPUÉS de las rutas
 * y ANTES del manejador de errores propio de la app. Reporta y sigue: no
 * responde nada, para no cambiar lo que la app ya contestaba.
 */
export function cazador() {
  return function cazar(err, req, res, siguiente) {
    try {
      fallo('excepcion', err, {
        gravedad: 'critico',
        ruta: `${req.method} ${req.path}`,
        usuario: idDeUsuario(req.usuario || req.user),
      })
    } catch (_) { /* ni aquí */ }
    siguiente(err)
  }
}
