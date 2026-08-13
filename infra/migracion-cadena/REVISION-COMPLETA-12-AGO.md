# Revisión completa · cadena de pruebas 5534, cadena 5550 y el precio de 0,01

12-ago-2026. Encargo: *revisar todo el código de la blockchain de prueba y de
la 5550, dejar todo listo para que Chainlist lo apruebe, criticarlo, mejorarlo
y entregar.* Y fijar el precio y ver a dónde llega la comisión.

> **Corregido el 13-ago.** Esta sección se escribió con el ORIGEN a 0,01 USD y
> la comisión a 0,01 ORIGEN. Los dos números eran míos y estaban mal. Lo que
> vale: el ORIGEN es **el gramo de oro dividido entre 55** —hoy 2,5728 USD— y
> la comisión son **0,001 ORIGEN**. Las cuentas rehechas están en
> `../veta-wallet-gas-y-precio/LA-COMISION.md`; abajo se deja lo que se pensó,
> con los números tachados, para que se vea de dónde salió cada conclusión.

Todo lo que sigue está **medido contra las cadenas encendidas**, no deducido.
Cuando algo no se pudo comprobar, lo dice.

---

## 1 · La comisión ~~con ORIGEN a 0,01 USD~~ · números superados

Medido en la 5534, no estimado. Una transferencia de ONDK real gastó
**52.472 de gas** (bloque 13.206); una transferencia nativa gasta 21.000.

Al precio de red acordado de **93 gwei**:

| | Gas | Comisión en ORIGEN | A 0,01 USD |
|---|---|---|---|
| Enviar ORIGEN | 21.000 | 0,001953 | **0,0000195 USD** |
| Enviar un token (ONDK) | 52.472 | 0,004880 | **0,0000488 USD** |

Dicho de otra forma: **con 1 ORIGEN se hacen 512 envíos nativos** o 205 envíos
de token. Y 1 ORIGEN, a 0,01, es un centavo. La billetera de una persona
—que la consolidación deja justo en 1 ORIGEN— lleva **un centavo de gasolina**,
que le da para más de quinientos movimientos.

### A dónde llega esa comisión

**Al validador que propone el bloque.** No se quema nada, no va a ningún
tesoro, no hay reparto. Medido: las cuatro direcciones de validador no están en
el génesis —empezaron en cero— y hoy tienen

```
node4  0x48ccec9a…  0,0398832 ORIGEN
node5  0x65f98726…  0,0336000
node3  0x69e8a7b2…  0,0314832
node6  0xc5484647…  0,0084000
                    ─────────
                    0,1133664 ORIGEN   ← todas las pruebas de estos días
```

Eso es, a 0,01 USD, **0,0011 dólares**. Reparto desigual porque depende de a
quién le tocó proponer.

### Lo que hay que ver de frente

Con la cadena **llena al 100%** —10 millones de gas por bloque, un bloque cada
10 segundos, las 24 horas—:

| | ORIGEN | A 0,01 USD |
|---|---|---|
| Un bloque lleno | 0,93 | 0,0093 |
| Una hora llena | 334,8 | **3,35** |
| Un día lleno | 8.035 | **80,35** |
| Un año lleno | 2.932.848 | **29.328** |

**La comisión no paga la cadena.** Seis máquinas EC2 y un balanceador cuestan
más que eso en uso realista, y el uso realista no es el 100% de capacidad: es
una fracción muy pequeña. La comisión de esta red **no es un modelo de
ingresos, es un antispam**. Conviene decirlo así hacia afuera antes de que
alguien lo calcule y lo diga por nosotros.

El otro número que hay que mirar de frente: la emisión es de **un billón** de
ORIGEN. A 0,01 USD eso son **10.000 millones de dólares** de valor declarado.
Es un número que va a llamar la atención de cualquiera que lo mire. (La fórmula
del oro que hay hoy en el backend lo pondría en 2,57 billones de dólares, que
es directamente insostenible.)

---

## 2 · Lo más grave que encontró esta revisión

### 2.1 · El backend cobra el ORIGEN a 2,57 USD, no a 0,01 · **257 veces**

`lib/origenPrice.js` calculaba el precio en vivo: un ORIGEN = 1/55 de gramo de
oro. Con la onza a **4.397,97 USD** —medido hoy en CoinGecko— eso da **2,5709
USD por ORIGEN**.

No es un número de informe. Lo usan tres caminos que mueven dinero de verdad:

