// Ingesta de telemetría. Es la única puerta por la que las apps escriben aquí.
//
// Se separa del resto de `/api/v1` a propósito: tiene un límite de peticiones
// mucho más alto que las rutas de identidad —una app manda lotes cada pocos
// segundos— y un alcance propio, para que la clave de una app que solo reporta
// métricas no sirva para nada más.

import { Router } from 'express'
import type { Request, Response, NextFunction } from 'express'
import { exigeApp, limite } from '../middleware/proteger.js'
import { ingerir, paisDeCabeceras, guardarCenso, MAX_LOTE, TIPOS } from '../analitica/eventos.js'
import { aplicacionDeClavePublica } from '../auth/aplicaciones.js'

export const telemetriaRouter = Router()

/**
 * Deja pasar con la clave secreta de la app O con su clave pública de ingesta.
 *
 * POR QUE EXISTE UNA CLAVE PUBLICA
 *
 * Una app móvil no puede guardar un secreto: un APK se descomprime en diez
 * segundos. Hasta aquí eso obligaba a que cada app reportara contra su propio
 * backend y este reenviara — un salto más, un servicio más que puede caerse, y
 * en la práctica la excusa perfecta para no instrumentar nada.
 *
 * La clave pública resuelve eso sin abrir nada: solo sirve para ESTA ruta, solo
 * escribe, no lee absolutamente nada, y no da acceso a ninguna otra parte de
 * Genesis ID. Es el mismo trato que hacen Sentry con su DSN o PostHog con su
 * clave de proyecto, y por la misma razón. Lo peor que puede hacer quien la
 * saque de un APK es mandar métricas falsas; para eso está el límite de
 * peticiones, y si alguien abusa se rota la clave desde el panel y la app vieja
 * simplemente deja de reportar.
 *
 * La clave SECRETA sigue siendo la única que sirve para identidades.
 */
function exigeIngesta(req: Request, res: Response, siguiente: NextFunction) {
  const publica = String(req.headers['x-telemetria-key'] || '').trim()
  if (publica) {
    const app = aplicacionDeClavePublica(publica)
    if (!app) return res.status(401).json({ error: 'Clave de telemetría inválida o revocada' })
    req.app_ecosistema = app
    return siguiente()
  }
  return exigeApp('telemetria.enviar')(req, res, siguiente)
}

/**
 * Recibe un lote de eventos.
 *
 * Responde 202 y no 200 a propósito: el cliente no debe esperar nada de
 * vuelta ni reintentar si algo se descartó. Un cliente de telemetría que
 * reintenta con insistencia acaba tirando el servicio que quería vigilar.
 */
telemetriaRouter.post(
  '/eventos',
  limite(600),
  exigeIngesta,
  async (req, res) => {
    const cuerpo = req.body ?? {}
    const lote = Array.isArray(cuerpo) ? cuerpo : cuerpo.eventos
    if (!Array.isArray(lote)) {
      return res.status(400).json({ error: 'Se espera { eventos: [...] } o un arreglo' })
    }
    if (lote.length > MAX_LOTE) {
      return res.status(413).json({
        error: `El lote no puede pasar de ${MAX_LOTE} eventos`,
        recibidos: lote.length,
      })
    }

    // El país sale de la cabecera del proxy. La IP no se guarda en ningún lado.
    const pais = paisDeCabeceras(req.headers as Record<string, any>)

    try {
      const r = await ingerir(req.app_ecosistema!.clave, lote, pais)
      res.status(202).json({
        aceptados: r.aceptados,
        descartados: r.descartados,
        // Si el lote trajo un fallo que nunca se había visto, se le dice al
        // cliente. Un backend puede usarlo para avisar por su cuenta sin
        // esperar a que alguien abra el panel.
        gruposNuevos: r.gruposNuevos,
      })
    } catch (e: any) {
      console.error('[telemetria] no se pudo ingerir:', e?.message)
      // Se responde 202 igualmente: perder métricas es aceptable, provocar
      // que el cliente reintente en bucle contra un almacén caído no lo es.
      res.status(202).json({ aceptados: 0, descartados: lote.length, gruposNuevos: [] })
    }
  },
)

/** Qué acepta esta puerta. Sirve para que un cliente nuevo se autoconfigure. */
telemetriaRouter.get('/esquema', exigeApp('telemetria.enviar'), (_req, res) => {
  res.json({
    maxLote: MAX_LOTE,
    tipos: TIPOS,
    gravedades: ['info', 'aviso', 'error', 'critico'],
    campos: {
      tipo: 'obligatorio · uno de `tipos`',
      nombre: 'obligatorio · qué pasó, en pocas palabras',
      usuario: 'opcional · id del usuario en tu app. Se guarda como huella irreversible',
      sesion: 'opcional',
      pais: 'opcional · ISO-3166 alfa-2. Si falta se deduce del proxy',
      plataforma: 'opcional · android | ios | web | servidor',
      version: 'opcional · versión de tu app',
      gravedad: 'opcional · por defecto info, o error si tipo=error',
      mensaje: 'opcional · el texto del fallo',
      pila: 'opcional · el stack',
      ruta: 'opcional · pantalla o endpoint',
      duracionMs: 'opcional · para tipo=rendimiento',
      valor: 'opcional · monto, para tipo=transaccion',
      moneda: 'opcional · HNL, USD, ORIGEN…',
      meta: 'opcional · hasta 10 claves cortas. Las que huelan a secreto se descartan',
      en: 'opcional · fecha ISO del cliente. Se acota a 48 h hacia atrás',
    },
    aviso: 'No mandes datos personales. Ni correos, ni nombres, ni documentos.',
  })
})

/**
 * El padrón de una app: cuánta gente tiene registrada de verdad.
 *
 * Va con la clave SECRETA, no con la pública: es una afirmación sobre los
 * datos propios de la app, y no puede venir de algo que viaja dentro de un
 * APK. Se manda al arrancar y cada pocas horas; el panel guarda solo el
 * último valor de cada app.
 */
telemetriaRouter.post('/censo', limite(60), exigeApp('telemetria.enviar'), async (req, res) => {
  const { registrados, activos30, verificados, negocios, extra } = req.body ?? {}
  if (!Number.isFinite(Number(registrados))) {
    return res.status(400).json({ error: 'Falta «registrados», y tiene que ser un número' })
  }
  const censo = await guardarCenso(req.app_ecosistema!.clave, {
    registrados, activos30, verificados, negocios, extra,
  })
  res.json({ ok: true, censo })
})
