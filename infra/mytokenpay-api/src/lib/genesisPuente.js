// Puente entre una app del ecosistema y Genesis ID.
//
// POR QUE HACE FALTA ESTE INTERMEDIARIO
//
// Genesis ID exige una clave de API (`X-API-Key: gid_live_…`) en todas sus
// rutas. Esa clave NO puede viajar dentro de la aplicación móvil: un APK se
// descomprime con una orden y cualquiera la extraería. Con ella podría crear
// identidades a nombre de otros y consultar perfiles.
//
// Así que la clave vive solo aquí, en el servidor de cada app, y el teléfono
// habla con su propio backend:
//
//   teléfono ──▶ backend de la app (/genesis/*) ──X-API-Key──▶ Genesis ID
//
// Este router se monta igual en el backend de Veta Wallet y en el de
// MyTokenPay; lo único que cambia es la clave que se le configura.
//
// UN SOLO PUENTE (SFSP v0.3 §11, plan 0.6)
//
// Llegó a haber TRES copias que decían cosas distintas: esta, la de
// `infra/genesis-proxy/genesis.router.js` y la reescrita en TypeScript de
// MyTokenPay. Cada una tenía rutas que a las otras les faltaban, y en las tres
// la dirección de billetera del vínculo era opcional. Ahora hay UNA lógica y
// vive en este archivo, copiado BYTE A BYTE en cada servicio que lo despliega
// (son despliegues separados; es el mismo patrón que `lib/sfsp410.js`):
//
//   infra/veta-wallet-backend/lib/genesisPuente.js     <- el canónico: se edita AQUÍ
//   infra/mytokenpay-api/src/lib/genesisPuente.js      <- copia idéntica (+ .d.ts)
//
// `infra/genesis-proxy/` queda RETIRADO: su `genesis.router.js` solo
// reexporta este archivo. `pruebas/probar-puente-genesis.mjs` (en Veta) falla
// si las copias divergen en un solo byte.
//
// COMO SE MONTA
//
//   import { routerGenesis, parserRostro } from './lib/genesisPuente.js'
//
//   app.use(['/genesis/biometria', '/genesis/foto', '/genesis/documento-fotos', '/genesis/documento/leer'], parserRostro)   // ANTES del parser general
//   app.use(bodyParser.json({ limit: '100kb' }))  // el de siempre, sin tocar
//   ...
//   app.use('/genesis', routerGenesis({ exigirSesion: miMiddlewareDeAuth, correoVerificado: (req) => … }))
//
// El orden de esas dos líneas importa y no es un detalle: el cuerpo lo parsea
// el PRIMER parser que lo alcanza, y los fotogramas del rostro pesan más que
// el límite general —que está bajo a propósito, porque ninguna otra ruta de la
// app tiene motivo para recibir un megabyte—. Si el parser general va primero,
// la verificación de identidad muere con un 413 y el usuario ve "no se pudo
// enviar la foto" sin más explicación.
//
// Variables de entorno (se leen en cada llamada y no al importar: así da igual
// si el servicio carga su `.env` antes o después de este módulo):
//   GENESIS_URL      https://genesis-id.onrender.com   (por defecto)
//   GENESIS_API_KEY  la clave de esta app, del panel de Genesis ID
//
// SOBRE `exigirSesion`
//
// Es el middleware de autenticación de la propia app. Es OBLIGATORIO: sin él,
// este puente convierte un endpoint público en una vía para crear identidades
// a nombre de cualquier correo. Cada ruta comprueba además que el usuario
// autenticado sea el dueño de la identidad que está tocando.
//
// SOBRE `correoVerificado`
//
// El puente encuentra la identidad por el CORREO de la sesión, y Genesis ID
// toma ese correo como la prueba de que la app autenticó a la dueña de la
// identidad («EL VÍNCULO ES LA LLAVE DEL SSO», genesis-id/src/routes/apps.ts).
// Esa prueba solo vale si la app comprobó que el correo es de quien lo usa, y
// no todas lo hacen: el alta de MyTokenPay acepta cualquier correo, y el login
// de Veta no exige haber pulsado el enlace de confirmación. Con el correo sin
// comprobar, quien se diera de alta con el de otra persona ataba su cuenta al
// GID de ella y pedía pases de SSO a su nombre —Ordenex, AuCorp y Ultron los
// aceptan— o le cambiaba la foto de la credencial.
//
// Así que la app dice, petición por petición, si el correo de ESA sesión está
// comprobado: `correoVerificado(req)` → true/false (o una promesa). Si no se
// pasa, el puente lo da por NO comprobado. Sin correo comprobado:
//
//   · `/vincular` y `/sso/token` no se hacen (403 CORREO_NO_VERIFICADO): son
//     las que convierten un correo en una llave para las otras apps.
//   · las rutas del trámite (`/datos`, `/documento*`, `/vivacidad`,
//     `/biometria`, `/foto`) siguen sirviendo para HACER el trámite, pero no
//     tocan una identidad que ya respondió por alguien (verificada, vencida o
//     suspendida, o con GID);
//   · `/movimientos` no se reporta sobre el GID de esa identidad.
//
// Y si la sesión sabe a qué GID está atada la cuenta (`req.usuario.gid`), esas
// mismas rutas exigen además que el correo lleve a ESE GID y no a otro.

