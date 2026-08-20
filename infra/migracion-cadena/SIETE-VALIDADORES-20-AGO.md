# La 5550 pasa de 4 a 7 validadores · 20-ago

José pidió «bajar la testnet y usar esos nodos». Antes de tocar nada se midió
el terreno, y el terreno había cambiado respecto a lo escrito. Este documento
empieza por lo que se encontró, porque cambia el plan.

## 1 · Lo que ya estaba hecho, y lo que estaba vencido

**La testnet en los nodos grandes ya estaba caída.** En los nodos 3, 4, 5 y 6:

```
● besu.service     loaded  failed  failed   Besu QBFT - Orden Global 5534
  besu5550.service loaded  active  running  Besu QBFT - Orden Global 5550
```

**La 5534 lleva congelada desde el 15-ago 05:29 UTC** —el momento exacto en que
arrancó la 5550—. Medido en el RPC que quedaba en pie: bloque 33.987, sin
avanzar en 20 segundos, **cero pares**. No tiene ni un validador vivo.

**Y la tarea «la cadena tiene 1 solo validador» estaba vencida**: era de cuando
la cadena era la 8532. La 5550 ya tenía **cuatro** validadores QBFT.

## 2 · Por qué 7 y no 5 ni 6

En QBFT la tolerancia a fallos es `(n−1)/3` redondeado hacia abajo:

| Validadores | Aguanta caídas |
|---|---|
| 4 | 1 |
| 5 | 1 |
| 6 | 1 |
| **7** | **2** |

Sumar uno o dos no compra nada. **El único salto que sirve es llegar a siete.**

## 3 · Qué máquinas, y por qué no las de la testnet

Las tres máquinas de la testnet son t3.small de 2 GB, y dos de ellas no están
libres: `ogb-testnet-2` aloja **el cerebro** (`cerebro.ordenscan.com`) y el
relevo de mensajes, y `ogb-testnet-3` es **todo el ensayo** (mongo + explorador
+ backend de prueba).

Las que de verdad estaban tiradas eran **node1 y node2**: dos t2.large a 67,74
USD/mes cada una corriendo únicamente la 8532, que no registra **ni una
transacción en los últimos 60.000 bloques**. Y la máquina `ensayo-besu-8532`,
una t3.medium con tres Besu sueltos de ensayo (cadenas 55330, 55331 y 5534),
arrancados a mano, sin unidad de systemd y sin DNS que les apuntara.

## 4 · El detalle que casi muerde · node1 no estaba libre

La regla **por defecto** del balanceador OrdenKapital reenviaba a **node1
puerto 80**, que es el JSON-RPC de polygon-edge. Como `*.ordenglobal-rpc.com`
es comodín, cualquier subdominio que no encajara en las otras dos reglas le
pegaba a la cadena vieja. Comprobado antes de tocar:

```
ondk.ordenglobal-rpc.com -> {"result":"0x2154"}   = 8532
```

Se movió la acción por defecto del grupo `ordenKapital` al grupo
`og5550-rpc-prod`, y se verificó con conexión nueva:

```
ondk.ordenglobal-rpc.com -> {"result":"0x15ae"}   = 5550
```

La acción anterior quedó guardada para revertir en un comando.

**De paso**: el balanceador `ogb-testnet-rpc` reenvía al grupo `ogb-5550-nodos`,
o sea que `rpc-testnet.ordenglobal-rpc.com` sirve la red principal. El nombre
miente; conviene renombrarlo antes de que alguien se confíe.

## 5 · Lo que se hizo

### Malla de red
30303 tcp **y** udp abiertos entre las siete máquinas. Antes faltaban 44 reglas
—node1 no tenía ninguna y la máquina de ensayo no tenía **ni una** regla de
entrada—. Verificado máquina por máquina después de aplicarlas.

### Los tres nodos nuevos

| | node1 | node2 | node7 |
|---|---|---|---|
| Máquina | OGB node 1 | OGB node 2 | ex `ensayo-besu-8532` |
| IP | 23.23.205.33 | 18.190.14.28 | 100.48.18.94 |
| Dirección | `0xbc820391…caf2a` | `0x4c03eb38…98036` | `0x453493fc…fc12e` |

