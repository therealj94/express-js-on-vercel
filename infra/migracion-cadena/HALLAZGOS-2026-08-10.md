# Lo que apareció al ensayar la migración · 10-ago-2026

Este documento existe porque el ensayo encontró que **la cadena 8532 no es la
que describía el plan**. El Documento 6 de la Junta y el runbook original se
apoyaban en dos cifras — «14 contratos de token» y «unas 250 transacciones» —
y las dos son falsas. Lo que sigue son mediciones, no estimaciones.

## 1. La cadena real

Volcando el árbol de estado completo del nodo 3 (bloque 4.158.431, raíz
`0xd21e29ff…7882`), con **0 nodos faltantes y 0 ilegibles**:

| | |
|---|---|
| Cuentas en el estado | **332** |
| De ellas, con código (contratos) | **173** |
| Ranuras de almacenamiento ocupadas | **1.385** |
| Tamaño del árbol completo | 5,3 MB |

El plan conocía **14** de esos 173 contratos.

Sondeando por RPC los 110 contratos que aparecen en eventos:

| Tipo | Cuántos |
|---|---|
| ERC-20 | 55 (de los cuales **42 fuera de la lista de 14**) |
| Pares / pools de un AMM | 30 |
| Factorías | 2 |
| Otros (routers, gestores) | 23 |

Hay un **Uniswap V3 desplegado** (tres contratos `UNI-V3-POS`, el gestor de
posiciones NFT), un envoltorio del nativo (`WORIGEN`, tres copias) y muchísimo
despliegue repetido de pruebas: `HARV` aparece **quince veces** en direcciones
distintas, `COFFEE` cinco, `TKNA` cuatro.

## 2. Por qué el método original no podía funcionar

`inventario.py` leía el estado por RPC: veinte ranuras fijas por contrato más
el mapa de saldos detectado a tientas. Eso alcanza para un ERC-20 sencillo y
no alcanza para nada más. Un par de AMM guarda reservas, acumuladores de
precio y marcas de tiempo empaquetadas; un pool V3 guarda ticks y posiciones
en mappings cuya clave no es una dirección.

Y no había forma de arreglarlo por RPC: el nodo **no expone ningún método de
enumeración**. Comprobado uno por uno contra `rpc.ordenglobal-rpc.com`:

    debug_storageRangeAt  -> no existe
    debug_accountRange    -> no existe
    debug_dumpBlock       -> no existe
    eth_getProof          -> no existe

Sin enumeración, leer estado por RPC es preguntar por ranuras que uno ya
sospecha. Lo que no se sospecha, no se lee — y no se entera nadie.

## 3. El método que sí funciona

`volcar-estado.go` abre directamente el LevelDB del árbol de Merkle-Patricia
del nodo y lo recorre entero desde la raíz del bloque de referencia. Sale todo:
cada cuenta con su nonce, saldo, código y **todas** sus ranuras.

Lo importante no es que lea mucho, sino que **sabe cuándo no leyó todo**: si
falta un solo nodo del árbol, lo cuenta y termina con error. No hay forma de
construir un génesis a partir de un volcado incompleto sin enterarse.

Requisitos: el árbol pesa 5,3 MB y se recorre en segundos. El árbol fuente de
polygon-edge y Go 1.20.1 ya están instalados en el nodo 3, así que se compila
ahí mismo.

## 4. Lo que todavía falta, medido

El árbol guarda `keccak(clave)`, no la clave. Para escribir un génesis hacen
falta las direcciones y las ranuras reales. `emparejar-preimagenes.py` prueba
candidatos y **cuenta lo que no logra emparejar**:

| | |
|---|---|
| Cuentas con dirección identificada | 168 de 332 |
| **Cuentas sin dirección conocida** | **164** |
| Ranuras identificadas | 498 de 1.385 |
| **Ranuras sin identificar** | **887** |

Esas dos cifras en negrita son el trabajo que queda, y son la razón por la que
**hoy no se puede construir el génesis**. Las dos tienen solución conocida:

- **Las 164 direcciones**: los candidatos salieron sólo de eventos. Faltan los
  remitentes y destinatarios de transacciones que no emitieron eventos. Se
  sacan recorriendo los bloques desde el propio nodo (la base de bloques son
  2,5 GB y está local), no por el RPC público.
- **Las 887 ranuras**: los candidatos probados fueron ranuras fijas y mappings
  con clave de dirección. Faltan mappings con clave numérica (ticks de V3, IDs
  de NFT), arreglos (`keccak(ranura) + i`) y estructuras. Se generan en cuanto
  se sepa el tipo de cada contrato — que ya está sondeado.

