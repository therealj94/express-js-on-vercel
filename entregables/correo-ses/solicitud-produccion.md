# La solicitud de paso a producción

## Por qué la denegaron, hasta donde se puede saber

AWS no publica el motivo. Lo que sí se puede leer de la cuenta es lo que se
mandó, y ahí hay un fallo concreto y comprobable:

> **`WebsiteURL: https://app.vetawallet.com`** — pero el correo sale de
> **`@ordenglobal.org`**.

El revisor entra a la web declarada y busca la relación con el dominio que
firma el correo. Cuando no cuadran, la solicitud se cae. Es de los motivos de
rechazo más comunes y el más fácil de arreglar.

Y hay tres cosas que la cuenta **sí tiene** y la solicitud **no mencionó**:
la lista de supresión activa para rebotes y quejas, el conjunto de
configuración con sus avisos a SNS, y el DKIM firmando con los tres registros
publicados. Un revisor no los busca. Hay que contárselos.

## Antes de volver a pedir

```sh
python3 comprobar.py
```

Tiene que salir en verde. **Un segundo rechazo cuesta más que el primero**: el
revisor ve el historial, y pedir dos veces con lo mismo mal puesto deja la
cuenta marcada.

## Dónde se pide

Consola de AWS → **Amazon SES** → región **Este de EE. UU. (Norte de Virginia)**
→ **Get set up** o **Account dashboard** → botón **Request production access**.

El caso viejo (`178716462400938`) está denegado y no se reabre. Se abre uno
nuevo.

## Qué poner en cada campo

| Campo | Qué poner |
|---|---|
| Mail type | **Transactional** |
| Website URL | **`https://www.ordenglobal.org`** ← esto es lo que estaba mal |
| Use case description | El texto de abajo |
| Additional contacts | `info@ordenglobal.org` |
| Preferred contact language | English |

## El texto, listo para pegar

Va en inglés porque el idioma de contacto de la cuenta es inglés y el revisor
lo lee en inglés. Cada dato se puede comprobar desde la propia cuenta, que es
justo lo que hace que una solicitud pase.

```
Orden Global Corp operates a financial ecosystem for retail users in Honduras
and the wider LATAM region. Our products are Veta Wallet (a digital asset
wallet, app.vetawallet.com), Genesis ID (KYC/KYB identity verification), and
Ordenex (an asset exchange). All of them are properties of ordenglobal.org,
the domain we send from.

WHO WE SEND TO
Only people who created an account with us and confirmed their own email
address during sign-up. We never buy, rent, scrape or import lists. Every
address on file belongs to a user who registered on one of our sites and who
completed identity verification through Genesis ID, meaning we hold a
government-issued document check for the person behind the address.

WHAT WE SEND
Transactional messages triggered by a user action:
  - email confirmation at sign-up
  - password reset links
  - identity verification result (approved or rejected)
  - virtual card issuance confirmation
  - transaction receipts
Expected volume is under 2,000 messages per month. We are not requesting
production access for marketing campaigns.

HOW WE HANDLE BOUNCES AND COMPLAINTS
This is already configured in the account and can be verified:
  - Account-level suppression list is enabled for BOUNCE and COMPLAINT.
  - Configuration set "ordenglobal-transaccional" has an event destination
    named "rebotes-y-quejas" publishing BOUNCE, COMPLAINT, DELIVERY_DELAY and
    REJECT to the SNS topic "ses-rebotes-ordenglobal", which notifies
    info@ordenglobal.org.
  - A hard bounce removes the address from our database and it is never
    retried. A complaint does the same and is logged.

AUTHENTICATION
  - Domain ordenglobal.org is verified with DKIM (three CNAME records
    published, status SUCCESS, signing enabled).
  - Custom MAIL FROM domain correo.ordenglobal.org is configured with its MX
    and SPF records so the envelope sender aligns with our domain.
  - SPF for ordenglobal.org includes amazonses.com.
  - DMARC is published at _dmarc.ordenglobal.org with reporting to
    admin@ordenglobal.org.

We understand and accept responsibility for keeping bounce and complaint rates
within the Amazon SES thresholds.
```

## Después de que lo aprueben

1. Correr `comprobar.py` otra vez. Tiene que decir
   **«LA CUENTA YA ESTA EN PRODUCCION»**.
2. Mandar un correo de prueba a una dirección de Gmail y otra de Outlook, y
   **abrir «mostrar original»**. Tienen que salir tres cosas en verde:
   `spf=pass`, `dkim=pass`, `dmarc=pass`.
3. Recién ahí subir DMARC de `p=none` a `p=quarantine`. Antes no: si algo está
   mal alineado, `p=quarantine` manda el correo bueno a la carpeta de basura.

## Si AWS vuelve a decir que no

No insistir con el mismo texto. Pedir en la respuesta del caso **qué falta en
concreto**, con esta pregunta, que obliga a una respuesta útil:

> Could you tell us specifically which requirement our account does not meet?
> We have DKIM verified, a custom MAIL FROM domain, SPF including amazonses.com,
> DMARC published, and account-level suppression enabled for bounces and
> complaints. We would like to fix the specific gap rather than resubmit.
