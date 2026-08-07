// Ingesta de telemetría. Es la única puerta por la que las apps escriben aquí.
//
// Se separa del resto de `/api/v1` a propósito: tiene un límite de peticiones
// mucho más alto que las rutas de identidad —una app manda lotes cada pocos
// segundos— y un alcance propio, para que la clave de una app que solo reporta
// métricas no sirva para nada más.

import { Router } from 'express'
import { exigeApp, limite } from '../middleware/proteger.js'
import { ingerir, paisDeCabeceras, MAX_LOTE, TIPOS } from '../analitica/eventos.js'

export const telemetriaRouter = Router()

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
  exigeApp('telemetria.enviar'),
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