## 5. Dos defectos más del kit, ya confirmados

- **Las aprobaciones ERC-20 se perdían.** `inventario.py` registraba los
  eventos `Approval` pero nunca leía `allowance()` ni la ranura del mapping
  anidado, y `construir-genesis.py` no la escribía. Toda aprobación viva
  pasaba a cero en la cadena nueva. Van 52 tripletas (token, dueño, gastador)
  distintas sólo hasta el bloque 2,8 M.
- **Besu 26.7.1 no corre con Java 21.** Pide Java 25 (class file 69). El
  runbook decía 21. Ya corregido; la máquina de ensayo lleva Corretto 25.

## 6. La decisión que corresponde a la Junta, no a la ingeniería

Migrar 173 contratos con fidelidad total es posible y es varias veces el
trabajo de migrar 14. Pero buena parte de esos 173 son **restos de pruebas**:
quince despliegues del mismo token no son quince activos.

La pregunta que hay que contestar antes de seguir es **qué contratos deben
sobrevivir al corte**. Tres respuestas posibles, de menor a mayor esfuerzo:

1. **Sólo lo que respalda valor real** — los tokens con tenedores de verdad y
   el nativo ORIGEN. Los despliegues de prueba se retiran formalmente.
2. **Lo anterior más el AMM**, si el intercambio se usa o se piensa usar.
3. **Todo, bit a bit**, incluidos los restos de prueba.

La opción 1 vuelve la migración a la escala del plan original. La 3 es la que
está descrita en el Documento 6 y hoy no tiene fecha realista.

## 7. Estado del ensayo

Máquina `i-00fd699595da41ef4` (`ensayo-besu-8532`, t3.medium, us-east-1a),
**sin ningún puerto de entrada abierto** — se opera sólo por SSM, igual que
los nodos de producción.

- Besu 26.7.1 sobre Corretto 25: funcionando.
- Llave del nodo de ensayo generada; su dirección validadora es
  `0x151ae662152a483deb1036ba760a33d3f5991689`.
- El kit de migración instalado en `/opt/ensayo/kit`.

Está lista para arrancar una cadena en cuanto haya un génesis que merezca
arrancarse. Mientras el punto 4 no cierre, no lo hay.


## Apéndice · Cómo se obtiene la disposición sin tener el código fuente

La pregunta era si hace falta el Solidity de cada contrato. La respuesta es que
hay tres caminos, y el tercero **no lo necesita y además es exacto**.

### 1. El fuente original (GitLab de MyTokenPay)

El mejor cuando existe. Se compila con el mismo `solc` y se lee la disposición
directamente. Sigue haciendo falta para los contratos propios que no
reconocemos.

### 2. Recompilar el código abierto conocido y comparar el bytecode

Los pools y el gestor de posiciones son **Uniswap V3 estándar** — se comprobó
por sondeo: responden a `slot0`, `tickSpacing`, `fee`, `maxLiquidityPerTick`.
Su fuente es público. Se compila y se compara el bytecode; si coincide, la
disposición es la de ese fuente, sin margen de duda.

Lo mismo con los tokens: quince despliegues del mismo tamaño (3.671 bytes) son
la misma plantilla compilada quince veces.

### 3. Trazar la ejecución en nuestro propio nodo — el que resuelve el resto

Besu expone `debug_traceCall`. Se llama a un getter y la traza dice **qué
ranura leyó** el contrato, en ese mismo instante. No es una inferencia sobre el
bytecode: es la ranura que la máquina virtual fue a buscar.

Comprobado el 10-ago sobre AGKA en la cadena de ensayo. Se llamó
`balanceOf(0xa07a2ba9…)` y la traza devolvió:

    0x5e13b8b8ff6b44e50627e0a90fc2bba3000cfa002dff98fb2e44f141feda935b

que es exactamente `keccak(dirección ++ ranura 0)` calculado por separado.
Coincidencia exacta.

Y no hace falta que el contrato tenga su estado cargado: la ranura que la
máquina virtual calcula depende del **código y del argumento**, no de lo que
haya guardado. O sea que basta con poner el código en una cadena de usar y
tirar, llamar a cada getter con los argumentos reales —que se leen de la cadena
vieja por RPC— y anotar las ranuras que salen.

**Para Uniswap V3 eso cierra el problema entero**, porque casi todo su estado
es legible: `slot0`, `liquidity`, `ticks`, `tickBitmap`, `positions`,
`observations`. Y `positions(tokenId)` en el gestor devuelve el dueño y los dos
ticks de cada posición, que son justamente los argumentos que hacen falta.

