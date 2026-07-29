import { Router } from 'express'
import { startIdentity, setPassportData, findIdentityByEmail } from '../engine.js'

// ============================================================
// Puente con el portal oficial de Genesis ID (genesisid.online).
//
// La API key (X-API-Key: gid_live_…) vive SOLO en el servidor, nunca en la
// app: un APK se descomprime y cualquiera podría extraerla. Las apps del
// ecosistema llaman a estas rutas y el servidor habla con el portal.
//
// Configura en el host (Render → Environment):
//   GENESIS_PORTAL_API=https://www.genesisid.online
//   GENESIS_API_KEY=gid_live_xxxxxxxxxxxxxxxxxxxx
// ============================================================

export const portalRouter = Router()

const PORTAL_API = (process.env.GENESIS_PORTAL_API || 'https://www.genesisid.online').replace(/\/$/, '')

// La clave se limpia al leerla: al pegarla en el panel del host es fácil que
// se cuelen espacios o un salto de línea al final.
const API_KEY = (process.env.GENESIS_API_KEY || '').trim()

export const portalConfigured = () => Boolean(API_KEY)

/**
 * Revisa que la clave se pueda usar como cabecera HTTP.
 *
 * Una cabecera solo admite bytes (0-255). Si la clave trae un carácter como
 * «…» —lo que pasa cuando se copia una versión abreviada del tipo
 * `gid_live_xxxx…`— fetch lanza un TypeError ANTES de salir a la red, y el
 * síntoma que se veía era "no se pudo contactar el portal", que apunta al
 * sitio equivocado. Mejor detectarlo aquí y decir exactamente qué pasa.
 */
export function revisarClave(k = API_KEY) {
  if (!k) return { ok: false, problema: 'GENESIS_API_KEY no está configurada en el servidor.' }

  for (let i = 0; i < k.length; i++) {
    const cp = k.codePointAt(i)!
    if (cp > 255) {
      const nombre = cp === 0x2026 ? '… (puntos suspensivos)' : `«${String.fromCodePoint(cp)}»`
      return {
        ok: false,
        problema: `La clave contiene ${nombre} en la posición ${i}. Eso pasa al copiar una versión ABREVIADA de la clave (gid_live_xxxx…). Copia la clave completa desde el portal y vuelve a guardarla.`,
      }
    }
    if (cp < 32 || cp === 127) {
      return { ok: false, problema: `La clave contiene un carácter de control en la posición ${i}. Vuelve a pegarla sin saltos de línea.` }
    }
    if (cp > 0xffff) i++ // pares suplentes
  }
  if (/\s/.test(k)) return { ok: false, problema: 'La clave contiene espacios. Vuelve a pegarla completa, sin espacios.' }
  if (!k.startsWith('gid_')) return { ok: false, problema: 'La clave no empieza por "gid_". Revisa que sea la clave del portal y no otro valor.' }
  return { ok: true as const, problema: null }
}

const TIMEOUT_MS = Number(process.env.GENESIS_PORTAL_TIMEOUT_MS || 30000)

// Rutas del portal. Se pueden cambiar por variable de entorno sin tocar el
// código: si el portal las mueve, basta con actualizarlas en el host.
// Descúbrelas con GET /api/portal/discover.
const PATHS = {
  userStatus: process.env.GENESIS_PATH_USER_STATUS || '/api/apps/user-status',
  register: process.env.GENESIS_PATH_REGISTER || '/api/apps/register-app',
  tokenValidate: process.env.GENESIS_PATH_TOKEN_VALIDATE || '/api/apps/token-validate',
}

/**
 * Traduce el fallo de un fetch a algo accionable. Sin esto, cualquier
 * problema de red se veía como un 502 con el mismo texto genérico y era
 * imposible saber si el portal estaba caído, si el DNS no resolvía o si
 * simplemente tardaba más que el tiempo de espera.
 */
