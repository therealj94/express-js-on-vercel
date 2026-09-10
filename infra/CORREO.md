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

### Y ahora vetawallet.com sí recibe (montado el 22-ago)

Los buzones existen, en AWS, sin hosting de por medio:

```
alguien escribe a soporte@vetawallet.com
        │
        ▼
  MX → inbound-smtp.us-east-1.amazonaws.com      (SES recibe)
        │
        ├─► S3  vetawallet-correo-entrante/entrante/<id>   (se guarda primero)
        │       cifrado AES256 · sin acceso público · caduca a los 90 días
        │
        └─► Lambda  veta-correo-entrante                   (reenvía)
                    │
                    ▼
              info@ordenglobal.org
```

**Se guarda ANTES de reenviar, a propósito.** Si la Lambda falla, el mensaje ya
está a salvo en S3 y se puede recuperar a mano. Al revés se perdería.

| Pieza | Nombre |
| --- | --- |
| Destinatarios atendidos | `soporte@` y `privacidad@vetawallet.com` |
| Conjunto de reglas SES | `veta-entrante` (activo) |
| Bucket | `vetawallet-correo-entrante` |
| Función | `veta-correo-entrante` (Python 3.12) |
| Rol | `veta-correo-entrante-reenvio` |
| Código | `infra/correo-entrante/reenviar.py` |

El rol lleva lo justo: leer **solo** ese bucket, y `ses:SendRawEmail`
**condicionado** a que el remitente sea `info@ordenglobal.org`. Aunque alguien
se hiciera con él, no puede mandar correo desde ninguna otra dirección.

#### El remitente no se conserva, y no es un descuido

SES solo deja mandar desde un dominio verificado nuestro. Y aunque dejara, un
correo que dice venir de `@gmail.com` pero sale de nuestros servidores falla el
DKIM y el DMARC de quien lo reciba, y acaba en no deseado.

Así que el reenvío sale como nuestro y **el remitente original va en
`Reply-To`**: al pulsar «responder», la respuesta llega a la persona. Va además
en el asunto —`[soporte@vetawallet.com] …`— y en las cabeceras
`X-Original-From` y `X-Original-To`.

#### Lo que suspende el filtro no se reenvía

SES pasa antivirus y antispam antes de llamar a la función. Si el veredicto es
`FAIL`, no se reenvía: meterle a alguien en el buzón justo lo que el filtro
acababa de parar no tiene defensa. El original **sí** queda en S3, por si fue
un falso positivo, y el motivo queda escrito en el registro.

#### Comprobado de punta a punta, con correos de verdad

| Prueba | Resultado |
| --- | --- |
| `soporte@` recibe | llegó a S3 en ~6 s |
| `privacidad@` recibe | llegó y se reenvió |
| Se reenvía a `info@ordenglobal.org` | las dos veces |
| El `Reply-To` apunta al remitente **externo** | sí — se mandó desde otra dirección distinta a propósito, porque probarlo desde la misma no habría demostrado nada |

Los mensajes de prueba se borraron del bucket después.

#### El dominio queda cerrado a cal y canto

**Nada manda desde `@vetawallet.com`** —se comprobó: todo el ecosistema sale de
`info@ordenglobal.org`—, así que se puede publicar la política más dura sin
riesgo de tirar correo bueno, porque no hay correo bueno que tirar:

```
vetawallet.com          TXT   v=spf1 -all
_dmarc.vetawallet.com   TXT   v=DMARC1; p=reject; sp=reject; rua=mailto:admin@ordenglobal.org; fo=1
```

Aquí sí se va directo a `p=reject` sin la rampa que sí hace falta en
`ordenglobal.org`: la rampa existe para no tirar correo legítimo por accidente,
y en este dominio cualquiera que diga venir de `@vetawallet.com` está mintiendo.

**Si algún día se quiere mandar desde vetawallet.com, hay que cambiar el SPF
ANTES.** Con `-all` puesto, el primer envío se rechaza entero.

