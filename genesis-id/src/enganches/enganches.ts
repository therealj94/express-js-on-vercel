/**
 * Enganches: avisar a las aplicaciones cuando algo cambia.
 *
 * ── EL PROBLEMA QUE RESUELVE ────────────────────────────────────────────────
 *
 * Hasta ahora, una aplicación que mandaba a alguien a verificarse no tenía
 * forma de enterarse del resultado más que PREGUNTANDO. Y como no sabe cuándo
 * va a pasar —una aprobación puede tardar diez minutos o dos días— la única
 * estrategia posible era preguntar cada tanto por cada persona pendiente.
 *
 * Eso tiene tres costes que se pagan todos a la vez: la app gasta peticiones
 * por gente que no ha cambiado, Genesis ID las atiende, y la persona ve su
 * cuenta desbloqueada con el retraso del intervalo de sondeo — que es lo único
 * de los tres que se nota desde fuera. Un aviso que llega solo elimina los
 * tres.
 *
 * Y hay un cuarto, menos visible y peor: sin aviso, la única forma de integrar
 * Genesis ID de verdad es sondear, y sondear bien es difícil. Un integrador que
 * lo haga mal acaba con gente aprobada a la que su app nunca desbloqueó.
 *
 * ── POR QUE CADA ENVIO VA FIRMADO ───────────────────────────────────────────
 *
 * Un aviso es una petición que llega de fuera a un sitio que suele estar
 * abierto. Quien adivine la dirección puede mandar «esta persona quedó
 * verificada» y la app se lo cree: es una vía directa para colar identidades
 * aprobadas sin pasar por aquí.
 *
 * Por eso cada envío lleva un HMAC-SHA256 del cuerpo con un secreto que solo
 * conocen Genesis ID y esa aplicación, y CON LA HORA DENTRO de lo firmado. La
 * hora es la mitad que se olvida: sin ella, un aviso legítimo capturado una vez
 * se puede reenviar mil veces y la firma sigue cuadrando. La app rechaza lo que
 * venga con más de unos minutos y se acabó.
 *
 * ── POR QUE LA COLA SE GUARDA ───────────────────────────────────────────────
 *
 * Este servicio se reinicia varias veces al día. Una cola en memoria pierde en
 * cada reinicio justo los avisos que no habían salido todavía —los que fallaron
 * y estaban esperando— y esos son, por definición, los importantes. Se guardan
 * en el almacén con el resto.
 *
 * ── LO QUE ESTO NO INTENTA SER ──────────────────────────────────────────────
 *
 * No es una cola de mensajes. No hay orden garantizado entre avisos distintos,
 * ni entrega exactamente-una-vez: un aviso puede llegar dos veces si la app
 * contesta tarde y se reintenta. Por eso cada envío lleva su identificador, y
 * la app tiene que ignorar los repetidos. Se dice claro en la documentación en
 * vez de prometer algo que no se cumple.
 */

import { createHmac, timingSafeEqual, randomBytes } from 'crypto'
import { store } from '../store.js'
import { id } from '../lib/uid.js'
import { registrar } from '../audit/bitacora.js'
import type { Aplicacion, Entrega, Enganche } from '../types.js'

/** Los avisos que existen. Uno por cambio que a una app le cambia qué hacer. */
export const EVENTOS = [
  'identidad.en-revision',
  'identidad.verificada',
  'identidad.rechazada',
  'identidad.suspendida',
  'negocio.verificado',
  'negocio.rechazado',
  'negocio.suspendido',
] as const

export type Evento = (typeof EVENTOS)[number]

/* Reintentos: seis intentos repartidos en unas siete horas. La escala sale de
   la avería que se quiere cubrir —un despliegue de la app, un reinicio, un
   corte de red— que se mide en minutos, no en días. Más allá de siete horas ya
   no es una avería pasajera: es que el enganche está mal puesto, y seguir
   reintentando solo esconde el problema. */
const ESPERAS = [30_000, 120_000, 600_000, 1_800_000, 3_600_000, 21_600_000]

const TOPE_ENTREGAS = 500
const CADA = 20_000

// ─────────────────────────────────────────────────────────────────────────────
// La firma
// ─────────────────────────────────────────────────────────────────────────────