import express, { Router } from 'express'

/**
 * Parser exclusivo de la ruta del rostro.
 *
 * Cuatro fotogramas en base64 no caben en el límite general de la app. Se le da
 * holgura solo a esta ruta y solo a ella: Genesis ID rechaza después cualquier
 * imagen suelta de más de 5 MB, que es el tope de la propia API de
 * reconocimiento, así que esta holgura solo permite mandar VARIAS, no una
 * más grande.
 */
export const parserRostro = express.json({ limit: '25mb' })

const base = () => (process.env.GENESIS_URL || 'https://genesis-id.onrender.com').replace(/\/$/, '')
const clave = () => (process.env.GENESIS_API_KEY || '').trim()

export const genesisConfigurado = () => Boolean(clave())

// ─────────────────────────────────────────────────────────────────────────────
// La dirección de billetera del vínculo
// ─────────────────────────────────────────────────────────────────────────────
//
// OBLIGATORIA (SFSP v0.3 §8.5 y §11). El límite de exposición se calcula POR
// GENESIS ID sumando lo que tienen todas las direcciones de la persona, y esa
// relación —qué direcciones son de quién— vive únicamente en los vínculos. Un
// vínculo sin dirección es una billetera que el límite no ve: la persona
// podría repartir su exposición entre cuentas y ninguna suma la alcanzaría.
// Por eso aquí no se ata nada sin dirección, y Genesis ID tampoco lo acepta.
//
// Se acepta `0x` + 40 hexadecimales, en minúsculas, en mayúsculas o con la
// suma de control EIP-55 correcta. Una mezcla de mayúsculas que NO cuadra con
// la suma de control es casi siempre una dirección copiada con un carácter
// cambiado, y se rechaza: atarla sería atar la billetera de otro (o de nadie).
// Lo que se guarda es siempre la forma en minúsculas, para que la misma
// billetera no cuente dos veces por venir escrita de dos maneras.

/**
 * Los códigos con que se rechaza un vínculo. Los dos primeros son los mismos
 * que usa Genesis ID; `DIRECCION_SIN_PRUEBA` es solo del puente: la dirección
 * vino en el cuerpo y no de la sesión (ver `/vincular`).
 */
export const CODIGOS_VINCULO = Object.freeze({
  SIN_DIRECCION: 'VINCULO_SIN_DIRECCION',
  DIRECCION_INVALIDA: 'VINCULO_DIRECCION_INVALIDA',
  DIRECCION_SIN_PRUEBA: 'VINCULO_DIRECCION_SIN_PRUEBA',
})

/** Los códigos con que el puente se niega a actuar sobre un correo que la app no comprobó. */
export const CODIGOS_CORREO = Object.freeze({
  NO_VERIFICADO: 'CORREO_NO_VERIFICADO',
  GID_AJENO: 'SESION_GID_AJENO',
})

// Los estados en que una identidad ya respondió por alguien: el GID existe y
// otras apps confían en él. Sin correo comprobado no se escribe sobre ellas.
const YA_RESPONDIO = new Set(['verificada', 'vencida', 'suspendida'])

