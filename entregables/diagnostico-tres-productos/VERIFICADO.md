# Lo que verifiqué yo mismo, contra el código y contra producción

Notas de trabajo del diagnóstico de PULSE2CHAT, Veta Wallet y Ordenex.
Acá solo va lo que comprobé de primera mano. Lo que reportan los agentes y yo
no pude confirmar va marcado como tal.

21 de agosto de 2026.

---

## Producción, medido con peticiones reales

### Ordenex: vivo, y no ha operado nunca

`GET https://ordenex-api-ba4b27b8b51a.herokuapp.com/mercados`

**14 mercados listados. Los 14 con volumen cero y sin último precio.**

| | |
|---|---|
| Mercados | AUKA, AGKA, ONDK, MNKA, IBS, HARV, AUBEX, ASL, LOVE, REST, SOL, AIT, AGRO, POLITICAL (todos contra ORIGEN) |
| Con volumen 24 h | 0 de 14 |
| Con último precio | 0 de 14 |
| Con precio de referencia | 3 de 14 (AUKA 4.596,58 USD · AGKA 62,59 · ONDK 2,15) |

Libro de órdenes:

- `AUKA-ORIGEN`: **una sola orden de venta** (4.365,3 ORIGEN por 1 AUKA). Cero compras.
- `ONDK-ORIGEN`: libro vacío por los dos lados.
- `AGKA-ORIGEN`: libro vacío por los dos lados.
- Tratos históricos en los tres: **cero**.

La API funciona bien. `/salud` contesta `{ok:true, cadena:true, mongo:true, bloque:58137}`,
que es una sonda honesta. Lo que no ha arrancado es el mercado.

### Cabeceras de seguridad, comparadas

| | CSP | HSTS | nosniff | X-Frame | Firma del servidor |
|---|---|---|---|---|---|
| Veta Wallet backend | sí | sí | sí | sí | oculta |
| Ordenex API | no | no | no | no | **`X-Powered-By: Express`** |
| Relevo de mensajes | no | no | no | no | (no aplica, es Python) |
| Genesis ID | — | sí | sí | sí | oculta |

La billetera tiene esto resuelto. Ordenex no tiene ninguna.

### Rutas de salud

| Servicio | Ruta | Qué publica |
|---|---|---|
| Genesis ID | `/healthz` | Listas, bitácora, caducidad, segundo factor, almacén, cola |
| Ordenex | `/salud` | `ok`, `cadena`, `mongo`, `bloque` |
| Mensajes | `/salud` | `vivo`, `cuando` |
| **Veta Wallet** | **ninguna** | Probé `/health`, `/healthz`, `/api/health`, `/status`: los cuatro 404 |

El backend que mueve dinero es el único sin sonda de salud.

### Genesis ID: lo de la tanda anterior está desplegado y funcionando

`GET https://genesis-id.onrender.com/healthz`, commit `6268b655`:

| | |
|---|---|
| `listasAlDiaSolas` | `true` |
| `listasRegistros` | **19.249** fichas reales de la OFAC |
| `caducidadActiva` | `true` |
| `bitacoraFirmada` | **`false`** ← falta la llave en Render |
| `operadoresSinSegundoFactor` | **2** |
| HSTS | puesta |
| `X-Powered-By` | fuera |

Dos cosas quedaron a medias **por configuración, no por código**: sin
`GENESIS_BITACORA_CLAVE` la bitácora no se firma, y dos operadores de rol
obligado no activaron su segundo factor.

---

## Veta Wallet · verificado en el código

### El sello de idempotencia solo actúa si el cliente lo manda

`infra/veta-wallet-backend/controller/transactionController.js:118`

```js
if (sello) {
  const reserva = await reservar(sello, quien, { chain_id, recipientAddress, amount });
```

Leído entero el camino: sin `idempotencyKey` en el cuerpo, `send()` valida la
contraseña, firma y emite **sin ningún control de duplicado**. El mecanismo de
`lib/idempotencia.js` está bien hecho —índice único como cerrojo real, reserva
antes de firmar, huella de los datos— pero toda la garantía depende de un dato
que manda el cliente y que el cliente puede perder.

