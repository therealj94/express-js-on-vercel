# OrdenExchange

La casa de cambio P2P del ecosistema Orden Global. Funciona como Binance P2P: la
gente publica anuncios para **comprar o vender ORIGEN** (y AUKA, AGKA) a cambio de
la moneda de su país —lempiras, quetzales, pesos, reales, soles, bolívares…—
pagando por transferencia bancaria o por las billeteras que cada país usa de
verdad (PIX, Nequi, Yape, SINPE Móvil, Tigo Money, Pago Móvil, Mercado Pago,
SPEI, Zelle…). La plataforma **custodia el activo** mientras el pago viaja por
fuera, hay **chat** por orden, **temporizador**, **apelaciones** que resuelve un
operador, **calificaciones** y **agentes de cambio** (comerciantes verificados
con garantía e insignia). Para operar hace falta **Genesis ID** verificado.

```
navegador ──▶ OrdenExchange (Express + TS) ──X-API-Key──▶ Genesis ID
                     │
                     └──JSON-RPC──▶ cadena 5550 (depósitos · retiros)
```

## Qué hay dentro

| Carpeta | Qué |
| --- | --- |
| `src/index.ts` | El servidor: API, app web y panel |
| `src/types.ts` | El modelo de datos entero, comentado |
| `src/motor/` | La lógica: `billetera` (custodia), `ordenes`, `anuncios`, `usuarios`, `agentes`, `precios`, `genesis`, `cadena`, `operadores`, `bitacora`, `demo` |
| `src/routes/` | Las rutas HTTP, finas: validan la sesión y llaman al motor |
| `src/data/` | `latam.ts` (países, monedas, métodos de pago con sus campos), `bancos.ts` (generado: los bancos de cada país con tipos de cuenta y formato, desde `fuentes/bancos.json` con `npm run generar:bancos`), `activos.ts`, `fxSemilla.ts` |
| `src/lib/` | `decimal.ts` (aritmética exacta con BigInt), sesión, límites, errores |
| `public/` | La app web (`index.html`, `app.js`, `i18n.js`) y el panel (`admin.html`) |
| `herramientas/` | `generar-bancos.mjs`: de `src/data/fuentes/bancos.json` a `src/data/bancos.ts` |
| `src/pruebas/` | Pruebas de extremo a extremo sobre el servidor real |
| `API.md` | El contrato HTTP completo |
| `docs/` | El documento de diseño (`OrdenExchange-Diseno.pdf`, generado desde `diseno.html`) con la arquitectura, los flujos, el KYC, la seguridad y las capturas |

## Cómo se pone en marcha

```sh
cd ordenexchange
npm install
npm start            # http://localhost:4100  → app en /, panel en /admin
npm run prueba       # pruebas
npm run typecheck
```

Sin `GENESIS_API_KEY` y fuera de producción arranca en **modo demostración**:
diez usuarios ya verificados (con GID de prueba, sufijo `-D`) en Honduras,
Guatemala, Brasil, Colombia, Perú, México, Costa Rica, Venezuela y Argentina,
con saldo, métodos de pago y anuncios. Se entra con un clic desde la pantalla de
entrada (o con su correo `<apodo>@demo.ordenexchange` y contraseña `demo1234`).
El panel imprime la contraseña del administrador al arrancar.

## Cómo funciona una compraventa

1. Alguien publica un **anuncio**: lado (compro / vendo), activo, moneda, precio
   fijo o **flotante** (un porcentaje sobre el precio de referencia), cantidad,
   límites por orden, métodos de pago, ventana de pago (15–60 min), términos y
   requisitos para la contraparte.
2. Otra persona lo toma: elige cuánto y abre la **orden**. En ese instante el
   activo del vendedor pasa a **custodia** (congelado). Si el vendedor no lo
   tiene, la orden no nace y el anuncio se pausa.
3. El comprador transfiere el dinero por el método pactado —los datos bancarios
   se ven solo dentro de la orden— y marca **«pagado»** antes de que venza el
   temporizador. Si no, la orden se cancela sola y el activo vuelve al vendedor.
4. El vendedor comprueba que llegó el dinero y **libera**: el activo pasa
   entero al comprador; la comisión, si hay, la paga el vendedor. Ambos se
   califican. Una orden que venció sin marcarse pagada se puede apelar durante
   24 horas si el comprador sí pagó.