// Keccak-256 (el de Ethereum, que NO es el SHA3-256 de `crypto`: cambia el
// relleno). Va escrito aquí para que este archivo no dependa de ningún paquete
// que un servicio tenga y otro no: tiene que ser idéntico en todos. Solo se usa
// para comprobar la suma de control de 40 caracteres, así que la velocidad da
// igual y se prefiere lo legible.
const MASCARA = (1n << 64n) - 1n
const ROTACIONES = [0, 1, 62, 28, 27, 36, 44, 6, 55, 20, 3, 10, 43, 25, 39, 41, 45, 15, 21, 8, 18, 2, 61, 56, 14]
const CONSTANTES = (() => {
  // Las constantes de ronda salen del LFSR de la especificación en vez de
  // copiarse de una tabla: una tabla con un dígito mal copiado no avisa.
  const bit = (t) => {
    if (t % 255 === 0) return 1n
    let r = 1
    for (let i = 1; i <= t % 255; i++) { r <<= 1; if (r & 0x100) r ^= 0x171 }
    return BigInt(r & 1)
  }
  const fuera = []
  for (let ronda = 0; ronda < 24; ronda++) {
    let c = 0n
    for (let j = 0; j < 7; j++) c |= bit(j + 7 * ronda) << BigInt((1 << j) - 1)
    fuera.push(c)
  }
  return fuera
})()
const rotar = (v, n) => (n === 0 ? v : ((v << BigInt(n)) | (v >> BigInt(64 - n))) & MASCARA)

function permutar(A) {
  for (let ronda = 0; ronda < 24; ronda++) {
    const C = [0, 1, 2, 3, 4].map((x) => A[x] ^ A[x + 5] ^ A[x + 10] ^ A[x + 15] ^ A[x + 20])
    for (let x = 0; x < 5; x++) {
      const D = C[(x + 4) % 5] ^ rotar(C[(x + 1) % 5], 1)
      for (let y = 0; y < 25; y += 5) A[x + y] ^= D
    }
    const B = new Array(25)
    for (let x = 0; x < 5; x++) {
      for (let y = 0; y < 5; y++) B[y + 5 * ((2 * x + 3 * y) % 5)] = rotar(A[x + 5 * y], ROTACIONES[x + 5 * y])
    }
    for (let x = 0; x < 5; x++) {
      for (let y = 0; y < 25; y += 5) A[x + y] = B[x + y] ^ (~B[((x + 1) % 5) + y] & MASCARA & B[((x + 2) % 5) + y])
    }
    A[0] ^= CONSTANTES[ronda]
  }
}

/** Keccak-256 de un texto, en hexadecimal. */
export function keccak256Hex(texto) {
  const TASA = 136
  const bytes = Array.from(Buffer.from(String(texto), 'utf8'))
  bytes.push(0x01)
  while (bytes.length % TASA) bytes.push(0)
  bytes[bytes.length - 1] |= 0x80
  const A = new Array(25).fill(0n)
  for (let desde = 0; desde < bytes.length; desde += TASA) {
    for (let i = 0; i < TASA / 8; i++) {
      let carril = 0n
      for (let b = 7; b >= 0; b--) carril = (carril << 8n) | BigInt(bytes[desde + i * 8 + b])
      A[i] ^= carril
    }
    permutar(A)
  }
  let hex = ''
  for (let i = 0; i < 4; i++) {
    for (let b = 0; b < 8; b++) hex += Number((A[i] >> BigInt(8 * b)) & 0xffn).toString(16).padStart(2, '0')
  }
  return hex
}

/**
 * La dirección en minúsculas, o `null` si no es una dirección de billetera
 * válida. La dirección cero tampoco vale: no es de nadie.
 */
export function normalizarDireccion(valor) {
  if (typeof valor !== 'string') return null
  const d = valor.trim()
  if (!/^0x[0-9a-fA-F]{40}$/.test(d)) return null
  const cuerpo = d.slice(2)
  const minus = cuerpo.toLowerCase()
  if (/^0+$/.test(minus)) return null
  if (cuerpo !== minus && cuerpo !== cuerpo.toUpperCase()) {
    const suma = keccak256Hex(minus)
    for (let i = 0; i < 40; i++) {
      const c = cuerpo[i]
      if (!/[a-fA-F]/.test(c)) continue
      const debeSerMayuscula = parseInt(suma[i], 16) >= 8
      if ((c === c.toUpperCase()) !== debeSerMayuscula) return null
    }
  }
  return '0x' + minus
}

