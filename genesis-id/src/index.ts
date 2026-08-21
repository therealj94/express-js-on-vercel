import express from 'express'
import cors from 'cors'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

import { store, iniciar, motor, saludAlmacen, saludBitacora } from './store.js'
import { asegurarAdministrador, limpiarSesiones } from './auth/operadores.js'
import { asegurarAplicaciones, alinearAlcances } from './auth/aplicaciones.js'
import { prepararTelemetria, hayMongo as telemetriaEnMongo } from './analitica/eventos.js'
import { estadoListas, hayListas, iniciarListas } from './aml/listas.js'
import { estadoTemporizador, iniciarTemporizadorListas } from './aml/temporizador.js'
import { cargarGafiDesdeMongo, estadoGafi, listasVencidas } from './aml/paises.js'
import { correoEncendido, correoRemitente } from './correo/enviar.js'
import { biometriaConfigurada, proveedorBiometria } from './kyc/biometria.js'
import { migrarFotosDelEstado, prepararCaducidad, conservacionConfigurada } from './kyc/fotosDocumento.js'
import { migrarFotosCredencialDelEstado, cifrarRetratosEnClaro } from './kyc/fotoCredencial.js'
import { verificarCadena } from './audit/bitacora.js'
import { cargaPesadas } from './middleware/proteger.js'
import { sesionRouter } from './routes/sesion.js'
import { appsRouter } from './routes/apps.js'
import { panelRouter } from './routes/panel.js'
import { telemetriaRouter } from './routes/telemetria.js'
import { analiticaRouter } from './routes/analitica.js'
import { directorioAppsRouter, directorioPanelRouter } from './routes/directorio.js'
import { estadoCadenaRapido } from './directorio/monedas.js'
import { prepararDirectorio } from './directorio/padron.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
/* ¿Quedó puesto el índice que caduca los documentos a los cinco años?
   Vive acá arriba, y no dentro del arranque, porque `/healthz` tiene que poder
   leerlo: era un aviso por consola y una cédula guardada sin plazo no daba
   ninguna señal. Arranca en `false` y solo pasa a `true` si el índice se creó
   de verdad. */
let caducidadPuesta = false

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

/*
 * CORS: abierto para las apps, cerrado para el panel.
 *
 * Antes era `app.use(cors())` a secas, o sea `Access-Control-Allow-Origin: *`
 * en todas las rutas, incluidas las del panel de cumplimiento.
 *
 * Conviene decir con precisión por qué eso NO era una puerta abierta, para no
 * inflar el arreglo: sin cookies de sesión, una página ajena no puede robar el
 * token del operador, porque el navegador no se lo adjunta solo. Y las rutas de
 * aplicación piden clave de API, que un navegador ajeno tampoco tiene.
 *
 * Pero `*` sobre `/api/panel` no aportaba absolutamente nada —el panel se sirve
 * desde este mismo servicio, así que es del mismo origen y no necesita CORS
 * para nada— y ampliaba la superficie sin motivo. Lo que no aporta y suma
 * riesgo, se quita.
 *
 * Si algún día el panel se sirve desde otro dominio, se enumeran sus orígenes
 * en `GENESIS_ORIGENES_PANEL`, separados por comas. Lista cerrada, nunca `*`.
 */
const origenesPanel = String(process.env.GENESIS_ORIGENES_PANEL || '')
  .split(',').map((s) => s.trim()).filter(Boolean)

const corsPanel = cors({
  origin(origen, responder) {
    // Sin cabecera `Origin` no hay nada cruzado: es la propia página del panel,
    // o `curl`, o una sonda. Negarlo rompería el panel sin proteger nada.
    if (!origen) return responder(null, true)
    // `false` no es un error: son cabeceras que no se ponen, y el navegador
    // corta solo. Lanzar aquí devolvería un 500 y ensuciaría los registros con
    // algo que no es una avería.
    return responder(null, origenesPanel.includes(origen))
  },
  credentials: true,
})

const corsApps = cors()

app.use('/api/panel', corsPanel)
app.use((req, res, siguiente) =>
  req.path.startsWith('/api/panel') ? siguiente() : corsApps(req, res, siguiente))
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
/* Express anuncia `X-Powered-By: Express` en cada respuesta. Le regala a
   cualquiera la pila que corre debajo, que es el primer dato que busca quien
   va a probar exploits conocidos. No cuesta nada quitarlo. */
app.disable('x-powered-by')

app.use((_req, res, siguiente) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'no-referrer')
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()')
  /* HSTS: el navegador recuerda que este sitio es solo por HTTPS y no vuelve a
     intentar el primer salto en claro. Sin esto, la primera visita de alguien
     a `http://` se puede interceptar antes de que llegue a TLS, y por ahí pasa
     la sesión de un operador que puede leer cédulas.
     Dos años y con los subdominios, que es lo que pide la lista de precarga. */
  res.setHeader('Strict-Transport-Security',
    'max-age=63072000; includeSubDomains; preload')
  siguiente()
})

