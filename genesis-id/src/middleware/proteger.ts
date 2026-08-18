// Guardias de las rutas.
//
// Hay dos formas de identificarse ante Genesis ID y no se mezclan:
//
//   - Un OPERADOR, con sesión abierta desde el panel. Puede decidir sobre
//     identidades. Se comprueba con `exigeOperador` y `exigePermiso`.
//   - Una APLICACION del ecosistema, con su clave de API. Puede pedir lo que
//     esté en sus alcances y nada más. Se comprueba con `exigeApp`.
//
// Una aplicación NUNCA puede aprobar una identidad, por mucho que tenga una
// clave válida. Aprobar es un acto humano y exige sesión de operador con el
// permiso correspondiente.

import type { Request, Response, NextFunction } from 'express'
import { operadorDeSesion, puede } from '../auth/operadores.js'
import { aplicacionDeClave } from '../auth/aplicaciones.js'
import type { Operador, Aplicacion } from '../types.js'

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      operador?: Operador
      app_ecosistema?: Aplicacion
    }
  }
}

function tokenDe(req: Request): string {
  const cabecera = String(req.headers.authorization || '')
  if (cabecera.startsWith('Bearer ')) return cabecera.slice(7).trim()
  return String(req.headers['x-genesis-sesion'] || '').trim()
}

export function exigeOperador(req: Request, res: Response, siguiente: NextFunction) {
  const operador = operadorDeSesion(tokenDe(req))
  if (!operador) {
    return res.status(401).json({ error: 'Hace falta una sesión de operador' })
  }
  req.operador = operador
  siguiente()
}

export function exigePermiso(permiso: string) {
  return (req: Request, res: Response, siguiente: NextFunction) => {
    const operador = req.operador ?? operadorDeSesion(tokenDe(req))
    if (!operador) {
      return res.status(401).json({ error: 'Hace falta una sesión de operador' })
    }
    if (!puede(operador.rol, permiso)) {
      return res.status(403).json({
        error: `El rol "${operador.rol}" no tiene el permiso "${permiso}"`,
      })
    }
    req.operador = operador
    siguiente()
  }
}

