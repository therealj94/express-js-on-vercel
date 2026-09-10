# AuCorp — estado de la plataforma fiat

**Fecha del corte:** 17 de agosto de 2026
**Rama:** `claude/veta-wallet-phantom-design-7syah8`

---

## Lo primero, porque es lo que se olvida

**AuCorp NO es un banco con licencia bancaria.** Es una institución de
tecnología financiera constituida en Próspera ZEDE bajo la Regulación FinTech A.
No hay seguro de depósitos ni ventanilla de último recurso.

Eso está escrito en el encabezado de `app.js` del API, en la respuesta de
`/salud`, en el pie de **todas** las pantallas de la app y en el dossier. No es
letra chica: es lo que cambia qué pasa con el dinero de alguien si algo sale
mal, y es la primera cosa que mira un regulador.

En todo el producto se dice **«cuenta en moneda local»**, nunca «cuenta
bancaria» ni «depósito asegurado».

---

## El cambio de nombre: AUBANK → AuCorp

AUBANK era una esfera dormida en el Núcleo, con letrero PRONTO. El nombre
cambió con la empresa.

**El nombre viejo no sobrevive como etiqueta en ningún sitio.** Dos nombres para
una misma casa es como se pierde la gente. Solo queda:

- como frase explícita — «AuCorp es la que antes se llamaba AUBANK» — en las
  respuestas de AU-RA y del cerebro;
- como palabra de búsqueda, para que quien todavía diga «aubank» reciba la
  respuesta en vez de un silencio.

Tocado en: `apps-web/veta-wallet/{app.js,i18n.js,saber.js,aura.js}`,
`orden-global-app/src/og/Nucleo.js`, `orden-global-app/src/voz.js`,
`infra/cerebro/conocimiento/saber.json`, `documentos/armar-dossier.py`.

### La esfera dejó de dormir

En la Veta Wallet la esfera perdió el `pronto` y se volvió una puerta de verdad,
con el mismo patrón que usó Ordenex cuando abrió.

**El puente de SSO se generalizó en vez de duplicarse.** Antes era un booleano
«viene de Ordenex»; con AuCorp entrando por el mismo circuito, un segundo
booleano habrían sido dos caminos paralelos que se separan en cuanto alguien
arregla uno solo. Ahora se guarda el **destino** y las casas viven en un mapa:

```js
const CASAS_SSO = {
  '#sso-ordenex': () => URL_ORDENEX,
  '#sso-aucorp':  () => URL_AUCORP,
};
```

`ordenexVolver()` pasó a ser `volverConLlave(destino)`. Una casa nueva del
ecosistema es una línea y nada más.

### La app móvil sigue en «pronto», a propósito

El puente de SSO de la app de React Native todavía no está cableado. Una esfera
que navega a un sitio donde hay que volver a identificarse es peor que una que
dice honestamente «todavía no». Queda escrito en el código para que no parezca
un descuido.

---

## Las cinco reglas que gobiernan todo el código

1. **El dinero se guarda en unidades mínimas enteras**, en un string, operado con
   BigInt. Nunca coma flotante: `0.1 + 0.2` no da `0.3` y en un libro mayor cada
   redondeo deja una viruta que al cierre del mes nadie sabe explicar.
2. **Los decimales son un DATO de cada moneda, no una constante.** El peso
   chileno y el guaraní tienen CERO. Darles dos hace que mil pesos se anoten como
   cien mil, y no se nota hasta que alguien reclama.
3. **El saldo se DERIVA del libro, no se guarda.** `saldos` es un atajo con
   guarda de concurrencia; si discrepa del libro, gana el libro.
4. **Ni un dato inventado.** Sin tasa real no hay conversión y la pantalla pinta
   un guion. Nunca un 1:1 de relleno, nunca un cero de consuelo.
5. **Lo que no se entiende, se rechaza.** Enderezar a ojo un monto que llegó
   torcido es adivinar con la plata de otro.

---

## El backend — `infra/aucorp-api/`

### `lib/monedas.js` — las 21 monedas

Latinoamérica completa, Canadá y el euro, con sus decimales **reales**.

| | |
|---|---|
| Referencia | USD |
| Centroamérica y Caribe | HNL, GTQ, CRC, NIO, PAB, DOP, BZD, JMD |
| Sudamérica | MXN, COP, PEN, BOB, BRL, ARS, UYU, VES, **CLP (0 dec)**, **PYG (0 dec)** |
| Norte y Europa | CAD, EUR |

