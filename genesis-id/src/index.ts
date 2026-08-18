import express from 'express'
import cors from 'cors'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

import { store, iniciar, motor, saludAlmacen } from './store.js'
import { asegurarAdministrador, limpiarSesiones } from './auth/operadores.js'
import { asegurarAplicaciones, alinearAlcances } from './auth/aplicaciones.js'
import { prepararTelemetria, hayMongo as telemetriaEnMongo } from './analitica/eventos.js'
import { estadoListas, hayListas, iniciarListas } from './aml/listas.js'
import { cargarGafiDesdeMongo, estadoGafi, listasVencidas } from './aml/paises.js'
import { biometriaConfigurada, proveedorBiometria } from './kyc/biometria.js'
import { migrarFotosDelEstado } from './kyc/fotosDocumento.js'
import { migrarFotosCredencialDelEstado } from './kyc/fotoCredencial.js'
import { verificarCadena } from './audit/bitacora.js'
import { sesionRouter } from './routes/sesion.js'
import { appsRouter } from './routes/apps.js'
import { panelRouter } from './routes/panel.js'
import { telemetriaRouter } from './routes/telemetria.js'
import { analiticaRouter } from './routes/analitica.js'
import { directorioAppsRouter, directorioPanelRouter } from './routes/directorio.js'
import { prepararDirectorio } from './directorio/padron.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const app = express()

// Render pone un balanceador delante. Sin declararlo, `req.ip` es SIEMPRE la
// dirección de ese balanceador, y eso rompe dos cosas a la vez: el límite de
// peticiones cuenta a todo el mundo en el mismo cubo —diez intentos de entrada
// por minuto para el planeta entero, así que dos operadores a la vez se echan
// mutuamente con un 429— y la dirección que queda escrita en la bitácora de
// sesión es la del proxy, o sea inservible para auditar quién entró desde
// dónde. El 1 significa «hay un proxy de confianza»: se toma la dirección que
// Render añade a la derecha, no la que pueda inventarse el cliente.
app.set('trust proxy', 1)

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
 * El cerebro: todo el ecosistema como un grafo navegable en 3D.
 *
 * Se sirve desde aquí y no como página suelta porque necesita dos cosas que
 * solo tiene este servidor: hablar con la cadena 8532 sin que un CSP se lo
 * impida, y preguntarle al panel por el estado real del ecosistema con la
 * sesión del operador que ya está abierta.
 */
app.get(['/cerebro', '/mapa'], (_req, res) => {
  res.sendFile(join(__dirname, '..', 'public', 'cerebro.html'))
})

/**
 * Genesis Core: el mismo ecosistema, pero para ENSEÑARLO.
 *
 * Es una página distinta de `/cerebro` a propósito, no una versión bonita de
 * la misma. `/cerebro` es la herramienta de trabajo: panel de capas, ficha de
 * cada pieza, datos en vivo, y hace falta la sesión del operador para verlo
 * entero. Esto no tiene panel ni ficha y no se puede hurgar: enseña la
 * ARQUITECTURA —cuántas piezas hay, cómo se agrupan, cómo se hablan— y no el
 * contenido de ninguna.
 *
 * Esa separación es la que respeta la regla de la casa: lo que no se enseña
 * es lo que el cerebro SABE. Que existe y cómo late no le sirve a nadie para
 * atacarnos, y es justo lo que hay que poder proyectar en una reunión.
 *
 * Por eso tampoco pide sesión, y por eso la página lleva `noindex`: se abre
 * desde un enlace que uno da, no desde una búsqueda.
 */
app.get(['/genesis-core', '/cerebro-3d', '/core'], (_req, res) => {
  res.sendFile(join(__dirname, '..', 'public', 'cerebro-3d.html'))
})

/* Los módulos de Genesis Core, uno por ruta.
 *
 * Se enumeran en vez de servir `public/` entero con `express.static`, por la
 * misma razón que ya llevaba `/cerebro-datos.js`: una carpeta servida reparte
 * todo lo que alguien deje ahí dentro algún día. Aquí hacen falta estos
 * cuatro y ninguno más — y si mañana se añade uno y falta la línea, el fallo
 * es un 404 evidente en la consola, no un fichero interno publicado sin que
 * nadie se entere. */
for (const modulo of ['cerebro-3d.js', 'cara-3d.js', 'voz-core.js', 'guion-core.js']) {
  app.get('/' + modulo, (_req, res) => {
    res.type('application/javascript')
    res.sendFile(join(__dirname, '..', 'public', modulo))
  })
}