| Camino | Qué pasa si el precio real es 0,01 |
|---|---|
| **Depositar USDT** | Pone 100 USDT, se le acreditan 38,9 ORIGEN = 0,39 USD. **Pierde el 99,6%.** |
| **Fondear la tarjeta** | Entrega 1 ORIGEN y se le cargan 2,57 USD. **Cada ORIGEN le cuesta 2,56 USD a la empresa.** |
| **Canje** | Valora lo enviado con el mismo precio equivocado. |

Mientras las dos puntas usaran la misma fórmula, el error se cancelaba solo. En
el momento en que el precio público de la 5550 es 0,01 y el backend dice 2,57,
**deja de cancelarse y alguien paga la diferencia**.

**Arreglado en el código**: el precio pasa a ser fijo, 0,01, movible con
`OG_ORIGEN_USD`. El oro queda disponible con `OG_PRECIO_MODO=oro` porque la
decisión de precio es de la Junta, pero deja de estar en dos sitios a la vez.
**No desplegado**: el token de Heroku sigue caducado. Hasta que se despliegue,
producción sigue cobrando a 2,57.

Dos cosas más que salieron de mirar ese archivo:

- **Binance devuelve 451 a las IP de Estados Unidos**, que es donde corre
  Heroku. La primera fuente de precio **no funcionaba nunca** en producción:
  cada consulta gastaba sus 4 segundos de espera para acabar en la segunda.
  Comprobado hoy.
- Si fallaban las dos fuentes, el código **se inventaba** una onza a 2.000 USD.
  Con el oro a 4.400, eso acreditaba al usuario **la mitad** de lo que le
  tocaba. Ahora falla en vez de inventar: devolver un precio equivocado en un
  camino de dinero es peor que no devolver ninguno.

### 2.2 · El RPC público entrega comprobante de envíos que nunca se van a minar

Firmé una transacción con **precio de gas cero**, desde una dirección al azar y
sin saldo, y la mandé al RPC público de la 5534. **La aceptó y devolvió un
hash.** Nunca se minó: desapareció de la cola sin llegar a ningún bloque.

Para la app eso es lo peor posible: Veta Wallet recibe un hash, se lo enseña al
usuario como «enviado, pendiente», y se queda pendiente para siempre.

La causa es que **ningún nodo tiene puesto `--min-gas-price`**. Los 93 gwei
acordados hoy no los exige nada: son una convención que respeta el backend
porque está escrita en el backend. `eth_gasPrice` de la cadena contesta **0**.

**Arreglado esa misma tarde, en los seis nodos.** Los cinco llevaban
`--min-gas-price=0` **escrito explícitamente** en su unidad de systemd. Ahora
llevan `93000000000`, y `eth_gasPrice` contesta 93 gwei en los seis.

Con eso solo no bastaba, y es un detalle que vale la pena saber: **Besu trata
como «locales» las transacciones que entran por su propio RPC y les perdona el
precio mínimo.** Con el suelo puesto, la de 0 gwei seguía entrando. Hace falta
además `--tx-pool-no-local-priority`, que quita ese trato especial. Con las dos
banderas:

```
0 gwei  -> RECHAZADA: Gas price below configured minimum gas price
93 gwei -> ACEPTADA
```

**Lo que sigue sin ser cierto, y hay que decirlo:** el suelo que la cadena
aplica de verdad es **«mayor que cero», no 93 gwei**. Probado gwei a gwei: 1,
10, 46, 50 y 92 se aceptan igual. Es efecto de `zeroBaseFee`, que deja el
mercado de comisiones sin base y con él la comprobación del mínimo. Los 93 gwei
son ahora el suelo del **cliente** —lo pone `lib/gas.js` en el backend— y la
cadena solo garantiza que nadie transacciona gratis.

Subirlo a un suelo real exigiría quitar `zeroBaseFee` y dejar que EIP-1559
ponga una base… que **se quema**. Eso reduciría la emisión con cada bloque, y
la emisión es de las cosas que no se tocan sin la Junta. Queda anotado como
decisión, no como pendiente técnico.

*(La prueba fue una transferencia de 21.000 de gas en la cadena de pruebas, y
no se repitió.)*

### 2.3 · La cadena no tiene PUSH0: no compila nada moderno

El génesis se quedaba en **London**. `PUSH0` es de **Shanghai**. Y `solc`,
desde la versión **0.8.20**, lo emite por omisión.

O sea: cualquiera que compile un contrato hoy con la configuración de fábrica
obtiene bytecode que esta cadena **rechaza**. Medido con un `eth_call` de un
código que sólo hace PUSH0:

