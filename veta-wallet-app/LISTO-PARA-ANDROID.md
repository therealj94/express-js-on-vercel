# Veta Wallet en Android — todo lo preparado y lo que falta

Este documento junta todo lo que se armó para publicar en Play Console.
`PUBLICAR-EN-TIENDAS.md` sigue siendo la referencia general (cubre iOS
también); este es el detalle de Android.

---

## Ya armado, lo tenés en el repositorio

| Qué | Dónde |
|---|---|
| Descripción corta y larga, ES/EN | Más abajo en este archivo, listas para copiar |
| Icono de la ficha (512×512) | `assets/store/icon-play-512.png` |
| Gráfico de función (1024×500) | `assets/store/feature-graphic.png` |
| Respuestas de Data Safety | Más abajo |
| Guía de la clasificación de contenido | Más abajo |
| Build de producción (.aab) | Workflow de GitHub Actions, ver abajo |

## Verificado ahora mismo, corrige `PUBLICAR-EN-TIENDAS.md`

El punto 8 de ese documento decía que el backend estaba sin desplegar y que
`DELETE /users/me` "todavía no existe". Ya no es así — se probó en vivo:

```
DELETE https://vetawallet-1a2e38ac52b1.herokuapp.com/users/me   → 401
```

401 (no autorizado) y no 404 (no existe): la ruta está desplegada, solo pide
sesión, que es lo esperado. El punto 8 está resuelto.

---

## Ficha de Play Console

### Nombre
Veta Wallet

### Descripción corta (máx. 80 caracteres)

**ES** (69):
> Tu oro en la cadena. Enviá, recibí y pagá con tu tarjeta Veta Wallet.

**EN** (69):
> Real gold on-chain. Send, receive and pay with your Veta Wallet card.

### Descripción completa (máx. 4000 caracteres)

**ES** (1323 caracteres) — está también en `/tmp/ficha-es.txt` si preferís
copiarlo de un archivo:

```
ORIGEN es oro real, certificado y guardado en bóveda, que viaja a la
velocidad de un mensaje. Veta Wallet es la billetera para guardarlo, moverlo
y pagar con él, y para el resto de los activos de la cadena de Orden Global.

TU BILLETERA
Guardá y movés ORIGEN y los demás tokens de la red 5550: AUKA (respaldado en
oro), AGKA (respaldado en plata), ONDK y el resto del ecosistema. Cada saldo
se lee directo de la cadena. Enviá y recibí con una dirección o con un
código QR.

TU TARJETA
Pedí tu tarjeta una vez verificada tu identidad. Gasta directo de tu saldo
en ORIGEN. Congelala cuando quieras, y mirá el número, el PIN y el CVV solo
cuando los necesités, con tu contraseña.

GENESIS ID
Verificá tu identidad una sola vez y quedá verificado en toda la red de
Orden Global, incluido MyTokenPay, sin repetir el trámite en cada servicio.

REMESAS
Una calculadora para saber cuánto le llega a alguien en Honduras, Guatemala,
México y el resto de la región, después de la comisión y el cambio a
moneda local.

SEGURIDAD
Tu clave privada y tu frase de recuperación viajan cifradas y solo se
muestran con tu contraseña. Bloqueo con huella o rostro. Registro de en qué
dispositivos está abierta tu cuenta. Podés borrar tu cuenta desde la app
cuando quieras.

Disponible en español e inglés.

Veta Wallet es de Orden Global Corp.
```

**EN** (1301 caracteres), en `/tmp/ficha-en.txt`:

```
ORIGEN is real, certified, vaulted gold that moves at the speed of a
message. Veta Wallet is where you keep it, move it, and pay with it, along
with the rest of the assets on the Orden Global chain.

YOUR WALLET
Hold and move ORIGEN and the other tokens on network 5550: AUKA
(gold-backed), AGKA (silver-backed), ONDK, and the rest of the ecosystem.
Every balance is read straight from the chain. Send and receive with an
address or a QR code.

YOUR CARD
Request your card once your identity is verified. It spends straight from
your ORIGEN balance. Freeze it whenever you want, and see the number, PIN
and CVV only when you need them, with your password.

GENESIS ID
Verify your identity once and stay verified across the whole Orden Global
network, including MyTokenPay, without repeating the process for every
service.

REMITTANCES
A calculator that shows how much lands on the other side in Honduras,
Guatemala, Mexico and the rest of the region, after the fee and the
exchange to local currency.

SECURITY
Your private key and recovery phrase travel encrypted and only show up
with your password. Face or fingerprint lock. A log of which devices your
account is open on. Delete your account from the app whenever you want.

Available in Spanish and English.

Veta Wallet is by Orden Global Corp.
```

