import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { fileURLToPath } from 'url'
import { authRouter } from './routes/auth.js'
import { metaRouter } from './routes/meta.js'
import { companiesRouter } from './routes/companies.js'
import { cobrosRouter, pagosRouter, identidadRouter } from './routes/cobros.js'
import { adminRouter } from './routes/admin.js'
import { exigirPersistencia, hayMongo } from './lib/mongo.js'
import { sembrarSiHaceFalta } from './lib/db.js'

/* Sin base de datos, produccion no arranca.
   El almacen eran tres Map() en memoria y las variables de Mongo llevaban
   meses puestas en Heroku sin que el codigo las usara: cada reinicio del dyno
   —al menos uno al dia— borraba todas las cuentas y todos los comercios. El
   fallo silencioso es el peor de todos, asi que ahora se grita al arrancar. */
exigirPersistencia()

const __filename = fileURLToPath(import.meta.url)

const app = express()
app.use(cors())
app.use(express.json({ limit: '12mb' }))

app.get('/', (_req, res) => {
  res.json({ name: 'MyTokenPay API', status: 'ok' })
})

app.get('/healthz', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    // Que se vea desde fuera si el almacen es persistente o de memoria: es
    // justo el dato que faltaba para notar que las cuentas se estaban
    // perdiendo en cada reinicio.
    almacen: hayMongo() ? 'mongodb' : 'memoria',
    precioOrigenUsd: Number(process.env.OG_TOKEN_PRICE_USD) || null,
    genesis: Boolean(process.env.GENESIS_API_KEY),
  })
})

app.use('/api/auth', authRouter)
app.use('/api/companies', companiesRouter)
app.use('/api/cobros', cobrosRouter)
app.use('/api/pagos', pagosRouter)
app.use('/api/identidad', identidadRouter)
app.use('/api/admin', adminRouter)
app.use('/api', metaRouter)

/* El manejador de errores va DESPUES de las rutas y antes del 404.
   Con handlers asincronos, una promesa rechazada que nadie atrapa no llega a
   Express 4: se pierde como `unhandledRejection` y la peticion queda colgada
   hasta el timeout del cliente. Envolver cada handler en try/catch se olvida;
   esto no. */
app.use('/api', (err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[api] error no atrapado:', err?.message, err?.stack?.split('\n')[1]?.trim())
  res.status(500).json({ error: 'Algo falló de nuestro lado. Volvé a intentarlo.' })
})

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' })
})

const port = process.env.PORT || 3001
if (process.env.VERCEL === undefined && process.argv[1] === __filename) {
  app.listen(port, () => {
    console.log(`MyTokenPay API listening on http://localhost:${port}`)
    // El directorio se siembra DESPUES de escuchar: si la base tarda, el
    // servicio ya esta contestando /healthz y el despliegue no se cae por eso.
    sembrarSiHaceFalta().catch((e) => console.error('[db] siembra fallida:', e?.message))
  })
}

export default app