Un detalle que explica por qué el emparejamiento a ciegas fallaba con V3: la
clave de una posición es `keccak(abi.encodePacked(dueño, tickLower, tickUpper))`
— veintiséis bytes **sin relleno** —, mientras que el emparejador rellena cada
valor a treinta y dos. Son hashes que no se parecen en nada.

### Lo que queda para el último recurso

Descompilar (heimdall, panoramix) da un Solidity aproximado. Con los tres
caminos de arriba probablemente no haga falta, y conviene que no haga falta:
«aproximado» y «migración de saldos» no se llevan bien.

---

# Apéndice · 11-ago-2026: el contador de huérfanas mentía

Al retomar el trabajo para construir la 5550 apareció esto, y conviene que
quede escrito porque es el modo de fallo contra el que se diseñó todo el
proceso.

## Lo que decía el estado

`estado-final2.json` declaraba **0 huérfanas y 0 cuentas sin dirección**, y con
eso se construyó el génesis y se dio por buena la etapa 2. Pero el juez daba
**7 contratos con la raíz de almacenamiento distinta**.

## Lo que pasó

El archivo del que salió, `estado-v3.json`, tiene **160 ranuras sin
identificar** repartidas en 12 contratos. El paso que unió los estados
(`estado-v3` → `estado-union`) **vació la lista de huérfanas sin resolverlas**.
El contador pasó a cero; las ranuras siguieron faltando.

Encima, el génesis se construyó con `--incompletos`, que salta a propósito la
regla de que un contrato viaja entero o no viaja. Sirve para ensayar; no para
producción.

Las dos cosas juntas producen exactamente lo que hay que evitar: una cadena que
parece correcta, con un informe que dice que todo cuadra, y a la que le falta
estado.

## La prueba de que encaja

Los 7 contratos con la raíz distinta son **los mismos** que cargan las
huérfanas, y se llevan 144 de las 160:

| Contrato | Huérfanas | ¿raíz distinta? |
|---|---:|---|
| `0xaf25c9025ad8bbe86d9d8051afe0192002aec272` | 66 | sí |
| `0xe80cc7eb524e7cf2877d6a6cca1dd3140695dd41` | 40 | sí |
| `0xa52a131a192db2f5499bd1df3755d1b1126d3d70` | 20 | sí |
| `0x6facc8df79cedc6c5065442ce27e915aa3a26b9b` | 10 | no se comparó |
| `0x16f052c851ab311cfb8f77c08dd06b4bc4bf1748` | 6 | sí |
| `0xd7f46c7103e107e260a39011ff256c5d898d5527` | 4 | sí |
| `0x62df6495249c0e074ce785e8a1539c93f000b836` | 4 | sí |
| `0xf85a573f43262ec0d4ec674a3a05c63d127ed840` | 4 | sí |
| `0x0000000000000000000000000000000000001001` | 2 | staking, no viaja |
| `0x3aec4b7004a2604084e204525bba1ede3ffda288` | 2 | no se comparó |
| `0xf1498640b27a66c0dc505093d70911c060e04fb0` | 1 | no se comparó |
| `0xfb83eea4b384a4b18e5a1eba7a4bb4c0b7ca19c1` | 1 | no se comparó |

Los tres de 4 huérfanas tienen **la misma raíz vieja y la misma nueva**: son
gemelos, un solo defecto repetido tres veces.

## Dos hipótesis que se probaron y se descartaron

No se dio nada por supuesto:

1. **«La foto es vieja y esos contratos cambiaron después.»** Falso: el
   `stateRoot` del bloque 4.164.360 de la cadena viva es
   `0xd21e29ff024f…`, **idéntico** al de la foto. El estado no se movió.
2. **«Tuvieron actividad reciente.»** Falso: barrido de eventos sobre los
   últimos 8.000 bloques (unas 34 horas) para los 7 contratos: **cero
   eventos**.

## Lo que hay que arreglar

1. **Identificar las 160 ranuras.** Es el trabajo real que queda.
2. **Que el paso de unión no pueda vaciar la lista de huérfanas.** Si un estado
   unido declara menos huérfanas que sus fuentes sin haberlas resuelto, tiene
   que abortar.
3. **`--incompletos` nunca en producción.** El génesis del corte se construye
   sin esa opción, y si un contrato no está entero, no arranca.

## Cierre de las huérfanas · 11-ago-2026, madrugada

De las 160, **67 identificadas**. Quedan 80.

### Lo que cerró, y cómo

**Los tres tokens con tenedores de verdad: 12 de 12.** AUKA (10), ONDK (1) y
AUBEX (1) eran entradas del mapa de saldos de tenedores que el barrido de
eventos original nunca había capturado. Se resolvió rehaciendo el barrido
completo desde dentro de un nodo —el RPC público corta en 1.000 bloques, el
local no—: 4,16 millones de bloques, 339 direcciones únicas.