5. Si algo falla, cualquiera **apela**: la orden se congela, un operador lee el
   chat y los comprobantes desde el panel y decide: liberar al comprador o
   devolver al vendedor. Queda en la bitácora.

## Los bancos de cada país

457 bancos y entidades en 23 países, con su tipo (comercial, estatal,
cooperativa, fintech, microfinanciera, caja), los **tipos de cuenta** que
ofrece cada uno con su nombre local (monetaria, caja de ahorro, cuenta vista,
conta poupança, cheques), el **formato del identificador** para transferir
(CLABE de 18 dígitos, CBU de 22, agencia + cuenta, CCI de 20) y el **código
oficial** donde existe (SPEI en México, código de banco en Venezuela para el
Pago Móvil, ACH en Colombia). Incluye las cooperativas y cajas que de verdad
se usan —MICOOPE, FEDECRÉDITO, las cajas municipales del Perú, la JEP en
Ecuador, APAP en República Dominicana— y anota las absorciones recientes.

La fuente es `src/data/fuentes/bancos.json`; `npm run generar:bancos` produce
`src/data/bancos.ts`, y de ahí salen los nombres de la transferencia bancaria
del catálogo. La app los pide por `GET /api/mercado/bancos/:pais` y el
formulario de métodos de pago agrupa principales y otros, ofrece los tipos de
cuenta del banco elegido y enseña el formato del número.

## Avisos y ayuda

Un **pulso** cada 20 segundos avisa de una orden nueva sobre tu anuncio, de un
cambio de estado o de un mensaje sin leer, se esté donde se esté en la app; el
aviso lleva a la orden. El **centro de ayuda** (`#/ayuda`) responde en los dos
idiomas las quince preguntas que de verdad se hace quien empieza, incluidas
las dos estafas típicas: el pago desde la cuenta de un tercero y el trato por
fuera de la plataforma.

## Precio de referencia

El activo está anclado al metal: **1 ORIGEN = 1/55 g de oro**, 1 AUKA = 1 onza
troy de oro, 1 AGKA = 1 onza troy de plata. Con el precio del metal en USD y la
tasa USD → moneda local sale la referencia en cada moneda; sobre ella trabajan
los anuncios flotantes y contra ella se comparan los fijos (un precio diez veces
fuera se rechaza: casi siempre es un cero de más). Metal y tasas los fija un
operador desde el panel; al arrancar salen de las variables de entorno y de la
semilla de `fxSemilla.ts`.

## Custodia: las tres reglas

1. Ningún bolsillo baja de cero; un movimiento que lo haría se rechaza entero.
2. Todo cambio de saldo deja un movimiento con su referencia. La suma de los
   movimientos ES el saldo (hay una prueba que lo comprueba para todos).
3. El activo no se inventa: entra por depósito comprobado en la cadena (o por el
   grifo de demostración, que se ve como tal) y sale por retiro que firma un
   operador. Liberar una orden solo mueve custodia del vendedor al comprador.

Toda la aritmética es exacta (`lib/decimal.ts`, BigInt a 18 decimales); los
recortes se hacen siempre hacia abajo.

## Confirmación del correo

La identidad se busca en Genesis ID **por el correo de la cuenta**, así que el
correo se confirma antes con un código de seis dígitos (Brevo, `BREVO_API_KEY`).
Sin proveedor y fuera de producción, el código se imprime en el registro y
vuelve en la respuesta (`codigoDemo`), para poder probar el flujo entero.

## Genesis ID

OrdenExchange entra por la misma puerta que Veta Wallet y MyTokenPay: la app
`ordenexchange` en Genesis ID, con su clave y sus alcances (`genesis-id/src/auth/
aplicaciones.ts`). El navegador nunca ve la clave: habla con `/api/genesis/*` y
el servidor reenvía (`src/motor/genesis.ts`, el mismo puente que
`infra/genesis-proxy`).

La verificación (KYC) se hace desde el perfil, en tres pasos, y la decide una
persona en Genesis ID:

1. **Datos y perfil de cumplimiento**: nombre tal como está en el documento,
   fecha de nacimiento, país, teléfono, dirección, **ocupación**, **origen de
   los fondos**, cuánto espera mover al año y si es persona expuesta
   políticamente. Genesis ID tamiza el nombre contra las listas de sanciones.
2. **Documento**: la MRZ (las líneas de caracteres del pasaporte o cédula),
   leída en el teléfono; la imagen no viaja. Genesis ID comprueba los dígitos
   de control, la vigencia y que coincida con lo declarado.