async function llamar(ruta, opciones = {}) {
  const CLAVE = clave()
  if (!CLAVE) {
    return { ok: false, estado: 503, cuerpo: { error: 'GENESIS_API_KEY no está configurada en este servidor' } }
  }
  const control = new AbortController()
  const temporizador = setTimeout(() => control.abort(), 25000)
  try {
    const r = await fetch(base() + ruta, {
      ...opciones,
      signal: control.signal,
      headers: { 'Content-Type': 'application/json', 'X-API-Key': CLAVE, ...(opciones.headers || {}) },
    })
    const cuerpo = await r.json().catch(() => ({}))
    return { ok: r.ok, estado: r.status, cuerpo }
  } catch (e) {
    return {
      ok: false,
      estado: 504,
      cuerpo: { error: e?.name === 'AbortError' ? 'Genesis ID no respondió a tiempo' : 'No se pudo contactar con Genesis ID' },
    }
  } finally {
    clearTimeout(temporizador)
  }
}

/**
 * @param exigirSesion      middleware de la app que deja `req.usuario` con al
 *                          menos { email } del usuario autenticado
 * @param correoVerificado  (req) => boolean | Promise<boolean>: ¿la app comprobó
 *                          que el correo de esta sesión es de quien la usa? Sin
 *                          ella, se da por NO comprobado (ver arriba).
 */
