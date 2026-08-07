// ─────────────────────────────────────────────────────────────────────────────
// Cliente de telemetría de Genesis ID.
//
// Un solo archivo, sin dependencias, que sirve igual en React Native, en el
// navegador y en un backend de Node. Se pega tal cual en cada app.
//
// LO QUE HACE, Y POR QUÉ ASÍ
//
//   · ACUMULA Y MANDA POR LOTES. Una petición por evento tumbaría la batería
//     del teléfono y llenaría el registro del servidor de ruido. Se junta lo
//     que salga en cinco segundos y se manda de una vez.
//
//   · NUNCA ROMPE LA APP. Todo va dentro de try/catch y los fallos se tragan
//     en silencio. Una librería de métricas que tira la app que vigila es
//     peor que no tener métricas. Ni una sola función de aquí lanza.
//
//   · NUNCA REINTENTA SIN FRENO. Si el servidor no responde, la cola se
//     guarda y se reintenta con espera creciente, y si crece demasiado se
//     tira lo más viejo. Un cliente que reintenta en bucle convierte una caída
//     de cinco minutos en una de dos horas.
//
//   · NO MANDA DATOS PERSONALES. El identificador de usuario que se le pasa
//     se convierte en huella irreversible del lado del servidor, pero aun así:
//     mandá un id interno, nunca un correo ni un nombre. Y nunca metas nada
//     personal en `meta`.
//
// USO MÍNIMO
//
//     import { telemetria } from './telemetria.js'
//
//     telemetria.iniciar({
//       url: 'https://genesis-id.onrender.com',
//       clavePublica: 'gidp_mytokenpay_…',    // en apps
//       // clave: process.env.GENESIS_API_KEY // en backends
//       app: 'mytokenpay',
//       version: '1.0.0',
//       plataforma: 'android',
//     })
//
//     telemetria.identificar(usuario.id)      // al iniciar sesión
//     telemetria.accion('cobrar', { ruta: '/pos/cobro' })
//     telemetria.error(e, { ruta: '/pagar' })
//
// DOS CLAVES, Y NO SON INTERCAMBIABLES
//
//   · `clavePublica` (`gidp_…`) es la que va DENTRO de las apps. Solo abre la
//     ruta de telemetría, solo escribe y no lee nada. Que se filtre de un APK
//     no expone ningún dato; lo peor que se puede hacer con ella es mandar
//     métricas falsas, y para eso se rota desde el panel.
//
//   · `clave` (`gid_live_…`) es la SECRETA, la que también abre identidades.
//     Solo en backends. Nunca, jamás, dentro de un APK: se descomprime en
//     diez segundos.
// ─────────────────────────────────────────────────────────────────────────────

const CONF = {
  url: '',
  /** Clave SECRETA. Solo para backends. Nunca dentro de una app móvil. */
  clave: '',
  /** Clave PÚBLICA de ingesta (`gidp_…`). Es la que va dentro de las apps. */
  clavePublica: '',
  app: '',
  version: '0',
  plataforma: 'desconocida',
  pais: undefined,
  /** Cada cuánto se vacía la cola, en milisegundos. */
  cada: 5000,
  /** Tope de la cola. Al pasarse se tira lo más viejo. */
  maxCola: 500,
  /** Cuántos eventos van por petición. El servidor acepta 200. */
  maxLote: 200,
  /** Poné false para apagarla del todo sin quitar las llamadas. */
  activa: true,
  /** Muestreo: 1 = todo, 0.25 = uno de cada cuatro. Los errores van siempre. */
  muestreo: 1,
}

let cola = []
let usuario = null
let sesion = null
let reloj = null
let fallos = 0
let enviando = false

const ahora = () => new Date().toISOString()
const azar = () => Math.random().toString(36).slice(2, 12)

/* ── Arranque ──────────────────────────────────────────────────────────── */

