# Orden Global, una sola app — con GENESIS de asistente

Cómo hacerlo funcionar. Escrito después de mirar lo que ya está construido,
no sobre una hoja en blanco.

---

## 0 · La conclusión primero

**No hay que construir una app nueva. Ya está construida el 80 %.**

`veta-wallet-app` no es una pantalla con botones: es un contenedor con **31
pantallas direccionables por nombre**, un router propio y sesión de Genesis
ID integrada.

```js
// veta-wallet-app/App.js
const SCREENS = { home, token, send, receive, buy, swap, card, cardSettings,
  fundCard, deposit, activity, notifs, settings, profile, mytokenpay,
  passport, scan, contacts, remesas, sessions, help, ... };   // 31 rutas
<Screen nav={{ go, back, route }} params={cur.params} />
```

Y la pantalla de envío **ya acepta destino y monto desde fuera** — el
comentario está escrito en el código desde antes de esta conversación:

```js
// veta-wallet-app/src/screens/Trade.js:82
// El monto puede llegar de fuera (deep link de pago, salto desde Remesas)
const [amt, setAmt] = useState(params?.amount ? normalizeAmtInput(...) : '');
const [to,  setTo ] = useState(params?.to || '');
```

Es decir: **«envía 15 dólares a Juan» es `go('send', {to, amount:15})`**. La
pantalla ya existe, ya se rellena, ya revisa antes de firmar. Lo que falta no
es la app: falta **quien traduzca la frase en esa llamada**.

Eso es lo que hay que construir, y son tres piezas.

---

## 1 · Las tres piezas

### 1.1 El mapa — registro de rutas

Un solo fichero que declara **todo lo que se puede alcanzar**, con su
dirección estable y qué parámetros admite:

```
og://wallet/home              og://wallet/send?to=&amount=&token=
og://wallet/receive           og://wallet/card
og://wallet/swap              og://wallet/activity
og://pay/cobrar?monto=        og://pay/negocio?id=
og://id/verificar             og://id/pasaporte
og://scan/tx?hash=            og://scan/bloque?n=
```

Cada entrada lleva: la ruta interna a la que resuelve, los parámetros
válidos, **si necesita sesión**, **si necesita firma** y una frase de ejemplo.

> **La regla del mapa: si no está en el mapa, GENESIS no lo puede hacer.**
> No es una limitación, es el diseño. Un asistente que solo puede llamar a
> una lista cerrada de destinos no puede inventarse una acción, y eso es
> exactamente lo que hace falta cuando hay dinero de por medio.

Beneficio lateral: ese mismo mapa sirve para *deep links* de verdad
(`vetawallet://` ya está registrado), para notificaciones que abren la
pantalla correcta y para cobrar con un QR.

### 1.2 El traductor — capa de intención

Frase → una entrada del mapa + parámetros resueltos. **Gramática primero,
modelo después:**

| Lo que se dice | Verbo | Destino | Parámetros |
|---|---|---|---|
| «abre veta wallet» | abrir | `og://wallet/home` | — |
| «quiero ver mi tarjeta» | abrir | `og://wallet/card` | — |
| «envía 15 dólares a Juan» | enviar | `og://wallet/send` | `to`=Juan→dirección, `amount`=15 |
| «cóbrale 200 a este cliente» | cobrar | `og://pay/cobrar` | `monto`=200 |
| «enséñame la transacción» | abrir | `og://scan/tx` | `hash`=la última |

Cuatro verbos cubren el 90 %: **abrir · enviar · cobrar · mostrar**. Las
entidades ya existen en la app: `listContacts()` y `nameFor()` en
`src/addressBook.js` resuelven «Juan» → dirección; los tokens salen de
`useTokens()`.

Un modelo de lenguaje entra **después**, y solo para lo que la gramática no
entendió — nunca para decidir un monto ni un destino. Esos dos salen siempre
de la libreta y del teclado, y se muestran en pantalla antes de firmar.

### 1.3 La barra de hablar — abajo, siempre

Tres estados, los mismos que ya usa el cerebro: **escucha → entiende →
confirma**. Lo que entendió se enseña escrito antes de actuar:

```
   «envía 15 dólares a Juan»
    → Enviar 15 ORIGEN a Juan (0x7a3f…c210)     [ Sí ]  [ No ]
```

---

## 2 · La regla que no se negocia

> **GENESIS prepara. La persona firma.**

El asistente **nunca** transmite una transacción. Rellena la pantalla, la
deja lista, y el envío pasa por la revisión y el PIN o la huella que ya
existen. Tres razones, y las tres pesan:

1. Un error de reconocimiento de voz no puede costar dinero.
2. Apple y Google rechazan una app que mueva fondos por voz sin confirmación
   explícita.
3. Si algún día entra un modelo de lenguaje, esta regla es lo único que hace
   que su error sea una molestia y no una pérdida.