function motivoDeFallo(e: any) {
  const code = e?.cause?.code || e?.code || null
  const mapa: Record<string, string> = {
    ENOTFOUND: 'El dominio del portal no resuelve en DNS. Revisa GENESIS_PORTAL_API.',
    EAI_AGAIN: 'Fallo temporal de DNS al resolver el portal.',
    ECONNREFUSED: 'El portal rechazó la conexión (servicio caído o puerto cerrado).',
    ECONNRESET: 'El portal cortó la conexión a mitad de la respuesta.',
    ETIMEDOUT: 'El portal no respondió a tiempo.',
    CERT_HAS_EXPIRED: 'El certificado TLS del portal está vencido.',
    UNABLE_TO_VERIFY_LEAF_SIGNATURE: 'No se pudo verificar el certificado TLS del portal.',
    DEPTH_ZERO_SELF_SIGNED_CERT: 'El portal usa un certificado autofirmado.',
  }
  if (e?.name === 'AbortError') {
    return { code: 'TIMEOUT', reason: `El portal no respondió en ${TIMEOUT_MS / 1000} s.` }
  }
  return { code: code || e?.name || 'UNKNOWN', reason: (code && mapa[code]) || String(e?.message || e) }
}

async function callPortal(path: string, body: unknown) {
  // Si la clave no sirve como cabecera, se dice aquí: antes el fetch fallaba
  // con un TypeError que se leía como "el portal no responde".
  const clave = revisarClave()
  if (!clave.ok) {
    return { ok: false as const, status: 503, data: { error: 'Clave del portal inválida', reason: clave.problema }, ms: 0 }
  }
  // Un intento y un reintento: los servicios que duermen (Render/Vercel free)
  // suelen fallar el primer golpe y responder bien al segundo.
  let ultimo: any = null
  for (let intento = 0; intento < 2; intento++) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
    const t0 = Date.now()
    try {
      const res = await fetch(`${PORTAL_API}${path}`, {
        method: 'POST',
        signal: ctrl.signal,
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'X-API-Key': API_KEY,
        },
        body: JSON.stringify(body ?? {}),
      })
      const texto = await res.text()
      let data: any
      try { data = texto ? JSON.parse(texto) : {} } catch { data = { noJson: texto.slice(0, 400) } }
      return { ok: res.ok, status: res.status, data, ms: Date.now() - t0 }
    } catch (e) {
      const { code, reason } = motivoDeFallo(e)
      ultimo = {
        ok: false as const,
        status: 502,
        data: { error: 'No se pudo contactar el portal Genesis ID', code, reason, url: `${PORTAL_API}${path}` },
        ms: Date.now() - t0,
      }
      // Un DNS que no resuelve no mejora reintentando.
      if (code === 'ENOTFOUND') break
    } finally {
      clearTimeout(timer)
    }
  }
  return ultimo
}

const esBilletera = (v: any) => /^0x[a-fA-F0-9]{40}$/.test(String(v || '').trim())

// Toma el primer valor no vacío entre varios nombres posibles de campo.
const pick = (o: any, ...keys: string[]) => {
  for (const k of keys) {
    const v = o?.[k]
    if (v !== undefined && v !== null && String(v).trim() !== '') return v
  }
  return null
}

// Normaliza lo que devuelva el portal a un pasaporte del ecosistema.
// Acepta el objeto plano o anidado (user/identity/data/profile/passport) y
// los nombres de campo más habituales, para no depender de un contrato exacto.
function toPassport(raw: any): any {
  if (!raw || typeof raw !== 'object') return null
  const src = raw.user || raw.identity || raw.data || raw.profile || raw.passport || raw
  // Si viene doblemente anidado (p. ej. { data: { user: {...} } }).
  const s = (src.user || src.identity || src.passport || src) as any

  const genesisUid = pick(s, 'genesisUid', 'gid', 'uid', 'genesis_uid', 'genesisId', 'genesis_id', 'GID')
  // Sin UID no hay pasaporte: no devolvemos un objeto lleno de nulls.
  if (!genesisUid) return null

  const statusRaw = String(pick(s, 'status', 'state', 'verificationStatus', 'kycStatus') || '').toLowerCase()
  const verified = statusRaw.includes('verif') || statusRaw.includes('approve') || statusRaw === 'active'
    || statusRaw === 'complete' || statusRaw === 'completed' || s.verified === true || s.isVerified === true

  // El portal manda el nombre partido en dos campos. Sin componerlo aquí, el
  // pasaporte llegaba sin titular y la app terminaba mostrando el nombre
  // deducido del correo (info@… → "Info").
  const partes = [
    pick(s, 'firstName', 'first_name', 'givenName', 'given_name', 'nombres'),
    pick(s, 'lastName', 'last_name', 'familyName', 'family_name', 'surname', 'apellidos'),
  ].filter(Boolean)

  return {
    genesisUid: String(genesisUid),
    fullName: pick(s, 'fullName', 'name', 'full_name', 'fullname', 'legalName', 'displayName', 'nombre')
      || (partes.length ? partes.join(' ') : null),
    email: pick(s, 'email', 'correo', 'mail'),
    documentId: pick(s, 'documentId', 'document', 'documentNumber', 'document_number', 'dni', 'idNumber', 'identity'),
    nationality: pick(s, 'nationality', 'country', 'nacionalidad', 'pais', 'countryCode'),
    birthDate: pick(s, 'birthDate', 'dob', 'dateOfBirth', 'birth_date', 'fechaNacimiento'),
    phone: pick(s, 'phone', 'phoneNumber', 'phone_number', 'telefono', 'mobile', 'celular'),
    address: pick(s, 'residence', 'homeAddress', 'home_address', 'addressLine', 'address_line', 'direccion', 'domicilio', 'city')
      || (esBilletera(s?.address) ? null : pick(s, 'address')),
    photoUrl: pick(s, 'photoUrl', 'photo', 'photo_url', 'avatar', 'avatarUrl', 'selfieUrl', 'selfie', 'picture', 'image', 'imageUrl', 'foto'),
    // 'address' se reparte según su forma: si parece 0x… es la billetera, y
    // si no, es el domicilio del titular. Antes cualquier domicilio acababa
    // guardado como dirección on-chain.
    walletAddress: pick(s, 'walletAddress', 'wallet', 'wallet_address')
      || (esBilletera(s?.address) ? String(s.address).trim() : null),
    status: verified ? 'verified' : statusRaw.includes('review') || statusRaw.includes('pending') ? 'review' : (statusRaw || 'pending'),
    raw: s,
  }
}

