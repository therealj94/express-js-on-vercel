# Respuesta al caso de soporte de AWS (salida del modo prueba de SES)

AWS pidió detalle sobre cómo vamos a enviar. Abajo está el texto **listo para
pegar** en el caso de soporte, en inglés porque es el idioma del caso.

Todo lo que dice es verificable: no hay una sola afirmación que no
corresponda a algo que está puesto. Antes de mandarlo se comprobó que:

- el dominio `ordenglobal.org` tiene sus tres CNAME de DKIM publicados
  (19-ago-2026) y el SPF con `include:amazonses.com`;
- la lista de supresión de la cuenta está encendida para rebotes y quejas
  — AWS lo puede ver de su lado;
- el usuario IAM que envía solo puede `ses:SendEmail` y solo como
  `*@ordenglobal.org`.

> **Antes de enviar la respuesta**, confirmá en la consola de SES que la
> identidad `ordenglobal.org` figura como **Verified**. AWS lo pide
> explícitamente y con la identidad en «Pending» suelen rechazar el caso.
> Los registros ya están publicados, así que es cuestión de que SES los lea.

---

## Texto para pegar en el caso

Thank you for the follow-up. Below is a detailed description of our sending
practices.

**Who we are.** Orden Global Corp operates Veta Wallet, a digital wallet, and
Genesis ID, its identity-verification service. Our sending domain is
`ordenglobal.org` and our From address is `info@ordenglobal.org`.

**Identity verification.** The domain identity `ordenglobal.org` is configured
with Easy DKIM (2048-bit); the three CNAME records were published in our DNS
zone on 19 August 2026 and resolve publicly. SPF at the apex is
`v=spf1 +mx +a +ip4:50.31.177.40 include:amazonses.com ~all`, and DMARC is
published at `_dmarc.ordenglobal.org` as `v=DMARC1; p=none;
rua=mailto:admin@ordenglobal.org; fo=1`. We will tighten the DMARC policy to
`quarantine` and then `reject` after a month of clean aggregate reports.

**What we send — transactional only.** We send exactly five message types,
each triggered by an action the recipient took themselves:

1. *Account confirmation* — sent when someone creates a wallet account, with a
   single-use link to confirm the address they just entered.
2. *Password reset* — sent only when the account holder requests it. The link
   is single-use and expires in 15 minutes.
3. *Identity verification approved* — sent when a compliance officer approves a
   Genesis ID application, carrying the person's identity code.
4. *Identity verification rejected* — sent on rejection, with the specific
   reason so the applicant can correct and retry (most often a document photo
   where an edge is cut off).
5. *Virtual card notices* — issuance confirmation and transaction-dispute
   acknowledgement, sent to the cardholder who performed the action.

We do **not** send newsletters, promotional campaigns, or any bulk mail from
this account.

**How our recipient list is built and maintained.** There is no list in the
marketing sense. Every address belongs to a person who created an account on
our platform and typed that address into our sign-up form. We never purchase,
rent, import, or scrape addresses. An address enters our system only through
self-service registration, and each address is confirmed by a link we send to
it. Addresses are removed when the account is deleted.

**Volume.** We are just starting to send through SES; this replaces an earlier
setup that used consumer mailboxes, which we are retiring for deliverability
and security reasons. We expect a few hundred messages per day initially,
growing with registrations. Our internal planning figure is up to roughly
5,000 messages per day at full scale. Sending is entirely event-driven — one
message per user action — so there are no bulk sends or campaign spikes.

**Bounces.** The account-level suppression list is enabled for `BOUNCE` and
`COMPLAINT`, so addresses that hard-bounce or generate a complaint are
suppressed automatically at the account level and are not retried. We monitor
the bounce and complaint rates in the SES console and in CloudWatch, and our
sending code logs every non-2xx response from the SendEmail API for review.

**Complaints.** Complaints are handled the same way — automatic suppression via
the account suppression list. Because our mail is strictly transactional and
sent only in response to a user action, we expect complaint volume to be very
low; any complaint would indicate a problem worth investigating individually,
and the suppression list guarantees no further mail reaches that address in the
meantime.

**Unsubscribe requests.** Our messages are transactional and carry no marketing
content, so there is no subscription to cancel — a person who no longer wants
these messages closes their account, which removes the address from our system.
`info@ordenglobal.org` is a monitored mailbox and any request that reaches it is
honoured by adding the address to the suppression list manually.

**Content quality.** Every message is sent in both plain text and HTML, uses no
remote images, and identifies the sender and the company. Each one carries a
standing security notice — that we will never ask for a password or a recovery
phrase by email — because our users hold financial assets and we consider
anti-phishing education part of the message itself. Example subject lines:

- `Confirmá tu cuenta de Veta Wallet` (Confirm your Veta Wallet account)
- `Restablecer tu contraseña de Veta Wallet` (Reset your Veta Wallet password)
- `Tu Genesis ID está verificado — GEN-XXXX-XXXX-X` (Your Genesis ID is verified)
- `Tu Genesis ID necesita una corrección` (Your Genesis ID needs a correction)
- `Tu tarjeta Visa de Veta Wallet está lista` (Your Veta Wallet Visa card is ready)

Sample body (password reset, translated from Spanish):

> You asked to reset the password on your Veta Wallet.
>
> Open this link and set a new password: [single-use link]
>
> The link is valid for fifteen minutes and can only be used once.
>
> If this wasn't you, there is nothing to do: without opening the link, your
> password stays as it is.
>
> — Orden Global Corp
> We will never ask you for your password or your recovery phrase by email.

**Least-privilege sending.** The IAM user our applications use can only call
`ses:SendEmail` and `ses:SendRawEmail`, and only with a From address matching
`*@ordenglobal.org`. Its credentials are stored as environment variables in our
hosting platforms and are not present in source control.

We would be glad to provide any further detail you need.

---

## Nota sobre una línea del correo de aprobación

El correo de identidad aprobada incluye **una** línea sobre la promoción vigente
(el sorteo que cierra el 9 de septiembre), con su aviso de mayores de 18 años y
el enlace a las bases. Es un renglón dentro de un mensaje que la persona
espera —le acaban de aprobar su identidad—, no un envío promocional: la línea
se apaga sola al cerrar la promoción. Si AWS repregunta por contenido
promocional, esa es la respuesta y es la verdad; si prefiriéramos evitar la
conversación, se quita esa línea y el correo sigue funcionando igual.
