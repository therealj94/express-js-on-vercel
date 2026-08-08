# Publicar Veta Wallet en App Store y Play Store

Estado a v1.18.0 · build 53.

Lo que se podía cerrar desde el código está cerrado. Lo que queda son trámites
y decisiones que solo puede hacer Orden Global.

---

## Listo en el código

| Requisito | Detalle |
|---|---|
| Eliminación de cuenta desde la app | Pantalla con 4 confirmaciones + contraseña → `DELETE /users/me` |
| Política de privacidad | `legal/POLITICA-DE-PRIVACIDAD.md`, enlazada desde Ajustes |
| Términos y condiciones | `legal/TERMINOS-Y-CONDICIONES.md`, enlazados desde Ajustes |
| `versionCode` de Android | Declarado en `app.json` |
| `buildNumber` de iOS | Declarado en `app.json` |
| Manifiesto de privacidad de Apple | 4 categorías de *required reason APIs* declaradas |
| Justificación de permisos | Textos en iOS; `RECORD_AUDIO` bloqueado en Android |
| Iconos y splash | 1024×1024; el icono de iOS sin canal alfa, como exige Apple |
| Exención de cifrado | `ITSAppUsesNonExemptEncryption: false` |
| Pantallas muertas | Ninguna. 33 rutas verificadas, todas alcanzables |
| Endpoints | Los 30 que llama la app existen y los verbos coinciden |
| Traducciones | 767 claves balanceadas ES/EN, ninguna usada sin definir |

---

## Pendiente — no depende del código

### 1. Cuenta de desarrollador de Apple (organización) — **empezá por esto**

Es la ruta crítica. Tarda semanas y bloquea todo lo demás en iOS.

- Requiere número **D-U-N-S** de la empresa. Si Orden Global no lo tiene, hay
  que pedirlo primero (gratis, tarda días).
- Cuenta de organización, no personal: una app financiera a nombre de una
  persona física genera preguntas en revisión.
- Costo: 99 USD al año.

**Android no depende de esto si la cuenta de Play Console es Individual.**
Google también pide D-U-N-S en Play Console, pero solo para cuentas de tipo
Organización — una cuenta Individual pide solo identidad de una persona
(documento + selfie) y una cuota única de 25 USD, y suele aprobarse en un par
de días.

Se decidió publicar Android ahora con una cuenta Individual y pedir el D-U-N-S
de Orden Global en paralelo para Apple. Cuando llegue, Google permite
**transferir la app publicada** a la cuenta de Organización sin perder
reseñas ni instalaciones (Play Console → Configuración de la app →
Transferir), pero es un trámite formal aparte — las dos cuentas tienen que
estar en regla y alguien tiene que aceptar la transferencia del otro lado. No
es instantáneo, así que conviene no dejarlo para el final.

### 2. Documentos legales — LISTO

Publicados y accesibles sin sesión:

- `https://legal.vetawallet.com/privacidad`
- `https://legal.vetawallet.com/terminos`

Son las URLs que hay que pegar en la ficha de App Store Connect y de Google
Play Console, y son las que enlaza la app desde Ajustes.

**Por qué un subdominio y no `vetawallet.com/privacidad`:** el dominio raíz
redirige *cualquier* ruta a `/login`, así que esas URLs nunca fueron accesibles
sin cuenta — exactamente lo que las tiendas rechazan. La web de la billetera es
un Next.js cuyo código está en un GitLab de terceros al que no tenemos acceso,
así que no se podía arreglar ahí. `legal.vetawallet.com` es un sitio estático
aparte que sí controlamos (Amplify `vetawallet-legal`, fuente en
`veta-wallet-legal/` de este repo).

### 3. Cuenta de demostración

Ambas tiendas necesitan entrar a la app para revisarla, y la app está detrás
de un login. Hace falta una cuenta con:

- Correo y contraseña que funcionen
- **KYC ya aprobado** — el revisor no va a completar una verificación de
  identidad con su propio documento
- Una tarjeta emitida y con saldo de prueba
- Algo de saldo ORIGEN para que las pantallas no se vean vacías

Se entrega en App Store Connect (Demo Account) y en Play Console (Instrucciones
de acceso).

### 4. Formularios de datos

- **Apple — App Privacy:** hay que declarar qué datos se recogen y para qué.
- **Google — Data Safety:** lo mismo, con otro formulario.

La política de privacidad tiene todo lo necesario para completarlos. Los
puntos clave: se recogen correo, nombre, documento, selfie, teléfono y
domicilio; **no hay rastreo publicitario ni SDK de terceros de analítica**;
los datos no se venden.

### 5. Capturas y textos de la ficha

- **iOS:** 6.7" y 5.5", mínimo 3 capturas cada uno
- **Android:** teléfono y tablet de 7" y 10"
- Descripción corta y larga, en español e inglés
- Icono de 512×512 para Play

### 6. Licencias para Remesas

La sección de Remesas implica transmisión de dinero, que en varios países
requiere licencia. **Antes de publicar hay que decidir una de dos:**

- Conseguir la licencia en los países donde se ofrezca, o
- Desactivar esa sección en la versión que va a las tiendas

Publicar sin resolverlo es exponerse a una baja de la app y a un problema
regulatorio.

### 7. Rotar los secretos que quedaron en el historial de git

| Secreto | Cuidado |
|---|---|
| `PASS_ADM` | Cifra las claves privadas. Rotarlo **exige migrar la base**: hay que descifrar con la vieja y volver a cifrar con la nueva. No se puede cambiar y ya |
| `PASS_TOKEN` | Firma los JWT. Rotarlo **cierra la sesión de todos** los usuarios |
| Mongo · CryptoMate · Veriff · treasury · correo | Se rotan desde el panel de cada proveedor |

`config.json` ya salió del repositorio y su API key de Etherscan dejó de estar
en el código, pero **ambos siguen en el historial**.

### 8. Desplegar el backend

**El token de Heroku expiró a mitad de sesión.** El commit está hecho y sin
desplegar. Con un token nuevo:

```bash
cd vetawallet-backend
git push origin HEAD:master
```

Lleva la eliminación de cuenta, el alias de registro, los arreglos de envío y
todo lo de seguridad. **Sin ese despliegue, la pantalla de eliminar cuenta de
la app llama a un endpoint que todavía no existe** — y eso es exactamente lo
que revisa Apple.

---

## Orden recomendado

1. **Hoy:** crear la cuenta Individual de Play Console (identidad + 25 USD)
2. **Hoy:** iniciar la cuenta de Apple y pedir el D-U-N-S — en paralelo, no bloquea Android
3. **Hoy:** conseguir un token nuevo de Heroku y desplegar el backend
4. Publicar los dos documentos legales en el sitio
5. Decidir qué hacer con Remesas
6. Compilar el AAB (`eas build -p android --profile production`) y probarlo de verdad con la cuenta de demostración
7. Capturas y textos de ficha
8. Enviar Android
9. Cuando llegue el D-U-N-S: transferir la app a la cuenta de Organización
10. Enviar iOS cuando la cuenta de Apple esté aprobada

---

## Compilar

```bash
cd veta-wallet-app

# APK para pruebas y distribución directa
eas build -p android --profile preview

# AAB para Google Play
eas build -p android --profile production

# iOS (necesita la cuenta de Apple ya aprobada)
eas build -p ios --profile production
```

**Antes de cada subida hay que subir el número de build**, en `app.json`:
`android.versionCode` y `ios.buildNumber`. Las tiendas rechazan un número
repetido.
