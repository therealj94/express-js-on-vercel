# Abrir Veta Wallet en Expo Go

Veta Wallet usa el **SDK 54 de Expo**.

> ## La regla que evita este ida y vuelta
>
> El SDK del proyecto **no es una elección fija** — tiene que perseguir a lo
> que Expo Go de la tienda esté repartiendo en cada momento, y eso cambia
> solo con el tiempo, sin que nadie acá haga nada.
>
> Cuando Expo publica un SDK nuevo, tarda unas semanas en llegar a todos los
> teléfonos: Play Store y App Store lo distribuyen de a poco. Durante esa
> ventana, el proyecto tiene que quedarse en el SDK **viejo**, porque es el
> que la mayoría de la gente todavía tiene instalado. Una vez que el nuevo ya
> rodó del todo, hay que subir, porque Expo Go deja de aceptar proyectos de
> SDKs muy atrasados.
>
> **Antes de tocar nada, comprobá cuál es hoy:**
> ```bash
> curl -s https://exp.host/--/api/v2/versions/latest | python3 -c "
> import sys,json; d=json.load(sys.stdin)
> print('Expo Go Android (tienda):', d.get('androidClientVersion'))
> print('Expo Go iOS (tienda):', d.get('iosClientVersion'))
> "
> ```
> Y compará contra el SDK del proyecto (`npm run verificar` lo dice). Si no
> coinciden, ahí está el problema — no hace falta adivinar nada más.
>
> Este vaivén ya pasó dos veces (subir → SDK 57, bajar → SDK 54, subir de
> nuevo → 57, bajar de nuevo → 54). Cada vez que se cambie, dejar anotado
> acá arriba la fecha y qué decía el comando de arriba en ese momento.

## Camino confiable: `npx expo start`

Es el único método que probamos que funciona siempre, sin depender de
cuentas de Expo ni de si un update ya se propagó. Sirve el bundle en vivo
desde tu computadora — nada de esto pasa por `u.expo.dev`.

**No uses la URL de un update publicado** (`exp://u.expo.dev/...`) para
abrir la app en Expo Go. Expo cambió en mayo de 2026 cómo Expo Go valida esos
updates (requiere que la cuenta logueada sea dueña del proyecto, y limitó
qué formato de bundle acepta) y quedó frágil — a veces falla con "Failed to
download remote update" sin ninguna razón clara, incluso con todo bien
configurado del lado del servidor. `npx expo start` no pasa por ese camino:
sirve el bundle directo, sin publicar nada.

## En el computador

Descomprime el proyecto en una carpeta **nueva** (no encima de una anterior:
quedaría un `node_modules` viejo y nada funcionaría).

```bash
cd veta-wallet-app
npm install
npm run verificar     # debe decir: ✓ listo para construir
npx expo start
```

Aparece un código QR en la terminal.

## En el teléfono

1. Instala **Expo Go** — tiene que ser la versión de **SDK 54**. Si Play
   Store/App Store ya reparte una más nueva (comprobalo con el comando de
   arriba), no sirve la de la tienda: bajala aparte desde
   `https://expo.dev/go?sdkVersion=54&platform=android&device=true` (Android
   únicamente — en iPhone no hay forma de instalar una versión vieja, la App
   Store solo sirve la actual).
2. El teléfono y el computador tienen que estar en la **misma red wifi**.
3. **Android**: abre Expo Go y toca *Scan QR code*.
   **iPhone**: escanea el QR con la cámara del sistema y abre el enlace.

Si el wifi no os deja veros (redes de invitados, universidades, oficinas),
usa el túnel:

```bash
npx expo start --tunnel
```

Va más lento pero funciona desde cualquier red.

## Qué funciona en Expo Go y qué no

| | Expo Go | APK (`eas build`) |
|---|---|---|
| Saldos, envíos, actividad, precios | sí | sí |
| Genesis ID, pasaporte, importar | sí | sí |
| Cámara y escáner QR | sí | sí |
| Subir foto del pasaporte | sí | sí |
| Aviso al recibir, **app abierta** | sí | sí |
| Aviso al recibir, **app cerrada** | **no** | sí |

