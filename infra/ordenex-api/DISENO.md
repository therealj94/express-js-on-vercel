# ORDENEX · el diseño, y por qué así

La casa de cambio de Orden Global. Este documento es **el contrato**: todo el
que escriba un módulo lo escribe contra esto, y si algo de aquí no se puede
cumplir, se cambia AQUÍ primero.

## La decisión de partida: de cero, con tres rescates

La vieja Ordenex (ico-back en Heroku, «ORDENEX SALE» en ordenexchange.link) no
era una casa de cambio: era una **venta directa** de tokens con Binance Pay —
cotización, checkout, webhook, envío. Sin libro, sin calce, sin velas, sin
ledger. Ni una pieza de su corazón sirve para un exchange, y su pila (Next.js
compilado + NestJS + cadena vieja) es ajena a la casa. Se construye de cero.

Se rescatan tres cosas: el **dominio** (ordenexchange.link, ya en Route 53),
los **logos de bancos hondureños** (bucket ordenex-media) para el circuito
fiat, y la **lección del circuito viejo**: transferencia bancaria + comprobante
+ confirmación humana — eso, formalizado, son los agentes.

## Los tres principios que mandan

1. **La casa nunca toca fiat.** El cash-in/out es entre personas: un agente
   verificado vende su propio ORIGEN por lempiras o dólares, o lo compra. El
   ledger solo custodia y arbitra con depósito en garantía. Sin esto, Ordenex
   sería una remesadora sin licencia — y el expediente legal del 14/08 es
   explícito en que licencias no hay todavía.
2. **Ni un número inventado.** Las velas salen SOLO de tratos reales. El precio
   de referencia (oro/plata) se enseña como referencia, rotulado, jamás como
   última operación. Sin feed, guion.
3. **Fail-closed con el dinero.** Saldo que no se pudo leer = operación que no
   sale. Igual que `saldosDe()` en la wallet.

## El mapa

```
apps-web/ordenex/          la web (misma casa: sin compilar, IIFE, data-t)
infra/ordenex-api/         el backend (Express + Mongoose, como la wallet)
```

- **API en Heroku**: app nueva `ordenex-api`. Siempre `git subtree push` /
  `git push heroku` desde el repo — nunca un paquete (lección del 12-ago).
- **Web en Amplify**: app nueva. Cuando esté probada, `www.ordenexchange.link`
  pasa del CloudFront viejo a la nueva.
- **Mongo**: `MONGODB_URI` propio (base `ordenex`). Enteros de dinero SIEMPRE
  como **string de wei** (BigInt en JS); 18 decimales todos los activos.

## Identidad: SSO de Genesis, sin contraseñas propias

Ordenex **no guarda contraseñas**. Se entra con la cuenta de Veta Wallet:

1. La web de Ordenex manda a `app.vetawallet.com/#sso-ordenex`.
2. La wallet (con sesión) llama a su backend `POST /genesis/sso/token` y
   vuelve a `ordenex…/#sso=<token>`.
3. La web manda el token a `POST /auth/sso`; el backend lo verifica contra
   Genesis `POST /api/v1/sso/verificar` con **su propia** `GENESIS_API_KEY`
   (app `ordenex`, dada de alta en APPS_ECOSISTEMA), y de `perfil.apps[]` saca
   la dirección custodiada del usuario en la wallet.
4. Emite su PROPIA sesión: JWT HS256 con `ORDENEX_TOKEN` (40 min) + refresh
   (30 días, con `tokenVersion`). Payload: `{ userId, gid }`.

Alcances de la app `ordenex` en Genesis: `gid.verificar, gid.perfil,
vinculo.crear, movimiento.enviar, tamiz.direccion, telemetria.enviar`.

Reglas heredadas: **tamiz de sanciones antes de cada retiro**
(`GET /api/v1/tamiz/direccion/:direccion`), **reporte AML** de cada operación
fiat y cada retiro (`POST /api/v1/movimientos` — la respuesta nunca se le
enseña al usuario), y operar fiat exige `perfil.verificada === true`.

## El ledger: doble entrada, en wei, con reserva

Colección `cuentas`: `{ userId, activo, disponible: string, reservado: string }`.
Toda mutación pasa por `lib/ledger.js` y deja rastro en `asientos`:
`{ ref, tipo, userId, activo, monto, contraparte, saldoDespues, en }`.

