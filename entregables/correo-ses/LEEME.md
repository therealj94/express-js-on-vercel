# El correo de Orden Global: qué falta y en qué orden

Medido contra la cuenta de AWS y contra el DNS público el 21 de agosto de 2026.

## Dónde estamos

SES está **en el cajón de arena**. Eso significa que solo se puede escribir a
direcciones verificadas una por una, con un tope de 200 al día. **A un usuario
de verdad no le llega nada**: ni la confirmación de la cuenta, ni el enlace
para recuperar la contraseña, ni el aviso de que su identidad quedó aprobada.

La solicitud para salir de ahí se pidió una vez y **la denegaron** (caso
`178716462400938`).

## Lo que ya está bien, y es bastante

| | |
|---|---|
| Dominio `ordenglobal.org` verificado | sí |
| DKIM firmando, tres registros publicados | sí |
| DMARC publicado | sí, en `p=none` |
| Lista de supresión para rebotes y quejas | activa |
| Conjunto de configuración con avisos | `ordenglobal-transaccional` → SNS → `info@ordenglobal.org` |

## Lo que falta

**Tres registros de DNS** y **una solicitud bien escrita**. Nada más.

### 1. Los tres registros

Están en `registros-dns.txt` con su valor exacto. El DNS de `ordenglobal.org`
**no está en nuestra cuenta de AWS**: lo sirven `ns1.nivapixel.com` y
`ns2.nivapixel.com`, así que hay que pegarlos en ese panel. Los otros dominios
del ecosistema sí están en Route 53 y esos se pueden tocar desde acá.

Uno de los tres tiene una trampa que hay que decir en voz alta:

> El SPF **se edita, no se agrega**. Un dominio con dos registros SPF falla en
> **los dos**, y el correo empieza a caer en spam sin que nada avise. Se abre
> el TXT que ya existe y se le mete `include:amazonses.com` justo antes del
> `~all`.

**Nada de esto rompe el correo que sale hoy.** El remitente propio quedó
configurado con `USE_DEFAULT_VALUE`: mientras el DNS no esté publicado, SES
vuelve solo a `amazonses.com` y el correo transaccional sigue saliendo igual.

### 2. La solicitud

En `solicitud-produccion.md` está dónde se pide, qué poner en cada campo y el
texto listo para pegar.

Ahí está también **por qué se cree que la denegaron**: la solicitud declaró
`app.vetawallet.com` como sitio web, pero el correo sale de `@ordenglobal.org`.
El revisor entra a la web declarada y busca la relación con el dominio que
firma. Cuando no cuadran, se cae.

## Qué tenés que hacer vos

Está en **`PASO-A-PASO.md`**, con los valores exactos y dónde tocar en cada
pantalla. Son tres pasos: verificar tu correo (ya te llegó el enlace), pegar
tres registros en el panel de nivapixel, y pedir el paso a producción.

## El orden importa

```sh
# 1. Pegar los tres registros en el panel de nivapixel
# 2. Esperar a que propaguen y comprobar
python3 comprobar.py

# 3. Solo cuando salga todo en verde, pedir el paso a producción
#    (ver solicitud-produccion.md)

# 4. Después de que lo aprueben, comprobar otra vez
python3 comprobar.py
```

**No pedir antes de que `comprobar.py` salga limpio.** Un segundo rechazo
cuesta más que el primero: el revisor ve el historial, y pedir dos veces con lo
mismo mal puesto deja la cuenta marcada.

## Lo que se probó de verdad

El camino de envío del backend **funciona entero**. Se mandó un correo real con
las mismas credenciales que usa producción, al mismo conjunto de configuración
y desde el mismo remitente, y salió con su identificador de mensaje. O sea que
credenciales, permisos, dominio firmante y configuración están bien: **lo único
que falta es que AWS saque la cuenta del cajón**.

El usuario de IAM que manda (`orden-global-correo`) tiene solo `ses:SendEmail`
y `ses:SendRawEmail`, que es exactamente lo que debe tener y ni un permiso más.

## Lo que ya hice

1. Configuré el **remitente propio** (`correo.ordenglobal.org`) en SES. Es lo
   que más pesa en una solicitud de producción, porque alinea el remitente del
   sobre con nuestro dominio en vez de con `amazonses.com`. Quedó en
   `USE_DEFAULT_VALUE` a propósito, para que no rompa nada mientras el DNS no
   esté.
2. Probé el envío real de punta a punta con las credenciales de producción.
3. Volví a pedir la verificación de **`mjoseenamorado1994@gmail.com`**. Estaba
   dada de alta pero sin verificar, así que el correo o no llegó o venció.
   **Tenés uno nuevo en tu bandeja**, con asunto *«Amazon Web Services – Email
   Address Verification Request»*. Hay que abrirlo y tocar el enlace; vence en
   24 horas. Con eso vas a poder probar el alta de cuenta y la recuperación de
   contraseña en tu propio correo aunque la cuenta siga en el cajón.

## Lo que NO pude hacer, y por qué

- **Abrir el caso de soporte.** La API de Support exige un plan de soporte de
  pago. Comprobado, no supuesto: `describe_severity_levels` contesta
  `SubscriptionRequiredException`. Hay que hacerlo desde la consola.
- **Reenviar la solicitud por API.** `put_account_details` contesta
  `ConflictException` porque los datos ya se enviaron una vez. También va por
  consola.
- **Publicar los registros de DNS.** `ordenglobal.org` no está en nuestra
  Route 53.

## Una corrección: cambiar de dominio NO sirve

En la entrega anterior sugerí verificar `ordenglobal.link` para salir del paso.
**Estaba equivocado y conviene dejarlo escrito.**

El cajón de arena es de la **cuenta entera**, no del dominio. Se comprobó con un
envío de verdad a una dirección no verificada, y AWS contesta
`MessageRejected: Email address is not verified`. Verificar otro dominio no
cambia nada: mientras la cuenta esté en el cajón, solo se le puede escribir a
identidades verificadas, venga el correo del dominio que venga.

Si de verdad hace falta escribirle a los usuarios **antes** de que AWS apruebe,
la única salida es un proveedor distinto que no esté limitado. El dominio ya
tiene uno en su SPF (`include:spf.jetsmtp.net`), así que esa puerta puede estar
abierta ya. Merece una llamada antes de montar nada nuevo.
