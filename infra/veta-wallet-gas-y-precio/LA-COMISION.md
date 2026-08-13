# La comisión de Orden Global · 0,01 ORIGEN fijos

Decidido el 12-ago-2026 por José: **0,01 ORIGEN por transacción, fijos, sin
tocar el gas.**

## Qué es y qué no es

No es el gas. Son dos cobros distintos que van a sitios distintos:

| | Cuánto | Quién lo cobra | A dónde va |
|---|---|---|---|
| **Gas** de un envío nativo | 0,001953 ORIGEN | la cadena | **al validador** que propone el bloque |
| **Gas** de un envío de token | 0,004880 ORIGEN | la cadena | al validador |
| **Comisión** | **0,010000 ORIGEN** | la billetera | **al tesoro** |

Que el gas va íntegro al validador no es teoría: se midió en la 5534, donde las
cuatro direcciones de validador empezaron en cero y fueron acumulando.

**Si los 0,01 tienen que ser ingreso de la empresa, no pueden ser gas.**

## Por qué la cobra la billetera y no la cadena

Porque el gas no puede ser plano. Es `gas usado × precio`, y el gas usado
depende de la operación: un envío de token gasta 2,5 veces más que uno nativo.
Si se ajustara el precio para que un envío nativo costara justo 0,01, el de
token costaría 0,025.

Fija de verdad quiere decir: **da igual que se envíe 1 ORIGEN o un millón, y da
igual que sea ORIGEN o un token.** Eso sólo se consigue cobrándolo aparte.

## Cómo se cobra

Una transacción de 0,01 ORIGEN al tesoro (`TREASURY_OG_ADDRESS`), con el nonce
siguiente al del envío, y **después** del envío del usuario.

El orden no es casual: si se cobrara primero y el envío fallara, se le habría
cobrado por nada. Al revés, lo peor que pasa es perder la comisión de un envío
que sí salió — que es el lado correcto en el que equivocarse. Y un fallo al
cobrar **nunca** convierte en error un envío que el usuario ya vio salir: se
anota en el log y se sigue.

La respuesta del backend trae ahora `comision` y `hashComision`, para que la
app pueda enseñarlo.

## Las cuentas

Con el ORIGEN a 0,01 USD:

| | ORIGEN | USD |
|---|---|---|
| Comisión | 0,010000 | 0,000100 |
| Envío nativo, todo incluido | 0,011953 | 0,000120 |
| Envío de token, todo incluido | 0,014880 | 0,000149 |

**Con 1 ORIGEN —lo que la consolidación deja en cada billetera— salen 84 envíos
nativos o 67 de token.** No hace falta subir el piso del génesis.

Con la cadena llena al 100%: 4.112.640 transacciones al día, **41.126 ORIGEN =
411 USD al día**, 150.111 USD al año. Contra los 29.328 al año que daría el gas
solo. La comisión es **5 veces el gas** de un envío nativo.

## Cómo se enciende

```
OG_COMISION_ORIGEN=0.01
```

**Sin esa variable no se cobra nada**, y así queda hasta que arranque la 5550:
encender un cobro a 435 personas sin avisarles no es algo que se haga de
madrugada. El código está desplegado (v76) y esperando.

Hay un tope de cordura: si alguien pusiera un valor mayor que 1 ORIGEN, se
ignora y se anota en el log. Un dedazo ahí sería caro.