**Qué se dejó afuera a propósito:** nada de "swap" (está deshabilitado en la
app, dice "próximamente"), nada de "comprar con tarjeta" (en obra), nada de
staking ni rendimientos (no existen). Describir una función que no funciona
es el tipo de cosa que un revisor prueba primero.

### Categoría
Finance (Finanzas)

### Imágenes

- Icono: `assets/store/icon-play-512.png` — 512×512, listo
- Gráfico de función: `assets/store/feature-graphic.png` — 1024×500, listo
- **Capturas de pantalla — esto lo tenés que hacer vos.** Hacen falta como
  mínimo 2 (recomendado 4-8) de teléfono, y Google pide que sean de la app
  real corriendo, no un mockup. No hay forma de generarlas desde acá: este
  entorno no tiene emulador de Android ni un teléfono conectado. En cuanto
  tengas el `.aab` o un APK de `preview` instalado en tu teléfono, sacale
  captura a: Billetera, la ficha de un token, la tarjeta (de frente),
  Actividad y Ajustes — son las cinco pantallas que mejor cuentan qué hace
  la app.

---

## Data Safety (Seguridad de los datos)

Google pide marcar, dato por dato, si se recoge, para qué, si se comparte y
si se puede borrar. Esto sale directo de `legal/POLITICA-DE-PRIVACIDAD.md`
— si ese documento cambia, esto hay que revisarlo de nuevo.

**¿La app recoge o comparte alguno de estos tipos de datos?** Sí.

| Categoría de Play | Dato | Se recoge | Se comparte | Con quién / por qué | ¿Obligatorio? |
|---|---|---|---|---|---|
| Personal info → Name | Nombre y apellido | Sí | Sí | CryptoMate, para emitir la tarjeta | Solo si pedís tarjeta |
| Personal info → Email address | Correo | Sí | No | — | Sí |
| Personal info → Phone number | Teléfono | Sí | No | — | Solo si activás verificación SMS |
| Personal info → Address | Domicilio | Sí | Sí | CryptoMate (tarjeta), Veriff (KYC) | Solo si pedís tarjeta / verificás identidad |
| Personal info → Other | Documento de identidad, selfie, fecha de nacimiento, nacionalidad, ocupación, origen de fondos | Sí | Sí | Veriff (verificación), CryptoMate (emisión de tarjeta) | Sí, para KYC |
| Financial info → User payment info | Número, PIN y CVV de la tarjeta | Sí | No (se pide bajo demanda, cifrado) | — | Solo si pedís tarjeta |
| Financial info → Purchase history | Movimientos de la tarjeta | Sí | No | — | Solo si tenés tarjeta |
| Financial info → Other | Dirección de la billetera, historial de transacciones en la cadena | Sí | No (es público en la blockchain, no es Veta Wallet quien lo expone) | — | Sí |
| App activity → Other actions | Registro de sesiones (fecha, hora) | Sí | No | — | Sí |
| App info and performance → Crash logs / Diagnostics | Registros técnicos de error | Sí | No | — | Automático |
| Photos and videos → Photos | Foto del documento y selfie | Sí | Sí | Veriff | Sí, para KYC |

**¿Los datos van cifrados en tránsito?** Sí — todo por HTTPS.

**¿Podés pedir que se borren tus datos?** Sí — desde la app, Ajustes →
Eliminar cuenta. Hay un enlace directo a la política de borrado.

**¿Se venden los datos?** No.

**¿Hay publicidad o SDKs de analítica de terceros?** No, ninguno.

**Nota sobre "Financial info":** la clave privada y la frase de recuperación
también se guardan (cifradas, en el servidor) — esto entra en "Financial
info → Other" o en un campo de seguridad aparte según cómo lo pida el
formulario en el momento; marcalo igual, cifrado no es lo mismo que "no se
recoge".

---

## Clasificación de contenido (cuestionario IARC)

Es un cuestionario de sí/no dentro de Play Console. Para Veta Wallet, la
respuesta a **todo** lo que sigue es **No**:

- Violencia, de cualquier tipo
- Contenido sexual
- Groserías o lenguaje fuerte
- Referencias a drogas, alcohol o tabaco
- Juego simulado o de azar
- Contenido generado por usuarios visible para otros usuarios (los contactos
  y la actividad son privados, solo los ve el dueño de la cuenta)
- Comparte la ubicación con otros usuarios
- Permite compras digitales (no hay compras dentro de la app)