// Guarda el pasaporte en el motor local para que el admin lo muestre.
function persist(email: string, p: ReturnType<typeof toPassport>, walletAddress?: string) {
  if (!p || !email) return
  startIdentity(email, p.fullName ?? undefined, walletAddress ?? p.walletAddress ?? undefined)
  if (p.genesisUid && p.status === 'verified') {
    setPassportData(email, {
      genesisUid: p.genesisUid,
      fullName: p.fullName ?? undefined,
      documentId: p.documentId ?? undefined,
      nationality: p.nationality ?? undefined,
      birthDate: p.birthDate ?? undefined,
      photoUrl: p.photoUrl ?? undefined,
      walletAddress: walletAddress ?? p.walletAddress ?? undefined,
    })
  }
}

/** ¿Está configurado el puente con el portal? */
portalRouter.get('/status', (_req, res) => {
  const clave = revisarClave()
  res.json({
    configured: portalConfigured() && clave.ok,
    portal: PORTAL_API,
    ...(clave.ok ? {} : { problemaConLaClave: clave.problema }),
  })
})

/**
 * Diagnóstico: muestra QUÉ CAMPOS devuelve el portal, sin exponer los datos
 * (los valores van enmascarados). Sirve para mapear nombres de campo cuando
 * el pasaporte llega incompleto.
 *   GET /api/portal/inspect?email=tu@correo.com
 */
/**
 * ¿Se puede llegar al portal desde este servidor? Prueba la raíz y las tres
 * rutas de la integración y dice qué responde cada una, cuánto tarda y — si
 * falla — por qué. Es lo primero que hay que mirar cuando el pasaporte no
 * llega: separa "el portal no contesta" de "el portal contesta otra cosa".
 *   GET /api/portal/ping
 */