export function iniciar(opciones = {}) {
  Object.assign(CONF, opciones)
  sesion = azar()
  if (!CONF.url || !CONF.app || (!CONF.clave && !CONF.clavePublica)) {
    // Sin destino no hay nada que hacer, pero tampoco se lanza: la app tiene
    // que seguir funcionando aunque quien la montó se olvidara de esto.
    CONF.activa = false
    return
  }
  if (reloj) clearInterval(reloj)
  reloj = setInterval(vaciar, CONF.cada)
  reloj?.unref?.()
  atraparNoAtrapados()
  return api
}

export function identificar(id) { usuario = id ? String(id) : null }
export function olvidar() { usuario = null; sesion = azar() }

/* ── Registro de eventos ───────────────────────────────────────────────── */

function encolar(evento) {
  try {
    if (!CONF.activa) return
    // El muestreo nunca se aplica a los errores: perder la mitad de los fallos
    // para ahorrar ancho de banda es ahorrar en lo único que importa.
    if (evento.tipo !== 'error' && CONF.muestreo < 1 && Math.random() > CONF.muestreo) return

    cola.push({
      usuario,
      sesion,
      version: CONF.version,
      plataforma: CONF.plataforma,
      pais: CONF.pais,
      en: ahora(),
      ...evento,
    })
    if (cola.length > CONF.maxCola) cola = cola.slice(-CONF.maxCola)
    // Un error no espera al reloj: es lo que alguien está esperando ver.
    if (evento.tipo === 'error') vaciar()
  } catch { /* jamás romper la app por una métrica */ }
}

export const sesionAbierta = (nombre = 'abrir', extra) => encolar({ tipo: 'sesion', nombre, ...extra })
export const registro = (nombre = 'alta', extra) => encolar({ tipo: 'registro', nombre, ...extra })
export const pantalla = (nombre, extra) => encolar({ tipo: 'pantalla', nombre, ruta: nombre, ...extra })
export const accion = (nombre, extra) => encolar({ tipo: 'accion', nombre, ...extra })

export const transaccion = (nombre, valor, moneda, extra) =>
  encolar({ tipo: 'transaccion', nombre, valor, moneda, ...extra })

export const rendimiento = (nombre, duracionMs, extra) =>
  encolar({ tipo: 'rendimiento', nombre, duracionMs, ...extra })

/**
 * Reporta un fallo. Acepta un Error, un texto o cualquier cosa.
 *
 * `gravedad` por defecto es 'error'. Usá 'critico' solo para lo que deja al
 * usuario sin poder seguir: si todo es crítico, nada lo es.
 */
export function error(e, extra = {}) {
  const mensaje = e?.message ?? (typeof e === 'string' ? e : JSON.stringify(e ?? 'error sin mensaje'))
  encolar({
    tipo: 'error',
    nombre: extra.nombre || e?.name || 'excepcion',
    gravedad: extra.gravedad || 'error',
    mensaje: String(mensaje).slice(0, 2000),
    pila: e?.stack ? String(e.stack).slice(0, 6000) : undefined,
    ...extra,
  })
}

/** Mide cuánto tarda algo y lo reporta. Devuelve lo que devuelva la función. */
export async function medir(nombre, fn, extra) {
  const t0 = Date.now()
  try {
    return await fn()
  } catch (e) {
    error(e, { nombre, ...extra })
    throw e            // se reporta y se vuelve a lanzar: no se traga el fallo
  } finally {
    rendimiento(nombre, Date.now() - t0, extra)
  }
}

/* ── Envío ─────────────────────────────────────────────────────────────── */

