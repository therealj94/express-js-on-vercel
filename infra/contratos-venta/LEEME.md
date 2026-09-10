# Comprar ORIGEN con USDT desde Polygon y BNB Smart Chain

## Lo primero, porque cambia todo lo demás

**Ningún contrato puede cobrar en Polygon y entregar en la 5550 en el mismo
acto.** Las cadenas no se leen entre ellas. Cualquiera que lo prometa está
describiendo dos sistemas y llamándolos uno.

Así que esto son dos piezas, y el reparto es deliberado:

| pieza | dónde | qué hace |
| --- | --- | --- |
| `VentaOrigen.sol` | Polygon (137) y BSC (56) | cobra el USDT, lo manda a la tesorería en la MISMA transacción, y deja escrito cuánto ORIGEN se debe y a qué dirección de la 5550 |
| `lib/vigiaCompras.js` | ordenex-api | lee esos eventos y paga el ORIGEN en la 5550 |

La parte que toca el dinero de otra persona es la de la cadena, y es la que se
puede auditar línea por línea. La de fuera solo entrega lo ya escrito.

## Las direcciones

| qué | dirección |
| --- | --- |
| Tesorería (recibe el USDT), Polygon y BSC | `0x6A1aeD0BFCC8c8aC7CB916270509CcD66911eBBc` |
| Pagadora (entrega el ORIGEN), cadena 5550 | `0x746268404Cc9CA2ef0Ac344F02B236DB232c3ad8` |

**Ojo con la segunda:** la que se pasó venía en minúsculas y su checksum no
coincidía. La de arriba es la misma dirección con el checksum correcto — vale
igual, pero conviene usar esta forma para que cualquier herramienta la acepte.

La tesorería **no es un contrato de custodia**: es una cuenta normal con
delegación EIP-7702 (los 23 bytes de código que se ven en el explorador son
`0xef0100` + la implementación). Tiene llave privada y puede firmar. La
implementación delegada es distinta en cada red, lo cual es normal.

## Cómo compra alguien

1. `approve(VentaOrigen, monto)` en el USDT de su red.
2. `comprar(montoUsdt, destino5550, minOrigen)`.

`destino5550` no tiene por qué ser la misma dirección que paga: quien compra
desde un exchange o una billetera de hardware normalmente cobra en otra.

`minOrigen` es la defensa del comprador: si el precio se mueve en contra entre
que firma y que se mina, la compra revierte en vez de entregarle menos de lo
que aceptó.

## Las decisiones que sostienen la seguridad

- **El contrato no custodia nada.** El USDT entra y sale en la misma llamada.
  No hay saldo acumulado, así que no hay nada que robar ni función de rescate
  que auditar.
- **La tesorería es inmutable.** No hay setter. Si hay que cambiarla se
  despliega otro contrato — más trabajo, y es exactamente el trabajo que se
  quiere que cueste. Un setter de tesorería es una llave que redirige todas las
  compras futuras.
- **El cupo ata las dos cadenas.** `cupoOrigen` sale del saldo real de la
  billetera pagadora. El contrato no vende por encima de él, así que no puede
  cobrar por un ORIGEN que no existe.
- **El precio caduca** a los 30 minutos. Pasado eso deja de vender en vez de
  seguir con un número viejo.
- **Dos llaves separadas.** El dueño (fría) nombra operador, pone límites y
  pausa. El operador (caliente, en el servidor) solo toca precio y cupo. Si se
  filtra la del servidor, lo peor que puede hacer es vender a mal precio dentro
  del cupo: no puede llevarse fondos ni redirigir la tesorería.
- **Los decimales se leen del token.** 6 en Polygon, 18 en BSC. Escribirlos a
  mano es el error que no se ve hasta que alguien compra por un millón de veces
  de menos.

## Probar

```
npx hardhat test        # 30 pruebas
```

Las que importan no son las de la compra feliz, sino las cinco formas en que un
contrato así hace daño: cobrar y no deber nada, vender lo que no hay, vender a
un precio que ya no es, entregar menos de lo aceptado, y que lo toque quien no
debe. Están todas.

## Desplegar

```
LLAVE_DESPLIEGUE=0x…  OPERADOR=0x…  npx hardhat run scripts/desplegar.js --network polygon
LLAVE_DESPLIEGUE=0x…  OPERADOR=0x…  npx hardhat run scripts/desplegar.js --network bsc
```

La llave entra por el entorno y **nunca** por un archivo del repositorio. El
script comprueba contra la cadena de verdad —el chainId, que en la dirección
del USDT haya un contrato, que su símbolo y decimales sean los de esa red, y
que quien firma tenga gas— y **no despliega si algo no cuadra**.

El contrato nace **cerrado**: sin precio, sin cupo y sin límites no vende nada.
Se abre en este orden:

1. `ponerLimites(min, max)` — el dueño.
2. Comprobar el ORIGEN real en la 5550.
3. `ponerPrecioYCupo(precio, cupo)` — el operador; esto ya lo hace el vigía en
   cada vuelta.

## Variables del vigía (en Heroku, nunca en el repo)

| variable | qué es |
| --- | --- |
| `VENTA_POLYGON` / `VENTA_BSC` | las direcciones de los contratos desplegados |
| `ORIGEN_PAGADOR_KEY` | la llave de `0x7462…`, que paga el ORIGEN en la 5550 |
| `OPERADOR_KEY` | la llave del operador, que refresca precio y cupo |
| `RPC_POLYGON` / `RPC_BSC` | opcionales, para usar un RPC de pago |

Sin `ORIGEN_PAGADOR_KEY` el vigía no arranca. Sin `OPERADOR_KEY` no refresca, y
el precio del contrato caduca solo y cierra la venta. Las dos ausencias son
seguras a propósito.

## Lo que falta antes de que esto pueda vender de verdad

1. **La billetera pagadora tiene 20,96 ORIGEN (~54 USD).** Con eso el cupo da
   para vender unos cincuenta dólares y se acaba. Fondearla es una decisión de
   tesorería, con acta.
2. **No hay BNB para desplegar en BSC.** La cuenta que firme necesita gas ahí;
   en Polygon hay 1,37 POL, que alcanza.
3. **Decidir quién es el dueño y quién el operador.** Lo sano es que el dueño
   sea una llave fría que no viva en ningún servidor, y el operador una llave
   propia solo para esto. No usar la misma que paga el ORIGEN.
4. **Las dos llaves nuevas** (`OPERADOR_KEY` y `ORIGEN_PAGADOR_KEY`) hay que
   generarlas y ponerlas en Heroku. No pasan por el repositorio ni por un chat.