Y lo pierde: en `apps-web/veta-wallet/app.js:2392` el sello vive en una variable
de memoria (`let enviando = false, pendiente = null`). Recargar la página lo
borra, y el reintento acuña uno nuevo que el backend nunca vio.

### `/transaction/send`: 300 veces más intentos de contraseña que `decriptSeed`

Los dos piden la contraseña. Los dos son un oráculo para adivinarla. Pero:

| Ruta | Qué hace | Tope | Dónde |
|---|---|---|---|
| `/users/decriptSeed` | **enseña** la frase semilla | 5 cada 15 min | `app.js:140-145` |
| `/users/decriptPrivate` | **enseña** la llave privada | 5 cada 15 min | `app.js:146` |
| `/cards/fund` | mueve hasta 5.000 USD | 10 cada 15 min | `app.js:116-121` |
| **`/transaction/send`** | **mueve todo el saldo** | **100 por minuto** | solo el global, `app.js:107` |

5 cada 15 minutos son 20 intentos a la hora. 100 por minuto son 6.000. El equipo
puso el freno duro donde el premio es *ver* un secreto, y lo dejó suelto donde el
premio es *llevarse el dinero*.

**Corrección a lo que reportó el agente:** dijo que con una ficha de sesión
robada se puede vaciar la billetera. **No es cierto**, y conviene decirlo: el
código pide además la contraseña (`transactionController.js:106`,
`bcrypt.compare`). El hallazgo real no es «una ficha basta», es la desproporción
del límite de intentos.

### `console.log(provider)` en el camino del dinero

`infra/veta-wallet-backend/controller/transactionController.js:100`, justo
después de `new JsonRpcProvider(chain.provider)`. El propio repositorio dejó
escrito en `routes/chains.js:20-22` que ese campo ha llevado direcciones de RPC
con la clave dentro, y que ya hubo una fuga por ahí. Se cerró en `/allChains` y
se reabrió acá con un registro de depuración que quedó en el camino de cada
envío.

### El webhook de tarjeta no comprueba firma

`infra/veta-wallet-backend/controller/cardController.js:894`

```js
if (!webhookKey || webhookKey !== process.env.CRYPTOMATE_WEBHOOK_KEY) {
```

Un secreto compartido estático, comparado con `!==`, y sin ningún HMAC sobre el
cuerpo. En el mismo repositorio, el webhook de KYC
(`kycController.js:21-33`) **sí** calcula HMAC-SHA256 sobre el cuerpo y compara
con `timingSafeEqual`. O sea que el patrón correcto ya existe en casa; es este el
que se quedó atrás.

---

## Lo que está bien y hay que decirlo

- **Los saldos de la billetera salen en vivo de la cadena**, no de un caché en la
  base. No hay dos fuentes que se puedan desincronizar.
- **El único saldo que sí vive en Mongo** se actualiza con `findOneAndUpdate`
  condicionado, así que dos peticiones a la vez no pueden acreditar ni descontar
  dos veces.
- **El precio y la comisión se calculan en el servidor.** No encontré ningún
  camino por el que el cliente pueda influirlos.
- **Ordenex guarda las cantidades como enteros de 18 decimales en texto**
  (`"4365300000000000000000"`), no como números de coma flotante. Es la decisión
  correcta y es la que evita el fallo más caro de una casa de cambio.
- **El webhook de KYC** verifica firma como se debe.

---

## Segunda tanda de verificaciones

### Veta Wallet: no existe revocación de sesión

`infra/veta-wallet-backend/middleware/verifyToken.js` comprueba **dos cosas y
nada más**: que la firma sea válida y que `decodedToken.address` coincida con
`user.address`. No mira `tokenVersion`, no mira `deletedAt`, no compara contra
ninguna sesión guardada.

Y **no existe ninguna ruta de cerrar sesión** en el backend. Lo busqué:
`logout`, `salir`, `signout`, `cerrar-sesion` — nada.

`tokenVersion` sí existe (`models/Users.js:203`) y sí sube al cambiar la
contraseña (`userController.js:123`) y al borrar la cuenta (`:443`, `:538`).
Pero **solo lo mira `authController.js:277`, que es la renovación**. O sea:
cambiar la contraseña bloquea la próxima renovación, no la sesión que ya está
abierta.

