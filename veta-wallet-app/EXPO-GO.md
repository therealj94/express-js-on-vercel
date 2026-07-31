# Abrir Veta Wallet en Expo Go

Veta Wallet usa el **SDK 54 de Expo**. Expo Go de la tienda solo abre
proyectos del SDK más reciente: si el proyecto se queda atrás, el teléfono
contesta con un error de versión y no hay forma de probarlo ahí. Por eso el
proyecto se mantiene al día.

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

1. Instala **Expo Go** desde Play Store o App Store. Tiene que ser la versión
   actual de la tienda — si la tuya es vieja, actualízala.
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

## Por qué `runtimeVersion` es `sdkVersion` y no `fingerprint`

Un update publicado con `eas update` solo se entrega a una app cuyo
`runtimeVersion` coincida. Expo Go pide siempre `exposdk:54.0.0`, que es lo
que produce la política `sdkVersion` de `app.json`.

La política `fingerprint` produce en cambio un hash del proyecto. Es lo
correcto para un APK propio — cambia solo cuando cambia algo nativo, así que
un binario viejo nunca recibe JavaScript que no puede ejecutar. Pero Expo Go
jamás va a igualar ese hash, así que deja de recibir updates **sin ningún
mensaje de error**: el servidor simplemente contesta que no hay nada nuevo.
Eso pasó entre las builds 48 y 49, y se ve solo mirando el número de build en
Ajustes → Acerca de.

Mientras Expo Go sea donde probamos, la política se queda en `sdkVersion`.
Tiene un costo que hay que respetar:

> Con `sdkVersion`, **cualquier** APK del SDK 54 se considera compatible con
> **cualquier** update. Si se agrega un módulo **nativo** nuevo — no una
> pantalla, no una dependencia de JavaScript, sino algo que toca el binario —
> hay que recompilar y repartir el APK **antes** de publicar el update. Si no,
> el APK viejo se baja un JavaScript que llama a algo que no tiene y se cierra
> al abrir.

Cómo saber si un cambio es nativo: si aparece o desaparece un paquete de la
lista `plugins` de `app.json`, o si `npm install` agregó una librería
`expo-*`/`react-native-*` que trae código propio, es nativo. Cambiar
pantallas, textos, estilos, llamadas a la API o lógica no lo es.

## Si algo falla

**"Project requires a newer version of Expo Go"**
Tu Expo Go es más viejo que el SDK del proyecto: actualiza Expo Go desde la tienda.

**"Project is incompatible with this version of Expo Go"**
Tu Expo Go es de otro SDK. Comprueba con `npm run verificar` qué SDK usa el
proyecto; si tu Expo Go es más nuevo, hay que subir el proyecto.

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