Lo de la app cerrada necesita trabajo en segundo plano, y ese módulo no viene
dentro de Expo Go. No es un fallo: Ajustes → Notificaciones lo indica cuando
detecta que corres en Expo Go. Para probar esa parte hace falta el APK:

```bash
eas build -p android --profile preview
```

**Importante, y esto costó un bug real:** no alcanza con no *usar*
notificaciones dentro de Expo Go — ni siquiera se puede *importar*
`expo-notifications` sin protección. Su propio `index.js` reexporta desde un
archivo con efecto al importar (`DevicePushTokenAutoRegistration.fx`) que
registra un listener de push apenas se carga el módulo, y eso hace `throw`
en Android dentro de Expo Go desde el SDK 53. La app se cerraba al abrir con
`[runtime not ready]` sin haber llamado a ninguna función de notificaciones.
`src/notify.js` ahora lo carga con `require()` diferido y solo fuera de Expo
Go — si alguna vez se vuelve a tocar ese archivo, no se puede volver a un
`import * as Notifications from 'expo-notifications'` estático arriba del
todo.

## Por qué `runtimeVersion` es `sdkVersion` y no `fingerprint`

Un update publicado con `eas update` solo se entrega a una app cuyo
`runtimeVersion` coincida. Expo Go pide siempre `exposdk:<SDK del proyecto>`,
que es lo que produce la política `sdkVersion` de `app.json`.

La política `fingerprint` produce en cambio un hash del proyecto. Es lo
correcto para un APK propio — cambia solo cuando cambia algo nativo, así que
un binario viejo nunca recibe JavaScript que no puede ejecutar. Pero Expo Go
jamás va a igualar ese hash, así que deja de recibir updates **sin ningún
mensaje de error**: el servidor simplemente contesta que no hay nada nuevo.
Eso pasó entre las builds 48 y 49, y se ve solo mirando el número de build en
Ajustes → Acerca de.

Mientras Expo Go sea donde probamos, la política se queda en `sdkVersion`.
Tiene un costo que hay que respetar:

> Con `sdkVersion`, **cualquier** APK del SDK del proyecto se considera
> compatible con **cualquier** update. Si se agrega un módulo **nativo**
> nuevo — no una pantalla, no una dependencia de JavaScript, sino algo que
> toca el binario — hay que recompilar y repartir el APK **antes** de
> publicar el update. Si no, el APK viejo se baja un JavaScript que llama a
> algo que no tiene y se cierra al abrir.
>
> Y al cambiar el SDK del proyecto (como acá), el `runtimeVersion` cambia
> también — los APK viejos dejan de recibir updates, en silencio, por el
> mismo motivo. Hay que recompilar y repartir el APK del SDK nuevo antes de
> publicar el próximo update.

Cómo saber si un cambio es nativo: si aparece o desaparece un paquete de la
lista `plugins` de `app.json`, o si `npm install` agregó una librería
`expo-*`/`react-native-*` que trae código propio, es nativo. Cambiar
pantallas, textos, estilos, llamadas a la API o lógica no lo es.

## Si algo falla

**"Project requires a newer version of Expo Go"**
Tu Expo Go es más viejo que el SDK del proyecto: actualiza Expo Go desde la tienda.

**"Project is incompatible with this version of Expo Go"**
Tu Expo Go es de otro SDK. Comprueba con `npm run verificar` qué SDK usa el
proyecto; si tu Expo Go es más nuevo, hay que subir el proyecto (o bajar
Expo Go, ver arriba).

**"Failed to download remote update" (java.io.IOException)**
Casi siempre es que abriste la URL de un update publicado (`u.expo.dev`) en
vez de usar `npx expo start`. Cambiá al método de arriba.

**Se queda cargando o no encuentra el servidor**
No estáis en la misma red. Usa `npx expo start --tunnel`.

**Errores raros después de actualizar**
```bash
npx expo start -c        # limpia la caché de Metro
```

**Cualquier otra cosa**
```bash
rm -rf node_modules package-lock.json && npm install
```