export function exigeApp(...alcances: string[]) {
  return (req: Request, res: Response, siguiente: NextFunction) => {
    const clave = String(req.headers['x-api-key'] || '').trim()
    const app = aplicacionDeClave(clave)
    if (!app) {
      return res.status(401).json({ error: 'Clave de API inválida o revocada' })
    }
    const falta = alcances.find((a) => !app.alcances.includes(a))
    if (falta) {
      return res.status(403).json({
        error: `La aplicación "${app.clave}" no tiene el alcance "${falta}"`,
      })
    }
    req.app_ecosistema = app
    siguiente()
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Límite de peticiones
// ─────────────────────────────────────────────────────────────────────────────

const cubos = new Map<string, { fichas: number; ultimo: number }>()

/**
 * Cubo con goteo, por IP.
 *
 * Sin esto, las rutas de entrada y de consulta de GID quedan expuestas a
 * fuerza bruta y a barridos: un GID son 8 caracteres, y sin límite alguien
 * puede recorrer el espacio buscando identidades verificadas.
 */
export function limite(porMinuto: number) {
  const relleno = porMinuto / 60000
  return (req: Request, res: Response, siguiente: NextFunction) => {
    /* EL LIMITE VA EN LA LLAVE, y no es un detalle: sin él, todas las rutas de
       un mismo router comparten cubo —la llave era solo IP + router— y el cubo
       se queda con el tope de la ÚLTIMA que lo tocó. En la práctica eso
       significaba que `/identidades`, declarada a 60 por minuto, se recortaba
       sola a 20 en cuanto alguien subía una foto, porque `/foto` está a 20.
       Un límite que dice 60 y aplica 20 no protege mejor: engaña a quien lee
       el código y echa a gente que no estaba abusando de nada. */
    const llave = `${req.ip}|${req.baseUrl}|${porMinuto}`
    const ahora = Date.now()
    const cubo = cubos.get(llave) ?? { fichas: porMinuto, ultimo: ahora }
    cubo.fichas = Math.min(porMinuto, cubo.fichas + (ahora - cubo.ultimo) * relleno)
    cubo.ultimo = ahora

    if (cubo.fichas < 1) {
      cubos.set(llave, cubo)
      res.setHeader('Retry-After', '60')
      return res.status(429).json({ error: 'Demasiadas peticiones. Espere un momento.' })
    }
    cubo.fichas -= 1
    cubos.set(llave, cubo)
    siguiente()
  }
}

// El mapa se vacía cada tanto para que no crezca sin fin.
setInterval(() => {
  const limiteTiempo = Date.now() - 600000
  for (const [k, v] of cubos) if (v.ultimo < limiteTiempo) cubos.delete(k)
}, 300000).unref?.()

// ─────────────────────────────────────────────────────────────────────────────
// Cuántas peticiones pesadas caben a la vez
// ─────────────────────────────────────────────────────────────────────────────

/*
 * EL LIMITE QUE FALTABA, Y POR QUE NO ES EL DEL TAMAÑO
 *
 * El cuerpo admitido es de 25 MB porque la prueba de vida manda hasta ocho
 * fotogramas en base64, y las versiones ya publicadas de la app mandan la foto
 * entera. Bajar ese tope dejaría sin verificarse a quien todavía no actualizó,
 * que es exactamente a quien no se puede dejar fuera.
 *
 * Pero el servicio corre con memoria contada, y una petición de 25 MB ocupa
 * bastante más de 25 MB una vez parseada a objetos. El problema nunca fue el
 * tamaño de UNA: es cuántas entran a la vez. Con el tope de peticiones por
 * minuto no basta — ese cuenta por IP, y mil personas distintas verificándose
 * en el mismo minuto pasan todas.
 *
 * Así que se cuenta lo que de verdad importa: cuántas hay dentro AHORA.
 *
 * QUIEN LLEGA DE MAS ESPERA, NO SE LE ECHA
 *
 * Rechazar en cuanto se llena convertiría un pico de campaña en errores para
 * gente que no hizo nada mal. Se hace cola, y solo se contesta 503 cuando la
 * cola también está llena o la espera se pasa de tiempo — y entonces con
 * `Retry-After`, para que la app sepa reintentar en vez de dar la verificación
 * por perdida.
 */

const A_LA_VEZ = Number(process.env.GENESIS_PESADAS_A_LA_VEZ || 3)
const EN_COLA = Number(process.env.GENESIS_PESADAS_EN_COLA || 12)
const ESPERA_MS = Number(process.env.GENESIS_PESADAS_ESPERA_MS || 20000)

let dentro = 0
const cola: { seguir: () => void; reloj: NodeJS.Timeout }[] = []

function soltarUna(): void {
  const siguiente = cola.shift()
  if (siguiente) {
    clearTimeout(siguiente.reloj)
    siguiente.seguir()
    return
  }
  dentro -= 1
}

/** Estado para /healthz: sin esto, una cola llena no se ve desde fuera. */
export function cargaPesadas(): { dentro: number; enCola: number; aLaVez: number } {
  return { dentro, enCola: cola.length, aLaVez: A_LA_VEZ }
}

/**
 * Deja pasar solo unas cuantas peticiones pesadas a la vez.
 *
 * Va en las rutas que reciben imágenes: documento, fotogramas de vivacidad,
 * biometría y retrato. En las demás no hace falta y solo añadiría latencia.
 */
export function pesada(req: Request, res: Response, siguiente: NextFunction): void {
  const liberar = () => {
    // Una sola vez: `finish` y `close` pueden dispararse los dos.
    if ((res as any)._pesadaLiberada) return
    ;(res as any)._pesadaLiberada = true
    soltarUna()
  }

  const entrar = () => {
    res.on('finish', liberar)
    res.on('close', liberar)
    siguiente()
  }

  if (dentro < A_LA_VEZ) {
    dentro += 1
    return entrar()
  }

  if (cola.length >= EN_COLA) {
    res.setHeader('Retry-After', '15')
    res.status(503).json({
      error: 'Hay muchas verificaciones en curso. Probá de nuevo en unos segundos.',
    })
    return
  }

  const reloj = setTimeout(() => {
    const i = cola.findIndex((x) => x.reloj === reloj)
    if (i >= 0) cola.splice(i, 1)
    res.setHeader('Retry-After', '15')
    res.status(503).json({
      error: 'Hay muchas verificaciones en curso. Probá de nuevo en unos segundos.',
    })
  }, ESPERA_MS)

  cola.push({ seguir: entrar, reloj })
}
