# Etapas 1 y 2 · el génesis nuevo, construido y ensayado · 25-ago 2026

**Producción sigue sin tocarse.** Todo esto ocurrió en `ogb-testnet-3`, con la
red aislada, y la máquina quedó como estaba.

---

## La regla, en las palabras de José

> «Cierra todo. Lo único origen que quedan son los 1 origen que se repartieron,
> y los tokens como estaban al día de hoy en las billeteras. Con eso
> reiniciamos. Solo es recuperar esas origen que quedaron en esas pruebas.»

De ahí salen cuatro reglas y ninguna otra:

1. Las **155 billeteras sembradas** quedan con **1 ORIGEN exacto**. Las que
   gastaron gas se reponen; las que recibieron de más se recortan.
2. Todo el demás ORIGEN fuera de las asignaciones grandes **vuelve al tesoro**:
   contratos, pools, restos de prueba y comisiones de validador.
3. Los **saldos ERC-20 quedan como están hoy**, sin tocar ni uno. WORIGEN es la
   única excepción, y no es una excepción sino la consecuencia: al quitarle al
   wrapper el ORIGEN que lo respalda, sus saldos tienen que ir a cero o el
   contrato queda insolvente. **Se hacen las dos cosas o ninguna.**
4. Las **tres asignaciones preservadas** de 250.000 millones no se tocan.

---

## El inventario, antes de decidir nada

Las 343 cuentas de la cadena, clasificadas sin dejar una fuera:

| Grupo | Cuentas | ORIGEN |
|---|---:|---:|
| Preservadas de 250.000 millones (incluye el tesoro) | 4 | 999.999.982.598,071166992 |
| Contratos con ORIGEN | 3 | 17.226,926876594 |
| Billeteras con su 1 ORIGEN exacto | 149 | 149,000000000 |
| Billeteras con más de 1 | 2 | 21,964744816 |
| Billeteras con menos de 1 (gastaron gas) | 6 | 3,960389068 |
| Validadores (comisión cobrada) | 7 | 0,076819116 |
| Contratos y cuentas sin ORIGEN | 172 | 0 |
| **Total** | **343** | **1.000.000.000.000,000000000** |

Los tres contratos con ORIGEN: el wrapper `0xccbe0c66…` con 16.387,76, el
contrato `0xa2218053…` con 839,17, y `0xaf25c902…` con cero.

## Los once mercados, no uno

El plan hablaba del pool AUKA/WORIGEN. Al leer el almacenamiento del wrapper
aparecieron **once** pools con WORIGEN, no uno: el grande con 16.259,23 y otros
diez con 84,00 entre todos, emparejados contra nueve tokens distintos.

Y los «12 tenedores de WORIGEN» **no son doce personas**: son diez pools más
dos cuentas, `0x0186450c…` (43,78) y `0x3063a26b…` (0,75), que son las dos
operadoras que crearon las 31 posiciones de liquidez —doce una y diecinueve la
otra—. Ningún tercero.

## Las 21 ranuras del wrapper, todas identificadas

Antes de vaciarlo había que saber qué guardaba, ranura por ranura. No quedó
ninguna sin explicar:

| Ranura | Qué es |
|---|---|
| 0, 1, 2 | nombre «Wrapped Origen», símbolo «WETH», decimales 18 |
| 14 ranuras del mapa índice 3 | los saldos de WORIGEN — suman **exactamente** el ORIGEN que respalda al contrato |
| 4 ranuras del mapa índice 4 | permisos, con dueño y gastador identificados por fuerza bruta sobre 1.205 direcciones |

El wrapper **no guarda `totalSupply`**: es estilo WETH y lo calcula como su
propio saldo. Vaciarle el ORIGEN lo deja emitido en cero solo, sin dejar
WORIGEN huérfano. Los permisos que sobreviven son inertes: un permiso para
gastar un token que ya nadie tiene no mueve nada.

---

## El hallazgo que habría dejado la cadena a medias

**El `extraData` del génesis nombra CUATRO validadores, no siete.**

node1, node2 y node7 entraron por votación QBFT el 20-ago, y esa votación vive
en la historia que el reinicio borra. Reiniciando con el `extraData` tal cual,
la cadena vuelve con **cuatro** validadores: aguanta una caída en vez de dos, y
se pierde el trabajo de aquel día sin que nada avise.

Corregido: el génesis nuevo lleva los **siete**. Para escribirlo hizo falta
codificar RLP a mano, y eso no se hace a ciegas — `extradata_qbft.py` decodifica
el `extraData` de producción, lo vuelve a codificar y exige que salga **byte a
byte igual** antes de fabricar uno nuevo. Un codificador que no sabe reproducir
lo que Besu ya aceptó no sirve para fabricar.

