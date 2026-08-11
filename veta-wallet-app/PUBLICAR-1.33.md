# Publicar Veta Wallet 1.33.0 · paso a paso

La versión 1.33.0 agrega **entrar con Google** y, en iPhone, **entrar con
Apple**. Esta guía va en orden: cada paso depende del anterior, y hay tres
sitios donde equivocarse cuesta un rechazo de la tienda o una semana de espera.

**Lo que ya está hecho y no hay que tocar:** el código de la app, la pantalla de
acceso, las traducciones, el historial de novedades, las versiones alineadas
(1.33.0 / build 69) y el verificador en verde.

**Lo que falta es configuración en consolas y un despliegue del backend.**
Nada de eso lo puede hacer el operador automático: requiere entrar con tu
cuenta a Google Cloud, a Apple y a Heroku.

---

## Paso 0 · Antes de nada, entender el orden

```
1. Crear los identificadores en Google Cloud   ─┐
2. Activar Sign in with Apple en Apple          ├─→ 3. Desplegar el backend
                                                ─┘        │
                                                           ▼
                                              4. Construir la app con esos datos
                                                           │
                                                           ▼
                                              5. Probar ANTES de subir
                                                           │
                                                           ▼
                                              6. Subir a las tiendas
```

**Si se construye la app antes de tener los identificadores, los botones no
aparecen** — están escondidos a propósito cuando falta la configuración, para
que nadie vea un botón que no funciona.

---

## Paso 1 · Google Cloud · los tres identificadores

En <https://console.cloud.google.com> → *APIs y servicios* → *Credenciales*.

Hacen falta **tres** clientes OAuth, no uno:

| Cliente | Para qué sirve |
|---|---|
| **Web** | Es el que fija a quién va dirigido el token. **Es el que verifica el servidor.** Sin este, nada funciona. |
| **Android** | Para que Google acepte abrir la ventana desde el teléfono Android |
| **iOS** | Lo mismo en iPhone |

### El cliente Web
*Crear credenciales → ID de cliente de OAuth → Aplicación web.* No hace falta
llenar orígenes ni redirecciones. Guardá el **ID de cliente** (termina en
`.apps.googleusercontent.com`).

### El cliente Android
*Crear credenciales → ID de cliente de OAuth → Android.*

- **Nombre del paquete:** `com.ordenglobal.vetawallet`
- **Huella SHA-1:** la del certificado con que EAS firma la app. Se obtiene con:

```sh
cd veta-wallet-app
npx eas credentials --platform android
```

Elegí el perfil `production` y copiá el **SHA-1 fingerprint**.

> **Este es el error más común.** Si se pone la huella de depuración en lugar de
> la de producción, Google funciona mientras probás y **deja de funcionar en la
> app publicada**. Y como la app ya está en la tienda, arreglarlo cuesta otra
> entrega.

### El cliente iOS
*Crear credenciales → ID de cliente de OAuth → iOS.*
- **ID del paquete:** `com.ordenglobal.vetawallet`

### Pantalla de consentimiento
*Pantalla de consentimiento de OAuth* → tipo **Externo** → **Publicar la
aplicación**.

> Si queda en «Prueba», **sólo entran las cuentas que agregues a mano**. Todos
> los demás verán un error. Es la segunda causa de que esto falle en producción.

---

## Paso 2 · Apple · activar Sign in with Apple

En <https://developer.apple.com/account> → *Certificates, Identifiers &
Profiles* → *Identifiers* → `com.ordenglobal.vetawallet`.

Marcá **Sign in with Apple** y guardá.

> **No es opcional.** La directriz 4.8 de Apple dice que si la app ofrece entrar
> con un servicio de terceros —y Google lo es— **tiene que ofrecer también
> entrar con Apple**. Sin esto, el rechazo es seguro. Por eso la app lo trae.

El *entitlement* ya está declarado en `app.json`; sólo hay que activarlo del
lado de Apple.

---

## Paso 3 · Desplegar el backend

Los archivos están en `infra/veta-wallet-social/`:

| Archivo | Dónde va |
|---|---|
| `lib/socialAuth.js` | `lib/socialAuth.js` del backend |
| `controller/socialController.js` | `controller/socialController.js` |
| `routes.fragmento.js` | las dos líneas que indica, dentro de `routes/auth.js` |

No hay dependencias nuevas que instalar: usa `axios` y `jsonwebtoken`, que ya
están.

### Las variables de entorno

```sh
heroku config:set --app vetawallet \
  GOOGLE_CLIENT_IDS="<ID-web>,<ID-android>,<ID-ios>" \
  APPLE_CLIENT_IDS="com.ordenglobal.vetawallet"
```