portalRouter.get('/ping', async (_req, res) => {
  const rutas = [PATHS.userStatus, PATHS.register, PATHS.tokenValidate]

  // Raíz con GET: comprueba DNS + TLS + que el host esté vivo, sin la clave.
  const raiz = await (async () => {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
    const t0 = Date.now()
    try {
      const r = await fetch(PORTAL_API, { method: 'GET', signal: ctrl.signal, redirect: 'manual' })
      return { alcanzable: true, httpStatus: r.status, server: r.headers.get('server'), ms: Date.now() - t0 }
    } catch (e) {
      const { code, reason } = motivoDeFallo(e)
      return { alcanzable: false, code, reason, ms: Date.now() - t0 }
    } finally { clearTimeout(timer) }
  })()

  // Radiografía de la clave sin revelarla: longitud, prefijo y si es usable.
  const clave = revisarClave()
  const claveInfo = {
    valida: clave.ok,
    longitud: API_KEY.length,
    empiezaPor: API_KEY.slice(0, 9) || null,
    ...(clave.ok ? {} : { problema: clave.problema }),
  }

  const endpoints: Record<string, any> = {}
  if (clave.ok) {
    for (const p of rutas) {
      const r = await callPortal(p, { ping: true, app: 'veta-wallet' })
      endpoints[p] = {
        httpStatus: r.status,
        ms: r.ms,
        // 401/403 aquí es BUENA señal: significa que el portal contestó.
        // 404 = la ruta no existe en el portal. 502 = ni siquiera respondió.
        lectura:
          r.status === 502 ? 'el portal no respondió'
            : r.status === 404 ? 'esa ruta no existe en el portal'
              : r.status === 401 || r.status === 403 ? 'el portal respondió pero rechazó la clave'
                : r.status >= 500 ? 'el portal respondió con un error interno'
                  : 'el portal respondió',
        respuesta: r.data,
      }
    }
  }

  res.json({
    portal: PORTAL_API,
    clave: claveInfo,
    timeoutMs: TIMEOUT_MS,
    raiz,
    endpoints,
    siguiente: !clave.ok
      ? `Arregla primero la clave: ${clave.problema}`
      : raiz.alcanzable
        ? 'El servidor sí llega al portal: mira el httpStatus de cada ruta.'
        : `Este servidor NO llega a ${PORTAL_API} (${(raiz as any).code}). Revisa que el dominio y el servicio estén arriba.`,
  })
})

/**
 * Descubridor de rutas. Cuando el portal responde 404 con HTML, la ruta que
 * tenemos configurada no existe en ese host. Esto prueba las variantes más
 * probables (y el host con y sin www) y dice cuál contesta algo que no sea
 * un 404, para configurarla sin adivinar.
 *   GET /api/portal/discover
 */
