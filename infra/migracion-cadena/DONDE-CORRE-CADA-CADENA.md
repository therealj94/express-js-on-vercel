# Dónde corre cada cadena · el mapa que faltaba

Descubierto el 13-ago mirando los procesos de las máquinas, no un documento:
**nadie lo había escrito.** Y cambia dos planes.

## Lo que corre en cada máquina

| Máquina | Tipo | Cadena vieja 8532 | Pruebas 5534 |
|---|---|---|---|
| OGB node 1 | t2.large | polygon-edge | — |
| OGB node 2 | t2.large | polygon-edge | — |
| **OGB node 3** | t2.large | polygon-edge | **validador Besu** |
| **OGB node 4** | t2.large | polygon-edge | **validador Besu** |
| **OGB node 5** | t2.large | polygon-edge | **validador Besu** |
| **OGB node 6** | t2.large | polygon-edge | **validador Besu** |
| ogb-testnet-1 | t3.small | — | RPC |
| ogb-testnet-2 | t3.small | — | RPC + **el cerebro** |
| ogb-testnet-3 | t3.small | — | RPC |
| ensayo-besu-8532 | t3.medium | — | ensayo |

Los cuatro validadores de la 5534 **están dentro de las máquinas de la cadena
vieja**, cada una corriendo los dos procesos a la vez. El directorio de datos
ya se llama `/opt/og5550/` —se preparó pensando en la 5550— aunque el génesis
que tiene dentro es el de la 5534.

## Consecuencia 1 · el ahorro de 414 USD al mes no era real

El plan decía: «retirar las seis máquinas de la cadena vieja, 414 de los 524
USD al mes». **Apagar esas seis mata también la red de pruebas.** Sólo las
máquinas 1 y 2 llevan exclusivamente la cadena vieja.

Lo que se puede retirar de verdad después del corte:

| | USD/mes aprox. |
|---|---|
| Nodos 1 y 2, que sólo llevan la 8532 | ~138 |
| Parar `polygon-edge` en los nodos 3 a 6 (no ahorra, libera la máquina) | 0 |
| Bajar de tamaño los nodos 3 a 6 una vez sólo lleven Besu | por decidir |

La cifra honesta del ahorro inmediato es **unos 138 USD al mes**, no 414. El
resto llega después, al reducir el tamaño de las cuatro que quedan.

## Consecuencia 2 · la 5550 no necesita máquinas nuevas

Ésta era «lo único que bloquea el corte»: decidir en qué máquinas corre la
5550. **Ya están decididas por los hechos.** Los nodos 3, 4, 5 y 6 tienen:

- Besu 26.7.1 instalado y en marcha, con Java 25
- IP elásticas fijas, y la malla de bootnodes ya escrita entre ellos
- el suelo de gas de 93 gigawei y `--tx-pool-no-local-priority` puestos
- `/opt/og5550/` ya existente
- **y sitio de sobra**: medido en el nodo 3, con las dos cadenas corriendo —
  7,9 GB de memoria con **6 GB libres**, carga media **0,02**, y 18 GB de
  disco libre. La cadena de pruebas ocupa 96 MB.

El génesis de la 5550 es pequeño —331 cuentas, 1.375 ranuras—, así que cabe
sin discusión.

**Coste de máquinas nuevas para la 5550: cero.**

## Cómo queda el arranque

Sobre esas cuatro máquinas, la 5550 es un tercer proceso con su propio
directorio, su propio puerto y su propio génesis. No toca ni la cadena vieja ni
la de pruebas.

```
/opt/og5550/      hoy: la 5534   ->  renombrar a /opt/og5534/ para que el
                                     nombre deje de mentir
/opt/mainnet5550/ nuevo: la 5550, puertos propios
```

**Arrancar los cuatro validadores de la 5550 ES el corte**, y eso no se hace
sin José. Lo que queda escrito aquí es que, cuando se haga, no hay que comprar
ni configurar nada: las máquinas ya están, probadas y con sitio.

## El riesgo que hay que decir

Durante la migración, un validador de la red principal comparte máquina con la
cadena que reemplaza. Si `polygon-edge` se desmadrara y se comiera la máquina,
se llevaría por delante un validador de la 5550. Con cuatro validadores, QBFT
aguanta que caiga uno, así que no para la cadena — pero el margen se estrecha.

Se cierra solo: en cuanto `ordenscan.com` indexe la 5550, se para
`polygon-edge` en los nodos 3 a 6 y el problema desaparece.