Con todo en "No", la clasificación debería salir la más baja disponible
(equivalente a "Para todos" / PEGI 3). El cuestionario lo tenés que
completar vos dentro de Play Console — no se puede rellenar desde acá.

---

## Lo que la política de Google Play dice sobre billeteras cripto

Fui a buscar el texto real de la política (no lo tenía de memoria, lo leí
ahora): **"Blockchain-based Content"**, en el Centro de Políticas para
Desarrolladores de Play.

Dos cosas concretas que dice, textual:

> "The purchase, holding, or exchange of cryptocurrencies should be
> conducted through certified services in regulated jurisdictions."

> "You must comply with applicable regulations for any region or country
> that your app targets and avoid publishing your app where your products
> and services are prohibited."

Y agrega que Google **puede pedir documentación** de que se cumple con eso.

**Esto es el mismo asunto que el punto 6 de `PUBLICAR-EN-TIENDAS.md`
(licencias para Remesas), pero más amplio: no es solo Remesas, es toda la
billetera.** Cripto se cubre con regulación distinta en cada país, y Play
puede pedir la prueba de que Orden Global cumple donde se publique la app.

Un dato a favor: la política menciona un formulario aparte, el **"Financial
features declaration"**, pero lo exige específicamente para apps que
**venden** tokens o dejan **ganar** rendimiento con ellos ("sell or enable
users to earn Tokenized Digital Assets"). Veta Wallet no hace ninguna de las
dos cosas hoy — el intercambio (swap) está deshabilitado en la app y no hay
ninguna función de staking o rendimiento. Por eso, ese formulario específico
probablemente no aplique todavía. Lo que sí sigue en pie es la obligación
general de cumplir la regulación de cada país donde se publique.

La política **no menciona** una distinción entre billetera custodial y no
custodial, ni exige una cuenta de Organización para publicar apps cripto —
esa parte de mi cautela anterior no está confirmada por el texto real. Sigue
sin resolverse qué mostró la pantalla de Play Console después de marcar
"Cryptocurrency wallet or exchange apps" en el alta de la cuenta — avisame
qué salió ahí cuando sigas.

**Lo que esto significa en la práctica:** antes de enviar a revisión,
conviene decidir en qué países se va a publicar Veta Wallet (probablemente
Honduras primero) y tener claro, aunque sea en una frase, bajo qué marco
regulatorio opera Orden Global ahí. No hace falta un dictamen legal completo
para el primer envío, pero si Play pide algo, hay que poder contestar con
algo mejor que "no lo sabemos".

---

## Lo que solo vos podés hacer

1. **Terminar de crear la cuenta de Play Console** (Individual, quedamos en
   eso) y contarme si el paso de "Cryptocurrency wallet" te bloqueó o dejó
   seguir.
2. **Decidir Remesas**: publicarlo tal cual (es una calculadora, no mueve
   dinero) o sacarlo de esta versión. Mi lectura: al ser un cálculo y no una
   ejecución, es más defendible que un envío real, pero la decisión final es
   tuya — yo no puedo evaluar el marco legal de cada país.
3. **La cuenta de demostración** para el revisor: correo/contraseña que
   funcionen, con KYC ya aprobado, algo de saldo y la tarjeta emitida. Decime
   si ya existe una o si armamos una.
4. **Las capturas de pantalla reales**, desde tu teléfono, con la app
   corriendo — ver la sección de arriba.
5. **Lanzar el build de producción** cuando quieras: `Actions → "Veta Wallet
   — compilar Android" → Run workflow → production`. Sale un `.aab` listo
   para subir a Play Console → Producción → Crear versión nueva.

---

## Resumen de todo `PUBLICAR-EN-TIENDAS.md`, actualizado

| # | Punto | Estado |
|---|---|---|
| 1 | Cuenta de desarrollador de Apple / D-U-N-S | Pendiente — en trámite, no bloquea Android |
| 2 | Documentos legales | Listo |
| 3 | Cuenta de demostración | Pendiente — necesito que me digas si ya existe |
| 4 | Data Safety / App Privacy | **Listo acá arriba**, falta pegarlo en Play Console |
| 5 | Capturas y textos de ficha | Textos e imágenes de marca listos; capturas reales pendientes de vos |
| 6 | Licencias para Remesas | Pendiente tu decisión, con la nota nueva sobre la política cripto |
| 7 | Rotar secretos del historial de git | Pendiente, no bloquea la publicación |
| 8 | Desplegar el backend | **Listo** — verificado en vivo |