/**
 * La cabecera `X-Genesis-Firma`, con la hora dentro de lo firmado.
 *
 * El formato —`t=<segundos>,v1=<hmac>`— lleva versión desde el primer día. El
 * día que haya que cambiar de algoritmo, `v2` puede convivir con `v1` mientras
 * los integradores se mueven; sin versión, ese cambio rompe a todos a la vez.
 */
export function firmar(cuerpo: string, secreto: string, segundos = Math.floor(Date.now() / 1000)) {
  const hmac = createHmac('sha256', secreto).update(`${segundos}.${cuerpo}`).digest('hex')
  return `t=${segundos},v1=${hmac}`
}

/**
 * Comprobar una firma. Vive aquí, en el servidor, aunque quien la use sea el
 * integrador: es la implementación de referencia contra la que se prueba, y
 * tenerla escrita evita que cada quien la deduzca del texto de la
 * documentación —que es como aparecen las comparaciones con `===` y las
 * ventanas de tiempo de un día.
 */
export function firmaCuadra(
  cuerpo: string, secreto: string, cabecera: string, toleranciaSegundos = 300,
): boolean {
  const partes = Object.fromEntries(
    String(cabecera || '').split(',').map((p) => p.split('=').map((x) => x.trim())))
  const t = Number(partes.t)
  if (!Number.isFinite(t)) return false
  if (Math.abs(Math.floor(Date.now() / 1000) - t) > toleranciaSegundos) return false

  const esperada = createHmac('sha256', secreto).update(`${t}.${cuerpo}`).digest()
  const dada = Buffer.from(String(partes.v1 || ''), 'hex')
  /* Comparación de tiempo constante: comparar con `===` filtra, por lo que
     tarda, cuántos bytes del principio acertó quien lo intenta. */
  return dada.length === esperada.length && timingSafeEqual(dada, esperada)
}

// ─────────────────────────────────────────────────────────────────────────────
// Encolar
// ─────────────────────────────────────────────────────────────────────────────

/** A qué aplicaciones les importa lo que le pasó a esta identidad. */
function destinatarios(evento: Evento, sujeto: { creadaPor?: string | null; vinculos?: { app: string }[] }): Aplicacion[] {
  /* Las que la crearon o la tienen vinculada, y NADIE MÁS. Mandar todos los
     avisos a todas las apps con enganche sería contarle a una aplicación quién
     se verificó en otra: el enganche pasaría de ser una comodidad a ser una
     fuga. */
  const suyas = new Set<string>()
  if (sujeto.creadaPor) suyas.add(sujeto.creadaPor)
  for (const v of sujeto.vinculos || []) suyas.add(v.app)

  return store.todo().aplicaciones.filter((a) =>
    a.activa && a.enganche?.activo && suyas.has(a.clave)
    && (a.enganche.eventos.length === 0 || a.enganche.eventos.includes(evento)))
}

/**
 * Pone en cola un aviso para cada aplicación interesada.
 *
 * Nunca lanza y nunca espera. Se llama desde dentro de una aprobación, y una
 * aprobación no se puede caer —ni retrasar— porque el servidor de un integrador
 * esté lento.
 */
export function avisar(
  evento: Evento,
  sujeto: { id: string; gid?: string | null; estado: string; creadaPor?: string | null; vinculos?: { app: string }[] },
  extra: Record<string, unknown> = {},
): number {
  let puestos = 0
  /* Un estado que no es un evento no se manda. Pasa si mañana alguien añade un
     estado nuevo a las decisiones y se olvida de esta lista: sin este corte, a
     los enganches que escuchan «todos» les llegaría un evento inventado que su
     código no sabe leer. */
  if (!EVENTOS.includes(evento)) return 0
  try {
    const cola = store.todo().entregas
    for (const app of destinatarios(evento, sujeto)) {
      /* El cuerpo es MINIMO a propósito: identificador, GID, estado y fecha.
         Nada de nombres, documentos ni fotos. Un aviso viaja a un servidor
         ajeno por una dirección que se configuró una vez y que nadie vuelve a
         mirar; meter datos personales ahí es regalarlos. Si la app necesita el
         detalle, lo pide con su clave por la API, que es donde se controla
         quién puede ver qué. */
      const cuerpo = JSON.stringify({
        evento,
        entregaId: id(),
        fecha: new Date().toISOString(),
        datos: { identidad: sujeto.id, gid: sujeto.gid ?? null, estado: sujeto.estado, ...extra },
      })
      cola.push({
        id: id(), app: app.clave, evento, url: app.enganche!.url, cuerpo,
        intentos: 0, proximoIntento: Date.now(), estado: 'pendiente',
        creadaEn: new Date().toISOString(),
      })
      puestos++
    }
    if (cola.length > TOPE_ENTREGAS) cola.splice(0, cola.length - TOPE_ENTREGAS)
    if (puestos) store.guardar()
  } catch (e: any) {
    // Un fallo aquí no puede tumbar la decisión que lo provocó.
    console.error('[genesis-id] no se pudo encolar el aviso:', e?.message || e)
  }
  return puestos
}