```
5534 →  "Invalid opcode: 0x5f"
8532 →  "opcode not found"
```

y el mismo código con PUSH1 pasa en las dos. Estrenar la 5550 en 2026 con esa
limitación heredada sería un error caro y difícil de deshacer después.

**Arreglado en el generador**: `shanghaiTime: 0`, y la 5550 se niega a
construirse sin él.

**Y probado en la 5534 el mismo día, sin rearrancar nada.** Un fork por
timestamp se puede programar en una cadena viva, porque el bloque `config` del
génesis **no entra en el hash del bloque cero**: se le añadió `shanghaiTime` a
los seis nodos, con activación 25 minutos más tarde, y los seis siguieron con
el mismo bloque cero `0x9fe069fa…` — misma base de datos, mismo estado, cero
resincronización.

A la hora señalada:

| | Antes | Después |
|---|---|---|
| `eth_call` de PUSH0 | `Invalid opcode: 0x5f` | **ejecuta** |
| `withdrawalsRoot` en la cabecera | no existía | `0x56e81f17…` |
| Producción de bloques | 6 por minuto | **6 por minuto, sin un salto** |

Los seis nodos: mismo bloque, `/readiness` 200, PUSH0 aceptado. **QBFT y
Shanghai conviven en Besu 26.7.1**, que era lo que había que averiguar antes de
construir la 5550 con ese ajuste.

*(Lo que sigue en pie del párrafo original: era un cambio
de génesis, y se pensaba que obligaba a rearrancar desde cero. No hacía
falta.)*

Cancun queda fuera a propósito: trae más superficie (blobs, TSTORE) y no
resuelve ningún problema que tengamos.

---

## 3 · Chainlist

`infra/migracion-cadena/chainlist/` — el archivo que había prometía **tres
cosas y dos eran falsas**.

1. **`faucet-testnet.ordenglobal.org` no existe.** Nunca se levantó. El
   revisor abre esa dirección, no carga, y cierra el pull request. Quitado.

2. **`rpc-testnet.ordenglobal-rpc.com` contesta bloque 0 la mitad de las
   veces.** Es el nombre del balanceador y detrás tiene dos máquinas: una al
   día y otra vacía. Preguntando seis veces, **tres contestaron altura 0**.
   Una billetera que caiga en la vacía ve saldo cero y nonce cero.
   **Arreglado** esa misma tarde (§5): el chequeo de salud del balanceador pasó
   de `/liveness` a `/readiness`, y el nodo vacío se sincronizó. Vuelve a estar
   en el archivo, ahora acompañado de `pruebas.ordenglobal-rpc.com`.

3. **`rpc.ordenglobal-rpc.com` sirve la cadena vieja 8532.** Ese era el RPC
   declarado para la 5550. Publicarlo haría que una billetera configurada para
   5550 **firmara contra 8532**. Cambiado a un nombre nuevo,
   `rpc5550.ordenglobal-rpc.com`, que hay que crear.

También: `chainId` 5534, 5550 y 8532 están **libres** en la lista publicada
—comprobado contra las 2.689 cadenas de `chainid.network`—, igual que los
nombres `Orden Global` y `Orden Global Testnet` y los nombres cortos `ogb` y
`ogb-test`.

Se añadió `verificar.py`, que corre las mismas comprobaciones que hace el
revisor —nombre del archivo, chainId contra el RPC de verdad, rutas EIP-3091
del explorador, choques con la lista publicada— y además pregunta la altura
seis veces al mismo nombre, que es como apareció el nodo vacío. **La regla:
no se abre el pull request si no sale en verde.**

| | 5534 | 5550 |
|---|---|---|
| `verificar.py` | **verde · se puede enviar hoy** | rojo a propósito: la cadena no existe |

---

## 4 · Lo demás que se arregló

**El `extraData` del génesis era un texto de relleno** y había que acordarse de
correr `besu rlp encode` a mano. El fallo era benigno —Besu no arranca con el
relleno— pero ocurría *la noche del corte*, que es justo cuando no se quiere
pensar. Ahora se calcula solo con `--validadores`, y el codificador **se
comprueba en cada ejecución contra el bloque cero de la 5534 en marcha**: sale
byte por byte igual al que escribió Besu.