Dos señales que se vieron en los datos y valían: nueve de las diez ranuras de
AUKA tienen **el mismo valor exacto** (0,032 tokens), o sea un reparto en lote;
y AUBEX y ONDK **comparten el hash de ranura**, o sea la misma dirección en la
misma posición de mapa en los dos contratos.

**Las tres factorías: 60 de 60.** 38, 18 y 4. Eran el mapa triple
`getPool[token0][token1][fee]`, y la pieza que faltaba es que Uniswap guarda
**las dos direcciones de cada par** — `[t0][t1]` y `[t1][t0]`. De ahí que sean
exactamente el doble de los pools de cada factoría: 19, 9 y 2.

Los 30 pools se identificaron llamando `token0()`/`token1()`/`fee()` a cada
contrato conocido, que es más rápido y más seguro que barrer eventos. Cuidado
con los precompilados: `0x02`, `0x03` y `0x04` responden a cualquier llamada y
aparecen como falsos pools.

### El emparejador, validado antes de creerle

Antes de dar por buena una sola coincidencia se comprobó que el cálculo
reproduce claves que el estado **ya tenía identificadas**: `['fija', 2]`,
`['fija', 3]` y `['fija', 4]` de un contrato cualquiera. Las tres coinciden
carácter por carácter. El pipeline es correcto; lo que falla en las que quedan
es el modelo de la disposición, no la aritmética.

### Las 80 que quedan

| Contrato | Ranuras | Qué es |
|---|---:|---|
| `0xaf25c9…` | 66 | gestor de posiciones V3 con las 31 posiciones reales |
| `0xd7f46c…`, `0x62df64…`, `0xf85a57…` | 4 c/u | gestores de posiciones **vacíos**, `totalSupply = 0` |
| `0x…1001` | 2 | contrato de staking de Edge, que **no viaja** |

Se probaron y fallaron: mapa de dirección con desplazamiento de estructura,
mapa numérico con desplazamiento, anidado dueño→índice, arreglo dinámico,
`_poolIds`, `_poolIdToPoolKey`, `_positions`, y ERC-721 completo — todos sobre
bases 0–255 y con los candidatos exactos (30 pools, 2 dueños, 31 posiciones).

También se descartó por fuerza bruta que sean ranuras simples: **dos millones**
de números probados, cero coincidencias. Son derivadas.

**El camino que queda es el que no adivina: trazar.** `cerrar-ranuras.py` corre
las llamadas de verdad contra un nodo propio y lee del `debug_trace` las
ranuras que la máquina virtual toca de hecho. Eso no depende de acertarle a la
disposición del contrato.

Nota sobre las 12 de los gestores vacíos: no son dinero de nadie —esos
contratos no tienen ni una posición—, pero igual tienen que viajar, porque la
regla es que un contrato viaja entero o no viaja.

### Cerradas las 160 · 11-ago-2026

**158 resueltas. Las 2 que quedan son del contrato de staking de Edge, que no
viaja.** Entre los contratos que sí migran: cero sin resolver.

Lo que cerró el tramo final fue dejar de adivinar la disposición y **leer lo
que la máquina virtual toca de hecho**. La cadena vieja expone
`debug_traceCall` y `debug_traceTransaction`; eso vale más que cualquier
modelo del contrato.

**Las 62 del gestor de posiciones.** Trazando llamadas reales — primero las de
lectura (`positions`, `ownerOf`, `tokenURI`, `tokenOfOwnerByIndex`), y como
esas no tocan todo el almacenamiento, después simulando las que escriben
(`transferFrom`, `approve`, `burn`, `collect`, `decreaseLiquidity`) con el
`from` puesto en el dueño real para que pasen la autorización. 356 llamadas,
cero fallos, 454 ranuras vistas.

**Las 4 del constructor, que valen por 16.** Los cuatro gestores de posiciones
—el que tiene 31 posiciones y los tres vacíos— comparten **los mismos cuatro
hashes con el mismo valor `0x01`**. Eso sólo puede venir del constructor.

Para trazarlo hacía falta la transacción de despliegue, y no estaba entre las
1.521 guardadas. Se encontró sin barrer la cadena:

1. **Quién los creó**, por derivación CREATE: `keccak(rlp([creador, nonce]))[12:]`
   contra las 439 direcciones conocidas × nonce 0–300.
2. **En qué bloque**, por **búsqueda binaria sobre `eth_getTransactionCount`** —
   el primer bloque donde el nonce del creador supera al de la creación. Unas
   22 consultas en lugar de 4,16 millones de bloques.