Lee montos escritos a mano en las dos formas del continente — `1.234,56` y
`1,234.56` — decidiendo por el **agrupamiento de tres en tres**, no contando
separadores. Rechaza `1.2.3.4`, miles mal agrupados, y más decimales de los que
la moneda tiene: redondear en silencio el dinero de otra persona es como se
pierden céntimos que después nadie sabe explicar.

### `lib/libro.js` — partida doble

Un asiento cuadra **por moneda**: sumar dólares con lempiras sería inventarse un
tipo de cambio dentro del libro. El saldo de un cliente es un **PASIVO** — la
casa se lo debe, no es suyo; ponerlo como activo es el error contable que precede
a gastarse el dinero de los clientes.

`reservas()` compara, por moneda, lo que se le debe a los clientes contra lo que
hay guardado. Un descuadre negativo no es un problema contable: es dinero de
clientes que no está, y esa función existe para que se vea el mismo día.

### `lib/asientos.js` — la única puerta

Nadie escribe `saldos` a mano. `asentar()` hace cuadrar el asiento y lo aplica.

**La guarda de concurrencia.** Comprobar el saldo y después restar es la receta
del doble gasto — dos retiros que leen 100 a la vez y salen los dos. La
comprobación del rojo va **dentro** del `findOneAndUpdate` condicionado, con el
propio string del monto como versión. Es la misma guarda lee-compara-escribe que
ya probó estar bien en el ledger de Ordenex. La prueba lanza los dos retiros de
verdad y comprueba que pasa exactamente uno.

**El orden.** Se mueven los saldos primero y se inserta el asiento después,
elegido por qué pasa si el proceso muere en medio:

- saldo movido sin asiento → el cliente ve **menos** plata por un rato. Molesto.
- asiento sin saldo movido → el cliente ve **más** y puede gastarla dos veces.

Se falla del lado molesto. Si el insert falla, se deshace lo aplicado y se grita
en el log.

`reconciliar()` recalcula desde el libro y compara. Con `arreglar` reescribe el
atajo con lo que dice el libro, **nunca al revés**.

### `lib/cambio.js` — tasas reales

Fuente: `open.er-api.com` (referencia diaria contra el dólar, cubre las 21
monedas, sin llave). Cada cotización viaja con **la fecha en que la fuente la
publicó** —no cuándo la pedimos: «hace 3 minutos» sobre una tasa de ayer es una
mentira con reloj— y con su origen dicho: es tasa de **referencia**, no precio de
ejecución de un corresponsal.

El margen va en `AUCORP_MARGEN_BPS` y por defecto es **CERO**. La cotización
devuelve la media **y** la aplicada, para que el margen se vea en vez de
esconderse dentro de un número peor.

`convertir()` exige la tasa como parámetro y no va a buscarla sola: quien
convierte tiene que haber visto la tasa, su fecha y su margen y haberlos guardado
en el asiento. Redondeo al más cercano, explícito — truncar siempre favorece a la
casa.

### `lib/tarifas.js` — comisiones y límites

Todas las comisiones **juntas en un archivo**, para que la Junta pueda leer qué
se cobra sin abrir el código del dinero. Todas en **cero** por defecto: un cobro
que aparece porque nadie configuró nada es un cobro que nadie decidió.

Redondean **hacia abajo**, al revés que las conversiones, para que el sobrante
nunca caiga sistemáticamente del lado de la casa.

Los límites, en cambio, **arrancan puestos** (nivel 1, el más apretado):

| Nivel | Diario | Mensual |
|---|---|---|
| 1 · identidad verificada | 1.000 USD | 5.000 USD |
| 2 · verificación reforzada | 10.000 USD | 50.000 USD |
| 3 · expediente completo | 100.000 USD | 500.000 USD |

Son **política, no técnica**: los pone la Junta y se cambian con
`AUCORP_LIMITES`. Los de arriba son un punto de partida conservador, no una
recomendación regulatoria.

### `lib/consumo.js` — cuánto lleva movido

Se mide en dólares para que el tope no se pueda saltar moviendo mil en cada una
de veintiuna monedas. Se calcula **recorriendo el libro**, no con un contador
guardado: un contador que se queda atrás lo hace en silencio y siempre a favor de
quien está moviendo dinero.

Solo cuenta lo que **sale**. Un retiro rechazado (clase `reverso`) libera lo que
había consumido.

Sin tasa no se puede medir, y **no poder medir es un NO**: dejar pasar porque el
proveedor de tasas está caído es justo cuando conviene mover dinero que no
debería moverse.

### Las rutas

