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

## Lo que ya hice

Configuré el **remitente propio** (`correo.ordenglobal.org`) en SES. Es lo que
más pesa en una solicitud de producción, porque hace que el remitente del sobre
esté alineado con nuestro dominio en vez de con `amazonses.com`. Quedó en
`USE_DEFAULT_VALUE` a propósito, para que no rompa nada mientras el DNS no
esté.

## Lo que NO pude hacer, y por qué

- **Abrir el caso de soporte.** La API de Support exige un plan de soporte de
  pago. Comprobado, no supuesto: `describe_severity_levels` contesta
  `SubscriptionRequiredException`. Hay que hacerlo desde la consola.
- **Reenviar la solicitud por API.** `put_account_details` contesta
  `ConflictException` porque los datos ya se enviaron una vez. También va por
  consola.
- **Publicar los registros de DNS.** `ordenglobal.org` no está en nuestra
  Route 53.

## Un camino alternativo, si urge

Si hace falta que salga correo **esta semana** y el panel de nivapixel es un
problema, se puede verificar **`ordenglobal.link`** como dominio de envío. Ese
sí está en nuestra Route 53, así que se configura entero desde acá en unos
minutos: verificación, DKIM, remitente propio, SPF y DMARC.

La contra, dicha de frente: los usuarios conocen `ordenglobal.org`, y un correo
que llega de otro dominio se ve menos confiable. Sirve para salir del paso, no
para quedarse.
