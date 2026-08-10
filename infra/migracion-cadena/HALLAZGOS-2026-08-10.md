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