#### Lo que no se pudo hacer desde aquí

El cPanel (`ordenglobal.org/cpanel`) **está bloqueado por la política de egreso
de la sesión**: el puerto 2083 corta la conexión y el 443 devuelve 403 del
proxy. Por eso los buzones se montaron en AWS y no en el hosting compartido —
que además tiene la ventaja de no jugarse la reputación de esa IP.

## Pendiente: subir el DMARC

Hoy `ordenglobal.org` tiene:

```
v=DMARC1; p=none; rua=mailto:admin@ordenglobal.org; fo=1
```

`p=none` observa pero **no bloquea nada**: cualquiera puede falsificar el
remite de `ordenglobal.org` y el correo entra igual. Para un dominio que manda
recuperaciones de contraseña de una billetera, eso es justo lo que hay que
cerrar.

### Ya está puesto, en una zona delegada — falta enchufarla

En vez de pedir el TXT una vez y volver a pedirlo en cada escalón de la rampa,
se creó una **zona delegada** en Route53 para `_dmarc.ordenglobal.org`
(`Z0057746HZGTMWH2BUA0`), con la política ya dentro y sirviendo:

```
v=DMARC1; p=quarantine; pct=25; rua=mailto:admin@ordenglobal.org; ruf=mailto:admin@ordenglobal.org; fo=1
```

Comprobado con `test_dns_answer`: Route53 ya la contesta.

**Falta un único registro NS en nivapixel**, y con eso la rampa entera
—`pct` 25 → 50 → 100, y luego `p=reject`— se hace desde aquí sin volver a
pedir nada:

```
Nombre:  _dmarc
Tipo:    NS
Valor:   ns-381.awsdns-47.com
         ns-810.awsdns-37.net
         ns-1099.awsdns-09.org
         ns-1735.awsdns-24.co.uk
```

**Por qué NS y no el TXT directamente.** Es el mismo esfuerzo una vez, pero el
TXT hay que volver a pedirlo en cada escalón —y una rampa que depende de pedir
un favor cuatro veces no se termina nunca—. Delegando la rama, el control de
esa política queda de este lado para siempre.

**Riesgo: ninguno para lo demás.** Se delega una hoja que solo contiene el
DMARC. La web, el correo y los DKIM de `ordenglobal.org` siguen exactamente
donde están, servidos por nivapixel.

Mientras no se ponga ese NS, lo que ve internet sigue siendo el `p=none` de
antes, así que no hay estado intermedio raro: o lo viejo, o lo nuevo.

### Si algún día se quiere mover TODO el DNS de ordenglobal.org

Se puede, y entonces el dominio entero se administra desde aquí. Pero **no se
hace a ciegas**: desde esta sesión no hay forma de listar todos los registros
—no se puede pedir una transferencia de zona, el cPanel está bloqueado y
crt.sh responde 502—, y migrar con una lista incompleta es exactamente como se
cae una web.

Lo que se pudo enumerar hoy, para que conste:

| Nombre | Tipo | Valor |
| --- | --- | --- |
| `ordenglobal.org` | A | `50.31.177.40` |
| `ordenglobal.org` | MX | `0 ordenglobal.org.` |
| `ordenglobal.org` | TXT | SPF + verificación de Google |
| `www` | CNAME | `d10i3mbvr3opn0.cloudfront.net` |
| `webmail`, `cpanel`, `whm`, `ftp` | A | `50.31.177.40` |
| 3 × `…._domainkey` | CNAME | DKIM de SES |
| `correo` | MX + TXT | dominio de remite de SES |
| `_dmarc` | TXT | la política |

Para hacerlo bien hace falta **el archivo de zona exportado desde cPanel**
(Editor de Zonas → Exportar, o WHM). Con eso se replica registro por registro,
se comprueba uno a uno contra el original, y solo entonces se cambian los
servidores de nombres en el registrador.

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
