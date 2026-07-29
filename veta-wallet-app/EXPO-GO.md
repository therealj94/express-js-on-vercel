# Abrir Veta Wallet en Expo Go

Veta Wallet usa el **SDK 57 de Expo**. Expo Go de la tienda solo abre
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

## Si algo falla

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