Primitivas (todas con guardas atómicas `findOneAndUpdate` sobre el documento y
comparación BigInt; si la guarda no calza, error — nunca saldo negativo):

```
acreditar(userId, activo, monto, ref)
debitar(userId, activo, monto, ref)          // falla si disponible < monto
reservar(userId, activo, monto, ref)         // disponible → reservado
liberar(userId, activo, monto, ref)          // reservado → disponible
ejecutarReserva(userId, activo, monto, aQuien, ref)  // reservado → disponible de otro
```

## El motor de calce: puro por dentro, con efectos por fuera

`lib/motor.js`. El corazón es **una función pura** — sin Mongo, sin reloj, sin
azar — para poder probarlo hasta el hartazgo:

```
calzar(libro, orden) -> { tratos: [...], resto: orden|null, libro: nuevoLibro }
```

- Libro por mercado: `{ compras: [...], ventas: [...] }` ordenadas
  precio-tiempo (mejor compra primero, mejor venta primero).
- Órdenes: `{ id, userId, mercado, lado: 'compra'|'venta', tipo: 'limite'|'mercado',
  precio: string|null, cantidad: string, resta: string, en }`.
  Precio en wei de ORIGEN por unidad entera del activo; cantidad en wei del
  activo. `notional = cantidad × precio / 1e18`.
- Cruce al **precio de la orden pasiva**. Una orden de mercado consume el libro
  y lo que no calce se cancela (jamás queda una orden de mercado descansando).
- Autocalce (mismo userId a ambos lados): la orden entrante se rechaza en la
  parte que calzaría consigo misma — wash trading no pinta velas de esta casa.

Alrededor, la cáscara con estado: reserva al colocar (compra: notional en
ORIGEN; venta: cantidad del activo), aplica tratos vía ledger
(`ejecutarReserva` cruzado), persiste orden/tratos, actualiza velas. **Una sola
cola por mercado** (promesa encadenada): un dyno, cero carreras.

Comisión de la casa: `ORDENEX_COMISION_PPM` (partes por millón, p. ej. 2500 =
0,25 %) sobre lo recibido, a la cuenta interna `casa`. Sin la variable: 0, y es
deliberado — igual que `OG_COMISION_ORIGEN` en la wallet.

## Mercados y velas

15 activos (ORIGEN nativo + 14 contratos — la tabla espejo de
`cadena.js`/`saldos.js`, con guardia de deriva). Mercados v1: **cada token
contra ORIGEN** (`AUKA-ORIGEN`, … 14 en total).

`velas`: `{ mercado, marco: '1m'|'15m'|'1h'|'1d', t0, o, h, l, c, v }` —
agregadas del flujo de tratos al confirmar cada calce. Solo tratos reales.

Referencia informativa (aparte, rotulada): AUKA onza oro, AGKA onza plata,
ORIGEN gramo/55 — del mismo feed que ya usa la wallet, y con guion si no llega.

### Las tres clases de precio

No se mezclan nunca, y cada una entra por su propia puerta para que no puedan:

| clase | de dónde sale | unidad | ruta |
|---|---|---|---|
| **trato** | lo que se pagó en el libro de esta casa | ORIGEN | `/mercados/:par/velas` |
| **referencia** | el metal real en otro mercado | USD, rotulada | `/mercados/:par/referencia` |
| **declarado** | una resolución de la Junta Directiva | USD, rotulada | `/precio-declarado/:token` |

El tercero es el más fácil de convertir en mentira y por eso es el más
amarrado. Un precio declarado **no** es una opinión sobre cuánto vale ONDK: es
el hecho comprobable de que la Junta, tal día, en tal acta, firmada por tal
persona, resolvió publicar tal cifra. Sin `fecha`, `precio`, `acta` y
`firmante` la fila no se guarda, y sin fila la pantalla enseña un guion.

Consecuencia que hay que tener clara antes de tocar `lib/preciosDeclarados.js`:
**un precio declarado no se mueve entre resoluciones.** Se queda plano en el
último valor firmado hasta que la Junta firme otro. Si alguna vez se pide que
«flote» o «se mueva un poquito» entre dos actas, la respuesta es no: eso ya no
sería el precio declarado, sería un precio inventado con un rótulo de declarado
encima — peor que no tener precio. Por lo mismo la gráfica es de **escalones**
(`VELAS.escalones`) y no de velas: una vela tiene apertura, máximo, mínimo y
cierre, y una resolución tiene un solo número.