| Ruta | Quién | Qué |
|---|---|---|
| `POST /auth/sso` · `/auth/refresh` | abierta | Entrar con Genesis ID |
| `GET /monedas` | abierta | Las 21, con el aviso de que manejar ≠ liquidar |
| `GET /cuentas` · `POST /cuentas` | sesión | Listar y abrir; total en USD (null si falta tasa) |
| `GET /limites` | sesión | Nivel, usado y tope |
| `GET /movimientos` | sesión | El extracto |
| `GET /movimientos/cotizar` | sesión | La tasa antes de cambiar |
| `POST /movimientos/transferir` | sesión | A otro cliente |
| `POST /movimientos/cambiar` | sesión | Entre monedas propias |
| `GET/POST/DELETE /beneficiarios` | sesión | La libreta de destinos |
| `GET /solicitudes` · `POST /solicitudes/retiro` | sesión | Pedir un retiro |
| `GET /deposito/instrucciones` | sesión | A dónde mandar el dinero |
| `POST /tesoreria/deposito` · `/retiro` | **X-Admin-Key** | La frontera |
| `GET /tesoreria/solicitudes` · `POST …/ejecutar` · `…/rechazar` | **X-Admin-Key** | La cola de retiros |
| `GET /tesoreria/corresponsales` · `POST /tesoreria/corresponsal` | **X-Admin-Key** | Las cuentas reales de la casa |
| `POST /tesoreria/nivel` | **X-Admin-Key** | Subir o bajar límites |
| `GET /tesoreria/reconciliar` | **X-Admin-Key** | Libro vs. atajo |
| `GET /salud` | abierta | Dice la verdad, incluido qué NO es esta casa |

### Las decisiones que hay detrás

**Un depósito no lo declara quien deposita.** Lo confirma quien vio llegar el
dinero. Una ruta donde el cliente dice «me llegaron mil» es una ruta donde
cualquiera se acredita mil. El comprobante del corresponsal es obligatorio, y una
sesión de usuario normal no abre esa puerta ni siendo válida.

**Un retiro se PIDE, no se ejecuta.** Entre el pedido y el pago pasa tiempo. Si
durante ese rato el dinero siguiera disponible, alguien podría pedir tres retiros
de todo su saldo y los tres se verían pagables; el primero que se pagara dejaría
a los otros dos sin fondo, y quien lo descubriría sería el corresponsal rebotando
una transferencia. Así que un asiento lo mueve a `retiro:<gid>` — sigue siendo
pasivo, la casa se lo sigue debiendo — y ahí espera.

Rechazarlo lo devuelve **entero, comisión incluida**: si no se pagó, no se cobra.

**En un retiro se aparta el neto MÁS la comisión.** Quien pide 100 recibe 100. La
alternativa —apartar 100 y mandar 98— es la que hace que la gente reciba menos de
lo que escribió, y eso siempre se siente como un engaño aunque estuviera en la
letra chica.

**Los beneficiarios son seguridad, no comodidad.** Un formulario en blanco
delante de alguien apurado es donde un dígito cambiado manda el dinero a otra
persona, y una transferencia emitida no se deshace pidiéndolo por favor. Se
comprueba al guardarlo, no al mandar. El número vuelve enmascarado, y la
solicitud se lleva una copia **congelada**: un histórico que cambia cuando cambia
otra tabla no es un histórico.

**Las cuentas del corresponsal NO viven en el código.** Un número de cuenta
bancaria en un commit es un número de cuenta publicado, y a diferencia de una
clave, ese no se rota — hay que abrir otra cuenta en otro banco. Las carga
operaciones contra la base.

**Sin corresponsal en una plaza no se inventa una cuenta** ni se enseña la de
otra moneda. Que el sistema sepa contar guaraníes no quiere decir que haya dónde
recibirlos.

**Entrar se puede sin KYC; mover dinero, no.** La puerta está en el dinero y no
en el sitio, justamente para que alguien pueda mirar antes de entregar sus
papeles. Y cuando se rechaza se dice **por qué**: el usuario puede ir y
terminarlo.

**El JWT se firma con `AUCORP_TOKEN`, nunca con el `PASS_TOKEN` de la wallet.**
Compartir el secreto de firma sería compartir todas las sesiones, y un
compromiso de AuCorp no puede volverse un compromiso de la billetera.

---

## La app — `apps-web/aucorp/banca/`

Un HTML y un JS. Sin marco, sin compilar: lo que hay en el repositorio es lo que
corre.