Consecuencia concreta: alguien sospecha que le robaron la contraseña, la cambia,
y la sesión del ladrón **sigue funcionando** hasta que caduque sola.

El borrado de cuenta es marcado, no destructivo (`user.deletedAt = new Date()`,
la cuenta se anonimiza). Así que el registro sigue existiendo y `user.address`
sigue coincidiendo: una sesión abierta sobre una cuenta borrada sigue pasando la
comprobación.

### Ordenex no tiene NINGÚN límite de peticiones ni cabeceras de seguridad

`infra/ordenex-api/package.json`: **`express-rate-limit` no está.
`helmet` no está.** Ninguno de los dos, ni en dependencias ni en desarrollo.

Eso explica lo que ya había medido desde fuera: cero cabeceras de seguridad y
`X-Powered-By: Express` a la vista.

Sin freno quedan poner órdenes, el circuito fiat entero, y **todo `/admin/*`**.
La clave de administrador se compara en tiempo constante, que está bien pensado
contra un ataque de temporización y no sirve de nada sin tope de intentos.

### Ordenex no tiene ningún documento legal

Busqué «término», «privacidad» y «riesgo» en todo `apps-web/ordenex/`: **cero
resultados**. Es una casa de cambio con circuito entre personas, custodia en
garantía y arbitraje de disputas, y no le dice nada al usuario.

### No hay CI para ningún backend

`.github/workflows/` tiene cuatro archivos: `genesis-build`, `genesis-update`,
`veta-build`, `veta-preview`. **Los cuatro son de compilar y publicar apps
móviles.** Ninguno corre las pruebas de ningún backend ni de ninguna web.

### `npm audit` del backend de la billetera: 26

4 críticas, 9 altas, 5 moderadas, 8 bajas. Medido hoy. Para comparar, medí
también los otros dos: `infra/ordenex-api` y `genesis-id` dan **cero**.

---

## Correcciones a lo que reportaron los agentes

Dos hallazgos no se sostuvieron al comprobarlos. Van escritos porque un informe
que solo suma hallazgos y nunca resta ninguno no es de fiar.

### FALSO · «los enlaces legales de Veta Wallet dan 404»

Se razonó que, como Amplify no sirve la extensión `.html` y no hay archivo de
reescrituras en el repositorio, el pie de página apuntaría a un 404.

Lo probé contra el sitio vivo. **Los cuatro caminos funcionan y sirven el
documento de verdad**, no la app:

| Ruta | Código | Título servido |
|---|---|---|
| `/terminos` | 200 | «Terminos y Condiciones · Veta Wallet» |
| `/privacidad` | 200 | «Politica de Privacidad · Veta Wallet» |
| una ruta inventada | 200 | la app entera (214 KB) |

La comprobación que importa no es el código de respuesta —una aplicación de una
sola página devuelve 200 para todo— sino el contenido. La reescritura está
configurada en algún sitio que no es el repositorio. El agente marcó su propia
duda («hay que comprobar contra el sitio vivo»), que es exactamente lo que hay
que hacer.

### SOBREDIMENSIONADO · «con una ficha de sesión robada se vacía la billetera»

El envío pide además la contraseña (`transactionController.js:106`). El hallazgo
real es otro y es más fino: la desproporción del límite de intentos.

---

## Tercera tanda · PULSE2CHAT y Ordenex

### PULSE2CHAT · el bulto no dice quién lo escribió

`apps-web/veta-wallet/candado.js:286`

```js
const k = await secretoCon(bulto.de);
```

`abrir()` deriva el secreto con la llave pública que viene **dentro del propio
bulto**. Ese campo lo guarda y lo devuelve el servidor tal cual. Busqué si algo
compara `bulto.de` contra las llaves publicadas del remitente que el servidor
declara: **no existe esa comprobación en ninguna parte**.

AES-GCM garantiza que «quien conocía este secreto fabricó este bulto». Si el
secreto se deriva de una llave que elige quien fabrica el bulto, la garantía se
queda en el aire. Quien pueda escribir en el relevo puede poner palabras en boca
de un contacto, y en la pantalla de la víctima es indistinguible de un mensaje
auténtico. Sobre una billetera, eso es dinero.

