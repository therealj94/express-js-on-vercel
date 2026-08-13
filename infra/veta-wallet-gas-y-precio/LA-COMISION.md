# El precio y la comisión de Orden Global

Corregido el 13-ago-2026 por José, después de que yo me equivocara con los dos
números. Esto es lo que vale.

---

## ⚠ NO ENCENDER LA COMISIÓN TODAVÍA

Encontrado por el Centinela el 13-ago y comprobado contra la cadena:

**La dirección a la que el backend cobraría la comisión no es la billetera
única.** `lib/comision.js` envía a `TREASURY_OG_ADDRESS`, y en producción esa
variable vale `0x48986B3a75E7DA51087F60A2E06F8Eb5445cE8fF`, que **no** es
`0x3d5510e5081822877d14cd51b356bf01df2c32c9`.

Medido en la cadena 8532:

| | saldo | nonce | ha firmado algo |
|---|---|---|---|
| `0x4898…E8fF` — a donde iría la comisión | 126 ORIGEN | **0** | **nunca** |
| `0x3d55…32c9` — la billetera única | 249.999.831.471 ORIGEN | 27 | sí |

Nonce cero significa que **nadie ha demostrado nunca tener su llave**. Si se
enciende la comisión con esto así, cada cobro cae ahí y no vuelve a salir.

**Hoy no cobra nada, y eso es lo que nos salva:** `OG_COMISION_ORIGEN` **no
existe** en la configuración de Heroku, así que el importe es cero y
`cobrarComision` devuelve `null` sin enviar nada. El 0,001 vive sólo en el
código y en este documento.

*(Corrección: en el parte del 13-ago escribí que la comisión estaba
«configurada y apagada». No está configurada. Comprobado leyendo las variables
de Heroku, no deducido.)*

**Antes de encenderla, en este orden:** decidir la dirección de tesorería,
ponerla en `TREASURY_OG_ADDRESS`, comprobar que su llave está en la copia fría,
y sólo entonces poner `OG_COMISION_ORIGEN=0.001`.

---

## El precio del ORIGEN · la fórmula del oro

```
ORIGEN = (precio del gramo de oro en USD) / 55
```

Con la onza a 4.401,35 USD: el gramo son **141,5066** y el ORIGEN, **2,572847
USD**. Es la fórmula que `lib/origenPrice.js` tuvo siempre y que **yo sustituí
por error por un valor fijo de 0,01**. Está revertida y comprobada ejecutando
el módulo dentro de Heroku: *2.5728469610990876, modo oro*.

Nadie salió perjudicado: mientras estuvo mal —de las 00:15 a las 02:01 UTC—
hubo **cero fondeos de tarjeta, cero depósitos, cero transacciones y cero
pagos**. Contado contra la base de datos, no supuesto.

## La comisión · 0,001 ORIGEN fijos

Por transacción, sea cual sea el monto y sea ORIGEN o un token.

| | ORIGEN | USD |
|---|---|---|
| **Comisión** | 0,001000 | **0,002573** |
| Gas de un envío nativo | 0,001953 | 0,005025 |
| Gas de un envío de token | 0,004880 | 0,012555 |
| **Total, envío nativo** | 0,002953 | **0,00760** |
| **Total, envío de token** | 0,005880 | **0,01513** |

**El gas cuesta el doble que la comisión.** Quien más cobra por mover ORIGEN
es la propia red, no nosotros — y ese gas va íntegro al validador que propone
el bloque, no al tesoro. Medido en la 5534: las cuatro direcciones de
validador empezaron en cero y fueron acumulando.

**Con 1 ORIGEN** —lo que la consolidación deja en cada billetera, y que al
precio del oro son **2,57 dólares**— salen **339 envíos nativos** o **170 de
token**, comisión y gas incluidos.

## Por qué la cobra la billetera y no la cadena

Porque el gas no puede ser plano: un envío de token gasta 2,5 veces más que uno
nativo. Fija de verdad significa que da igual qué se envíe y cuánto, y eso sólo
se consigue cobrándolo aparte — una transacción de 0,001 ORIGEN al tesoro,
**después** del envío del usuario. Si se cobrara antes y el envío fallara, se
le habría cobrado por nada.

## Cuánto es eso

Con la cadena **llena al 100%** —4.112.640 transacciones al día—: **4.113
ORIGEN al día = 10.581 USD**, y **3.862.136 USD al año**.

## Cómo se enciende

```
OG_COMISION_ORIGEN=0.001
```

Sin esa variable no se cobra nada, y así queda hasta que arranque la 5550. Hay
un tope de cordura en **0,1 ORIGEN**: atado al oro, eso ya son 26 centavos por
movimiento, así que cualquier cosa por encima se ignora y se anota en el log.

## Un número que conviene tener pensado antes de que lo calcule otro

La emisión es de **un billón** de ORIGEN. A 2,5728 USD son **2,57 billones de
dólares**. Y como cada ORIGEN se define como 1/55 de gramo de oro, la emisión
equivale a **18.182 toneladas de oro** — más de lo que tiene ningún país del
mundo (Estados Unidos, el mayor tenedor, declara unas 8.133).

No es una objeción a la fórmula: es una pregunta que alguien va a hacer, y es
mejor tener la respuesta preparada —si el oro es referencia de precio o
respaldo, y en qué proporción— antes de que la haga en público.
