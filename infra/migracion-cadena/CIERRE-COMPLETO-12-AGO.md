# Las ranuras están cerradas · 12-ago-2026

**1.383 de 1.385 ranuras identificadas.** Las 2 restantes son del contrato de
staking de Polygon Edge, que **no viaja al génesis por decisión de diseño**
—QBFT vota, no hay staking—, así que el cierre está completo.

El génesis 5550 construido con eso **pasa el juez entero**:

```
RESULTADO: 1350 comprobaciones iguales · 0 distintas · 0 sin poder comparar
```

Incluida la **raíz de almacenamiento de los 172 contratos**. Esa es la
comprobación fuerte: si un solo valor de una sola ranura estuviera mal, la raíz
no coincidiría. En el ensayo del 10-ago había **7 raíces distintas**; ahora hay
cero.

## Qué no funcionó, y por qué importa

Adivinar se agotó de verdad. Contra las 30 huellas huérfanas se probó:

| Intento | Resultado |
|---|---|
| Ranuras fijas 0 … 3.000.000 | 0 |
| Mapas de dirección · 1.125 direcciones × 25 ranuras × 4 desplazamientos | 0 |
| Mapas de clave numérica · 0 … 300.000 × 12 ranuras | 0 |
| Arreglos · 60 ranuras × 20.000 índices | 0 |
| Mapas de clave bytes32 · los 294 topics de la cadena | 0 |

Cero de treinta. No es que faltara una vuelta más de fuerza bruta: era el
camino equivocado.

## Lo que sí funcionó: preguntárselo a la cadena

**La cadena vieja sí expone `debug_traceTransaction`.** El «banco» —tres Besu
de usar y tirar -- se montó sobre la creencia contraria, y por eso se atascaba:
trazaba sobre un estado incompleto, la ejecución se desviaba y revelaba ranuras
de otra historia. Se quedó en 108 huérfanas y no bajaba.

Trazando sobre la cadena real la máquina virtual recorre el estado de verdad y
dice, sin ambigüedad, qué ranura toca:

1. Barrido de los eventos de toda la cadena en tramos de 1.000 bloques
   (`cosechar-tx.py`) → **1.529 eventos, 1.008 transacciones, 0 tramos
   fallidos**.
2. `debug_traceTransaction` sobre cada una (`trazar-en-la-vieja.py`) →
   **869 ranuras distintas vistas**, de las que **28 de las 30 huellas**
   quedaron resueltas. 1.000 trazadas, 8 sin traza.
3. Cada ranura se acepta **solo si su keccak es la huella que el volcado tiene
   apuntada**. No se inventa ni un valor.

Las 2 que no salieron son del contrato `0x…1001`, cuyo almacenamiento lo
escribe el consenso, no una transacción. Por eso ninguna traza lo toca — y por
eso tampoco viaja.

## Dos fallos del kit que habrían detenido el corte

**1. El constructor no entendía una etiqueta que el emparejador sí emite.**
`ValueError: etiqueta desconocida: ('triple getPool', …)`. El emparejador
escribe una etiqueta legible para humanos —`"A/B/500 -> pool"`— y el
constructor solo sabe leer la forma calculable. Habría reventado con el
servicio ya caído y el reloj corriendo.

Arreglado de raíz con `aplanar-claves.py`: traduce **todas** las claves a
ranura cruda una sola vez y **comprueba cada una contra su huella**. Da igual
cómo se llame la etiqueta — o cuadra, o se reporta. El constructor ya no
interpreta nada.

**2. El génesis sale sin `extraData`.** Lleva el texto
`PENDIENTE: besu rlp encode --from=validadores.json --type=QBFT_EXTRA_DATA`, y
Besu se niega a arrancar con eso. Es intencional —hay que poner los validadores
del día— pero **tiene que estar en la lista de pasos del corte**, porque el
génesis recién construido no arranca.

## Los archivos

| | |
|---|---|
| `cosechar-universo.py` | todas las direcciones que la cadena ha visto (935) |
| `cosechar-tx.py` | qué transacción escribió cada evento |
| `trazar-en-la-vieja.py` | le pide a la cadena vieja que diga sus ranuras |
| `buscar-huerfanas.py` | la fuerza bruta que no sirvió · se deja por lo que descarta |
| `aplanar-claves.py` | todas las claves a ranura cruda, comprobadas |
| `ranuras-por-traza.json` | las 28 huellas que resolvió la traza |
| `ranuras-todas.json` | **las 1.383 ranuras listas para el génesis** |

## Cómo se sabe que sigue valiendo

El estado de la 8532 lleva sin cambiar desde el **bloque 4.149.261**
(8-ago 11:45 UTC). Mientras la raíz de estado de la punta siga siendo
`0xd21e29ff024fd135656a54ee3581bda080f716836d0e0243f0e8ec3a0b277882`, este
cierre es válido y no hay que repetir nada.

La noche del corte: leer esa raíz, compararla, y seguir. Si cambió, rehacer el
volcado y volver a pasar el juez.
