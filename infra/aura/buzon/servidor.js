// El buzon: por donde la burbuja del ecosistema habla con AU-RA.
//
// ── POR QUE EXISTE ESTA PIEZA EN MEDIO ──────────────────────────────────────
//
// AU-RA vive en el nodo de la GPU, y ese nodo NO ACEPTA NINGUNA ENTRADA de
// internet — su grupo de seguridad se llama `aura-gpu-sin-entrada` y cumple.
// Ahi dentro tambien vive la llave privada que paga los premios.
//
// Se podia abrir un puerto en el nodo y poner un certificado. Se decidio que
// no: la maquina que guarda la llave de los pagos no pasa a depender de que un
// servidor web no tenga un fallo. Asi que la web deja el recado AQUI, y el
// nodo lo recoge SALIENDO, exactamente como ya hace con WhatsApp.
//
// El precio son uno o dos segundos de espera. Es lo mismo que ya espera
// cualquiera que le escriba por WhatsApp, y a nadie le ha parecido lento.
//
// ── POR QUE UN SERVICIO APARTE Y NO UNA RUTA EN GENESIS ID ──────────────────
//
// Genesis ID guarda documentos de identidad cifrados. Colgarle al lado un chat
// abierto al publico junta la superficie de ataque de las dos cosas y hace que
// un fallo del chat pueda tumbar el KYC. Son procesos distintos a proposito.
//
// ── LO QUE ESTE PROCESO NO SABE ─────────────────────────────────────────────
//
// Nada. No tiene el modelo, no tiene el guion, no tiene la memoria y no sabe
// quien es nadie. Guarda un texto unos segundos y lo entrega. Si alguien se
// mete aqui, se lleva las conversaciones de los ultimos minutos y ni una llave.
// Eso tambien fue una decision: es lo unico de la cadena expuesto a internet,
// asi que es donde menos tiene que haber.

import express from 'express'
import cors from 'cors'
import crypto from 'node:crypto'

const app = express()
app.use(cors())
app.use(express.json({ limit: '32kb' }))   // un mensaje de chat, no un archivo

// La llave con la que el nodo se identifica. NO va en el repositorio: la pide
// Render en su panel (`sync:false`). Sin ella el buzon arranca igual pero no
// deja recoger nada — mejor mudo que abierto.
const LLAVE = process.env.AURA_BUZON_LLAVE || ''

// ── Lo que se guarda, y cuanto ──────────────────────────────────────────────
//
// En memoria a proposito. Un recado vive segundos: lo que hace falta es que
// aguante entre que la web lo deja y el nodo lo recoge. Meterlo en una base de
// datos seria guardar en disco conversaciones de gente que no nos dio nada.
//
// Si el proceso se reinicia se pierden los recados en vuelo y la web reintenta.
// Perder un mensaje es molesto; guardarlo para siempre es peor.

const VIDA_MS = 90 * 1000          // un recado caduca a los 90 segundos
const TOPE_COLA = 200              // recados esperando al nodo, como mucho
const TOPE_TEXTO = 1000            // caracteres de un mensaje

const cola = []                    // esperando a que el nodo los recoja
const listos = new Map()           // ticket → { texto, botones, cuando }

function limpiar () {
  const ahora = Date.now()
  while (cola.length && ahora - cola[0].cuando > VIDA_MS) cola.shift()
  for (const [t, r] of listos) if (ahora - r.cuando > VIDA_MS) listos.delete(t)
}
setInterval(limpiar, 15000).unref?.()

// ── El freno de la puerta ───────────────────────────────────────────────────
//
// El freno de verdad —el que cuida la GPU— esta en `portal.py`, en el nodo.
// Este es el de antes: impedir que alguien LLENE LA COLA y deje sin sitio a
// los demas. Son dos frenos porque protegen dos cosas distintas, y el de aqui
// no gasta ni un gramo de tarjeta para decir que no.

const POR_IP = 30
const VENTANA_MS = 60 * 1000
const vistas = new Map()

function pasa (ip) {
  const ahora = Date.now()
  const v = (vistas.get(ip) || []).filter(t => ahora - t <= VENTANA_MS)
  if (v.length >= POR_IP) { vistas.set(ip, v); return false }
  v.push(ahora)
  vistas.set(ip, v)
  if (vistas.size > 5000) for (const [k, w] of vistas) {
    if (!w.length || ahora - w[w.length - 1] > VENTANA_MS * 5) vistas.delete(k)
  }
  return true
}