Los tres identificadores de Google separados por coma, **sin espacios**. El
token que llega puede venir dirigido a cualquiera de los tres según por dónde
entró la persona, y los tres son válidos.

> **Si estas variables no están, el botón no acepta a nadie** — a propósito.
> Es preferible que no funcione a que acepte tokens emitidos para cualquier otra
> aplicación del mundo, que es lo que pasaría si el servidor no comprobara a
> quién va dirigido el token.

### Comprobar que quedó bien

```sh
curl -s -X POST https://vetawallet-1a2e38ac52b1.herokuapp.com/auth/social \
  -H 'Content-Type: application/json' \
  -d '{"provider":"google","idToken":"esto-no-es-un-token"}'
```

Tiene que responder **401** con «No se pudo verificar la identidad». Si
responde 404, la ruta no quedó registrada. Si responde 500, faltan las
variables.

---

## Paso 4 · Construir la app

```sh
cd veta-wallet-app
node scripts/verificar.js        # tiene que decir "listo para construir"
```

Los identificadores se pasan como variables al construir. En `eas.json`,
dentro de `build.production.env`, agregá:

```json
"EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID": "<ID-web>",
"EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID": "<ID-android>",
"EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID": "<ID-ios>"
```

Y lo mismo en `preview`, para poder probar antes.

```sh
npx eas build --platform android --profile production
npx eas build --platform ios --profile production
```

---

## Paso 5 · Probar ANTES de subir

Esto no es opcional. Construí primero el perfil `preview`, instalalo en un
teléfono de verdad y comprobá **las cinco cosas**:

1. **Entrar con Google** en Android → entra y muestra el saldo.
2. **Entrar con Google** en iPhone → lo mismo.
3. **Entrar con Apple** en iPhone → lo mismo.
4. **Una cuenta que ya existía con correo y contraseña**, entrando ahora con
   Google con ese mismo correo → **tiene que caer en su cuenta de siempre, con
   sus mismos fondos**. Si crea una cuenta nueva y vacía, algo está mal: parar
   y avisar.
5. **Cancelar** a mitad del ingreso → vuelve a la pantalla sin error rojo.

> La número 4 es la que hay que mirar con más cuidado. Si fallara, alguien con
> fondos podría entrar y ver cero, y eso no se arregla con una actualización:
> hay que arreglar datos.

---

## Paso 6 · Subir a las tiendas

### Google Play

```sh
npx eas submit --platform android --profile production
```

En la consola, además:

- **Versión de producción → Notas de la versión:** usar el texto del historial
  de novedades de 1.33.0.
- **Contenido de la app → Seguridad de los datos:** ya declara correo y datos
  de identidad. **Entrar con Google no agrega ningún dato nuevo** — sólo el
  correo, que ya estaba declarado.

### App Store

```sh
npx eas submit --platform ios --profile production
```

En App Store Connect:

- **Novedades de esta versión:** el mismo texto.
- **Información de la revisión:** dejá una **cuenta de prueba** con correo y
  contraseña. El revisor de Apple no puede usar tu Google ni tu Apple ID, y si
  no puede entrar, rechaza por «no pudimos revisar la app».

> Esa cuenta de prueba es la tercera causa de rechazo más común, y la más
> evitable.

---

## Lo que ya cumple, y conviene no romper

| Requisito de la tienda | Estado |
|---|---|
| Sign in with Apple si hay otro acceso de terceros | **sí**, en 1.33.0 |
| Borrar la cuenta desde dentro de la app | **sí** (Ajustes → Eliminar cuenta) |
| Política de privacidad accesible sin iniciar sesión | **sí** |
| Términos accesibles sin iniciar sesión | **sí** |
| Declaración de cifrado (exportación) | **sí**, `ITSAppUsesNonExemptEncryption: false` |
| Permisos explicados en su idioma | **sí**, los cinco textos están |
| Manifiesto de privacidad de iOS | **sí** |

---

## Si algo sale mal

| Síntoma | Causa casi segura |
|---|---|
| El botón de Google no aparece | falta `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` al construir |
| Funciona en pruebas y falla en la app publicada | la huella SHA-1 es la de depuración, no la de producción |
| «Error 400: redirect_uri_mismatch» | el nombre del paquete del cliente Android no es `com.ordenglobal.vetawallet` |
| Sólo entran algunas cuentas | la pantalla de consentimiento quedó en modo «Prueba» |
| El servidor responde 401 siempre | `GOOGLE_CLIENT_IDS` no coincide con el identificador que usa la app |
| El botón de Apple no aparece en iPhone | falta activar la capacidad en el portal de Apple |