3. **Rostro**: un selfie. Con proveedor de biometría se coteja solo; sin él lo
   coteja un operador. La cuenta queda **en revisión**.
4. Un **operador de cumplimiento** aprueba en el panel de Genesis ID (con las
   listas de sanciones cargadas y sin bloqueos). Genesis ID emite el **GID**
   (`GEN-XXXX-XXXX-C`); OrdenExchange lo recoge al sincronizar, guarda el
   nombre legal, ata la cuenta a la identidad y la persona ya puede operar.

Cada paso devuelve el estado de la identidad y la cuenta ya sincronizada, así
que la app siempre sabe en qué paso va (`paso`), qué falta (`faltanDatos`) y si
hay que repetir la foto (`rostroPendiente`). Además:

- se puede entrar con **sesión única** desde otra app del ecosistema
  (`POST /api/auth/sso`), y OrdenExchange emite tokens para las demás;
- ninguna cuenta opera sin GID verificado; si Genesis ID la **suspende**, deja
  de operar en cuanto se sincroniza;
- cada dirección de retiro se **tamiza** contra las listas de sanciones (si
  Genesis ID no responde, el retiro no sale: se cierra, no se abre);
- cada compraventa completada se manda al **monitoreo AML** de ambas partes por
  una cola persistente con reintentos (`src/motor/aml.ts`): un reporte que no
  llega se reintenta, no se pierde.

Todo esto se prueba contra un Genesis ID de verdad, no contra un doble:

```sh
(cd ../genesis-id && npm install)
npm run prueba:genesis
```

`src/pruebas/genesis.integracion.ts` levanta el Genesis ID del repositorio en
un proceso aparte (clave recién emitida, listas de prueba, sin proveedor de
biometría) y OrdenExchange en modo real, y recorre registro → correo → datos →
MRZ → rostro → revisión → aprobación por el operador → GID, sesión única,
tamizado, una compraventa cuyos movimientos llegan al monitoreo y una
suspensión que apaga la cuenta.

## Cadena 5550

No hay llaves privadas aquí. **Depositar** es transferir desde la dirección
registrada en el perfil a la **tesorería** de la plataforma y pegar el hash: el
servidor lo comprueba por JSON-RPC (destino, origen, confirmaciones; para AUKA y
AGKA, el evento `Transfer`). **Retirar** deja el monto en custodia hasta que un
operador lo firma desde la tesorería y anota el hash en el panel.

## Panel de operadores (`/admin`)

Resumen, apelaciones (con el chat completo y los comprobantes), órdenes, agentes,
retiros, depósitos, usuarios (congelar, ajustar), precios, configuración,
bitácora encadenada y operadores. Roles: `admin` todo (incluidos precios,
configuración y ajustes de saldo); `soporte` resuelve apelaciones, cancela
órdenes, decide retiros y agentes y bloquea cuentas; `auditor` solo lee.

## Despliegue

- **Render**: `render.yaml` en la raíz del repo trae el servicio `ordenexchange`
  (rootDir `ordenexchange`). Hay que fijar `ORDENEX_MONGO_URL`, `GENESIS_API_KEY`,
  `BREVO_API_KEY`, `ORDENEX_TESORERIA`, `ORDENEX_ADMIN_PASSWORD` y el precio del
  metal. El modo demostración nunca se enciende con Mongo o tesorería configuradas.
- **Vercel**: `vercel.json` ya apunta a `src/index.ts`. Mongo es obligatorio.

`GET /healthz` responde `degradado` mientras falte algo esencial y dice qué.

## Pruebas

```sh
npm run prueba
```

`decimal.test.ts` prueba la aritmética. `genesis.integracion.ts` (`npm run
prueba:genesis`) es el KYC contra un Genesis ID real (ver arriba). `flujo.test.ts`
levanta el servidor en modo demo y recorre todo: registro y confirmación del correo, verificación, mercado, orden de compra con
custodia, chat, marcar pagado, liberar con contraseña, calificar; orden de venta
sobre un anuncio de compra; cancelación y vencimiento; apelaciones resueltas en
ambos sentidos desde el panel; permisos de auditor; congelar cuentas; precios;
anuncios propios con requisitos; retiros; agentes; y al final comprueba que
**cada saldo cuadra con sus movimientos**.
