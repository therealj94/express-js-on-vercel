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

## 7 · La 8532, apagada · autorizado por José el 20-ago

`polygon-edge` y su watchdog quedaron **parados y deshabilitados en las seis
máquinas**. El watchdog se apagó primero: si no, reanima el servicio a los tres
minutos y el apagado no dura.

| | node1 | node2 | node3 | node4 | node5 | node6 |
|---|---|---|---|---|---|---|
| polygon-edge | inactivo | inactivo | inactivo | inactivo | inactivo | inactivo |
| watchdog | inactivo | inactivo | inactivo | inactivo | inactivo | inactivo |
| procesos vivos | 0 | 0 | 0 | 0 | 0 | 0 |

**Los datos no se borraron**: `/home/ec2-user/node-x` y sus hermanos siguen en
disco —2,6 GB en node1—. Volver es `systemctl start polygon-edge`.

Comprobado después, en tres nodos distintos: la 5550 con **siete validadores**,
**siete proponentes distintos** en 70 bloques, seis pares cada uno y la altura
subiendo (41.404 → 41.417). El apagado no la rozó.

Queda un cabo cosmético: el grupo `ordenKapital` del balanceador apunta a
node1:80, que ya no responde. Ninguna regla lo usa desde que se movió la acción
por defecto, así que no sirve tráfico — solo se verá en rojo en la consola.

## 8 · Lo que queda, y por qué no lo decido yo

### a) Las seis t2.large están enormes para lo que hacen · 224 USD/mes
Medido con la 8532 ya apagada:

| | node3 | node5 | node7 (t3.medium) |
|---|---|---|---|
| Besu en memoria | 482 MB | 538 MB | 604 MB |
| Memoria de la máquina | 7.930 MB | 7.930 MB | 3.839 MB |
| Carga media | 0,09 | 0,03 | 0,17 |
| Disco de la 5550 | 94 MB | 93 MB | 176 MB |

Un validador de la 5550 gasta **medio giga y nada de CPU**. Las t2.large tienen
8 GB porque las heredamos de la cadena vieja, que sí los usaba.

Bajarlas a t3.medium —el tamaño que **ya usa node7, que valida sin despeinarse**—
lleva cada una de 67,74 a 30,40 USD/mes: **224 USD/mes entre las seis**, más que
todo lo demás junto.

El cambio pide apagar y encender cada instancia (unos dos minutos). Con siete
validadores se aguantan dos caídas, así que hacerlo **de una en una** es seguro,
y las IP elásticas sobreviven al reinicio. **No lo hago sin permiso**: es tocar
seis máquinas de producción, y un arranque que no vuelve es un validador menos.

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

## 9 · Chainlist · publicado

El PR #8612 se **mergeó** el 19-ago. Comprobado en las tres fuentes que
importan, no en la página del PR:

- `_data/icons/ordenglobal.json` está en `master` con el CID
  `bafkreicn6kctjauo7yoam3daqzs3vybogw6nkwuhtls7isnhubti74qqvi`
- `_data/chains/eip155-5550.json` en `master`, con `"icon": "ordenglobal"`
- **`chainid.network/chains.json`** —el archivo que consume Chainlist— ya sirve
  la Orden Global con sus dos RPC y el ícono

El CID se verificó sin fiarse de Pinata: es el sha256 del propio archivo, y
calculado sobre nuestro PNG local da exactamente ese. Además se bajó del
gateway y volvió con los mismos 186.157 bytes y el mismo hash.

Queda `"status": "incubating"`. Se cambia a `active` cuando toque; ahora ya hay
siete validadores, así que el motivo original de esa marca desapareció.

---

# Segunda jornada · 20-ago · nodos terminados

## 10 · El misterio de node3, resuelto

Llevaba en `unhealthy` desde el 15-ago sin explicación. La causa: **`firewalld`
corría solo en node3**, y su zona `public` permitía nada más `ssh`, `mdns` y
`dhcpv6-client` — **ningún puerto**.

Encajaba con todos los síntomas:

- respondía 200 en `127.0.0.1` (el bucle local no pasa por el cortafuegos);
- el balanceador no lo alcanzaba en 8545, y ahí fallaba;
- y sin embargo **validaba y tenía pares**, porque node3 *inicia* las
  conexiones de red y firewalld solo filtra lo que entra.

Se abrieron 8545/tcp y 30303 tcp+udp de forma permanente. Quedó **sano en los
dos grupos**, y el arreglo sobrevivió al reinicio posterior. El RPC público
sirve ahora desde tres nodos en vez de dos.

Los otros seis no llevan firewalld. La protección la da el grupo de seguridad,
que en node3 ya restringía 8545 a los balanceadores y 30303 a las seis IP
conocidas.

## 11 · El redimensionamiento, y el susto

**Salió mal en el primer intento y hay que dejarlo escrito.**

node1 se apagó para pasarlo a `t3.medium` y AWS respondió *«The requested
configuration is currently not supported»*. Al devolverlo a `t2.large`,
respondió **`InsufficientInstanceCapacity`**. Durante unos minutos node1 estuvo
apagado y sin poder arrancar.

La causa, averiguada después: **`us-east-1e` es una zona vieja.** De los 58
tipos que ofrece, ninguno es t3 ni m5 — solo familias antiguas (t2, m3, m4, c3,
c4, r3, r4, i2, i3, d2, x1). Y encima andaba sin capacidad de `t2.large`.

**La comprobación que faltó**: mirar `describe_instance_type_offerings` de la
zona **antes** de apagar la máquina, no después. Queda escrito para la próxima.

La salida resultó mejor que el plan: node1 arrancó como **`t2.medium`** —4 GB,
los mismos que node7— a 33,87 USD/mes en vez de 67,74. La IP elástica sobrevivió.

Desde ahí, cada nodo se hizo con una lista de tipos candidatos y vuelta al
original si ninguno entra, respaldo del disco antes de tocar, y verificación de
que la cadena sigue en siete validadores antes y después.

| Nodo | Zona | Antes | Ahora | USD/mes |
|---|---|---|---|---|
| node1 | us-east-1e | t2.large | **t2.medium** | 67,74 → 33,87 |
| node3 | us-east-1e | t2.large | **t2.medium** | 67,74 → 33,87 |
| node5 | us-east-1d | t2.large | **t3.medium** | 67,74 → 30,40 |
| node6 | us-east-1d | t2.large | **t3.medium** | 67,74 → 30,40 |
| node2 | us-east-2b | t2.large | **t3.medium** | 67,74 → 30,40 |
| node4 | us-east-2b | t2.large | **t3.medium** | 67,74 → 30,40 |

Los cuatro pasos a t3 son un salto a Nitro; antes de cada uno se regeneró el
initramfs con `dracut --add-drivers "nvme nvme_core ena"`. El `fstab` ya usaba
UUID, que es lo que de verdad decide si arranca. Los cuatro entraron limpios.

**Comprobación final**: bloque 41.637 → 41.643 en 60 segundos, y **los siete
validadores proponen** — 9, 9, 10, 10, 10, 11 y 11 bloques de 70. Reparto parejo.

## 12 · La cuenta

| | USD/mes |
|---|---|
| Cómputo antes de empezar | 482,38 |
| **Cómputo ahora** | **250,10** |
| **Ahorro** | **232,28** |

Y con más red que antes: siete validadores en vez de cuatro, tres nodos
sirviendo el RPC público en vez de dos.

## 13 · Limpieza

Se dieron de baja los destinos huérfanos del balanceador: `ordenKapital` y
`ordenssl` apuntaban a node1 en los puertos 80 y 443, donde ya no hay nada desde
que se apagó la 8532; `ogb-testnet-nodos` apuntaba a las dos máquinas de la
testnet. Ninguna regla los usaba. Las reglas que quedan son tres, y las tres
llevan a la 5550.

Quedan **seis respaldos de disco** (`snap-…`), uno por nodo, de antes de tocar
cada máquina. Cuestan unos 3 USD/mes entre todos. Conviene conservarlos unos
días y borrarlos después.