/**
 * El mapa del ecosistema, aparte de la página.
 *
 * Es lo único del cerebro que se edita cuando el ecosistema cambia —una app
 * nueva, un nodo más— y tenerlo suelto significa que añadir una pieza es
 * escribir cinco líneas en vez de bucear en el motor gráfico.
 *
 * Va como ruta suya y no con `express.static` sobre `public/`: servir una
 * carpeta entera reparte todo lo que alguien deje ahí dentro algún día, y
 * aquí solo hace falta este archivo.
 */
app.get('/cerebro-datos.js', (_req, res) => {
  res.type('application/javascript')
  res.sendFile(join(__dirname, '..', 'public', 'cerebro-datos.js'))
})

/**
 * Estado del servicio.
 *
 * Se publica sin autenticar porque es lo que consultan los sistemas de
 * vigilancia, pero solo dice si el motor está en condiciones de operar — no
 * revela ningún dato de ninguna persona. La versión anterior publicaba aquí, y
 * en `/api/admin/*`, el recuento y la lista entera de identidades sin pedir nada.
 *
 * Dice además QUE COMMIT está corriendo. Sin eso, cuando una página nueva
 * devuelve 404 no hay forma de distinguir dos cosas muy distintas: que el
 * código esté mal, o que el servidor siga sirviendo una versión vieja porque
 * el despliegue no se disparó. Se ha perdido más de una hora en esa duda. El
 * commit no es secreto —el repositorio es público— y saber cuál corre es lo
 * primero que hace falta para diagnosticar cualquier cosa.
 */
const COMMIT = process.env.RENDER_GIT_COMMIT || process.env.GIT_COMMIT || 'desconocido'
const RAMA = process.env.RENDER_GIT_BRANCH || process.env.GIT_BRANCH || 'desconocida'
const ARRANQUE = new Date().toISOString()