app.get(['/', '/admin'], (_req, res) => {
  res.sendFile(join(__dirname, '..', 'public', 'admin.html'))
})

/**
 * La mesa de cotejo: la pantalla donde se resuelve UNA identidad.
 *
 * Se sirve aparte de `/admin` y no como una ficha lateral dentro del panel
 * porque necesita la ventana entera. Ahí se comparan dos rostros, y una
 * credencial dentro de un cajón de 400 px se ve del tamaño de un sello: no hay
 * forma de cotejar una cara así. Es la misma sesión y la misma API —no es un
 * panel aparte—, solo que con sitio para mirar.
 *
 * Acepta la identidad por ruta (`/revision/<id>`) y por parámetro
 * (`/revision?id=<id>`); la página entiende las dos.
 */
app.get(['/revision', '/revision/:id', '/cotejo', '/cotejo/:id'], (_req, res) => {
  res.sendFile(join(__dirname, '..', 'public', 'revision.html'))
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
for (const modulo of ['cerebro-3d.js', 'cara-3d.js', 'voz-core.js', 'guion-core.js', 'fichas-core.js', 'ambiente.js']) {
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
 * La marca de Genesis ID, en vectores.
 *
 * Se sirve suelta para que cualquier pieza del ecosistema —un correo, la web
 * de la wallet, una página que enseñe el sello— pueda pintarla sin copiarse
 * los trazos. Es una RECREACIÓN vectorial del logotipo oficial (el original
 * llegó como imagen); si aparece el archivo fuente, se sustituye aquí y todo
 * el ecosistema lo hereda.
 */
app.get('/marca.svg', (_req, res) => {
  res.type('image/svg+xml')
  res.setHeader('Cache-Control', 'public, max-age=86400')
  res.sendFile(join(__dirname, '..', 'public', 'marca.svg'))
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
  const tempo = estadoTemporizador()
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
      /* CUANTOS REGISTROS Y DE CUANDO.
         Sin estos dos, desde fuera no se distingue una lista de cincuenta mil
         registros bajada ayer de una de tres cargada hace un anio: las dos
         salen `cargadas: true, vencidas: false`. El numero que decide si el
         tamizado sirve de algo tiene que verse sin entrar al panel. */
      listasRegistros: listas.registros,
      listasDiasDesdeDescarga: listas.diasDesdeDescarga,
      /* EL TAMIZADO CONTINUO, ¿ESTA CORRIENDO?
         Las listas se actualizan solas cada 24 h. Lo que hay que poder ver
         desde fuera no es que el temporizador exista, sino que siguio
         corriendo: `atrasado` se pone en true si se paso vuelta y media sin
         completar una, y `fallosSeguidos` distingue una caida puntual de la
         OFAC de una averia de verdad. */
      listasAlDiaSolas: tempo.encendido,
      listasUltimaCorrida: tempo.ultimaCorrida,
      listasTemporizadorAtrasado: tempo.atrasado,
      listasFallosSeguidos: tempo.fallosSeguidos,
      biometria: biometriaConfigurada(),
      proveedorBiometria: proveedorBiometria(),
      /* La política publicada promete conservar los datos de verificación cinco
         años. Sin llave de cifrado NO se conserva nada —se borra al decidir, como
         antes—, así que si esto sale en false la casa está incumpliendo su propio
         documento y hay que verlo desde fuera, no descubrirlo el día de una
         auditoría. */
      conservacionDocumentos: conservacionConfigurada(),
      /* SI ESTO ES FALSE, «SE CONSERVA CINCO ANIOS» ES «PARA SIEMPRE».
         El indice que caduca los documentos se crea al arrancar. Si falla, la
         funcion lo devolvia en un aviso por consola que nadie lee, y unas
         cedulas guardadas sin plazo no daban ninguna senial. Ahora se ve desde
         fuera, que es donde se mira cuando algo va mal. */
      caducidadActiva: caducidadPuesta,
      /* Cuántas verificaciones pesadas hay dentro y cuántas esperando. Si la
         cola sube y no baja, el servicio se está quedando corto de memoria o de
         CPU y hay que subir el plan — y esto es lo que lo dice antes de que
         empiecen los 503. */
      verificacionesDentro: cargaPesadas().dentro,
      verificacionesEnCola: cargaPesadas().enCola,
      verificacionesALaVez: cargaPesadas().aLaVez,
      ssoConfigurado: Boolean(process.env.GENESIS_SSO_SECRETO),
      /* SI EL CORREO ESTA ENCENDIDO, Y CON QUE REMITENTE.
         Va aquí porque no había forma de saberlo sin entrar al panel: quien
         pega las credenciales en Render no puede comprobar que quedaron
         bien, y un correo que no sale no se nota hasta que alguien reclama
         que nunca le avisaron de su verificación.
         Se publica el REMITENTE, que va impreso en cada correo que mandamos
         y por tanto no es secreto; la llave y el secreto no se publican ni
         en parte — /healthz es público. */
      /* CONTRA QUE CADENA LEE EL PANEL.
         Se publica porque el 20-ago el panel enseñó saldos de la cadena vieja
         y NO HABIA FORMA DE VERLO desde fuera: los números eran plausibles y
         estaban bien formados, solo eran de otro sitio. Con `cadenaCoincide`
         en false, cualquiera lo detecta sin entrar al panel. */
      rpcDelDirectorio: estadoCadenaRapido().rpc,
      cadenaEsperada: estadoCadenaRapido().cadenaEsperada,
      cadenaQueContesta: estadoCadenaRapido().cadenaQueContesta,
      cadenaCoincide: estadoCadenaRapido().coincide,
      correoEncendido: correoEncendido(),
      correoDe: correoEncendido() ? correoRemitente() : null,
      /* CUAL de las dos falta, no solo que algo falta. Con un booleano suelto
         hay que adivinar entre un nombre mal escrito, una variable pegada en
         el servicio equivocado y ninguna de las dos puestas. Van los NOMBRES
         de las variables, que no son secretos —están en este repositorio— y
         nunca su contenido ni su longitud. */
      correoFaltan: ['GENESIS_SES_LLAVE', 'GENESIS_SES_SECRETO']
        .filter((v) => !process.env[v]),
      bitacoraIntegra: cadena.integra,
      /* DÓNDE se rompió, no solo QUE se rompió.
         Publicaba `integra: false` y ninguna pista más, y así estuvo:
         quien lo leía sabía que había un problema y no podía hacer nada
         con esa información. Es el mismo fallo que el de la revisión
         previa de la app —«hay 1 problema» y la lista vacía—: una alarma
         que no dice qué pasa bloquea y no deja avanzar a quien la lee.
         Va el ÍNDICE de la entrada, nunca su contenido: /healthz es
         público y en la bitácora hay nombres de personas. */
      bitacoraRotaEn: cadena.rotaEn,
      bitacoraEntradas: cadena.total,
      // El hueco NO se esconde detrás de un sello: si la bitácora se cerró
      // alguna vez por rotura, se dice aquí y se dice dónde. Un registro de
      // cumplimiento que vuelve a verde sin dejar rastro no vale nada.
      bitacoraSellos: cadena.sellos.length,
      /* Copias exactas que el almacen escribio de mas y se apartaron al
         cargar, y sitios donde dos entradas DISTINTAS comparten el mismo
         numero de orden. Lo primero es el fallo del 20-ago, ya arreglado y
         aqui solo para verlo si vuelve; lo segundo no se toca nunca solo. */
      bitacoraCopiasApartadas: saludBitacora().copiasApartadas,
      bitacoraSitiosEnChoque: saludBitacora().sitiosEnChoque,
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
  /* El índice que caduca el archivo de documentos. Se pone en cada arranque
     —crear uno que ya existe no hace nada— para que el día que se cambie de
     base el archivo no se quede sin caducidad y nadie lo note. Sin él, «se
     conserva cinco años» sería «se conserva para siempre». */
  if (conservacionConfigurada()) {
    caducidadPuesta = await prepararCaducidad()
    console.log(caducidadPuesta
      ? '[genesis-id] archivo de documentos: cifrado y con caducidad a 5 años'
      : '[genesis-id] AVISO: archivo cifrado pero SIN índice de caducidad; no se borrarán solos')
  } else {
    console.log('[genesis-id] AVISO: sin GENESIS_ARCHIVO_CLAVE no se conservan las imágenes ' +
      'del documento — se borran al decidir, y eso contradice la política publicada')
  }

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

  /* Y una vez fuera del estado, cifrados. Va DESPUES de la mudanza a proposito:
     lo que acaba de mudarse ya sale cifrado de `guardarFoto`, y lo que queda por
     cifrar es solo lo que estaba guardado en claro de antes. */
  const cerrados = await cifrarRetratosEnClaro().catch((e) => {
    console.error('[genesis-id] no se pudieron cifrar los retratos:', e?.message)
    return null
  })
  if (cerrados && (cerrados.cifrados || cerrados.fallidos)) {
    console.log(
      `[genesis-id] retratos de credencial cifrados: ${cerrados.cifrados}, ` +
      `${cerrados.fallidos} sin cifrar`)
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

  /* Y a partir de acá se mantienen solas. Va después de cargar las listas por
     una razón concreta: la primera vuelta del temporizador REEMPLAZA lo que
     haya, y si arrancara antes de que el almacén tenga lo suyo, un fallo de
     descarga dejaría el servicio sin listas en vez de con las de ayer. */
  iniciarTemporizadorListas()

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
