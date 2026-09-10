# ULTRON FP para Android

App **nativa**. No es un acceso directo al navegador: tiene su icono, su
proceso, su botón de atrás, el micrófono conectado de verdad, las descargas en
la carpeta del teléfono y se actualiza sola.

Se descarga en **https://ultron.ordenglobal.link/apk**

## Las DOS actualizaciones, que no son la misma

**1 · La del tablero — todos los días, y no se nota.** El tablero se sirve
desde `ultron.ordenglobal.link`, así que cuando se despliega el servidor el
teléfono lo tiene en el momento, sin reinstalar nada. El 99 % de lo que cambia
—la pantalla, las herramientas, el cerebro— entra por aquí.

**2 · La de la envoltura — casi nunca.** Solo cuando cambia la app nativa: un
permiso nuevo, otra forma de bajar archivos. La app mira
`/apk/ultron.json`; si el `codigo` de ahí es mayor que el suyo, **pregunta** y
se actualiza en un toque. Se pregunta, no se impone: una app que se reinicia
sola en medio de una conversación es peor que una desactualizada.

## Los permisos, y por qué cada uno

| Permiso | Para qué |
|---|---|
| `INTERNET` | hablar con el servidor |
| `ACCESS_NETWORK_STATE` | saber si hay red, para avisar en vez de quedarse en blanco |
| `RECORD_AUDIO` | el micrófono: es como se le habla a ULTRON |
| `MODIFY_AUDIO_SETTINGS` | bajar el volumen del resto mientras dicta |
| `REQUEST_INSTALL_PACKAGES` | instalar la actualización que la propia app se baja |
| `POST_NOTIFICATIONS` | avisar cuando hay versión nueva (Android 13+) |

Ninguno de más. Las de escribir en disco **no** van: las descargas usan la
carpeta propia de la app, que desde Android 10 no necesita permiso de nadie.
El micrófono va como `required="false"`: una tableta sin micro tiene que poder
instalarla y usarla escribiendo.

## Publicar una versión nueva

```bash
export ANDROID_HOME=/opt/android-sdk
export ULTRON_KEYSTORE=<ruta al ultron.keystore>
export ULTRON_KEYSTORE_CLAVE=<la clave>
# 1. subir `codigo` de uno en uno y `nombre` en app/build.gradle
gradle --no-daemon :app:assembleRelease
# 2. copiar el APK y rehacer la ficha
cp app/build/outputs/apk/release/app-release.apk ../ultron/public/apk/ultron.apk
#    y en ../ultron/public/apk/ultron.json: codigo, version, sha256, bytes
node ../ultron/pruebas/probar-apk.mjs      # cuadra ficha y archivo, o se pone rojo
# 3. desplegar ULTRON como siempre
```

`probar-apk.mjs` corre en CI y comprueba las tres cosas que fallan en
silencio: que el archivo sea un APK de verdad, que el sha256 de la ficha sea el
del archivo que se sirve, y que el `codigo` cuadre con el que compiló Gradle.
Si el `codigo` se olvida, el archivo cambia y **ningún teléfono se entera**.

## LA LLAVE DE FIRMA — esto es lo que no se puede perder

Android solo deja instalar una actualización encima si está firmada con la
**misma** llave. Si se pierde, **no hay forma de actualizar los teléfonos que
ya la tienen**: habría que desinstalar y volver a instalar uno por uno, con
otro nombre de paquete.

Está guardada en S3, en `og-5550-arranque-548380372606/android/`
(`ultron.keystore` y su clave). Huella de la firma, la que sale en la página de
descarga y en la ficha:

```
77c55985604f57b0bfdcd3f7de8995413f1be8423f99cb1fd32a66e4f9a413f7
```

Si algún día se instala un «ULTRON» que no muestre esa huella, no es el
nuestro.

## Lo que NO está probado

No se pudo ejecutar en un teléfono ni en un emulador: la máquina donde se
compiló no tiene virtualización. Está compilada, firmada (v2 y v3), pasada por
el analizador de Android sin un solo error, y comprobada pieza por pieza
—manifiesto, permisos, actividad de arranque, tema, icono, contenido del
paquete—. La primera instalación real es la prueba que falta.