**La consolidación también subía saldos, en silencio.** A quien tenía menos del
piso de 1 ORIGEN se le rellenaba con ORIGEN de la billetera única. Como la suma
total seguía cuadrando, el invariante de emisión no lo veía. Ahora se informa
cuántas billeteras reciben y cuánto, y aborta si dejara la billetera única en
negativo —que produciría un génesis que Besu no puede leer.

**El gas del backend estaba escrito a mano y distinto en cada sitio**: 400 gwei
en enviar, 600 en enviar token, 2000 en el canje, contra los 93 acordados —4,3,
6,5 y 21,5 veces. Lo que más daño hacía no era el precio sino el `gasLimit` de
210.000: la comprobación de fondos usa **el límite, no el gasto**, así que
obligaba a tener 0,084 ORIGEN libres para mover cualquier cantidad. Con las
billeteras a 1 ORIGEN eso es el **8,4% del saldo bloqueado por envío**, y en el
canje —210.000 a 2000 gwei— habrían sido **0,42 ORIGEN, el 42% del saldo de una
persona** reservado para una sola operación. Se ve como «no alcanza para cubrir
el monto más el gas» cuando sí alcanzaba. Ahora precio y límite salen de la
cadena, con suelo en el precio acordado.

---

## 5 · Lo que se ejecutó en la red, y lo que sigue bloqueado

AWS se cayó a mitad de la revisión (`InvalidClientTokenId` en cualquier
llamada) y volvió con llaves nuevas. Con SSM de vuelta se hizo:

**El suelo de gas en los seis nodos** (§2.2), uno a uno para no perder el
quórum, comprobando después de cada reinicio que la cadena seguía avanzando —
avanzó entre 3 y 4 bloques en cada paso.

**El balanceador, arreglado de raíz.** El chequeo de salud era `/liveness`, que
sólo dice «el proceso vive»: por eso un nodo en el bloque 0 figuraba como sano y
recibía la mitad del tráfico. Besu tiene `/readiness`, que además mira peers y
sincronía. Medido antes de cambiar nada: `/liveness` daba 200 en los dos nodos,
`/readiness` daba **200 en el bueno y 503 en el vacío**. El grupo pasó a
`/readiness?minPeers=1&maxBlocksBehind=5`. Ahora un nodo atrasado **no puede**
volver a servir tráfico aunque alguien lo añada por error.

**testnet-1 pasó a ser el segundo nodo RPC de verdad.** Le faltaba
`static-nodes.json` —descubrimiento por sí solo no bastaba— y las reglas de
entrada al puerto 30303 en los cuatro validadores. Su génesis tiene el mismo
md5 que el bueno. Está sincronizado, con 4 peers, y de vuelta en el grupo.

Los seis nodos, al terminar: **mismo bloque, 93 gwei, `/readiness` 200, arranque
automático activado**, malla completa. Y `rpc-testnet.ordenglobal-rpc.com`
contesta la punta en diez de diez llamadas, así que vuelve a ser el RPC
principal del archivo de Chainlist.

Sigue bloqueado:

- **Heroku**, con el token caducado. Los arreglos del backend —el precio de
  0,01 y el gas— están escritos, comprobados de sintaxis y **sin desplegar**.
  **Producción sigue cobrando el ORIGEN a 2,57 USD.**

---

## 6 · Para que la 5550 esté lista, por orden

1. **Cerrar el precio.** Confirmar 0,01 y desplegar el backend, o producción
   seguirá con la fórmula del oro. Con Junta de por medio, porque cambia la
   tasa a la que la tarjeta consume ORIGEN.
2. ~~`--min-gas-price` en todos los nodos~~ — **hecho** (§5).
3. ~~Probar Shanghai en la 5534~~ — **hecho** (§2.3), y sin rearrancar. La
   5550 se construye con `shanghaiTime` sin dudas.
4. ~~Arreglar el balanceador~~ — **hecho** (§5): dos nodos sincronizados y un
   chequeo de salud que ya no deja entrar a uno vacío.
5. **Enviar la 5534 a Chainlist** —ya está en verde— y aprender del proceso
   antes de mandar la de producción.
6. **Crear `rpc5550.ordenglobal-rpc.com`** apuntando sólo a nodos de la 5550, y
   poner `ordenscan.com` a indexar la 5550.
7. Correr `verificar.py eip155-5550.json` y sólo entonces abrir el pull request
   de producción.

Lo que sigue bloqueando el corte no cambió y no lo cambia esta revisión: el
cierre de ranuras contra el `stateRoot` de la 8532, que está documentado en
`CIERRE-COMPLETO-12-AGO.md`.
