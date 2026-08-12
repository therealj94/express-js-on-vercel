# Google Play — everything you have to fill in

Version 1.33.0 · build 69 · package `com.ordenglobal.vetawallet`

Copy each block into the matching field. Character limits are Google's, and
the counts shown are what these texts actually use.

---

## Store listing

### App name — max 30
```
Veta Wallet
```
*(11 characters)*

### Short description — max 80
```
Your gold-backed digital wallet. Send, receive and hold ORIGEN in seconds.
```
*(73 characters)*

### Full description — max 4000
```
Veta Wallet is the official wallet of Orden Global. Hold, send and receive ORIGEN — a digital currency backed by gold — along with the other tokens of the ecosystem, from a wallet that is yours and only yours.

SIGN IN IN ONE TAP
Continue with your Google account, or with Apple on iPhone. No new password to invent, no verification email to wait for. Prefer email and password? That works too, and if you already had an account you land in the same one, with the same funds.

BACKED BY GOLD
One ORIGEN represents a fixed fraction of a gram of gold. Its value follows the metal, not the mood of the market.

MOVE MONEY IN SECONDS
Send to any address by scanning a QR code or picking a contact. Transfers confirm in seconds and cost about one cent.

EVERYTHING IN ONE PLACE
• ORIGEN and every token in the Orden Global ecosystem
• Full history of what came in and what went out
• Prices updated in real time
• Your address as a QR code, ready to be scanned

YOUR IDENTITY, IF AND WHEN YOU WANT IT
Genesis ID lets you verify your identity once and carry it across every app in the ecosystem. It is optional: the wallet works without it.

BUILT TO PROTECT YOU
• Face ID or fingerprint to unlock
• Your recovery phrase is asked for behind a password before it is ever shown
• Sessions you can review and close from any device
• Delete your account whenever you decide, from inside the app

FOR EVERYONE
Available in English and Spanish. No minimum balance, no monthly fee, no paperwork to get started.

Veta Wallet runs on Orden Global's own blockchain — a network operated by validators of the organisation, where confirmation is immediate and cannot be reversed.

Questions? vetawallet.com
```
*(1,672 characters)*

---

## Graphics

| Asset | Size | Where it is |
|---|---|---|
| App icon | 512×512 | `assets/store/icon-play-512.png` ✓ |
| Feature graphic | 1024×500 | `assets/store/feature-graphic.png` ✓ |
| Phone screenshots | 1080×1920 | `assets/store/screenshots/` — **2 ready, see below** |

### About the screenshots

Two are attached and they are **real captures of the app**, not mock-ups:
sign in and create account.

Play requires **at least 2**, so you can submit with these. But a listing with
2 screenshots converts worse than one with 6, and the two you have show the
door rather than the house.

**To capture the rest, from your own phone**, once you install the build:

1. Open the app and sign in with a real account that has some balance.
2. Capture: **Home** (balances), **Send**, **Receive** (the QR), **History**
   and **Card**.
3. Send them over and I will resize them to 1080×1920 and put them in order.

Do not use an empty account: an all-zero balance is honest but it sells
nothing.

---

## Categorisation

| Field | Value |
|---|---|
| App category | **Finance** |
| Tags | Digital wallet · Cryptocurrency · Payments |
| Email | *(your support address)* |
| Website | `https://vetawallet.com` |
| Privacy policy | `https://legal.vetawallet.com/privacidad` |
| Delete account URL | `https://legal.vetawallet.com/eliminar-cuenta` |

---

## Data safety

This is the section that gets listings rejected. Answer exactly like this —
it matches what the app actually does.

### Does your app collect or share user data? → **Yes**

| Data type | Collected | Shared | Required | Purpose |
|---|---|---|---|---|
| **Email address** | Yes | No | Yes | Account management, sign-in |
| **Name** | Yes | No | No | Account management |
| **User IDs** | Yes | No | Yes | Account management |
| **Photos** | Yes | No | No | Identity verification (Genesis ID, optional) |
| **Other financial info** | Yes | No | Yes | App functionality — wallet balances and transfers |
| **Crash logs** | Yes | No | No | Diagnostics |

### Security practices

- **Data is encrypted in transit** → **Yes**
- **You can request that data be deleted** → **Yes** (Settings → Delete account)
- **Committed to Google Play Families Policy** → No (not aimed at children)
- **Independent security review** → No

> **Signing in with Google does not add any new data.** It gives us your email
> address, which is already declared. Do not add anything to this section
> because of it.

---

## Content rating questionnaire

| Question | Answer |
|---|---|
| Category | **Finance** |
| Violence, sexual content, profanity, drugs | **No** to all |
| Does the app let users interact or exchange content? | **No** |
| Does the app share the user's location? | **No** |
| Does the app allow purchases of digital goods? | **No** *(no in-app purchases)* |
| Does the app contain gambling? | **No** |
| **Does the app deal with cryptocurrency or financial products?** | **Yes** |

Expected rating: **PEGI 3 / Everyone**.

---

## Financial features declaration

Play asks about this for anything in the Finance category. Tick:

- ☑ **Digital wallet / cryptocurrency exchange**
- ☐ Loans (does not apply)
- ☐ Insurance (does not apply)
- ☐ Investments or securities (does not apply)

Some countries ask for documents proving you are entitled to offer this
service. **Have Orden Global's registration papers to hand before you start
the form**: leaving it half-filled locks the section for several days.

---

## Release notes for 1.33.0 — max 500

```
Sign in with Google, and with Apple on iPhone. One tap and you are in: no new password to invent, no verification email to wait for.

If you already had an account with that same email, you land in yours, with the same funds. No second account is created.

Your identity is checked by our server against Google or Apple directly. The app never sees or stores those passwords.
```
*(376 characters)*

### The same, in Spanish

```
Ya podés entrar con tu cuenta de Google, y en iPhone también con Apple. Un toque y estás adentro: sin inventar otra contraseña ni esperar el correo de verificación.

Si ya tenías cuenta con ese mismo correo, entrás a la tuya de siempre, con tus mismos fondos. No se crea una segunda.

Tu identidad la comprueba nuestro servidor contra Google o Apple directamente. La app no ve ni guarda tu contraseña de esas cuentas.
```

---

## App access — the field everyone forgets

Play asks whether any part of the app is behind a login. **Answer yes**, and
give the reviewer a working account:

```
All features require an account.

Test account
  Email:    [create one and put it here]
  Password: [the password]

Steps: open the app → Sign in → enter the details above.
The account has balance so the reviewer can see the wallet in use.
```

> Without this, the reviewer sees a sign-in screen, cannot get past it, and
> rejects with "we were unable to review your app". It is the most common
> rejection and the most avoidable.

**Create that account and leave some balance in it before submitting.**

---

## Order of operations

1. Google Cloud → the three OAuth client IDs *(see `PUBLICAR-1.33.md`)*
2. Deploy the backend with `GOOGLE_CLIENT_IDS`
3. Build with `--profile production`
4. Install it on a phone and **test signing in with Google**
5. Capture the remaining screenshots from that same phone
6. Fill in everything above
7. Upload the `.aab` and submit for review

> Do not do 7 before 4. If Google sign-in is broken in the published build,
> fixing it costs another release and another review.