// ─────────────────────────────────────────────────────────────────────────────
// Entregar
// ─────────────────────────────────────────────────────────────────────────────

let corriendo = false

async function entregar(e: Entrega): Promise<void> {
  const app = store.todo().aplicaciones.find((a) => a.clave === e.app)
  const secreto = app?.enganche?.secreto
  if (!app?.enganche?.activo || !secreto) {
    /* El enganche se apagó o se borró mientras esto esperaba en la cola.
       Entregarlo igual sería mandar datos a una dirección que ya nadie
       autoriza. */
    e.estado = 'cancelada'
    e.ultimoError = 'el enganche se apagó antes de entregarlo'
    return
  }

  e.intentos++
  try {
    const r = await fetch(e.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'Genesis-ID/2 (enganches)',
        'X-Genesis-Evento': e.evento,
        'X-Genesis-Entrega': e.id,
        'X-Genesis-Intento': String(e.intentos),
        'X-Genesis-Firma': firmar(e.cuerpo, secreto),
      },
      body: e.cuerpo,
      /* Diez segundos. Un servidor que tarda más no está pensando: está caído o
         atascado, y esperarle bloquea la cola de todos los demás. Se reintenta,
         que para eso está. */
      signal: AbortSignal.timeout(10_000),
    })
    if (!r.ok) throw new Error(`contestó ${r.status}`)
    e.estado = 'entregada'
    e.entregadaEn = new Date().toISOString()
    delete e.ultimoError
  } catch (err: any) {
    e.ultimoError = String(err?.message || err).slice(0, 200)
    if (e.intentos >= ESPERAS.length) {
      e.estado = 'fallida'
      /* Se deja escrito en la bitácora. Un aviso que se rinde después de siete
         horas es un problema de integración que alguien tiene que ver, y si
         solo queda en la cola nadie lo mira nunca. */
      registrar('sistema', 'enganche.fallido', e.app,
        { evento: e.evento, entrega: e.id, error: e.ultimoError })
    } else {
      e.proximoIntento = Date.now() + ESPERAS[e.intentos - 1]
    }
  }
}

/** Una vuelta a la cola. Devuelve cuántos envíos se intentaron. */
export async function vaciarCola(): Promise<number> {
  if (corriendo) return 0
  corriendo = true
  try {
    const ahora = Date.now()
    const pendientes = store.todo().entregas
      .filter((e) => e.estado === 'pendiente' && e.proximoIntento <= ahora)
      .slice(0, 20)     // de veinte en veinte: no se atasca el proceso
    if (!pendientes.length) return 0

    /* En paralelo y no en fila: son servidores distintos, y uno lento no tiene
       por qué retrasar a los demás. */
    await Promise.all(pendientes.map((e) => entregar(e)))
    store.guardar()
    return pendientes.length
  } finally {
    corriendo = false
  }
}

let reloj: NodeJS.Timeout | null = null

export function iniciarEnganches() {
  if (reloj) return
  reloj = setInterval(() => { void vaciarCola() }, CADA)
  reloj.unref?.()
}

export function pararEnganches() {
  if (reloj) { clearInterval(reloj); reloj = null }
}

// ─────────────────────────────────────────────────────────────────────────────
// Para el panel
// ─────────────────────────────────────────────────────────────────────────────