portalRouter.get('/discover', async (req, res) => {
  const clave = revisarClave()
  if (!clave.ok) return res.status(503).json({ error: 'Clave del portal inválida', reason: clave.problema })

  // ?paths=/api/x,/api/y prueba rutas concretas. Sirve para comprobar al
  // instante la ruta real del portal, sin esperar a un redespliegue.
  const sueltas = String(req.query.paths || '')
    .split(',').map((s) => s.trim()).filter(Boolean)
    .map((s) => (s.startsWith('/') ? s : `/${s}`))

  const candidatas: Record<string, string[]> = sueltas.length ? { rutasQuePediste: sueltas } : {
    userStatus: [
      '/api/apps/user-status', '/api/apps/user_status', '/api/apps/userStatus', '/api/apps/status',
      '/api/app/user-status', '/api/v1/apps/user-status', '/api/user-status', '/api/users/status',
      '/api/external/user-status', '/api/partners/user-status', '/api/integrations/user-status',
      '/apps/user-status', '/api/apps/verify-user',
    ],
    register: [
      '/api/apps/register-app', '/api/apps/register', '/api/apps/register_app', '/api/app/register-app',
      '/api/v1/apps/register-app', '/api/register-app', '/apps/register-app',
    ],
    tokenValidate: [
      '/api/apps/token-validate', '/api/apps/validate-token', '/api/apps/token_validate',
      '/api/apps/token/validate', '/api/v1/apps/token-validate', '/api/token-validate', '/apps/token-validate',
    ],
  }

  // El host puede estar publicado con o sin www: se prueban ambos.
  const hosts = [PORTAL_API]
  const alt = PORTAL_API.includes('://www.')
    ? PORTAL_API.replace('://www.', '://')
    : PORTAL_API.replace('://', '://www.')
  if (alt !== PORTAL_API) hosts.push(alt)

  // Se prueba POST y GET: si la ruta existiera pero con otro método, el
  // portal respondería 405 en vez de 404, y eso ya sería una pista.
  const probar = async (host: string, path: string, method: 'POST' | 'GET') => {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 12000)
    try {
      const r = await fetch(`${host}${path}`, {
        method,
        signal: ctrl.signal,
        headers: {
          Accept: 'application/json',
          'X-API-Key': API_KEY,
          ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}),
        },
        body: method === 'POST' ? JSON.stringify({ ping: true, app: 'veta-wallet' }) : undefined,
      })
      const texto = (await r.text()).slice(0, 200)
      const esHtml = /^\s*</.test(texto)
      return { method, status: r.status, tipo: esHtml ? 'html' : 'json', muestra: esHtml ? null : texto }
    } catch (e) {
      return { method, status: 0, tipo: 'error', muestra: motivoDeFallo(e).code }
    } finally { clearTimeout(timer) }
  }

  const resultado: Record<string, any> = {}
  const encontradas: Record<string, string> = {}

  for (const [grupo, rutas] of Object.entries(candidatas)) {
    const filas: any[] = []
    for (const host of hosts) {
      for (const path of rutas) {
        for (const method of ['POST', 'GET'] as const) {
          const r = await probar(host, path, method)
          if (r.status === 404 || r.status === 0) continue
          // Que responda no basta: una página web también responde. Solo
          // sirve si devuelve JSON.
          const esApi = r.tipo === 'json'
          filas.push({
            host,
            path,
            ...r,
            lectura: esApi
              ? (r.status < 300 ? 'API JSON — esta sirve' : `API JSON, pero respondió ${r.status}`)
              : 'devuelve una página web, no es una API',
          })
          if (esApi && !encontradas[grupo] && method === 'POST') encontradas[grupo] = `${host}${path}`
          // Si el POST ya respondió, no hace falta probar el GET.
          if (method === 'POST') break
        }
      }
    }
    resultado[grupo] = filas.length ? filas : 'ninguna de las variantes existe (todas 404)'
  }

  const halladas = Object.keys(encontradas).length
  res.json({
    portalProbado: hosts,
    rutasConfiguradasAhora: PATHS,
    rutasQueSIRESPONDEN: resultado,
    comoConfigurarlo: sueltas.length
      ? (encontradas.rutasQuePediste
        ? `Esa ruta sirve. Guarda en Render la variable que corresponda con el valor: ${encontradas.rutasQuePediste.replace(/^https?:\/\/[^/]+/, '')}`
        : 'Ninguna de las rutas que pediste devuelve JSON. Mira "lectura" en cada fila.')
      : halladas
        ? {
        nota: 'Guarda en Render las variables de las rutas que aparecen arriba y redespliega.',
        GENESIS_PATH_USER_STATUS: encontradas.userStatus?.replace(/^https?:\/\/[^/]+/, '') || '(sin cambios)',
        GENESIS_PATH_REGISTER: encontradas.register?.replace(/^https?:\/\/[^/]+/, '') || '(sin cambios)',
        GENESIS_PATH_TOKEN_VALIDATE: encontradas.tokenValidate?.replace(/^https?:\/\/[^/]+/, '') || '(sin cambios)',
      }
      : {
        lectura: `Ninguna de las ${Object.values(candidatas).flat().length} rutas probadas existe en ${hosts.join(' ni ')} (todas 404). La API de aplicaciones no está publicada ahí.`,
        comoEncontrarLaRuta: [
          'El portal es un proyecto Next.js en Vercel: cada ruta de API es un archivo del repositorio.',
          'Busca en el repo del portal: app/api/**/route.ts  (App Router)  o  pages/api/**.ts  (Pages Router).',
          'Lo que veas ahí es la ruta real. Ejemplo: app/api/v2/identity/status/route.ts → /api/v2/identity/status',
          'Si no existe ningún archivo parecido, la API de aplicaciones todavía no está construida en el portal.',
        ],
        comoProbarla: 'Cuando tengas la ruta, pruébala al instante sin redesplegar: /api/portal/discover?paths=/tu/ruta',
        mientrasTanto: 'Veta Wallet no queda bloqueada: el pasaporte se puede importar a mano (Ajustes → Importar mi pasaporte) y el motor guarda las identidades igual.',
      },
  })
})