export function routerGenesis({ exigirSesion, correoVerificado } = {}) {
  if (typeof exigirSesion !== 'function') {
    throw new Error(
      'routerGenesis necesita el middleware de sesión de la app. Sin él, cualquiera podría ' +
      'crear identidades a nombre de otros correos.',
    )
  }
  if (correoVerificado !== undefined && typeof correoVerificado !== 'function') {
    throw new Error('correoVerificado tiene que ser una función (req) => boolean')
  }

  const router = Router()
  router.use(exigirSesion)

  const responder = (res) => (r) => res.status(r.estado).json(r.cuerpo)

  /** ¿Puede esta sesión hablar con la autoridad de su correo? Solo un `true` vale. */
  async function correoDeFiar(req) {
    if (!correoVerificado) return false
    try {
      return (await correoVerificado(req)) === true
    } catch {
      return false
    }
  }

  /** La cuenta sabe a qué GID está atada, y el correo lleva a OTRO (o a ninguno). */
  const gidAjeno = (req, identidad) => Boolean(req.usuario.gid) && identidad?.gid !== req.usuario.gid

  /**
   * ¿Puede esta sesión actuar sobre `identidad` con la autoridad de su correo?
   * Devuelve null si puede, o el código con que se le niega.
   */
  async function sinAutoridad(req, identidad) {
    if (!(await correoDeFiar(req))) return CODIGOS_CORREO.NO_VERIFICADO
    if (gidAjeno(req, identidad)) return CODIGOS_CORREO.GID_AJENO
    return null
  }

  const negar = (res, codigo) => res.status(403).json({
    error: codigo === CODIGOS_CORREO.GID_AJENO
      ? 'Esta cuenta está atada a otra identidad de Genesis ID'
      : 'Esta cuenta todavía no ha comprobado que el correo sea tuyo. Entrá con tu Genesis ID para hacerlo.',
    codigo,
  })

  /**
   * La identidad sobre la que va a escribir una ruta del trámite, o null si ya
   * se contestó. Sin correo comprobado solo se escribe mientras la identidad
   * está a medio trámite: una que ya respondió por alguien no se toca.
   */
  async function identidadParaEscribir(req, res) {
    const identidad = await identidadDe(req.usuario.email)
    if (!identidad) {
      res.status(404).json({ error: 'Identidad no encontrada' })
      return null
    }
    if (identidad.gid || YA_RESPONDIO.has(identidad.estado)) {
      const codigo = await sinAutoridad(req, identidad)
      if (codigo) {
        negar(res, codigo)
        return null
      }
    }
    return identidad
  }

  /**
   * Estado del trámite del usuario autenticado.
   * Crea la identidad si aún no existe, para que la app siempre tenga algo que
   * mostrar sin necesitar una llamada aparte.
   */
  // `/status` es el nombre con el que la web ya lo pedía (venía de la copia de
  // genesis-proxy); se aceptan los dos para que ninguna versión publicada se
  // quede sin respuesta.
  router.get(['/estado', '/status'], async (req, res) => {
    const email = req.usuario.email
    const existente = await llamar(`/api/v1/identidades/por-email/${encodeURIComponent(email)}`)
    if (existente.ok) return res.json(existente.cuerpo)
    const creada = await llamar('/api/v1/identidades', { method: 'POST', body: JSON.stringify({ email }) })
    responder(res)(creada)
  })

  /** El GID de esta sesion, SIN crear nada.
   *
   * `/estado` crea la identidad si no existe —es lo que quiere la app al abrir
   * el registro—. El relevo del chat necesita lo contrario: preguntar si esta
   * persona esta verificada y cual es su GID, y si no hay identidad, que no
   * aparezca una «iniciada» por haber preguntado. Sin esta ruta, cada alta
   * del chat de alguien sin Genesis dejaba una identidad vacia en el motor.
   * Devuelve {estado, gid} o 404. Nada mas: el chat no necesita el expediente. */
  router.get('/gid', async (req, res) => {
    const r = await llamar(`/api/v1/identidades/por-email/${encodeURIComponent(req.usuario.email)}`)
    if (!r.ok || !r.cuerpo) return res.status(404).json({ error: 'sin identidad' })
    const idn = r.cuerpo.identidad || r.cuerpo
    return res.json({ estado: idn.estado || null, gid: idn.gid || null })
  })

  /** Foto de la credencial: la unica imagen que Genesis ID conserva. */
  router.post('/foto', async (req, res) => {
    const idn = (await identidadParaEscribir(req, res))?.id
    if (!idn) return
    responder(res)(await llamar(`/api/v1/identidades/${idn}/foto`, {
      method: 'POST', body: JSON.stringify({ foto: req.body?.foto }),
    }))
  })

  /** Datos que declara la persona sobre sí misma, incluido el perfil AML. */
  router.post('/datos', async (req, res) => {
    const idn = (await identidadParaEscribir(req, res))?.id
    if (!idn) return
    const b = req.body ?? {}
    responder(res)(await llamar(`/api/v1/identidades/${idn}/datos`, {
      method: 'POST',
      body: JSON.stringify({
        nombreCompleto: b.nombreCompleto,
        fechaNacimiento: b.fechaNacimiento,
        paisResidencia: b.paisResidencia,
        telefono: b.telefono,
        direccion: b.direccion,
        ocupacion: b.ocupacion,
        origenFondos: b.origenFondos,
        propositoCuenta: b.propositoCuenta,
        volumenEsperadoUsd: b.volumenEsperadoUsd,
        pepDeclarado: b.pepDeclarado,
      }),
    }))
  })

  /**
   * MRZ del documento, ya leída en el teléfono.
   *
   * Se manda el texto y no la fotografía a propósito: así la imagen del
   * documento no viaja por la red ni queda almacenada en ningún servidor, que
   * es un dato personal menos en riesgo por cada usuario.
   */
  router.post('/documento', async (req, res) => {
    const idn = (await identidadParaEscribir(req, res))?.id
    if (!idn) return
    responder(res)(await llamar(`/api/v1/identidades/${idn}/documento`, {
      method: 'POST', body: JSON.stringify({ mrz: req.body?.mrz, textoAnverso: req.body?.textoAnverso }),
    }))
  })

  /**
   * El documento como dos fotos, para quien se verifica desde un navegador.
   *
   * En el telefono la zona de lectura mecanica la lee ML Kit y aqui arriba solo
   * viaja el texto, que es un dato personal menos en riesgo. En un navegador
   * ese lector no existe, y pedirle a la gente que teclee a mano las cuarenta y
   * cuatro columnas de su pasaporte era pedir un imposible: el tramite se caia
   * ahi. Asi que por la web suben las dos caras y las lee una persona.
   */
  router.post('/documento-fotos', async (req, res) => {
    const idn = (await identidadParaEscribir(req, res))?.id
    if (!idn) return
    const r = await llamar(`/api/v1/identidades/${idn}/documento-fotos`, {
      method: 'POST',
      body: JSON.stringify({ anverso: req.body?.anverso, reverso: req.body?.reverso }),
    })
    /* Genesis ID y esta aplicacion se despliegan por separado, asi que puede
       haber un rato —o un vuelta atras— en que este puente ya sepa mandar las
       dos caras y el motor todavia no sepa recibirlas. Un 404 crudo llegaria a
       la pantalla como «no se encontro tu identidad», que es mentira y ademas
       asusta. Se traduce a un motivo que la web sabe explicar. */
    if (r.estado === 404) {
      return res.status(503).json({
        error: 'La revisión del documento por fotografías todavía no está disponible',
        motivo: 'genesis-sin-fotos',
      })
    }
    responder(res)(r)
  })

  /**
   * Lee el REVERSO desde su foto, sin adjuntar nada.
   *
   * Genesis ID saca el texto con Rekognition, rescata la zona mecánica con sus
   * dígitos de control y descarta la imagen; devuelve la MRZ y lo que dice
   * para que la web lo enseñe y la persona lo confirme. Sin lector en Genesis
   * responde 503 con `motivo: 'sin-lector'` y la web ofrece teclear las
   * líneas. Montar `parserRostro` también en esta ruta: la foto pesa más que
   * el límite general.
   */
  router.post('/documento/leer', async (req, res) => {
    const idn = (await identidadParaEscribir(req, res))?.id
    if (!idn) return
    const r = await llamar(`/api/v1/identidades/${idn}/documento/leer`, {
      method: 'POST', body: JSON.stringify({ imagen: req.body?.imagen }),
    })
    // Un Genesis anterior sin la ruta: se traduce a «sin lector», que la web
    // ya sabe explicar, en vez de un 404 que suena a «no existís».
    if (r.estado === 404) return res.status(503).json({ error: 'Lector no disponible', motivo: 'sin-lector' })
    responder(res)(r)
  })

  /**
   * Pide el reto de vivacidad.
   *
   * La secuencia de gestos la sortea Genesis ID, no la app: si la eligiera el
   * cliente, quien controle el teléfono elegiría la que ya tiene grabada.
   */
  router.post('/vivacidad', async (req, res) => {
    const idn = (await identidadParaEscribir(req, res))?.id
    if (!idn) return
    responder(res)(await llamar(`/api/v1/identidades/${idn}/vivacidad`, { method: 'POST' }))
  })

  router.post('/biometria', async (req, res) => {
    const idn = (await identidadParaEscribir(req, res))?.id
    if (!idn) return
    responder(res)(await llamar(`/api/v1/identidades/${idn}/biometria`, {
      method: 'POST',
      body: JSON.stringify({
        selfie: req.body?.selfie,
        fotoDocumento: req.body?.fotoDocumento,
        reto: req.body?.reto,
        fotogramas: req.body?.fotogramas,
      }),
    }))
  })

  /**
   * Ata la cuenta de esta app al GID del usuario, CON su dirección de billetera.
   *
   * La dirección sale SOLO de la sesión (Veta la tiene en el JWT: la billetera
   * custodiada que genera su servidor). Una dirección que llega en el cuerpo no
   * prueba nada —cualquiera escribe la de otro, la de una tesorería o la de una
   * estafa— y Genesis ID la publicaría como «identidad verificada» de ese GID
   * (`/api/v1/direccion/:dir`, lo que enseña OrdenScan). Así que se rechaza con
   * su propio código. Ninguna app publicada la mandaba por necesidad: la de
   * MyTokenPay llama con `{}`, y la web de Veta manda la de su sesión, que es la
   * que se usa. MyTokenPay ata su cuenta en `/api/auth/sso` con la dirección que
   * Genesis ya conoce de la identidad.
   *
   * Sin dirección válida no hay vínculo (ver `normalizarDireccion`), y sin
   * correo comprobado tampoco (ver `correoVerificado`). Las dos cosas se
   * comprueban ANTES de hablar con Genesis ID.
   */
  router.post('/vincular', async (req, res) => {
    const candidata = req.usuario.address || null
    if (!candidata) {
      const traida = req.body?.direccion
      return res.status(422).json(traida
        ? {
            error: 'La dirección de la billetera tiene que venir de tu sesión, no de la petición',
            codigo: CODIGOS_VINCULO.DIRECCION_SIN_PRUEBA,
          }
        : {
            error: 'Hace falta la dirección de la billetera para vincular la cuenta',
            codigo: CODIGOS_VINCULO.SIN_DIRECCION,
          })
    }
    const direccion = normalizarDireccion(candidata)
    if (!direccion) {
      return res.status(422).json({
        error: 'La dirección de la billetera no es válida (0x y 40 caracteres hexadecimales)',
        codigo: CODIGOS_VINCULO.DIRECCION_INVALIDA,
      })
    }
    if (!(await correoDeFiar(req))) return negar(res, CODIGOS_CORREO.NO_VERIFICADO)
    const identidad = await identidadDe(req.usuario.email)
    if (!identidad) return res.status(404).json({ error: 'Identidad no encontrada' })
    if (gidAjeno(req, identidad)) return negar(res, CODIGOS_CORREO.GID_AJENO)
    responder(res)(await llamar('/api/v1/vinculos', {
      method: 'POST',
      body: JSON.stringify({
        identidadId: identidad.id,
        // La cuenta la fija el servidor a partir de la sesión, nunca el cuerpo
        // de la petición: si viniera del cliente, alguien podría atar su GID a
        // la cuenta de otro.
        cuenta: req.usuario.id || req.usuario.email,
        // El correo prueba ante Genesis ID que esta app autenticó a la persona
        // dueña de esa identidad: sin él, cualquier clave de API podía atar su
        // cuenta al expediente de cualquiera y pedir tokens de SSO a su nombre.
        // Por eso solo se manda si la app lo comprobó (`correoVerificado`).
        email: req.usuario.email,
        direccion,
      }),
    }))
  })

  /**
   * Token de sesión única para entrar en otra app del ecosistema sin repetir
   * el KYC.
   */
  router.post('/sso/token', async (req, res) => {
    // Un pase de SSO abre sesión en las otras apps del ecosistema con este GID:
    // sin correo comprobado no se pide, ni siquiera se pregunta por el GID.
    if (!(await correoDeFiar(req))) return negar(res, CODIGOS_CORREO.NO_VERIFICADO)
    const identidad = await identidadDe(req.usuario.email)
    const gid = identidad?.gid
    if (!gid) return res.status(403).json({ error: 'Todavía no hay una identidad verificada' })
    if (gidAjeno(req, identidad)) return negar(res, CODIGOS_CORREO.GID_AJENO)
    responder(res)(await llamar('/api/v1/sso/token', {
      method: 'POST',
      body: JSON.stringify({ gid, cuenta: req.usuario.id || req.usuario.email }),
    }))
  })

  /**
   * La dirección de billetera que Genesis ID conoce de la identidad del usuario.
   *
   * Sale de los vínculos del GID (la registra Veta Wallet al vincular). Sirve
   * para que «Conectar billetera» no le pida a la persona teclear una dirección
   * que el ecosistema ya tiene. Venía de la copia de MyTokenPay.
   */
  router.get('/billetera', async (req, res) => {
    const perfil = await llamar(`/api/v1/identidades/por-email/${encodeURIComponent(req.usuario.email)}`)
    const gid = perfil.cuerpo?.identidad?.gid
    if (!gid) return res.json({ direccion: null, gid: null })
    const r = await llamar(`/api/v1/gid/${encodeURIComponent(gid)}`)
    const apps = r.ok && Array.isArray(r.cuerpo?.apps) ? r.cuerpo.apps : []
    const direccion =
      apps.find((a) => a && a.app === 'veta-wallet' && a.direccion)?.direccion ??
      apps.find((a) => a && a.direccion)?.direccion ??
      null
    res.json({ direccion, gid })
  })

  /**
   * Comprueba si una dirección está sancionada.
   *
   * Conviene llamarlo ANTES de firmar cualquier envío: es el control más
   * directo que tiene el ecosistema, y evita que la wallet mande fondos a una
   * dirección de una lista.
   */
  router.get('/tamiz/:direccion', async (req, res) => {
    responder(res)(await llamar(`/api/v1/tamiz/direccion/${encodeURIComponent(req.params.direccion)}`))
  })

  /** Movimientos para el monitoreo AML. Nunca se le dice al usuario si saltó algo. */
  router.post('/movimientos', async (req, res) => {
    const identidad = await identidadDe(req.usuario.email)
    const gid = identidad?.gid
    if (!gid) return res.json({ ok: true, omitido: 'sin GID verificado' })
    // Sin correo comprobado no se le cargan movimientos al monitoreo de ESE GID:
    // podrían ser de otra persona. La respuesta es la misma que sin GID.
    if (await sinAutoridad(req, identidad)) return res.json({ ok: true, omitido: 'sin GID verificado' })
    await llamar('/api/v1/movimientos', {
      method: 'POST',
      body: JSON.stringify({ gid, movimientos: req.body?.movimientos ?? [] }),
    })
    res.json({ ok: true })
  })

  /** La identidad de ese correo según Genesis ID ({ id, gid, estado, … }), o null. */
  async function identidadDe(email) {
    const r = await llamar(`/api/v1/identidades/por-email/${encodeURIComponent(email)}`)
    const identidad = r.ok ? r.cuerpo?.identidad : null
    return identidad && identidad.id ? identidad : null
  }

  return router
}
