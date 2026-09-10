# El génesis de la 5550 · construido y juzgado

12-ago-2026, por la noche. **Está construido, y no tiene ni una diferencia con
la cadena vieja.** Falta una sola decisión tuya para que sea el definitivo, y
después arrancarlo — que es el corte y no se hace sin ti.

## Antes de nada: el cierre sigue vigente

La condición para que todo esto valga es que la cadena vieja no se haya movido
desde el cierre de ranuras. Comprobado esta noche:

| | |
|---|---|
| Bloque de la 8532 | **4.174.569** |
| Raíz de estado ahora | `0xd21e29ff024fd135656a54ee3581bda080f716836d0e0243f0e8ec3a0b277882` |
| Raíz de estado del cierre | **la misma** |
| Transacciones en la punta | 0 |

No hay que rehacer nada.

## Lo que se construyó

```
python3 construir-genesis-desde-arbol.py estado-listo.json \
  --ranuras ranuras-todas.json \
  --chain-id 5550 --periodo 10 \
  --validadores validadores-5550.json \
  --consolidar-origen 0x3d5510e5081822877d14cd51b356bf01df2c32c9 \
  --preservar 0xacc03b7f… 0x50219186… 0x3011f7f9…
```

| | |
|---|---|
| Archivo | `/opt/migracion/genesis-5550-nuevo.json` en node1 |
| Tamaño · md5 | 4.551.689 bytes · `89a1ec6b15d584525326ca11951d87df` |
| Cuentas | **331** (172 con código) |
| Ranuras | **1.375** |
| Emisión | **1.000.000.000.000 exacto** |
| `shanghaiTime` | **0** — con PUSH0 desde el bloque cero |
| `extraData` | calculado, los 4 validadores, sin pasar por `besu rlp encode` |
| Cuentas que quedan fuera | **0** |

### El reparto de las ranuras, que cuadra al detalle

- El volcado del árbol trae **1.385** ranuras.
- **10** son del contrato de staking de Edge, `0x…1001`, que **no viaja**: en la
  5550 los validadores los gobierna QBFT, no un contrato.
- Quedan **1.375**, y las 1.375 están en el génesis.

Las **78 huérfanas** que bloqueaban todo en el ensayo del 12 quedaron
resueltas: el constructor sólo reporta incompleto ese contrato de staking.

## El juez: cero diferencias

Se comparó el génesis contra la cadena vieja **sin arrancar nada**, cuenta por
cuenta y ranura por ranura (`juez.py`):

| Qué se comparó | Resultado |
|---|---|
| Código y nonce de las 331 cuentas | **662 iguales · 0 distintos** |
| Saldos que la consolidación no toca (contratos + las 3 preservadas) | **175 iguales · 0 distintos** |
| **Todas** las ranuras de almacenamiento | **1.375 iguales · 0 distintas** |

Los saldos de las billeteras de persona no se comparan **a propósito**: la
consolidación los cambia, y ese cambio está acordado.

## La consolidación, con lo que ahora sí se ve

| | |
|---|---|
| Billeteras de persona con 1 ORIGEN | **155** |
| Contratos que conservan su saldo | 3 |
| Billeteras preservadas | 3 · **750.000.000.000** |
| A la billetera única | **249.999.982.618,0731** |
| Emisión antes y después | **cuadra** |

Y una cosa que antes pasaba en silencio y ahora se informa: **33 billeteras
tenían menos de 1 ORIGEN y se les rellena hasta el piso**, con 17,27 ORIGEN
que salen de la billetera única. Tres de ellas tenían exactamente cero.

## La billetera única: confirmada

**Ya no falta.** José lo dijo el 13-ago: la billetera única es
`0x3d5510e5081822877d14cd51b356bf01df2c32c9` —la misma que ya estaba puesta—.
No hay que reconstruir nada: el génesis que se juzgó con cero diferencias es el
definitivo.

Y dónde corre, que era la otra pregunta abierta, está resuelto en
`DONDE-CORRE-CADA-CADENA.md`: **no hacen falta máquinas nuevas.**

Las tres asignaciones preservadas —750.000 millones— **no se tocan**. Aplicar
«dejemos 1 en cada billetera» a esas tres sería mover el tesoro, y eso va con
instrucción escrita de la Junta.

## Y después, el corte

Arrancar la 5550 con sus cuatro validadores **es el corte**, y no se hace sin
ti. Lo que queda del runbook a partir de ahí: repartir el génesis, arrancar los
cuatro Besu, comprobar que el bloque cero da el mismo hash en los cuatro,
crear `rpc5550.ordenglobal-rpc.com`, apuntar las apps y poner `ordenscan.com` a
indexar la nueva.