portalRouter.get('/inspect', async (req, res) => {
  const email = String(req.query.email || '')
  if (!email.includes('@')) return res.status(400).json({ error: 'Usa ?email=tu@correo.com' })

  const mask = (v: any): any => {
    if (v === null || v === undefined) return null
    if (Array.isArray(v)) return v.length ? [mask(v[0]), `…(${v.length})`] : []
    if (typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, mask(x)]))
    const s = String(v)
    if (typeof v === 'boolean' || typeof v === 'number') return v
    if (/^https?:\/\//.test(s)) return `<url ${s.length} chars>`
    return s.length <= 4 ? s : `${s.slice(0, 3)}…(${s.length})`
  }

  const r = await callPortal(PATHS.userStatus, { email, app: 'veta-wallet' })
  const passport = toPassport(r.data)

  // Un mensaje de error no es un dato personal: se muestra entero. Enmascarar
  // también los errores fue lo que ocultó la causa real del problema.
  const falloDeRed = r.status === 502 || r.status === 503
  // Si el portal devuelve HTML (su página de error), no hay campos que mapear:
  // es que la ruta no existe o no acepta esta llamada. Enmascararlo como
  // "<!D…(400)" solo escondía el diagnóstico.
  const devolvioHtml = typeof r.data?.noJson === 'string'
  res.json({
    portal: PORTAL_API,
    rutaUsada: PATHS.userStatus,
    portalHttpStatus: r.status,
    tardoMs: r.ms,
    ...(falloDeRed
      ? {
        problema: 'El servidor no logró hablar con el portal — no es un problema de los datos.',
        detalle: r.data,
        siguiente: 'Abre /api/portal/ping para ver si el portal es alcanzable desde este servidor.',
      }
      : devolvioHtml
        ? {
          problema: r.status === 404
            ? `El portal respondió 404: la ruta ${PATHS.userStatus} no existe en ${PORTAL_API}.`
            : `El portal respondió ${r.status} con una página HTML en vez de JSON.`,
          respuestaHtml: r.data.noJson.slice(0, 200),
          siguiente: 'Abre /api/portal/discover: prueba las rutas alternativas y te dice cuál configurar.',
        }
        : {
        camposQueDevuelveElPortal: mask(r.data),
        pasaporteQueLeeLaApp: passport
          ? Object.fromEntries(Object.entries(passport).filter(([k]) => k !== 'raw').map(([k, v]) => [k, v ? 'OK' : 'FALTA']))
          : 'el portal no devolvió un UID',
      }),
  })
})

/**
 * Registra/vincula la app del usuario en el portal (paso previo a verificar).
 * Body: { email, fullName?, walletAddress? }
 */
portalRouter.post('/register', async (req, res) => {
  const { email, fullName, walletAddress } = req.body ?? {}
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return res.status(400).json({ error: 'Correo válido requerido' })
  }
  startIdentity(email, fullName, walletAddress)
  const r = await callPortal(PATHS.register, {
    email,
    fullName,
    name: fullName,
    walletAddress,
    wallet: walletAddress,
    app: 'veta-wallet',
  })
  res.status(r.ok ? 200 : r.status).json(r.data)
})

/**
 * Estado de verificación del usuario en el portal. Si ya está verificado,
 * devuelve el pasaporte completo y lo guarda en el motor.
 * Body: { email, walletAddress? }
 */
portalRouter.post('/user-status', async (req, res) => {
  const { email, walletAddress } = req.body ?? {}
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return res.status(400).json({ error: 'Correo válido requerido' })
  }
  const r = await callPortal(PATHS.userStatus, { email, walletAddress, app: 'veta-wallet' })
  const passport = toPassport(r.data)
  if (passport) {
    // El portal no siempre devuelve la billetera: la completamos con la
    // que envió la app para que el pasaporte salga entero.
    passport.email = passport.email || email
    passport.walletAddress = passport.walletAddress || walletAddress || null
  }
  if (r.ok && passport) persist(email, passport, walletAddress)

  // Respaldo: si el portal no responde, entrega lo que ya tengamos guardado.
  if (!r.ok || !passport?.genesisUid) {
    const local = findIdentityByEmail(email)
    if (local?.genesisUid) {
      return res.json({
        passport: {
          genesisUid: local.genesisUid,
          fullName: local.fullName,
          email: local.email,
          documentId: local.documentId ?? null,
          nationality: local.nationality ?? null,
          birthDate: local.birthDate ?? null,
          photoUrl: local.photoUrl ?? null,
          walletAddress: local.walletAddress ?? null,
          status: local.step === 'verified' ? 'verified' : local.step,
        },
        source: 'engine',
      })
    }
  }
  res.status(r.ok ? 200 : r.status).json({ passport, source: 'portal', portal: r.data })
})

/**
 * Valida el token que devuelve el portal al terminar la verificación y
 * entrega el pasaporte emitido.
 * Body: { token, email?, walletAddress? }
 */
portalRouter.post('/token-validate', async (req, res) => {
  const { token, email, walletAddress } = req.body ?? {}
  if (!token || typeof token !== 'string') {
    return res.status(400).json({ error: 'token requerido' })
  }
  const r = await callPortal(PATHS.tokenValidate, { token, app: 'veta-wallet' })
  const passport = toPassport(r.data)
  const mail = passport?.email || email
  if (passport) {
    passport.email = mail || null
    passport.walletAddress = passport.walletAddress || walletAddress || null
  }
  if (r.ok && passport && mail) persist(mail, passport, walletAddress)
  res.status(r.ok ? 200 : r.status).json({ passport, source: 'portal', portal: r.data })
})