async function vaciar() {
  if (enviando || !cola.length || !CONF.activa) return
  enviando = true
  const lote = cola.slice(0, CONF.maxLote)
  try {
    const r = await fetch(CONF.url.replace(/\/$/, '') + '/api/v1/telemetria/eventos', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // La pública gana si está: es la que corresponde a una app, y así un
        // descuido copiando configuración de un backend no acaba metiendo la
        // clave secreta en un APK.
        ...(CONF.clavePublica
          ? { 'X-Telemetria-Key': CONF.clavePublica }
          : { 'X-API-Key': CONF.clave }),
      },
      body: JSON.stringify({ eventos: lote }),
    })
    if (r.ok) {
      cola = cola.slice(lote.length)
      fallos = 0
    } else if (r.status === 401 || r.status === 403) {
      // La clave no sirve. Reintentar con la misma clave no la va a arreglar y
      // solo genera ruido: se apaga y se avisa una vez.
      CONF.activa = false
      cola = []
      console.warn('[telemetria] clave rechazada (' + r.status + '); telemetría apagada')
    } else {
      fallos++
    }
  } catch {
    fallos++
  } finally {
    enviando = false
    // Espera creciente hasta un minuto. Sin esto, una caída del servidor se
    // convierte en una tormenta de peticiones desde todos los teléfonos a la vez.
    if (fallos > 0 && reloj) {
      clearInterval(reloj)
      const espera = Math.min(60000, CONF.cada * Math.pow(2, Math.min(fallos, 4)))
      reloj = setInterval(vaciar, espera)
      reloj?.unref?.()
    }
  }
}

/** Manda lo que quede, ya. Se llama al cerrar la app o al terminar un proceso. */
export async function cerrar() {
  try { await vaciar() } catch { /* nada */ }
}

/* ── Captura automática ────────────────────────────────────────────────── */

/**
 * Engancha los fallos que nadie atrapó.
 *
 * Es lo que más valor da por línea escrita: los errores que alguien ya está
 * atrapando suelen estar previstos; los que llegan aquí son los que nadie vio
 * venir, y son justo los que hacen que la app se quede en negro.
 */
function atraparNoAtrapados() {
  try {
    if (typeof globalThis.addEventListener === 'function') {
      globalThis.addEventListener('error', (ev) =>
        error(ev.error || ev.message, { nombre: 'error-no-atrapado', gravedad: 'critico' }))
      globalThis.addEventListener('unhandledrejection', (ev) =>
        error(ev.reason, { nombre: 'promesa-sin-catch', gravedad: 'critico' }))
    }
    // Node: se reporta y se deja que el proceso siga su curso normal.
    if (typeof process !== 'undefined' && process?.on) {
      process.on('uncaughtException', (e) => { error(e, { nombre: 'excepcion-no-atrapada', gravedad: 'critico' }); cerrar() })
      process.on('unhandledRejection', (e) => error(e, { nombre: 'promesa-sin-catch', gravedad: 'critico' }))
      process.on('beforeExit', () => cerrar())
    }
  } catch { /* entorno raro: sin captura automática, pero la app arranca */ }
}

/* ── Middleware para backends Express ──────────────────────────────────── */

/**
 * Reporta cada petición y cada error de un backend Express.
 *
 *     app.use(telemetria.express())
 *     app.use(telemetria.expressErrores())   // después de las rutas
 */
export function express() {
  return (req, res, siguiente) => {
    const t0 = Date.now()
    res.on('finish', () => {
      const ruta = req.route?.path ? req.baseUrl + req.route.path : req.path
      rendimiento('http', Date.now() - t0, { ruta, meta: { metodo: req.method, codigo: res.statusCode } })
      // Un 5xx es un fallo aunque nadie haya lanzado una excepción.
      if (res.statusCode >= 500) {
        encolar({
          tipo: 'error', nombre: 'respuesta-' + res.statusCode, gravedad: 'error',
          mensaje: `${req.method} ${ruta} respondió ${res.statusCode}`, ruta,
        })
      }
    })
    siguiente()
  }
}

export function expressErrores() {
  return (err, req, _res, siguiente) => {
    error(err, {
      ruta: req.path,
      gravedad: 'critico',
      meta: { metodo: req.method },
    })
    siguiente(err)
  }
}

const api = {
  iniciar, identificar, olvidar, sesionAbierta, registro, pantalla, accion,
  transaccion, rendimiento, error, medir, cerrar, express, expressErrores,
  get pendientes() { return cola.length },
  get activa() { return CONF.activa },
}

export const telemetria = api
export default api