Misma paleta que el sitio de AuCorp —hueso, pozo, oro, acero— porque es la misma
empresa y cambiar de colores al entrar haría dudar a cualquiera de si sigue en el
sitio correcto. Lo que cambia es la **densidad**: una portada se lee de arriba
abajo y esto se **opera**.

- Cifras **tabulares** siempre: una columna de saldos donde los dígitos bailan no
  se puede comparar de un vistazo.
- Cada estado tiene **forma además de color**, para quien no distingue verde de
  rojo.
- Riel en el escritorio, barra de cinco destinos en el teléfono.
- La tabla del extracto deja de ser tabla en pantalla chica: cinco columnas en
  360px no se leen, se sufren.

**Pantallas:** cuentas (con el total en dólares), mover (transferir · cambiar con
la cotización mientras se escribe · pedir retiro), depositar, movimientos,
destinos, límites.

### Seguridad de la pantalla

- **Aquí no hay contraseña.** Se entra con la cuenta de Veta Wallet. La
  contraseña de la wallet no pasa por esta pantalla ni una vez, y por eso no
  puede filtrarse desde aquí.
- El token de paso **se consume del hash inmediatamente**: un token en la barra
  de direcciones es un token que se copia, se pega en un chat y se queda en el
  historial.
- La sesión vive en **`sessionStorage`**: cerrar la pestaña cierra la sesión. En
  una pantalla de dinero eso es lo correcto —un ordenador prestado, una oficina
  compartida— y volver a entrar es un clic.
- Cada formulario acuña su **sello de idempotencia una vez** y lo conserva
  mientras esté abierto, para que un reintento tras un corte de red no mande el
  dinero dos veces. Acuñar uno nuevo en cada toque haría exactamente lo
  contrario.
- CSP estricta, `noindex`, `esc()` en todo lo que viene del servidor.

---

## Las pruebas

| Suite | Qué prueba |
|---|---|
| `probar-monedas.mjs` | Decimales reales, las dos formas de escribir, lo que se rechaza |
| `probar-libro.mjs` | Partida doble, cuadre por moneda, la posición de cambio a la vista |
| `probar-asientos.mjs` | Mongo real: idempotencia, nunca rojo, **la carrera**, el libro manda |
| `probar-cambio.mjs` | La fuente **de verdad**: 21 monedas, conversión sin perder céntimos |
| `probar-api.mjs` | El API entero: recorrido completo + todas las puertas cerradas |
| `apps-web/probar-banca.mjs` | **Navegador real contra API real**: la pantalla y el API se entienden |

```
cd infra/aucorp-api && npm install && npm run probar
cd apps-web && node probar-banca.mjs
```

Si `mongodb-memory-server` no puede descargar su binario, las suites de Mongo lo
dicen y se salen sin fingir un verde. Se le puede pasar uno ya descargado con
`MONGOMS_SYSTEM_BINARY=/ruta/a/mongod`.

### Fallos reales que las pruebas encontraron

- **El acuse que se borraba.** `ir()` limpiaba el aviso, así que la confirmación
  de una transferencia se destruía en el mismo gesto que la mostraba: el dinero
  salía bien y la persona no veía ni una palabra. Ahora el aviso viaja **con** el
  cambio de pantalla — pertenece a la pantalla a la que se llega.
- **`1.2.3.4` se aceptaba** como 1234 con 4 decimales. Cerrado validando el
  agrupamiento de tres en tres.

### Dos trampas del arnés, anotadas porque el síntoma no se parece a la causa

- Ir de `/banca/` a `/banca/#sso=…` es un cambio de **hash**: el navegador no
  recarga el documento, el script no vuelve a correr y la llave no se lee nunca.
- Interceptar el HTML con `page.route` para ajustar la CSP deja **colgadas para
  siempre** las peticiones que hace la propia página. La pantalla se queda en
  «Entrando…» y no hay ni un error en consola.

---

## Variables de entorno

| Variable | Para qué | Sin ella |
|---|---|---|
| `MONGODB_URI` | La base (`dbName: aucorp` se fija en el código) | Arranca, `/salud` lo canta, toda operación falla cerrada |
| `AUCORP_TOKEN` | Firma las sesiones. **Nunca el `PASS_TOKEN` de la wallet** | No entra nadie (503) |
| `AUCORP_ADMIN_KEY` | La frontera del dinero | La frontera queda cerrada (503) |
| `GENESIS_API_KEY` | El alta de la app `aucorp` en Genesis | No se verifica ningún SSO |
| `GENESIS_URL` | Dónde vive Genesis | Por defecto, producción |
| `CORS_ORIGENES` | Orígenes permitidos, por comas | Ningún navegador puede llamar |
| `AUCORP_MARGEN_BPS` | Margen del cambio | **Cero** |
| `AUCORP_TARIFAS` | Comisiones (JSON) | **Todas en cero** |
| `AUCORP_LIMITES` | Topes por nivel (JSON) | Los conservadores de arriba |

