# Telemetría y padrón hacia Genesis ID

Dos módulos que se pegan al backend de Veta Wallet (y con el mismo código al de
MyTokenPay) para que el panel de analítica deje de estar vacío.

```
backend de la app ──X-Telemetria-Key──▶ Genesis ID  (qué pasó, qué falló)
                  ──X-API-Key─────────▶ Genesis ID  (quién es quién)
```

## Qué resuelve

El panel de Genesis ID —web en `/analitica`, y ahora también la app Android—
sabe filtrar por app, plataforma, país, hora e importe, y sabe decir **a quién**
le falló un pago. Pero solo puede hacerlo con lo que las apps le manden. Hoy no
le manda nadie, así que las pantallas salen vacías.

Con esto montado se llenan:

| Pantalla del panel | Qué la llena |
| --- | --- |
| Actividad, con todos los filtros | `telemetria.js` |
| Ingresos (app y web por separado) | `telemetria.js` |
| Errores, y **a quién le pasaron** | `telemetria.js` + `directorio.js` |
| Billeteras y sus saldos | `directorio.js` |
| Gente, países, embudo | `directorio.js` |

## La regla que manda sobre todas

**Esto no puede romper ni frenar la billetera.** Un módulo de métricas que tira
el servicio que venía a vigilar es peor que no tener métricas. De ahí salen
todas las decisiones del código:

- nada se manda dentro de la petición: los eventos van a una cola en memoria y
  salen en lote cada 8 segundos, en segundo plano;
- la cola tiene tope (2000). Si Genesis ID está caído se tiran los eventos
  **más viejos** y se sigue — crecer sin freno es quedarse sin memoria en el
  proceso que firma transacciones;
- ninguna función pública lanza nunca. El peor caso es que no se reporte;
- sin `GENESIS_TELEMETRIA_KEY` el módulo queda dormido y no hace ni una
  petición. Un servidor sin configurar no cambia de conducta.

## Variables de entorno

| Variable | Para qué |
| --- | --- |
| `GENESIS_TELEMETRIA_KEY` | Clave **pública** de ingesta. Se saca del panel: Analítica → Aplicaciones → clave pública. Solo sirve para escribir métricas; no lee nada ni da acceso a identidades |
| `GENESIS_API_KEY` | La clave **secreta** de la app, la misma que ya usa el puente `genesis-proxy`. La necesita el padrón |
| `GENESIS_URL` | `https://genesis-id.onrender.com` por defecto |
| `APP_VERSION` | Qué versión reporta el servidor. En Heroku se puede usar `HEROKU_RELEASE_VERSION` |

Y las de ajuste fino, que casi nunca hace falta tocar:
`GENESIS_TELEMETRIA_INTERVALO_MS` (8000), `GENESIS_TELEMETRIA_LOTE` (100),
`GENESIS_TELEMETRIA_COLA` (2000), `GENESIS_DIRECTORIO_HORAS` (6),
`GENESIS_DIRECTORIO_LOTE` (200).

## Cómo se monta

### 1. Los middleware, en `app.js`

```js
import { medidor, cazador, cerrar as cerrarTelemetria } from './telemetria.js'

// DESPUÉS del middleware de sesión, para que `req.usuario` ya exista.
app.use(verificarToken)          // el de la propia app
app.use(medidor())

// ... aquí van todas las rutas ...

// El cazador va ANTES del manejador de errores propio. Reporta y deja pasar
// el error: no cambia lo que la app ya respondía.
app.use(cazador())
app.use(manejadorDeErroresDeLaApp)
```

El medidor **no** reporta un evento por petición correcta: un backend con
tráfico real mandaría millones de eventos idénticos que no dicen nada y
llenarían la retención en una tarde. Reporta lo que sirve: los errores (con
quién los sufrió) y las peticiones anormalmente lentas.

### 2. Los momentos que importan, donde ocurren

```js
import { ingreso, alta, transaccion, accion, fallo, idDeUsuario } from './telemetria.js'

// Al iniciar sesión
ingreso(idDeUsuario(usuario), { pais: usuario.pais })

// Al crear la cuenta
alta(idDeUsuario(usuario), { pais: usuario.pais })

// Al enviar dinero — el importe es lo que permite filtrar «más de $500»
transaccion(idDeUsuario(usuario), { valor: montoUsd, moneda: 'USD', nombre: 'envio' })

// Cualquier cosa con intención
accion(idDeUsuario(usuario), 'tarjeta.congelar')

// Un fallo que se atrapó a mano
try { ... } catch (e) { fallo('firma.transaccion', e, { usuario: idDeUsuario(usuario) }) }
```

### 3. El padrón, en el arranque

```js
import { programar } from './directorio.js'
import Usuario from './models/Usuario.js'

// `traerUsuarios` la escribe la app porque solo ella sabe consultar su base.
// La primera pasada se retrasa 30 s a propósito: durante el arranque el
// servidor está abriendo la base y atendiendo el primer tráfico.
programar(() => Usuario.find({}, {
  _id: 1, email: 1, nombre: 1, address: 1, pais: 1, telefono: 1,
  createdAt: 1, lastLogin: 1, kyc: 1, verificado: 1,
}).lean())
```

### 4. El apagado ordenado (opcional pero recomendable)