Hoy solo ONDK es declarable (lista blanca `DECLARABLES`). ORIGEN, AUKA y AGKA
siguen un metal y su precio se **mide**; que la Junta pudiera «declarar» el
precio del oro sería absurdo, y el API lo rechaza con `NO_DECLARABLE`.

## La cadena: depósitos y retiros

- **Depósito**: dirección propia por usuario (ethers, llave AES-256 con
  `ORDENEX_ADM`, mismo patrón `lib/cripto.js` de la wallet — descifrado solo en
  servidor). El vigía (`lib/vigia.js`) sondea cada 30 s: saldo nativo +
  `balanceOf` de los 14; delta positivo ⇒ acredita ledger y anota `depositos`.
  El barrido a la caliente es endpoint de admin, manual, v1.
- **Retiro**: a cualquier dirección 5550. Orden: tamiz → debitar ledger →
  firmar desde la caliente (`ORDENEX_HOT_KEY`) → anotar `retiros` con hash →
  AML. Si la firma falla, se reacredita y se anota el fallo. Idempotencia por
  `retiroKey` del cliente.

## El circuito fiat: agentes

- `agentes`: `{ gid, userId, nombre, bancos: [{banco, cuenta, titular}],
  monedas: ['HNL','USD'], activo: bool }`. Alta por admin
  (`X-Admin-Key: ORDENEX_ADMIN_KEY`).
- `solicitudes`: `{ tipo: 'entrada'|'salida', userId, agenteId, activo: 'ORIGEN',
  cantidad, moneda, montoFiat, banco, referencia, estado, historia: [...] }`.
- **Entrada** (usuario compra ORIGEN con fiat): usuario abre solicitud contra
  un agente → **se reserva el ORIGEN del agente** (garantía) → usuario
  transfiere fiat al banco del agente y anota la referencia → agente confirma
  recibido → la garantía se ejecuta al usuario. Si el agente no confirma:
  disputa, resuelve admin.
- **Salida** (usuario vende ORIGEN por fiat): espejo — se reserva el ORIGEN del
  usuario, el agente transfiere fiat, el usuario confirma, la garantía se
  ejecuta al agente.
- Estados: `abierta → tomada → fiat-avisado → liquidada | cancelada | disputa`.
  Todo cambio de estado va a `historia` con quién y cuándo. Ambas puntas con
  Genesis verificada; AML en cada liquidación; el precio lo pactan las partes
  (la referencia se enseña al lado, rotulada).

## Rutas (todas bajo el prefijo raíz; JSON; errores `{ error, codigo }`)

```
POST /auth/sso {token}                → { token, refreshToken, usuario }
POST /auth/refresh {refreshToken}     → par nuevo

GET  /mercados                        → [{ mercado, ultimo, cambio24h, vol24h, referencia }]
GET  /mercados/:par/libro             → { compras: [[precio,cant]…20], ventas: […] }
GET  /mercados/:par/velas?marco=1h&desde=&hasta= → [[t0,o,h,l,c,v]…]
GET  /mercados/:par/tratos            → últimos 50 [{ precio, cantidad, lado, en }]
GET  /mercados/:par/referencia?marco=30m → { activo, unidad:'USD', rotulo, fuente, actualizadoEn, velas }
GET  /precio-declarado/:token         → { token, clase:'declarado', moneda, vigente, serie }

POST /ordenes {mercado, lado, tipo, precio?, cantidad, ordenKey} 🔒
GET  /ordenes?estado=abierta 🔒
DELETE /ordenes/:id 🔒

GET  /portafolio 🔒                   → { cuentas: [{activo, disponible, reservado}], direccionDeposito }
POST /retiros {activo, cantidad, direccion, retiroKey} 🔒
GET  /movimientos 🔒                  → asientos + depósitos + retiros del usuario

GET  /fiat/agentes?moneda=HNL         → agentes activos (sin números de cuenta)
POST /fiat/solicitudes 🔒             GET /fiat/solicitudes 🔒
POST /fiat/solicitudes/:id/tomar 🔒(agente)  /avisar 🔒  /confirmar 🔒  /cancelar 🔒
POST /fiat/solicitudes/:id/disputar 🔒

POST /admin/agentes 🔑  DELETE /admin/agentes/:id 🔑
POST /admin/solicitudes/:id/resolver 🔑
POST /admin/barrer {activo} 🔑        GET /admin/estado 🔑
POST /admin/precio-declarado {token, fecha, precio, acta, firmante, nota?} 🔑
DELETE /admin/precio-declarado/:id 🔑  (solo para el error de tecleo; no es la
                                        forma de «bajar» un precio: para eso la
                                        Junta declara otro y quedan los dos)
GET  /salud                           → { ok, cadena, mongo, bloque }
```

