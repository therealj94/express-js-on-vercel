# SES · el estado real, con dos noticias distintas

Conviene no mezclarlas, porque son dos cosas separadas y solo una es buena.

## Noticia 1 · el DKIM quedó verificado ✅

Es el aviso que llegó a `info@ordenglobal.org`. Comprobado contra la API y
contra el DNS público:

```
verificada para enviar: True
DKIM: SUCCESS · firmando: True · RSA 2048 bits
los tres CNAME ..._domainkey.ordenglobal.org resuelven
```

Y probado con un envío real —no con la configuración, con un correo— a
`info@ordenglobal.org`, que salió con `MessageId`
`010001a01cf3ad1f-...`. Funcionan a la vez las credenciales, la firma del
dominio, el conjunto de configuración y la entrega.

**Lo que el DKIM SÍ resuelve:** que el correo salga firmado por
`ordenglobal.org` y no acabe en la carpeta de no deseados por falta de firma.
Es el requisito de entrega, y estaba pendiente desde el principio.

**Lo que el DKIM NO resuelve:** la cuenta sigue en el cajón de arena. Son dos
puertas distintas y solo se abrió una.

## Noticia 2 · la salida del cajón de arena fue DENEGADA ❌

Esto no venía en ese aviso; salió al consultar la API.



## Lo que dice AWS, sacado de la API

```
ESTADO DE LA REVISION: DENIED
caso: 178716462400938
produccion: False | cuota: 200/dia | 1 correo por segundo
```

El texto de la respuesta **no se pudo leer desde aquí**: la API de casos de
soporte exige un plan de pago de AWS. Hay que abrirlo en el Centro de Soporte,
o en el correo que llegó a `info@ordenglobal.org`.

## Lo que sí se pudo auditar, que es lo que AWS mira

| Lo que evalúan | Cómo estaba |
|---|---|
| Dominio verificado | ✅ `ordenglobal.org`, verificado |
| DKIM | ✅ `SUCCESS`, firmando |
| Reputación | ✅ `HEALTHY` |
| Supresión automática de rebotes y quejas | ✅ activada |
| **Qué se hace con un rebote o una queja** | ❌ **NADA** |
| Dominio MAIL FROM propio | ❌ sin configurar |

**El hueco era el quinto.** No había ningún conjunto de configuración, así que
los rebotes y las quejas no iban a ninguna parte: se suprimía la dirección en
silencio y nadie se enteraba nunca de que un correo no llegó.

Y esa es exactamente la pregunta central de la solicitud —*«¿cómo va a manejar
los rebotes y las quejas?»*—. La primera vez se contestó con una intención. Una
intención no se puede comprobar, y AWS comprueba.

## Lo que se arregló antes de volver a pedirlo

Ya no es una intención: está montado y se puede verificar desde fuera.

**Conjunto de configuración `ordenglobal-transaccional`**, con dos destinos:

| Destino | Recoge |
|---|---|
| SNS → correo a `info@ordenglobal.org` | `BOUNCE`, `COMPLAINT`, `REJECT`, `DELIVERY_DELAY` |
| CloudWatch | `SEND`, `DELIVERY`, `BOUNCE`, `COMPLAINT`, `REJECT` |

Más la supresión a nivel de cuenta, que ya estaba, y las métricas de reputación
activadas en el propio conjunto.

**Y los dos servicios que mandan correo ya lo usan.** Se añadió
`ConfigurationSetName` al cuerpo de la petición en:

- `genesis-id/src/correo/enviar.ts` (variable `GENESIS_SES_CONJUNTO`)
- `infra/veta-wallet-backend/lib/correo.js` (variable `SES_CONJUNTO`)

Las dos con valor por defecto, para que funcione sin tocar la configuración, y
como variable para poder cambiarlo sin desplegar. Las nueve pruebas de correo de
Genesis ID siguen en verde.

## El texto para responder al caso