function deQuien (req) {
  // Render va detras de un proxy, asi que la IP de verdad viene en la cabecera.
  // Se toma la PRIMERA, que es la del cliente: las de despues las puede poner
  // cualquiera y confiar en la ultima es confiar en quien llama.
  const h = String(req.headers['x-forwarded-for'] || '')
  return (h.split(',')[0] || '').trim() || req.socket.remoteAddress || '?'
}

// ── 1 · La web deja el recado ───────────────────────────────────────────────

app.post('/decir', (req, res) => {
  if (!pasa(deQuien(req))) return res.status(429).json({ error: 'muchas' })
  limpiar()
  const texto = String(req.body?.texto ?? '').slice(0, TOPE_TEXTO).trim()
  const toco = req.body?.toco ? String(req.body.toco).slice(0, 120) : null
  if (!texto && !toco) return res.status(400).json({ error: 'sin texto' })
  if (cola.length >= TOPE_COLA) return res.status(503).json({ error: 'ocupado' })

  // La sesion la valida el NODO, que es quien tiene el escalafon. Aqui viaja
  // tal cual: este proceso no decide permisos porque no sabe de permisos.
  const ticket = crypto.randomUUID()
  cola.push({
    ticket,
    sesion: req.body?.sesion ? String(req.body.sesion).slice(0, 64) : null,
    texto,
    toco,
    cuando: Date.now()
  })
  res.json({ ticket })
})

// ── 2 · La web pregunta si ya hay respuesta ─────────────────────────────────

app.get('/oir/:ticket', (req, res) => {
  const r = listos.get(req.params.ticket)
  if (!r) return res.json({ listo: false })
  listos.delete(req.params.ticket)          // se entrega UNA vez y se olvida
  res.json({ listo: true, texto: r.texto, botones: r.botones, sesion: r.sesion })
})

// ── 3 · El nodo recoge y contesta ───────────────────────────────────────────

function esElNodo (req) {
  if (!LLAVE) return false
  // Se exige el «Bearer » y no se acepta la llave suelta. Con `replace` la
  // cadena se quedaba igual cuando el prefijo no estaba, asi que la llave a
  // pelo tambien entraba: dos formas validas de presentar una credencial son
  // dos caminos que hay que revisar cada vez que se toca esto, y el segundo
  // nadie se acuerda de que existe. Lo cazo su propia prueba.
  const cab = String(req.headers.authorization || '')
  if (!cab.startsWith('Bearer ')) return false
  const a = Buffer.from(cab.slice(7))
  const b = Buffer.from(LLAVE)
  // Comparacion de tiempo constante: con `===` se puede adivinar la llave
  // letra por letra midiendo cuanto tarda en decir que no.
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

app.get('/cola', (req, res) => {
  if (!esElNodo(req)) return res.status(401).json({ error: 'no' })
  limpiar()
  res.json({ recados: cola.splice(0, 10) })
})

app.post('/contesta', (req, res) => {
  if (!esElNodo(req)) return res.status(401).json({ error: 'no' })
  const ticket = String(req.body?.ticket || '')
  if (!ticket) return res.status(400).json({ error: 'sin ticket' })
  listos.set(ticket, {
    texto: String(req.body?.texto ?? ''),
    botones: Array.isArray(req.body?.botones) ? req.body.botones.slice(0, 3) : [],
    sesion: req.body?.sesion ? String(req.body.sesion).slice(0, 64) : null,
    cuando: Date.now()
  })
  res.json({ ok: true })
})

// ── Salud ───────────────────────────────────────────────────────────────────
//
// Sin `LLAVE` el buzon no sirve para nada y hay que verlo desde fuera, no
// descubrirlo porque nadie contesta.

app.get('/healthz', (_req, res) => {
  limpiar()
  res.json({
    ok: true,
    llaveConfigurada: Boolean(LLAVE),
    esperando: cola.length,
    contestados: listos.size
  })
})

const PUERTO = process.env.PORT || 8090
if (process.env.NODE_ENV !== 'prueba') {
  app.listen(PUERTO, () => {
    console.log(`buzon de AU-RA en :${PUERTO}` +
      (LLAVE ? '' : ' · SIN LLAVE: el nodo no va a poder recoger nada'))
  })
}

export { app, cola, listos, limpiar, VIDA_MS, TOPE_COLA, TOPE_TEXTO, POR_IP }