🔒 = Bearer JWT propio · 🔑 = X-Admin-Key.

## Variables de entorno (ninguna en el repo, jamás)

```
MONGODB_URI, ORDENEX_TOKEN, ORDENEX_ADM, ORDENEX_HOT_KEY, ORDENEX_ADMIN_KEY,
GENESIS_URL, GENESIS_API_KEY, OG_CHAIN_PROVIDER (rpc.ordenglobal-rpc.com),
ORDENEX_COMISION_PPM (opcional), CORS_ORIGENES
```

## La web (apps-web/ordenex) — la casa hermana

Sigue la guía destilada de Veta Wallet (paleta :root íntegra, Cinzel/Archivo/
JetBrains, vidrio, IIFE con const léxica, scripts en orden, i18n data-t es/en,
`esc()`/`jsTxt()`). Acento propio de Ordenex: `--acento:#74E6C8`.

Archivos y orden de carga:
`qr.js → cadena.js → datos.js → velas.js → i18n.js → app.js`

- `datos.js` (`const DATOS`): cliente del API — sesión en
  localStorage `ordenex.sesion`, refresh automático, y polling suave (libro y
  tratos cada 5 s, velas cada 30 s, solo con la pestaña visible).
- `velas.js` (`const VELAS`): gráfica de velas en canvas propio — velas OHLC,
  volumen abajo, cruz con tooltip, marcos 1m/15m/1h/1d, autoescala, línea de
  referencia rotulada. Sin librerías. `dibujar(canvas, velas, opciones)`.
- `app.js` (`const ONX`): vistas en `#lienzo` — `mercados` (tabla con precio,
  cambio 24h con jade/coral, volumen), `mercado` (velas + libro + formulario
  limite/mercado + mis órdenes), `portafolio` (saldos, depósito con QR,
  retiro), `fiat` (agentes, mis solicitudes, flujo entrada/salida), `acceso`
  (solo el botón SSO). Sin sesión se ve TODO lo público (mercados, velas,
  libro); la sesión se pide al operar.
- Portada corta: sello, titular, mercados vivos, y el botón
  «Entrar con mi cuenta Veta Wallet».

## Cambios mínimos fuera de Ordenex

1. `genesis-id/src/auth/aplicaciones.ts`: alta de `{ clave:'ordenex', … }` en
   APPS_ECOSISTEMA (el arranque la siembra y devuelve la secreta UNA vez).
2. `apps-web/veta-wallet/app.js`: manejador de `#sso-ordenex` — con sesión,
   pide `POST /genesis/sso/token` y redirige a Ordenex con el token; sin
   sesión, primero login. Y la esfera de Ordenexchange del Núcleo deja de
   decir «pronto».

## Pruebas (cada módulo con la suya, corren en CI de mano)

- `pruebas/probar-motor.mjs` — el calce puro: precio-tiempo, parciales,
  mercado que barre, autocalce rechazado, resto que descansa, invariantes
  (∑cantidades, conservación de valor).
- `pruebas/probar-ledger.mjs` — reserva/ejecución/liberación, saldo jamás
  negativo, doble entrada cuadra (∑asientos = 0 por activo).
- `pruebas/probar-api.mjs` — el API entero con Mongo de memoria y Genesis
  fingido: SSO, colocar/cancelar, retiro idempotente, fiat de punta a punta.
- `apps-web/probar-ordenex.mjs` — Playwright: portada, mercados sin sesión,
  velas pintadas, flujo de compra con API fingido, es/en.
```