---

## 3 · Qué se junta y cómo — pieza por pieza

| Pieza | Estado hoy | Cómo entra |
|---|---|---|
| **Veta Wallet** | Expo 54 · RN 0.81 · 31 pantallas · v1.33 | **es el contenedor**. Se renombra a Orden Global |
| **Genesis ID** | app aparte, Expo 54 · RN 0.81 · ya usa WebView | **la puerta**: se abre la app y lo primero es Genesis ID. Ya hay puente en el backend y `src/genesis.js` en la wallet |
| **MyTokenPay** | Expo 51 · RN 0.74 · expo-router · ~15 pantallas | **no se puede pegar tal cual**: otra versión de React Native y otro router. Fase 1 en WebView; luego se reescriben nativas *pagar* y *cobro*, que son las que importan |
| **ordenscan** | web | WebView siempre. Es un explorador, no necesita ser nativo |
| **El cerebro / FLUX** | web, voz grabada | su banco de respuestas y su forma de hablar se reusan; GENESIS es el mismo personaje dentro de la app |

**Por qué WebView y no todo nativo:** porque lo que toca llaves tiene que ser
nativo y lo que no toca llaves no gana nada siéndolo. Un explorador o un
panel de comercio dentro de un WebView se actualiza sin pasar por la tienda.
La frontera es clara: **nada que vea una clave privada vive en un WebView.**

---

## 4 · La voz, dentro del teléfono

- **Lo que dice**: las frases fijas se meten grabadas en el paquete de la app
  —el mismo Piper, el mismo `manifiesto.json`— y suenan **sin red**. Lo
  variable («te quedan 12 ORIGEN») lo lee la voz del sistema con
  `expo-speech`.
- **Lo que oye**: `@react-native-voice/voice`. Ojo: **necesita compilación
  propia**, no funciona en Expo Go. Es el primer sitio donde el proyecto deja
  de poder probarse con el lector de QR.
- **Sin conexión**: abrir, mostrar y navegar tienen que funcionar sin red.
  Enviar, no — y GENESIS lo dice en vez de fallar en silencio.

---

## 5 · El camino, por fases

**Fase 0 · el mapa (≈1 semana).** Registro de rutas + `og://` + los intentos
que no necesitan pantallas nuevas: *abrir* y *mostrar*. Al final de la
semana se le puede decir «abre mi tarjeta» y se abre. Sin voz todavía:
escrito. Sirve para demostrar que el mapa está bien antes de gastar en voz.

**Fase 1 · la voz y el envío (≈2 semanas).** Barra de hablar, los cuatro
verbos, «envía 15 a Juan» con confirmación. Aquí ya se puede enseñar.

**Fase 2 · el resto del ecosistema (≈2 semanas).** Genesis ID como puerta con
sesión única, MyTokenPay y ordenscan embebidos, «abre X» para todo.

**Fase 3 · lo nativo que faltaba.** Cobro de MyTokenPay nativo, frases
offline, y —si la Junta aprueba el crédito— el modelo de lenguaje como
respaldo del traductor, nunca de la firma.

---

## 6 · Lo que hay que arreglar antes, y no es opcional

1. **PASS_TOKEN de 7 caracteres firma todas las sesiones de la wallet**
   (tarea abierta #27). Meter todo el ecosistema detrás de una sola sesión
   multiplica lo que protege esa clave. **Esto se cierra antes de unificar
   identidades, no después.**
2. **Una sola app es un solo radio de daño.** El asistente tiene que ser un
   módulo que se pueda apagar con un interruptor remoto sin tocar la
   billetera. Si GENESIS falla, la app sigue siendo una billetera.
3. **Una sola app es una sola revisión de tienda.** Hoy son tres apps que
   fallan por separado; mañana un rechazo detiene todo. Conviene mantener
   Veta Wallet publicable por su cuenta durante al menos una versión.
4. **Permisos de micrófono**: hay que explicar en la ficha de la tienda para
   qué se usa, y que no se envía audio a ningún servidor (con Piper y
   reconocimiento del sistema, es verdad — conviene que siga siéndolo).

---

## 7 · Lo que yo NO haría

- **Empezar de cero un contenedor nuevo.** Se tiraría un router probado, 31
  pantallas y dos años de arreglos por una carpeta limpia.
- **Meter el modelo de lenguaje en la fase 1.** El traductor determinista
  cubre lo que se va a enseñar en una reunión, cuesta cero y no se inventa
  nada.
- **Fusionar MyTokenPay a la fuerza ya.** Dos versiones de React Native en un
  mismo paquete es la clase de trabajo que se come un mes sin que se note por
  fuera. WebView ahora, nativo cuando haya motivo.
- **Que el asistente firme.** Ni con confirmación por voz. La firma se toca
  con el dedo.
