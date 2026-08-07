import express from 'express'
import cors from 'cors'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

import { store, iniciar, motor } from './store.js'
import { asegurarAdministrador, limpiarSesiones } from './auth/operadores.js'
import { asegurarAplicaciones, alinearAlcances } from './auth/aplicaciones.js'
import { prepararTelemetria, hayMongo as telemetriaEnMongo } from './analitica/eventos.js'
import { estadoListas, hayListas, iniciarListas } from './aml/listas.js'
import { cargarGafiDesdeMongo, estadoGafi, listasVencidas } from './aml/paises.js'
import { biometriaConfigurada, proveedorBiometria } from './kyc/biometria.js'
import { verificarCadena } from './audit/bitacora.js'
import { sesionRouter } from './routes/sesion.js'
import { appsRouter } from './routes/apps.js'
import { panelRouter } from './routes/panel.js'
import { telemetriaRouter } from './routes/telemetria.js'
import { analiticaRouter } from './routes/analitica.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const app = express()

// CORS abierto solo tiene sentido para las apps del ecosistema, que se
// identifican con clave de API; el panel se sirve desde el mismo origen.
app.use(cors())
// 25 MB porque la prueba de vida manda hasta ocho fotogramas en base64 en una
// sola petición. La app los reduce a 720 px —unos 40 kB cada uno— pero las
// versiones ya publicadas mandan la foto entera, de dos megas larga, y esas
// personas no pueden actualizar hasta que instalen: dejarlas fuera por un
// límite es dejarlas sin verificarse.
//
// La holgura no permite mandar una IMAGEN más grande: `kyc/rekognition.ts`
// rechaza cualquiera que pase de 5 MB, que es el tope de la propia API.
app.use(express.json({ limit: '25mb' }))

// Cabeceras de seguridad. Son pocas líneas y evitan las formas más comunes de
// abuso de un panel: incrustarlo en un iframe ajeno para engañar al operador, y
// que el navegador adivine tipos de contenido.
app.use((_req, res, siguiente) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'no-referrer')
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()')
  siguiente()
})

app.get(['/', '/admin'], (_req, res) => {
  res.sendFile(join(__dirname, '..', 'public', 'admin.html'))
})

// El panel de analítica se sirve aparte del de cumplimiento. Son dos oficios
// distintos —quien mira métricas no está aprobando identidades— y separarlos
// deja abrir uno sin cargar el otro.
app.get(['/analitica', '/metricas'], (_req, res) => {
  res.sendFile(join(__dirname, '..', 'public', 'analitica.html'))
})

/**
 * Estado del servicio.
 *
 * Se publica sin autenticar porque es lo que consultan los sistemas de
 * vigilancia, pero solo dice si el motor está en condiciones de operar — no
 * revela ningún dato de ninguna persona. La versión anterior publicaba aquí, y
 * en `/api/admin/*`, el recuento y la lista entera de identidades sin pedir nada.
 */
app.get('/healthz', (_req, res) => {
  const cadena = verificarCadena()
  const listas = estadoListas()
  const listo = hayListas() && cadena.integra && motor === 'mongodb'
  res.json({
    estado: listo ? 'ok' : 'degradado',
    en: new Date().toISOString(),
    comprobaciones: {
      almacenPersistente: motor === 'mongodb',
      listasCargadas: listas.cargadas,
      listasVencidas: listas.vencidas,
      biometria: biometriaConfigurada(),
      proveedorBiometria: proveedorBiometria(),
      ssoConfigurado: Boolean(process.env.GENESIS_SSO_SECRETO),
      bitacoraIntegra: cadena.integra,
      telemetriaPersistente: telemetriaEnMongo(),
    },
  })
})

app.get('/api', (_req, res) => {
  res.json({
    nombre: 'Genesis ID',
    lema: 'Identidad digital · Orden Global',
    version: 2,
    rutas: {
      sesion: '/api/sesion/* — operadores del panel',
      apps: '/api/v1/* — aplicaciones del ecosistema (cabecera X-API-Key)',
      telemetria: '/api/v1/telemetria/eventos — uso y errores de las apps',
      panel: '/api/panel/* — cumplimiento (sesión de operador)',
      analitica: '/api/panel/analitica/* — métricas del ecosistema',
    },
  })
})

app.use('/api/sesion', sesionRouter)
app.use('/api/v1/telemetria', telemetriaRouter)
app.use('/api/v1', appsRouter)
app.use('/api/panel/analitica', analiticaRouter)
app.use('/api/panel', panelRouter)

app.use('/api', (_req, res) => res.status(404).json({ error: 'Ruta no encontrada' }))

// Cualquier error no previsto se registra completo pero se responde escueto: el
// detalle de una excepción puede filtrar rutas de archivos y estructura interna.
app.use((error: any, _req: express.Request, res: express.Response, _n: express.NextFunction) => {
  // Un cuerpo demasiado grande no es un fallo del servidor y no puede
  // responderse «Error interno»: quien lo manda puede arreglarlo, pero solo si
  // se le dice. Pasó de verdad — una verificación de rostro con ocho fotos sin
  // reducir daba 500 y nadie sabía por qué.
  if (error?.type === 'entity.too.large' || error?.status === 413) {
    return res.status(413).json({
      error: 'Las imágenes pesan demasiado. Actualice la aplicación: la versión nueva las reduce antes de enviarlas.',
      limite: '25 MB',
    })
  }
  console.error('[genesis-id] error no controlado:', error)
  res.status(500).json({ error: 'Error interno' })
})