app.get('/healthz', (_req, res) => {
  const cadena = verificarCadena()
  const listas = estadoListas()
  const almacen = saludAlmacen()
  // Un guardado que falla no cambia nada visible desde fuera: el servicio sigue
  // respondiendo, con los datos vivos solo en memoria hasta el próximo
  // reinicio. Por eso cuenta para el estado: es la avería que se paga tarde.
  const guardaBien = almacen.ultimoVolcado?.ok !== false
  const listo = hayListas() && cadena.integra && motor === 'mongodb' && guardaBien
  res.json({
    estado: listo ? 'ok' : 'degradado',
    en: new Date().toISOString(),
    version: { commit: COMMIT.slice(0, 12), rama: RAMA, arrancadoEn: ARRANQUE },
    comprobaciones: {
      almacenPersistente: motor === 'mongodb',
      guardadoOk: guardaBien,
      ultimoGuardado: almacen.ultimoVolcado?.en ?? null,
      listasCargadas: listas.cargadas,
      listasVencidas: listas.vencidas,
      biometria: biometriaConfigurada(),
      proveedorBiometria: proveedorBiometria(),
      ssoConfigurado: Boolean(process.env.GENESIS_SSO_SECRETO),
      bitacoraIntegra: cadena.integra,
      // El hueco NO se esconde detrás de un sello: si la bitácora se cerró
      // alguna vez por rotura, se dice aquí y se dice dónde. Un registro de
      // cumplimiento que vuelve a verde sin dejar rastro no vale nada.
      bitacoraSellos: cadena.sellos.length,
      bitacoraRoturas: cadena.sellos.map((x) => x.rotaEn).filter((x) => x !== null),
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
app.use('/api/v1/directorio', directorioAppsRouter)
app.use('/api/v1', appsRouter)
app.use('/api/panel/analitica', analiticaRouter)
app.use('/api/panel/directorio', directorioPanelRouter)
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

/**
 * En un servidor de verdad, sin base de datos no se arranca.
 *
 * El motor cae al archivo en cuanto GENESIS_MONGO_URL falta, está vacía o
 * viene mal escrita, y hasta ahora eso solo dejaba un AVISO entre los demás
 * mensajes de arranque: el servicio respondía 200, la semilla creaba de nuevo
 * a admin@ordenglobal.link con otra contraseña, y todos los demás operadores e
 * identidades desaparecían del mapa. Nadie mira los registros de arranque de un
 * servicio que responde bien; lo que se nota es a la gente que ya no puede
 * entrar, y para entonces nadie relaciona una cosa con la otra.
 *
 * Negarse a arrancar convierte una pérdida silenciosa de datos en una avería
 * ruidosa, que es lo que hay que preferir en el servicio que aprueba
 * identidades reales. Para desarrollo el motor de archivo sigue intacto: esto
 * solo se aplica cuando corre en Render, y hay salida expresa con
 * GENESIS_PERMITIR_ARCHIVO=si por si alguna vez hace falta arrancar sin base.
 */
function exigirAlmacenPersistente(): void {
  const enRender = Boolean(process.env.RENDER)
  const permitido = /^(si|sí|1|true)$/i.test(String(process.env.GENESIS_PERMITIR_ARCHIVO || ''))
  if (motor === 'archivo' && enRender && !permitido) {
    throw new Error(
      'SIN ALMACEN PERSISTENTE: falta GENESIS_MONGO_URL (o está mal escrita) y el disco de ' +
      'Render es efímero. Arrancar así borraría operadores e identidades en el próximo ' +
      'despliegue. Defina GENESIS_MONGO_URL en el panel de Render, o GENESIS_PERMITIR_ARCHIVO=si ' +
      'si de verdad quiere arrancar sin base de datos.',
    )
  }
}

export async function arrancar(): Promise<void> {
  exigirAlmacenPersistente()
  await iniciar()

  // Lo PRIMERO después de abrir el almacén: sacar del documento de estado las
  // fotos de documento que se guardaron dentro. Mientras sigan ahí, cada
  // guardado reescribe esos megabytes y el documento avanza hacia los 16 MB que
  // MongoDB no deja pasar — y el día que los pase, deja de guardarse TODO
  // (identidades incluidas) sin que el servicio dé ninguna señal.
  const mudanza = await migrarFotosDelEstado().catch((e) => {
    console.error('[genesis-id] no se pudieron mudar las fotos del documento:', e?.message)
    return null
  })
  if (mudanza && (mudanza.movidas || mudanza.sueltas || mudanza.fallidas)) {
    console.log(
      `[genesis-id] fotos de documento fuera del estado: ${mudanza.movidas} mudadas, ` +
      `${mudanza.sueltas} sueltas por expediente ya decidido, ${mudanza.fallidas} sin mover`)
  }

  // Y la MISMA mudanza para el retrato de la credencial, que es la bomba lenta:
  // las fotos del documento se sueltan al decidir el expediente, pero el retrato
  // no se suelta nunca —es la credencial— y cada persona verificada dejaba hasta
  // medio megabyte permanente ahi dentro. Con unas treinta se pasaba de los
  // 16 MB otra vez.
  const retratos = await migrarFotosCredencialDelEstado().catch((e) => {
    console.error('[genesis-id] no se pudieron mudar los retratos:', e?.message)
    return null
  })
  if (retratos && (retratos.movidas || retratos.fallidas)) {
    console.log(
      `[genesis-id] retratos de credencial fuera del estado: ${retratos.movidas} mudados, ` +
      `${retratos.fallidas} sin mover`)
  }

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
  await prepararDirectorio().catch(() => {})
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

/**
 * Cierre ordenado.
 *
 * El almacén vuelca en diferido —100 ms después de cada cambio— y Render manda
 * SIGTERM en cada despliegue y al dormir el servicio del plan gratuito. Sin
 * este manejador, todo lo que estuviera en esa ventana se perdía sin dejar
 * rastro: justo el operador que se acababa de crear, o la identidad que se
 * acababa de aprobar.
 */
let cerrando = false
async function cerrarConOrden(senal: string): Promise<void> {
  if (cerrando) return
  cerrando = true
  console.log(`[genesis-id] ${senal}: guardando lo pendiente antes de cerrar…`)
  try {
    await store.guardarYa()
    console.log('[genesis-id] guardado. Cerrando.')
  } catch (e: any) {
    console.error('[genesis-id] NO se pudo guardar al cerrar:', e?.message)
  }
  process.exit(0)
}
process.on('SIGTERM', () => void cerrarConOrden('SIGTERM'))
process.on('SIGINT', () => void cerrarConOrden('SIGINT'))

if (debeEscuchar) {
  arrancar()
    .then(() => {
      app.listen(puerto, '0.0.0.0', () => {
        console.log(`[genesis-id] escuchando en http://0.0.0.0:${puerto}`)
      })
    })
    .catch((e) => {
      console.error('[genesis-id] no se pudo arrancar:', e?.message || e)
      process.exit(1)
    })
}

export default app
export { store }
