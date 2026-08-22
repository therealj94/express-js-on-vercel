# El correo del ecosistema — estado medido el 22-ago-2026

## Dónde está hoy

Amazon SES en **us-east-1**, fuera del cajón de arena desde el 22-ago
(caso 178716462400938).

| | |
| --- | --- |
| Cuota diaria | 50.000 mensajes |
| Ritmo máximo | 14 por segundo |
| Estado de la cuenta | `HEALTHY`, envío activo |
| Uso declarado ante AWS | transaccional |
| Conjunto de configuración | `ordenglobal-transaccional` |
| Supresión automática | rebotes y quejas |

`us-east-2` sigue en el cajón de arena (200/día). No se usa y no hace falta.

## El dominio que sí manda

`ordenglobal.org` está bien montado, y eso costó trabajo:

- **DKIM `SUCCESS`**, firmado por SES
- **Dominio propio de remite** (`correo.ordenglobal.org`, `SUCCESS`) — sin
  esto el `Return-Path` sería de `amazonses.com` y el SPF no alinearía
- **SPF** incluye `amazonses.com`
- **DMARC** presente, pero en `p=none` — ver abajo

El remitente es `info@ordenglobal.org`. Lo manda `infra/veta-wallet-backend/lib/correo.js`,
que firma SigV4 a mano para no meter el SDK entero de AWS en un dyno.

Ya lo usan el alta de cuenta, la recuperación de contraseña, la tarjeta y la
importación. La migración desde los buzones de Gmail y Outlook **está hecha en
el código y encendida en producción**: `SES_LLAVE` y `SES_SECRETO` están
puestas en la app `vetawallet` de Heroku.

## La reputación no es lo que parece a primera vista

`GetSendStatistics` decía **40% de rebote** (4 de 10). Eso asusta y es
engañoso: los cuatro rebotes eran direcciones **nuestras de prueba**
(`prueba@ordenglobal.org`, 21-ago) y el total son diez envíos.

Lo que AWS mira de verdad —`Reputation.BounceRate` en CloudWatch— marca
**0,00%**, y la cuenta está `HEALTHY`. Los umbrales reales son 5% (aviso) y
10% (suspensión).

**Al mirar esto, mirar CloudWatch, no la proporción cruda.** Con pocos envíos
la proporción cruda no significa nada.

Esas cuatro direcciones quedaron en la lista de supresión. Es correcto y no
hay que tocarlo; solo conviene saberlo si algún día una prueba a
`prueba@ordenglobal.org` parece no salir.

## Lo que estaba roto: 27 direcciones que no recibían nada

**`vetawallet.com` no tiene ningún registro MX.** El dominio existe y sirve la
web, pero no hay servidor de correo. Así que `soporte@vetawallet.com` y
`privacidad@vetawallet.com` —publicadas 27 veces en once archivos— rebotaban
todo.

Importaba porque la política de privacidad promete ese buzón para ejercer los
derechos sobre los datos, y las tiendas exigen un contacto vivo para pedir el
borrado de cuenta.

Se apuntaron todas a `info@ordenglobal.org`, que es la única del dominio de la
que hay evidencia de que existe: es el remitente de SES, aparece 34 veces en
el ecosistema y ya estaba publicada en el pie. Inventar
`soporte@ordenglobal.org` habría cambiado una dirección muerta por otra, con
el agravante de parecer arreglada.

### Si algún día se quieren buzones propios de vetawallet.com

Se puede, y lo podemos hacer nosotros: **`vetawallet.com` sí está en nuestro
Route53** (13 registros). Haría falta decidir dónde viven los buzones —el
hosting compartido que ya sirve `ordenglobal.org`, Google Workspace, o SES
entrante— y añadir el MX.

## Pendiente: subir el DMARC

Hoy `ordenglobal.org` tiene:

```
v=DMARC1; p=none; rua=mailto:admin@ordenglobal.org; fo=1
```

`p=none` observa pero **no bloquea nada**: cualquiera puede falsificar el
remite de `ordenglobal.org` y el correo entra igual. Para un dominio que manda
recuperaciones de contraseña de una billetera, eso es justo lo que hay que
cerrar.

El registro propuesto, en `_dmarc.ordenglobal.org` (TXT):

```
v=DMARC1; p=quarantine; pct=25; rua=mailto:admin@ordenglobal.org; ruf=mailto:admin@ordenglobal.org; fo=1
```

**`pct=25` a propósito, y no se salta.** Con `p=quarantine` al 100% de golpe,
cualquier correo legítimo que no alinee se va a la carpeta de no deseado sin
avisar — y el SPF del dominio incluye terceros (`spf.jetsmtp.net`, el hosting
compartido) que no se han comprobado uno por uno. Al 25% el daño posible es
una cuarta parte, y los informes `rua` dicen qué falla antes de subirlo.

**El DNS de `ordenglobal.org` no es nuestro**: es autoritativo en
`ns1/ns2.nivapixel.com`, el hosting compartido. Este cambio hay que pedirlo o
hacerlo desde ese panel; desde AWS no se puede.

Camino sugerido: poner `pct=25`, leer los informes una o dos semanas, y si no
aparece nada legítimo fallando, subir a `pct=100` y luego a `p=reject`.

## Suelto, para cuando toque

La app `vetawallet` de Heroku todavía guarda `GMAIL_USER` y `GMAIL_PASS` del
montaje anterior. **El código ya no las lee.** No se revocan —hay instrucción
expresa de no revocar nada— pero son credenciales vivas de un buzón personal
sentadas en el entorno de producción, y no hacen falta.
