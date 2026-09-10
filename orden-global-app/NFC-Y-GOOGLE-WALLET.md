# Pagar con NFC: qué hace falta y qué no depende de nosotros

Son dos cosas distintas y conviene no mezclarlas.

| | Qué es | Se puede |
|---|---|---|
| **Agregar a Google Wallet** | La tarjeta se copia a Google Wallet y se paga con NFC desde ahí | Sí, si CryptoMate lo soporta y Google nos aprueba |
| **Pagar con NFC desde Veta Wallet** | La app emula la tarjeta con el chip NFC del teléfono | En la práctica, no |

---

## 1. Agregar a Google Wallet (push provisioning)

Es el camino real. El usuario toca un botón en Veta Wallet, la tarjeta queda
en Google Wallet, y paga acercando el teléfono. Veta Wallet no maneja el NFC:
lo maneja Google.

### Lo que verifiqué

**El SDK de Google no es público.** La documentación de push provisioning
(`developers.google.com/pay/issuers/apis/push-provisioning/android`) contesta
*"Only authorized Google Accounts can view this content"*. No es que esté mal
documentado: está cerrado a socios aprobados.

**El módulo de React Native que existe confirma lo mismo.**
`@expensify/react-native-wallet` es el único mantenido que hace esto, y su
README pide, antes de escribir una línea de código:

- Pedir acceso a la Google Push Provisioning API
- Descargar el TapAndPay SDK (se entrega tras la aprobación)
- Registrar el package name y el SHA-256 de la app en la lista blanca de Google
- Esperar la verificación. Sin eso, las funciones devuelven `Not verified`

Para iOS, lo mismo por otro lado: hay que pedir el entitlement
`com.apple.developer.payment-pass-provisioning` a Apple, y **solo califican
Team IDs de producción** — un Team ID de prueba no sirve.

### El eslabón que falta y que no depende de Google

Aunque Google nos apruebe, la tarjeta tiene que poder tokenizarse. Eso lo
provee el emisor a través de Visa Token Service, y se materializa en un dato
que la app le pasa al SDK (la OPC, *opaque payment card*).

**Ese dato tiene que darlo CryptoMate.** Hoy no lo da: de los 17 endpoints de
tarjeta que usa el backend, ninguno tiene que ver con tokenización,
provisioning ni wallets. Son emisión, saldo, PAN, PIN, 3DS, límites,
movimientos, reemisión y congelado.

### Qué preguntarle a CryptoMate

Esto es lo que decide si el camino existe o no. Conviene preguntarlo tal cual:

1. ¿Soportan push provisioning a Google Wallet y Apple Wallet para las
   tarjetas virtuales enterprise?
2. Si sí, ¿exponen un endpoint que devuelva la **OPC (opaque payment card)**
   para Android, y los datos equivalentes para Apple Pay In-App Provisioning?
3. ¿La tokenización la habilita su BIN sponsor o hay que gestionarla con Visa
   por separado?
4. ¿Nos registran como socio ante Google/Apple, o el trámite lo hacemos
   nosotros a nombre de Orden Global?
5. ¿Hay costo por token emitido o por tarjeta tokenizada?

Si la respuesta a la 1 es no, este camino está cerrado hasta que ellos lo
construyan, y no hay nada que podamos hacer del lado de la app.

### Y además: rompe Expo Go

Cualquiera de estos módulos es **código nativo**. Eso significa:

- No funciona en Expo Go, ni ahora ni nunca. Habría que pasar a un
  development build para probarlo.
- Con `runtimeVersion: sdkVersion` (ver `EXPO-GO.md`), agregar un módulo
  nativo obliga a recompilar y repartir el APK **antes** de publicar el
  update. Si no, el APK viejo se baja JavaScript que llama a algo que no
  tiene y se cierra al abrir.

O sea que esto no llega por aire. Es una versión nueva instalada a mano.

---

## 2. Pagar con NFC desde la propia app (HCE)

Que la app emule la tarjeta y se pague acercando el teléfono, sin Google
Wallet en el medio.

Android lo permite técnicamente — se llama Host Card Emulation — pero
"permitir" es solo la mitad. Para que un datáfono acepte el pago, la app tiene
que presentar credenciales EMV reales: un token de Visa y sus claves, emitidos
por un Token Service Provider. Esas credenciales no se generan; se reciben, y
solo las recibe un emisor certificado.

Es decir: hace falta **todo lo del punto 1** (tokenización de CryptoMate,
relación con Visa) **más** la certificación EMVCo de la app como aplicación de
pago, más el alcance PCI que eso arrastra.

Por eso ninguna wallet de cripto hace esto: todas empujan la tarjeta a Google
Wallet o Apple Pay. No es falta de ganas, es que el camino corto no existe.

**Recomendación: descartarlo.** El punto 1 le da al usuario exactamente lo
mismo — pagar acercando el teléfono — con una fracción del trabajo y sin
certificaciones.

---

## Orden sugerido

1. Preguntarle a CryptoMate las 5 preguntas de arriba. **Todo depende de eso.**
2. Si dicen que sí: pedir acceso a Google Push Provisioning y el entitlement
   de Apple en paralelo — los dos trámites tardan.
3. Recién entonces: development build, integrar el módulo, y repartir APK
   nuevo.

Nada de esto es trabajo de app hasta el paso 3, y el paso 3 no empieza sin el
paso 1.