---

## Etapa 1 · las cuentas

```
recuperado al tesoro : 17.247,964005914
repuesto a sembradas :      1,035176320
neto al tesoro       : 17.246,928829594
```

El tesoro pasa de 249.999.982.598,071166992 a **249.999.999.845,000000000**.

Ese número redondo no se buscó: es lo que queda al restar del billón las tres
preservadas (750.000 millones) y las 155 billeteras (155). Que caiga exacto es
la señal de que las cuentas cierran.

### El juez

`juzgar-genesis-nuevo.py` está escrito **aparte del constructor a propósito**:
un guion que construye y se aprueba a sí mismo no comprueba nada, repite su
propio error con las mismas cuentas. Parte de la foto y del génesis viejo, y no
mira el constructor. Diecinueve comprobaciones, todas en verde.

Y antes de creerle, se le plantaron nueve averías a mano para ver si sabía
ponerse rojo:

| Avería | |
|---|---|
| un ORIGEN de menos en el tesoro | la caza |
| una preservada movida | la caza |
| una sembrada con 0,5 en vez de 1 | la caza |
| al wrapper le queda ORIGEN | la caza |
| al wrapper le sobrevive un saldo de WORIGEN | la caza |
| se pierde un saldo de AUKA | la caza |
| cambia el código de un contrato | la caza |
| cambia el chainId | la caza |
| se toca el extraData | la caza |

---

## Etapa 2 · el ensayo

### Ensayo 1 · Besu acepta el génesis

Arrancado en `ogb-testnet-3` con el génesis **exacto**, md5
`3f3c774485f58ed8dfed3373e04a038f` comprobado en la máquina. **Cero errores en
el arranque.** Leído contra el RPC, no contra el archivo:

| | |
|---|---|
| chainId | 5550 |
| **validadores QBFT en el bloque 0** | **7** |
| tesoro | 249.999.999.845,000000000 |
| wrapper | 0 ORIGEN · 0 WORIGEN en el pool |
| billeteras con 1 ORIGEN exacto | **155 de 155** |

### La prueba de punta a punta

Se leyó la emisión de **los 172 contratos** en la cadena de ensayo y en
producción, y se compararon:

```
contratos con emision: 47
DIFERENCIAS entre produccion y el ensayo: 0
```

Cero, leído de dos cadenas distintas. Los tokens quedan exactamente como están
hoy.

### Ensayo 2 · la cadena vive y mueve dinero

Con siete validadores hacen falta cinco nodos para producir un bloque, y en la
máquina de ensayo no caben siete Besu. Así que el segundo ensayo levanta una
**variante** que cambia dos cosas y solo dos —comprobado por el guion antes de
arrancar—: `extraData` con un único validador, y 1 ORIGEN para él restado del
tesoro. La emisión no se mueve.

**Un tropiezo que vale anotar:** con `--p2p-enabled=false` el nodo arranca, el
RPC responde y la altura se queda clavada en cero. QBFT es consenso en red: sin
pila de red no arranca el bucle, y no lo dice claro. Con la red encendida y
aislada (`--discovery-enabled=false --max-peers=0`), produce bloques.

Y entonces, dos transacciones firmadas a mano:

| | antes | después |
|---|---:|---:|
| remitente | 1,000000000 | 0,650000000 |
| destino | 1,000000000 | 1,250000000 |
| wrapper | 0,000000000 | 0,100000000 |
| WORIGEN del remitente | 0,000000000 | 0,100000000 |

El envío de 0,25 se movió. Y el depósito de 0,10 en el wrapper emitió
**exactamente** 0,10 WORIGEN: **el wrapper arranca solvente desde cero y
funciona**. Que era la duda de fondo.

Después se pararon los dos nodos y se borraron sus datos. `mongod`,
`ogscan-ensayo` y `caddy` siguen activos.

---

## Herramientas

| Guion | Qué hace |
|---|---|
| `construir-genesis-nuevo.py` | el génesis, desde la foto. Si la suma no cuadra al wei, no emite nada |
| `juzgar-genesis-nuevo.py` | lo audita aparte, en 19 comprobaciones |
| `extradata_qbft.py` | lee y escribe el `extraData` QBFT, y se prueba contra el de producción |
| `ensayo-vivo.py` | arma la variante de un validador y firma transacciones a mano |

## Lo que falta antes del corte

1. **La ventana de corte.** Media hora de mantenimiento, de noche.
2. El token de Heroku, si se quiere la copia de Ordenscan (no bloquea).