---

## Desplegado hoy

| Qué | Dónde | Estado |
|---|---|---|
| Sitio + banca de AuCorp | `main.d2e55u6ls6v9xt.amplifyapp.com` | ✅ arriba |
| Veta Wallet (esfera abierta) | `app.vetawallet.com` · `www.vetawallet.com` | ✅ arriba |
| API de AuCorp | — | ❌ **sin desplegar** |

---

## Lo que falta — y de quién es

### Bloqueantes, tuyos

1. **`www.aucorp.io` sirve todavía el WordPress viejo.** Ahí `/banca` redirige a
   `/service/banca-movil/`. Por eso la esfera de la wallet apunta al dominio de
   Amplify. Cuando el dominio apunte a la app, es **una línea** (`URL_AUCORP` en
   `apps-web/veta-wallet/app.js`).
2. **El API no está desplegado.** No creé el servicio ni la base: es gasto
   recurrente y decisión de infraestructura. Hasta entonces la app dice «no se
   pudo conectar» — honesto, pero no funciona.
3. **Dar de alta la app `aucorp` en Genesis ID** para que tenga su propia clave
   (`APPS_ECOSISTEMA`). Sin eso no se puede verificar ningún SSO.
4. **Cargar las cuentas del corresponsal** por `POST /tesoreria/corresponsal`
   cuando el API esté arriba. Nunca por el repositorio.
5. **Decidir las comisiones y los límites definitivos.** Hoy las comisiones son
   cero y los límites son un punto de partida conservador. Los definitivos los
   pone la Junta y hay que mirar el régimen de cada plaza.

### Del producto, pendientes

- **La conciliación con el corresponsal es MANUAL.** Una persona de operaciones
  marca cada depósito contra el extracto. No hay integración automática, y fingir
  que la hay sería peor que no tenerla porque nadie estaría revisando.
- **No hay ejecución real de divisas.** Cada cambio deja a la casa con una
  posición en `posicion.cambio` que alguien tiene que cerrar comprando la moneda
  de verdad. `reservas()` enseña esa posición corta a propósito, en vez de
  taparla con un ajuste.
- **Falta el puente fiat → cripto** (comprar ORIGEN/ONDK con saldo fiat). Los dos
  lados ya comparten el `gid` y la dirección custodiada viaja en el SSO: falta el
  asiento que ata las dos casas.
- **La app está solo en español.** El sitio tiene los dos idiomas; la banca, no.
- **La esfera de la app móvil sigue en «pronto»** hasta que se cablee su SSO.
- **Panel de operaciones**: hoy la cola de retiros y la carga de corresponsales se
  usan con `curl` y `X-Admin-Key`. Funciona, pero no tiene pantalla.

---

## Pendientes de antes, sin tocar

- **Tarea #17** — la cadena tiene 1 validador, no 6.
- **Tarea #27** — `PASS_TOKEN` de 7 caracteres firma todas las sesiones de la
  wallet.
- Aplicar el sello de la bitácora, borrar 4 cuentas de prueba, rotar la clave de
  CoinMarketCap.
- **Parkeado por vos:** el creador de mercado del tesoro, la guarda de auto-cruce
  en el motor, y arrancar el libro de ONDK.
- **Tuyo:** fondear la wallet pagadora de ORIGEN
  (`0x746268404Cc9CA2ef0Ac344F02B236DB232c3ad8`, ~20,96 ORIGEN), registrar los
  primeros agentes fiat, y dar gas BNB + decidir llaves owner/operator del
  contrato `VentaOrigen` (escrito y probado, nunca desplegado).

---

## Commits de este trabajo

```
15bbb74  cimientos del dinero fiat — monedas y libro mayor
991738a  la puerta del dinero — persistencia, guarda de concurrencia y reconciliación
dfb9d5d  tasas de cambio reales, con fecha y sin inventar nada
40352d7  el API en pie — SSO, cuentas, transferencias, cambio y frontera
fe7be17  AUBANK pasa a ser AuCorp en todo el ecosistema, y su esfera deja de dormir
e2fd5e3  las funciones que le faltaban a una fintech de verdad
655b763  la banca, con su diseño y todas sus pantallas
6718304  prueba de la banca en un navegador de verdad, y el acuse que se borraba
```
