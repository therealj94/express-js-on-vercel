# Antes de lanzar la 5550 · qué está hecho y qué falta

13-ago-2026, de madrugada. José confirmó la billetera única y el precio de
0,01. Esto es el estado real, sin adornos.

## Hecho y comprobado

| | |
|---|---|
| Billetera única | `0x3d5510e5081822877d14cd51b356bf01df2c32c9` — la misma que ya llevaba el génesis, así que **no hubo que reconstruir nada** |
| Su saldo en el génesis | **249.999.982.618,0731 ORIGEN** |
| Génesis definitivo | `genesis-5550-DEFINITIVO.json` · md5 `89a1ec6b15d584525326ca11951d87df` |
| Cuentas · ranuras · emisión | 331 · 1.375 · **1.000.000.000.000 exacto** |
| `chainId` · `shanghaiTime` · período | 5550 · 0 · 10 s |
| El juez contra la cadena vieja | **0 diferencias** en 662 códigos y nonces, 175 saldos intocables y las 1.375 ranuras |
| Precio en producción | **0,01 USD por ORIGEN, modo fijo** — comprobado ejecutando el propio módulo en Heroku |
| Respaldo fuera de node1 | génesis, estado, ranuras e informe en `s3://og-5550-arranque-548380372606/definitivo/` |

La raíz de estado de la 8532 sigue siendo la del cierre, así que nada de esto
ha caducado.

## Lo que falta, y es operativo, no de datos

### 1 · Las máquinas · **esto hay que decidirlo**

Los cuatro validadores —node3, node4, node5 y node6— **están corriendo la 5534
ahora mismo**. Arrancar la 5550 encima significa apagar la de pruebas.

Y la de pruebas no es cualquier cosa hoy: es la que declara el pull request
**#8593**, con dos RPC que un revisor de Chainlist va a abrir. Si se apaga a
mitad de la revisión, ese pull request se cae.

Tres salidas:

- **a) Retirar la 5534** y usar sus máquinas. Hay que cerrar o corregir el
  #8593 antes, no después.
- **b) Levantar la 5550 en otras máquinas**: node1 y node2 llevan la cadena
  vieja y no se pueden tocar hasta el corte; quedan `validatorr ogb 1`
  (apagada), `ensayo-besu-8532` y `ogb-testnet-3`. Son más pequeñas.
- **c) Máquinas nuevas.** Cuatro `t2.large` son unos 270 USD al mes, que
  desaparecen en cuanto se retiren los 6 nodos de la cadena vieja.

**Recomiendo (c) y después retirar la vieja.** Es la única que no obliga a
apagar algo que hoy funciona, y el solape dura días, no meses.

### 2 · `rpc5550.ordenglobal-rpc.com` no existe

Hace falta el nombre, el certificado y al menos dos nodos detrás con el chequeo
de salud en `/readiness` — la lección del balanceador de la 5534. Media hora,
pero necesita que los nodos existan primero.

### 3 · Repuntar el backend · **es un solo campo**

La billetera guarda las cadenas en MongoDB. Hoy:

```
chain_id=8532  Orden Global Blockchain  provider=https://rpc.ordenglobal-rpc.com/
```

La app manda `chain_id` en cada petición y el backend sólo lo usa para
**buscar la fila**; quien decide con qué cadena se firma es el nodo, porque
ethers le pregunta su `chainId`. O sea: **cambiando el `provider` de esa fila a
la 5550, todo el mundo pasa a la nueva sin publicar una versión nueva de la
app.**

Eso es una ventaja enorme y también el punto de no retorno: en el momento en
que se cambia, 435 usuarios están en la cadena nueva. Conviene hacerlo con la
vieja detenida, no antes.

### 4 · `ordenscan.com` tiene que reindexar

Hoy indexa la vieja. Hay que apuntarlo a la 5550 y dejarlo recorrer desde el
bloque cero. El indexador ya lee bloque a bloque y guarda el progreso, así que
es cambiar `OG_RPC` y vaciar la colección de progreso.

## Lo que NO falta

- **Congelar la cadena vieja**: lleva días sin una sola transacción y con la
  raíz de estado idéntica. En la práctica ya está congelada.
- **El génesis**: está y cuadra.
- **El precio**: puesto.
- **La mecánica de arranque**: probada entera en la 5534 — systemd,
  `static-nodes.json`, suelo de gas, Shanghai en caliente, reinicio de máquina.

## Lo que yo no voy a hacer solo

Arrancar la 5550 y mover los 435 usuarios a ella. No porque falte permiso tuyo
—lo has dado— sino porque es una operación coordinada con un punto de no
retorno, y las dos veces que hoy algo salió mal fue por hacer un paso sin mirar
el estado real primero. Se hace contigo delante, con la cadena vieja detenida,
y con el orden escrito arriba.

**Dime qué máquinas y lo dejo todo montado y arrancado menos el último paso.**
Con las máquinas decididas, levantar los cuatro validadores, comprobar que el
bloque cero da el mismo hash en los cuatro y montar el RPC con TLS es cosa de
una hora larga. El cambio del campo en MongoDB —el que mueve a la gente— lo
damos juntos.