```js
process.on('SIGTERM', async () => {
  await cerrarTelemetria()     // manda lo que quede en la cola
  server.close(() => process.exit(0))
})
```

## El detalle que hay que hacer bien

**El identificador del usuario tiene que ser el mismo en los dos módulos.**

Genesis ID nunca guarda quién es nadie: guarda `HMAC(sal, app|usuario)`, que no
se puede revertir. El panel vuelve a poner el nombre calculando esa misma huella
sobre el padrón. Para que el cruce funcione, el `usuario` de la telemetría tiene
que ser **exactamente** el mismo `idExterno` del padrón.

Por eso los dos módulos usan `idDeUsuario()`, que vive en un solo sitio. Si se
manda el correo en un lado y el `_id` en el otro, las huellas no coinciden y el
panel dirá «fuera del padrón» para todo el mundo — **sin que nada falle a la
vista**. Es el fallo más silencioso de todo este montaje, y la primera prueba
del archivo de pruebas existe justo para eso.

`idDeUsuario` prefiere el `_id` de Mongo al correo, porque el correo se puede
editar y el día que alguien lo cambie su historial se partiría en dos personas.

## Qué NO se manda

La lista de campos del padrón está cerrada a propósito en `deUsuario()`: ni
contraseñas, ni semillas, ni llaves privadas, ni PIN, ni documentos, ni saldos
guardados. Si mañana alguien añade un campo al modelo de usuario, no se filtra
solo. Hay una prueba que falla si esa lista crece sin querer.

De la telemetría tampoco sale nada personal: el identificador se convierte en
huella del lado de Genesis ID, y de la IP solo se deduce el país, que se
descarta en el acto.

## Pruebas

```sh
node --test pruebas/unidad.test.mjs
```

15 pruebas. No comprueban que «manda eventos» —eso es lo fácil— sino lo que
puede costar dinero: que nunca lance ni con basura, que la cola no crezca sin
freno con Genesis ID caído, que un lote rechazado no se reintente para siempre,
que el medidor no reporte el ruido de fondo, que el padrón no filtre secretos, y
que el identificador sea el mismo en los dos módulos.

## Después de montarlo

En el panel (web `/analitica` o la app), la telemetría aparece en minutos. El
padrón, en la primera pasada (30 s tras el arranque) y luego cada 6 horas.

Un aviso que ahorra un rato de desconcierto: **Genesis ID descarta los eventos
de más de 72 horas** y acota al presente los que vengan con fecha futura. Es
correcto y defensivo, pero significa que un histórico viejo no se puede cargar
de golpe — la telemetría empieza a contar desde que se enciende.

---

## Montado desde el cliente (agosto 2026)

El backend de Veta Wallet vive fuera de este repositorio y no se puede tocar
desde aquí, así que la telemetría se montó **desde los clientes**, que sí están
aquí. Ya está funcionando en los dos:

| Dónde | Archivo | Estado |
|---|---|---|
| Web | `apps-web/veta-wallet/telemetria.js` | montado, con clave |
| App Android | `veta-wallet-app/src/telemetria.js` | ya existía; le faltaba `identificar()` |

**El fallo que tenía la app**: llamaba a `arrancarTelemetria()` pero nunca a
`identificar()`. Sin identificador el servidor no puede registrar personas —los
eventos llegaban pero sin nadie a quien atribuirlos— y «Últimas conexiones»
salía vacío aunque la app estuviera reportando. Se engancha ahora en el punto
único de sesión (`acctApi` de `App.js`), incluyendo la sesión restaurada al
arrancar, que es el caso más común: quien no cierra sesión nunca vuelve a pasar
por el login.

### La clave es la misma en los dos

`gidp_veta-wallet_…`, la **pública** de ingesta. Está en `app.json` de la app y
repetida en el archivo de la web. Si un día se rota hay que cambiarla **en los
dos sitios**, o uno de los dos deja de reportar en silencio.

### Si todo sale como «fuera del padrón»

Es el único fallo silencioso que queda, y tiene una sola causa: el
identificador que manda el cliente no es el mismo que manda el backend al
sincronizar el padrón. Genesis ID guarda `huella(app, usuario)` y para poner
nombre recalcula esa cuenta sobre el padrón; si un lado manda el `_id` de Mongo
y el otro el correo, las huellas no coinciden y no hay ningún error visible.

Los clientes usan, por este orden: `idExterno`, `_id`, `id`, `sub`, `userId`,
`email`. El backend (`telemetria.js` de esta carpeta) usa `idExterno`, `_id`,
`id`, `email`. Deben resolver al mismo valor.

Comprobación: en el panel, Conexiones → si **todas** las filas dicen «fuera del
padrón» pero hay conexiones, es esto. Si el padrón está sincronizado y algunas
sí salen con nombre, no lo es.

### Lo que sigue faltando: el padrón

Los clientes **no** pueden sincronizar el padrón — esa puerta exige la clave
secreta porque son datos personales, y una clave secreta no puede vivir en un
APK ni en una página. Mientras el backend no monte `directorio.js`, el nombre y
la billetera solo aparecen para quien ya esté en el padrón por otra vía.

Cuando se monte, todo lo ya recogido se identifica solo **hacia atrás**: la
huella es determinista, así que no hay que esperar a que la gente vuelva a
entrar.