Las cuatro ranuras resultaron ser **derivadas, no números**: valores como
`0x77b7bbe0e49b…`, o sea `keccak` de una cadena de texto. Por eso la fuerza
bruta sobre dos millones de enteros no las encontró ni las iba a encontrar.

| Gestor | Creador | Nonce | Bloque |
|---|---|---:|---:|
| `0xaf25c9…` (31 posiciones) | `0x3063a2…` | 42 | 2.004.924 |
| `0xd7f46c…` (vacío) | `0x3063a2…` | 41 | 2.004.916 |
| `0x62df64…` (vacío) | `0x018645…` | 3 | 2.187.442 |
| `0xf85a57…` (vacío) | `0x018645…` | 47 | 2.192.365 |

Las preimágenes están en `preimagenes-cerradas.json`.

### Las 18 cuentas sin dirección, recuperadas · 11-ago-2026

Cerradas las ranuras, el génesis todavía dejaba **18 contratos fuera**: estaban
en el árbol sólo por su hash, sin dirección conocida, y sin dirección no hay
génesis posible.

Los 18 tenían el mismo perfil exacto —contrato, nonce 1, saldo cero, **cinco
ranuras**— y **un único hash de código**, que ningún contrato con dirección
conocida compartía.

Su contenido los delató: uno de sus campos apunta a **ONDK**, otro a un
**Wrapped Origen**, otro a un contrato de 19 KB que usa `CREATE2`, y otro vale
`1`. Es la forma exacta de un par de AMM estilo Uniswap V2: factoría, los dos
tokens, y el candado de reentrada.

**Por qué no aparecían.** No se pueden derivar por `CREATE` —se probaron 439
creadores × 600 nonces, cero coincidencias— porque se despliegan por `CREATE2`,
donde la dirección depende del hash del código de creación, que no está en la
cadena.

**Cómo se recuperaron.** Una factoría de pares lleva su propio índice. Se probó
`allPairsLength()` contra las 439 direcciones conocidas: **doce factorías**
respondieron, con 1 a 3 pares cada una. Recorriendo `allPairs(i)` de las doce
salieron **18 direcciones**, y las 18 corresponden exactamente a los 18 hashes
sin dirección.

Que fueran doce factorías distintas explica por qué ninguna búsqueda centrada
en una sola las encontraba.

Con las direcciones puestas, sus 5 ranuras se identificaron solas y quedaron
**cero sin identificar**.

### Estado del génesis de ensayo

```
cuentas: 332 · contratos: 173
contratos COMPLETOS: 172
en el génesis van 331 cuentas · quedan fuera 0
```

El único incompleto es `0x…1001`, el contrato de staking de Edge, que **no
viaja**: QBFT gestiona los validadores por voto.

## VEREDICTO · 11-ago-2026, 05:45

```
RESULTADO: 1350 comprobaciones iguales · 0 distintas · 0 sin poder comparar
```

Todas las raíces de almacenamiento coinciden. Cada contrato viaja entero, cada
saldo y cada nonce cuadran. Comparado con el intento anterior —1.343 iguales y
**7 distintas**— el estado ahora migra bit por bit.

### Una trampa que casi da un falso resultado

La primera corrida con el génesis nuevo dio **las mismas 7 diferencias, con los
mismos valores de raíz carácter por carácter**. Eso no podía ser: aunque el
génesis nuevo estuviera mal, las raíces habrían cambiado.

`comparar-cadenas.py` tenía la dirección de la cadena nueva **fija en el
código** (`NUEVA = 'http://127.0.0.1:8545'`). La cadena nueva estaba en el
8547, así que el juez estuvo comparando contra la cadena de ensayo del día
anterior —la del génesis incompleto— y repitiendo su veredicto.

Ahora lee `OG_NUEVA` del entorno. **Un juez con la dirección fija no juzga lo
que uno cree que juzga**, y la señal de que algo iba mal fue que el resultado
era demasiado idéntico al anterior.

### Lo que queda para el génesis de producción

Lo comprobado es la **copia fiel**. Falta aplicarle encima las
transformaciones deliberadas, en este orden y comprobando cada una:

1. Consolidación del ORIGEN nativo: 1 por billetera de persona, los contratos
   conservan el suyo, el resto a la billetera única.
2. Chain ID 5550 y los cuatro validadores en el `extraData`.
3. El oráculo del oro y el precio del gas.

Primero se probó que la copia es exacta; recién ahora se le cambian cosas a
propósito. Al revés no se puede distinguir un error de un cambio querido.