### PULSE2CHAT · el código de seguridad no coincide, y lo probé ejecutándolo

`apps-web/veta-wallet/chat.js:576`

```js
return CANDADO.codigoDeSeguridad([mia.pub], suyas);
```

Mi lado: **un** aparato (`miLlave()` es el actual). Su lado: **todos** los suyos.
No lo deduje, lo corrí con la función real:

| Caso | Coincide |
|---|---|
| Los dos con un solo aparato | **sí** |
| Los dos con teléfono y computadora | **NO** |
| Pasando todos los aparatos de ambos lados | sí |

El servidor admite cinco aparatos (`servidor.py:368`). Teléfono más computadora
es el caso normal, no el raro.

**Los dos hallazgos se multiplican entre sí.** El primero hace posible
suplantar a un contacto. El segundo rompe justo la pantalla que serviría para
detectarlo: la app dice que una discrepancia «puede ser un ataque», el usuario
la ve discrepar siempre, y en dos días deja de mirarla.

### PULSE2CHAT · el mensaje puede caer a texto plano sin que nadie lo vea

`chat.js:194` devuelve `{ok:true, e2e:false}` cuando no pudo cifrar, con el
comentario de que es «para que la app lo enseñe en ese mensaje». Pero
`app.js:6208` es `await CHAT.enviar(...)`: **el valor de retorno se descarta**.
No hay ningún indicador en la burbuja.

Mientras tanto el sello del compositor se pinta siempre: «ni nosotros podemos
leerlos».

---

### Ordenex · un trato mueve las dos patas en escrituras separadas

`infra/ordenex-api/lib/motor.js:223-234`. Leído: **cuatro llamadas sueltas** a
`ejecutarReserva`, sin `try` que las abrace y sin compensación. La primera saca
el activo del vendedor. La tercera saca el ORIGEN del comprador. Si la primera
pasa y la tercera no, no hay quien deshaga la que ya se movió.

El agente lo midió con un arnés propio y un fallo inyectado, y el resultado es
el que se teme: el vendedor entrega el activo y cobra cero.

### Ordenex · los depósitos se acreditan con CERO confirmaciones

`infra/ordenex-api/lib/cadena5550.js:91,95`

```js
const wei = await conPlazo(p.getBalance(direccion), 12000, 'ORIGEN nativo');
```

Sin etiqueta de bloque, ethers usa `latest`, o sea la punta. No hay profundidad
de confirmación en ningún punto del circuito de depósito.

**La asimetría es la prueba de que es un olvido y no una decisión.** En el mismo
repositorio, `lib/vigiaCompras.js:54-64` espera 60 bloques en Polygon —con el
comentario «Polygon reorganiza poco pero lo hace»— y 30 en BSC. La casa sabe lo
que es una reorganización; simplemente no lo aplicó a su propia cadena.

### Ordenex · el vigía de compras no se arranca desde ningún lado

Busqué `vigiaCompras` y `arrancarCompras` en `app.js`, en el `Procfile` y en
`bin/`: **cero resultados**. `app.js:173-178` arranca solo `vigia` y
`referenciaVelas`.

Si los contratos de venta en Polygon y BSC están vivos, alguien paga USDT y
nadie le manda el ORIGEN. **No pude comprobar si `VENTA_POLYGON` y `VENTA_BSC`
están puestas en producción** — hay que confirmarlo antes de asustarse o de
descartarlo.

---

## Ninguna ruta de producción se desvía del repositorio

Es la buena noticia de la tanda, y contrapesa el incidente del 12 de agosto: se
compararon las rutas declaradas en el código contra lo que responde producción
en los tres servicios, y **no apareció ni una discrepancia real**. Las que
parecían serlo se descartaron una por una antes de reportarlas (rutas que solo
aceptan POST, un mercado inventado, un prefijo en plural que en el código es
singular).

Lo que sí falta en los tres: **ninguno publica qué versión corre**. No hay ruta
de versión, no hay commit en ninguna cabecera, y los `package.json` dicen
`0.0.0` y `0.0.1`. Eso es exactamente lo que hizo lento de diagnosticar el
incidente del 12 de agosto.