/** Lo que se puede enseñar de un enganche. El secreto NO está aquí. */
export function verEnganche(app: Aplicacion) {
  if (!app.enganche) return null
  const suyas = store.todo().entregas.filter((e) => e.app === app.clave)
  const ultima = suyas.at(-1)
  return {
    url: app.enganche.url,
    eventos: app.enganche.eventos,
    activo: app.enganche.activo,
    puestoEn: app.enganche.puestoEn,
    /* Del secreto, solo si lo hay. Enseñarlo otra vez —aunque sea al operador
       que lo creó— convertiría el panel en una segunda copia del secreto, y
       basta con que se filtre una. */
    tieneSecreto: Boolean(app.enganche.secreto),
    entregas: {
      pendientes: suyas.filter((e) => e.estado === 'pendiente').length,
      entregadas: suyas.filter((e) => e.estado === 'entregada').length,
      fallidas: suyas.filter((e) => e.estado === 'fallida').length,
      ultima: ultima
        ? { evento: ultima.evento, estado: ultima.estado, intentos: ultima.intentos,
            creadaEn: ultima.creadaEn, ultimoError: ultima.ultimoError }
        : null,
    },
  }
}

export function ponerEnganche(
  app: Aplicacion, url: string, eventos: string[], actor: string,
): { ok: true; secreto: string } | { ok: false; error: string } {
  let u: URL
  try { u = new URL(url) } catch { return { ok: false, error: 'La dirección no es válida' } }

  /* Solo HTTPS. Un aviso por HTTP viaja en claro y, peor, se puede desviar:
     la firma prueba quién lo escribió, no que llegue a donde debía. */
  if (u.protocol !== 'https:') return { ok: false, error: 'La dirección tiene que ser https' }

  /* Y no a la red de casa. Sin esto, un enganche es una forma de hacer que este
     servicio pida cosas a direcciones internas que desde fuera no se alcanzan
     —el clásico SSRF—, y encima con reintentos. */
  if (/^(localhost$|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?$)/i.test(u.hostname)) {
    return { ok: false, error: 'No se puede apuntar a una dirección interna' }
  }

  const malos = eventos.filter((e) => !EVENTOS.includes(e as Evento))
  if (malos.length) return { ok: false, error: `Eventos que no existen: ${malos.join(', ')}` }

  /* 32 bytes del generador criptográfico, no dos identificadores pegados.
     `id()` sirve para nombrar cosas —lleva la hora dentro y unos 40 bits de
     azar— y eso está bien para un identificador y mal para un secreto con el
     que se firma: la mitad del valor es adivinable mirando el reloj. Aquí el
     secreto es lo único que separa un aviso nuestro de uno que se inventó
     cualquiera. */
  const secreto = 'gse_' + randomBytes(32).toString('base64url')
  app.enganche = {
    url: u.toString(), eventos, activo: true, secreto,
    puestoEn: new Date().toISOString(),
  }
  store.guardar()
  registrar(actor, 'enganche.puesto', app.clave, { url: u.host, eventos })
  // El secreto se enseña aquí y nunca más, igual que la clave de API.
  return { ok: true, secreto }
}

export function quitarEnganche(app: Aplicacion, actor: string): boolean {
  if (!app.enganche) return false
  delete app.enganche
  store.guardar()
  registrar(actor, 'enganche.quitado', app.clave, {})
  return true
}

/**
 * Manda un aviso de prueba.
 *
 * Existe porque la alternativa es que el integrador descubra que su enganche
 * está mal el día que se verifica su primera persona de verdad — y para
 * entonces ya perdió el aviso.
 */
export function probarEnganche(app: Aplicacion): boolean {
  if (!app.enganche?.activo) return false
  store.todo().entregas.push({
    id: id(), app: app.clave, evento: 'prueba', url: app.enganche.url,
    cuerpo: JSON.stringify({
      evento: 'prueba',
      entregaId: id(),
      fecha: new Date().toISOString(),
      datos: { nota: 'Aviso de prueba de Genesis ID. No corresponde a ninguna identidad.' },
    }),
    intentos: 0, proximoIntento: Date.now(), estado: 'pendiente',
    creadaEn: new Date().toISOString(),
  })
  store.guardar()
  void vaciarCola()
  return true
}

export function estadoEnganches() {
  const cola = store.todo().entregas
  return {
    configurados: store.todo().aplicaciones.filter((a) => a.enganche?.activo).length,
    pendientes: cola.filter((e) => e.estado === 'pendiente').length,
    fallidas: cola.filter((e) => e.estado === 'fallida').length,
  }
}

export type { Enganche, Entrega }
