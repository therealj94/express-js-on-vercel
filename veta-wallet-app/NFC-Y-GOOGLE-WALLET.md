# Pagar acercando el teléfono

> **Corrección · 20-sep-2026.** La versión anterior de este documento concluía
> que CryptoMate «hoy no da» la credencial que hace falta, y que por eso el
> camino estaba cerrado. **Era falso, y frenó el proyecto semanas.** La
> conclusión se sacó mirando qué endpoints usaba *nuestro* backend, no qué
> ofrece CryptoMate — como deducir que una tienda no vende pan porque nosotros
> nunca compramos pan ahí.
>
> CryptoMate documenta el endpoint con nombre y todo, y ya está integrado.

---

## Lo que se consigue, y lo que no

| | Se paga acercando el teléfono | Qué falta |
|---|---|---|
| **Añadir a Google Wallet** | Sí. La tarjeta vive en Google Wallet y se paga con NFC desde ahí | Alta ante Google y el SDK. Ver abajo |
| **Pagar desde dentro de Veta Wallet** | No, y no va a poder | Certificación EMVCo y alcance PCI |

Conviene decirlo claro porque se pide a menudo: **el pago por NFC no ocurre
dentro de Veta Wallet.** Ocurre en Google Wallet, con la tarjeta que Veta
Wallet metió ahí. Para quien paga es idéntico —acerca el teléfono al datáfono y
listo— pero la credencial vive en Google, no en nuestra app.

Que la app emule la tarjeta ella misma se llama Host Card Emulation. Android lo
permite, pero para que un datáfono acepte el pago hay que presentar credenciales
EMV reales, emitidas por un Token Service Provider a un emisor certificado, más
la certificación EMVCo de la app como aplicación de pago y el alcance PCI que
eso arrastra. Ninguna billetera de cripto lo hace. No es falta de ganas: el
camino corto no existe.

---

## El endpoint que sí existe

```
POST /cards/virtual-cards/{cardId}/google-pay/provisioning
```

Devuelve la **OPC** (*opaque payment card*): el número de la tarjeta cifrado
para Google y atado a un aparato concreto. Es lo que el SDK necesita para meter
la tarjeta en la billetera sin que nadie teclee nada.

Dos cosas que deciden el diseño:

- **Los dos datos que pide los genera el teléfono**, no el servidor:
  `wallet_account_id` y `device_id` salen del SDK de Google. La documentación
  de CryptoMate lo dice con todas las letras: *«your backend cannot obtain
  them»*. Por eso el flujo es app → nuestro backend → CryptoMate y vuelta.
- **La credencial es dinero.** De un solo uso, de vida corta, y no se guarda ni
  se registra en ningún sitio.

**Apple Wallet no.** La documentación técnica lo niega dos veces: *«Apple Pay
is not available through this endpoint. Google is the only supported wallet
today.»* El sitio comercial de CryptoMate sí lo anuncia en español, y se
contradice con su propia documentación. Hay que preguntárselo, pero se planifica
con Google solamente.

---

## Lo que ya está construido

| Dónde | Qué |
|---|---|
| Backend · `controller/cardController.js` | `googleWalletProvisioning` — cambia los identificadores del aparato por la credencial. No la registra, no la guarda, responde `no-store` |
| Backend · `routes/cards.js` | `POST /cards/google-wallet/provisioning`, con sesión de usuario |
| Backend · sonda | `GET /cards/admin/google-wallet/sonda`, protegida con `x-admin-key`: dice si el programa lo admite, sin devolver credencial |
| App · `src/googleWallet.js` | El puente: pide los identificadores, llama al backend, se la entrega al SDK. Si no hay módulo nativo, contesta «no disponible» y nada revienta |
| App · `src/api.js` | `cardApi.googleWalletProvisioning` |
| App · `src/screens/Card.js` | El botón, que **solo aparece si de verdad se puede** |

El backend distingue tres finales que la app necesita separar: que el programa
no lo admita (`PROVISIONING_NO_DISPONIBLE`, que no se arregla reintentando y
retira el botón), que nuestra clave no tenga nivel (`CLAVE_SIN_NIVEL`), y un
fallo pasajero. Con un 500 genérico la app diría «probá de nuevo» para siempre.

---

## Lo que falta, y no es código

### 1 · Saber si nuestro programa lo admite

Es lo primero y lo decide todo. La sonda lo contesta:

```sh
curl -sS -H "x-admin-key: $ADMIN_SECRET" \
  "https://vetawallet-1a2e38ac52b1.herokuapp.com/cards/admin/google-wallet/sonda"
```

Tres respuestas posibles:

- `soportado: true` → el programa está habilitado. Seguir por el punto 2.
- `PROVISIONING_NO_DISPONIBLE` → hay que pedírselo a CryptoMate. No es trabajo
  de app y ninguna cantidad de código lo arregla.
- `CLAVE_SIN_NIVEL` → el endpoint pide una clave de nivel 2 o superior. Pedir
  el ascenso a CryptoMate.

La documentación de CryptoMate además dice, literalmente, que hay que hablar
con ellos antes de construir el lado del cliente. Así que preguntar por correo
vale tanto como correr la sonda, y probablemente llegue antes.

### 2 · El alta ante Google

Cerrada a socios aprobados. La documentación de push provisioning contesta
*«Only authorized Google Accounts can view this content»* a quien no esté
dentro. Hay que:

1. Pedir acceso a la **Google Pay Push Provisioning API**.
2. Descargar el **SDK TapAndPay**, que se entrega tras la aprobación, y
   meterlo en `android/libs`.
3. Registrar el nombre del paquete y la huella **SHA-256** de la app en la
   lista blanca de Google.
4. Que CryptoMate registre el programa de tarjetas con la red.

Sin esto, las funciones del SDK devuelven `Not verified`. Los trámites tardan y
**no dependen de que el código esté listo**: conviene empezarlos ya.

### 3 · Un APK nuevo, repartido a mano

El módulo es **código nativo**. Eso significa:

- No funciona en Expo Go, ni ahora ni nunca. Hace falta un *development build*.
- Con `runtimeVersion: sdkVersion` (ver `EXPO-GO.md`), añadir un módulo nativo
  obliga a **recompilar y repartir el APK antes** de publicar la actualización
  por aire. Si no, el APK viejo se baja JavaScript que llama a algo que no
  tiene y se cierra al abrir.

El código de hoy está escrito para que ese orden no importe: el puente detecta
si el módulo está y, si no está, el botón no se pinta. **La app se puede
repartir ya con todo esto dentro** sin esperar a nada.

```sh
npm i @expensify/react-native-wallet
npx expo prebuild --platform android
# meter el SDK TapAndPay en android/libs y referenciarlo en build.gradle
npx expo run:android
```

---

## El orden

1. Correr la sonda, o preguntarle a CryptoMate. **Todo depende de eso.**
2. Si la respuesta es sí: pedir el acceso a Google en paralelo, porque tarda.
3. Cuando llegue el SDK: instalar el módulo, compilar, repartir el APK.
4. El botón aparece solo.

Nada de esto es trabajo de app hasta el paso 3, y el paso 3 no empieza sin el
paso 1.