// ─────────────────────────────────────────────────────────────────────────────
// Arranque
// ─────────────────────────────────────────────────────────────────────────────

const puerto = Number(process.env.PORT || 4000)
const __filename = fileURLToPath(import.meta.url)
const debeEscuchar =
  process.argv[1] === __filename || Boolean(process.env.PORT) || Boolean(process.env.RENDER)

export async function arrancar(): Promise<void> {
  await iniciar()

  // Las listas se cargan DESPUES de abrir el almacen: viven en Mongo, en su
  // propia coleccion, y antes de eso no hay de donde traerlas.
  const fichas = await iniciarListas().catch((e) => {
    console.error('[genesis-id] no se pudieron cargar las listas:', e?.message)
    return 0
  })
  if (fichas > 0) console.log(`[genesis-id] listas de sanciones: ${fichas.toLocaleString('es')} fichas`)

  // Las del GAFI son otra cosa y viven aparte: no son nombres de personas sino
  // países, caben en dos líneas y las mantiene a mano el equipo de cumplimiento.
  await cargarGafiDesdeMongo().catch(() => false)
  const gafi = estadoGafi()
  console.log(
    `[genesis-id] listas del GAFI: plenaria del ${gafi.fecha} (${gafi.origen}) · ` +
    `${gafi.altoRiesgo.length} en llamamiento, ${gafi.vigilancia.length} bajo vigilancia`)

  const admin = asegurarAdministrador()
  const appsNuevas = asegurarAplicaciones()
  const alcancesNuevos = alinearAlcances()
  for (const t of alcancesNuevos) console.log(`[genesis-id] alcances al día — ${t}`)
  limpiarSesiones()

  // Índices y caducidad de la telemetría. Va después de abrir el almacén y no
  // rompe el arranque si falla: sin analítica el motor de identidad sigue
  // haciendo su trabajo, que es lo que no se puede detener.
  await prepararTelemetria().catch((e) =>
    console.error('[genesis-id] no se pudieron preparar los índices de telemetría:', e?.message))

  console.log(`[genesis-id] almacén: ${motor}`)

  // Los avisos van juntos y al final, donde se ven. Cada uno describe algo que
  // impide operar con datos reales.
  const avisos: string[] = []
  if (motor === 'archivo') {
    avisos.push(
      'ALMACEN EN ARCHIVO: en Render el disco es efímero y los datos se pierden en cada ' +
      'despliegue. Configure GENESIS_MONGO_URL antes de verificar identidades reales.',
    )
  }
  if (!hayListas()) {
    avisos.push(
      'SIN LISTAS DE SANCIONES: no se puede tamizar a nadie, y por eso ninguna identidad ' +
      'podrá aprobarse sin anulación expresa. Cárguelas desde el panel: Listas → ' +
      'Descargar de la OFAC.',
    )
  }
  if (!biometriaConfigurada()) {
    avisos.push(
      'SIN PROVEEDOR DE BIOMETRIA: el cotejo del rostro tendrá que resolverlo un operador ' +
      'a mano en cada verificación. Defina GENESIS_AWS_ACCESS_KEY_ID y ' +
      'GENESIS_AWS_SECRET_ACCESS_KEY para usar Rekognition.',
    )
  } else {
    console.log(`[genesis-id] biometría: ${proveedorBiometria()}`)
  }
  if (listasVencidas()) {
    avisos.push(
      `LISTAS DEL GAFI VENCIDAS: las vigentes son de la plenaria del ${gafi.fecha}, hace ` +
      `${gafi.dias} días. El GAFI se reúne unas tres veces al año; actualícelas en el panel: ` +
      'Listas → Actualizar GAFI.',
    )
  }
  if (!process.env.GENESIS_SSO_SECRETO) {
    avisos.push('SIN GENESIS_SSO_SECRETO: el inicio de sesión único entre apps está desactivado.')
  }
  for (const a of avisos) console.warn(`[genesis-id] AVISO — ${a}`)

  if (admin.creado) {
    console.log(`[genesis-id] primer administrador: ${admin.email}`)
    if (admin.contrasena) {
      console.log(
        `[genesis-id] CONTRASEÑA INICIAL (se muestra una sola vez): ${admin.contrasena}\n` +
        '[genesis-id] Cámbiela al entrar. Defina GENESIS_ADMIN_PASSWORD para fijarla usted.',
      )
    }
  }
  for (const a of appsNuevas) {
    console.log(`[genesis-id] clave de API de ${a.clave} (se muestra una sola vez): ${a.secreta}`)
  }

  setInterval(limpiarSesiones, 3600000).unref?.()
}

if (debeEscuchar) {
  arrancar()
    .then(() => {
      app.listen(puerto, '0.0.0.0', () => {
        console.log(`[genesis-id] escuchando en http://0.0.0.0:${puerto}`)
      })
    })
    .catch((e) => {
      console.error('[genesis-id] no se pudo arrancar:', e)
      process.exit(1)
    })
}

export default app
export { store }