En cada uno: Corretto 25 desde `corretto.aws`, Besu 26.7.1 (tarball con md5
`ae7a9bfa9fbade000e530a63efd7eb91`, **el mismo binario** que ya corría en los
validadores), y el génesis con md5 `89a1ec6b15d584525326ca11951d87df`,
comprobado contra el que corre en producción. El RPC de los tres queda atado a
`127.0.0.1`: son validadores, no servidores públicos.

En la máquina de ensayo se pararon antes los tres Besu sueltos. **No se borró
ningún dato**: sus directorios siguen ahí.

### La votación
Con `qbft_proposeValidatorVote` desde los **cuatro** validadores originales, de
uno en uno, verificando el conjunto entre cada alta. Los tres entraron. Después
se descartaron los votos ya aplicados para no dejar propuestas colgando.

### La prueba de que funciona
No basta con salir en la lista: hay que proponer bloques. En 70 bloques
seguidos proponen **los siete**, node7 incluido.

```
bloque punta: 41.349 · proponentes distintos: 7
```

## 6 · Lo que se retiró

- `rpc5534.service` parado y deshabilitado en `ogb-testnet-1` y `ogb-testnet-2`.
- `ogb-testnet-1` **detenida** (no terminada: se vuelve a encender cuando se
  quiera).
- `ogb-testnet-2` intacta en lo que importa: caddy, mensajes y cerebro-ordenes
  los tres activos, y `cerebro.ordenscan.com` responde 401 —su contraseña, o
  sea vivo—.
- `ogb-testnet-3` sin tocar, por decisión de José. `pruebas.ordenscan.com` → 200.

### El ahorro real, y una estimación mía que salió mal
Dije «unos 45 USD/mes». **Son 15,18.** La diferencia es que la máquina de
ensayo, que contaba como retirada, terminó reutilizada como validador 7 — que
es mejor uso, pero no ahorra. Cómputo: de 482,38 a **467,20 USD/mes**.

El objetivo de esta jornada no era ahorrar: era pasar de aguantar una caída a
aguantar dos.

## 7 · Lo que queda, y por qué no lo decido yo

### a) La 8532 sigue corriendo en las seis t2.large
Ya no la usa nadie: cero transacciones, y desde hoy tampoco le llega tráfico
por el balanceador. Pararla **no ahorra un peso** —las máquinas se quedan,
ahora sirven la 5550— pero sí quita un riesgo real: **seis de los siete
validadores comparten máquina con ella**. Si polygon-edge se desmadrara, se
llevaría por delante un validador.

Es la decisión que el documento del 15-ago ya dejaba en manos de José, y sigue
ahí. La cadena queda apagada pero restaurable: los datos no se borran.

### b) node7 no tiene IP fija
Se intentó asociarle una IP elástica y AWS respondió que el usuario `jose`
**no tiene permiso** para `ec2:AssociateAddress` (fallaron las cinco libres,
con el mismo error). Mientras la máquina no se apague, la IP no cambia. Si se
apaga, hay que reescribir su `--p2p-host` y los bootnodes que la citen.

### c) Cinco IP elásticas sin asociar
`100.59.165.162`, `18.235.240.240`, `3.220.53.86`, `34.234.142.58`,
`52.7.66.163`. AWS cobra por cada IPv4 pública reservada y sin usar: unos 18
USD/mes entre las cinco. Liberarlas **es irreversible** —esa IP no vuelve—, así
que no se toca sin decirlo.

### d) node3 sigue en `unhealthy` en el balanceador
Responde bien en local y valida bloques con normalidad. La red sirve con node5
y node6. Sin resolver desde el 15-ago.

### e) El ensayo habla con una cadena muerta
`ogb-testnet-3` sigue en pie, pero la 5534 que consulta está congelada desde el
15-ago. El explorador y el backend de prueba arrancan, pero detrás no hay
bloques nuevos. Si el ensayo va a servir para algo, hay que apuntarlo a la 5550
o levantar una cadena de pruebas de verdad.