Va en inglés porque el caso se abrió en inglés. **Antes de mandarlo, leé lo que
AWS contestó**: si pidieron algo distinto de lo que aquí se cubre, hay que
añadirlo. No mandes esto a ciegas.

---

Hello,

Thank you for the review. We have addressed the gap in our bounce and complaint
handling, and we would like to ask you to reconsider.

**What changed since our first request**

Previously we relied only on account-level suppression. That suppressed
addresses but gave us no visibility, so nobody on our side ever saw a bounce.
That was a real gap and we have closed it.

We now send all mail through a dedicated configuration set,
`ordenglobal-transaccional`, with two event destinations:

- An SNS topic that emails our operations address on `BOUNCE`, `COMPLAINT`,
  `REJECT` and `DELIVERY_DELAY`. A person reads these.
- A CloudWatch destination recording `SEND`, `DELIVERY`, `BOUNCE`, `COMPLAINT`
  and `REJECT`, so we can watch the rates rather than discover a problem after
  the fact.

Account-level suppression for `BOUNCE` and `COMPLAINT` remains enabled, and
reputation metrics are enabled on the configuration set. Both of our sending
services now set `ConfigurationSetName` on every message, so nothing bypasses
this.

**What we send**

Only transactional mail, and only to people who created an account with us:

- account confirmation at sign-up,
- password reset links the user requested,
- identity verification approved or rejected notices,
- security notices about the user's own account.

We do not send marketing email, we do not buy or rent lists, and we do not mail
addresses that did not register with us. Every address comes from a sign-up form
where the person typed it themselves.

**How a recipient stops receiving mail**

Because this is transactional mail tied to an account, a user stops receiving it
by closing their account, which our app supports directly. Every message
identifies the sender and links to our support address. If someone marks a
message as spam, the complaint reaches the SNS topic above and the address is
suppressed automatically.

**Identity and volume**

Our sending domain `ordenglobal.org` is verified with Easy DKIM (2048-bit) and
is currently signing. Expected volume is low: we have a few hundred registered
users and each one receives a handful of messages over the life of their
account. We are not asking for a large quota, only to stop being limited to
verified recipients, which currently prevents a new user from receiving their
own confirmation email.

Thank you for reconsidering.

---

## Lo que queda por hacer, y no es código

1. **Leé la respuesta de AWS** antes de mandar nada. Si pidieron algo concreto
   que aquí no se cubre, hay que añadirlo.
2. **Confirmá la suscripción del tema de rebotes.** Llegó un correo de AWS a
   `info@ordenglobal.org` pidiendo confirmar. Sin ese clic el conjunto recoge
   los rebotes pero el aviso no sale del sistema.
3. **Respondé al caso `178716462400938`** en el Centro de Soporte, en el mismo
   hilo. Abrir un caso nuevo empeora las cosas: se pierde el historial y parece
   que se está insistiendo por otra puerta.

## Lo que NO se hizo, y por qué

**No se volvió a pedir la salida del cajón de arena por la API.** Se puede
—`PutAccountDetails`— pero volver a pedirlo sin decir qué cambió es la forma más
rápida de que lo denieguen otra vez y con peor nota. La vía correcta después de
una negativa es responder en el hilo del caso explicando qué se corrigió.

**No se configuró un dominio MAIL FROM propio.** Mejora la posición pero exige
dos registros DNS nuevos en cPanel, y las credenciales de cPanel se perdieron
con el reinicio del contenedor. Se puede hacer cuando las tengas a mano; no es
lo que bloquea.

## Mientras tanto, qué significa el cajón de arena

- **200 correos al día**, uno por segundo.
- Y lo que de verdad duele: **solo se puede escribir a direcciones verificadas
  en SES**. Un usuario nuevo que se registre hoy **no recibe su correo de
  confirmación**, porque su dirección no está verificada.

El sistema no se cae por eso —la regla de que un correo fallido nunca tumba la
operación que lo disparó se cumple— pero la verificación por correo no funciona
para nadie de fuera hasta que esto se resuelva.
