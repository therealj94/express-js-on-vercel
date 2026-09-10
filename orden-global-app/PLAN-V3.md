# Orden Global v3 — lo que José pidió el 14-ago (segunda tanda)

## LO PRIMERO: el MyTokenPay de verdad — ENCONTRADO Y VERIFICADO

Pidió no empezar sin tener esto claro. Está claro:

- Proyecto en su Expo: **`@vetawallet/mytokenpay`**, último build **06-ago-2026**,
  Android, v1.0.0, **runtime `exposdk:54.0.0`** — el MISMO SDK que nuestra app.
  APK: `expo.dev/artifacts/eas/bdkP7kgYLdba17ezfDDYfAddzi64zffBHs8n38o_A68.apk`
- Descargado y abierto. `assets/app.config` del APK dice: expo-router, expo-font,
  expo-secure-store, expo-location, expo-image-picker, expo-camera,
  expo-local-authentication · `backgroundColor #0A0812` · paquete `com.mytokenpay.app`.
- Sus textos (bundle Hermes) traen EXACTAMENTE las mismas rutas que el código
  local `mytokenpay-app/mobile/app/`: login, registro, mi-empresa, negocio-panel,
  cobro, pagar, explorar, bonos, conectar-wallet, verificar-identidad, legal.

**Conclusión: el código local ES esa app** (local en SDK 51, su build en 54; el
resto idéntico). Se porta el código local — legible y completo — a nuestro
contenedor SDK 54. NO es un botón que abre otra app: son pantallas nativas
dentro de Orden Global.

Pantallas a portar (líneas): cobro 584 · verificar-identidad 579 · pagar 562 ·
negocio-panel 479 · panel 403 · registrar-empresa 370 · index 294 · explorar 268 ·
conectar-wallet 264 · bonos 251 · mi-empresa 235 · login 223 · notificaciones 136 ·
legal 87.

Qué NO se porta y por qué:
- `login.tsx` / `registro.tsx` / `conectar-wallet.tsx`: **Genesis ID es el login
  único**. La identidad del comercio sale de la cuenta ya abierta.
- `verificar-identidad.tsx`: lleva al KYC de Genesis que ya existe (`kyc`).
- `legal.tsx`: la app ya tiene sus legales.

## El resto del pedido

1. **Splash**: seguía saliendo Veta Wallet porque el splash NATIVO de
   `app.json` apuntaba a `assets/splash.png` (el de la wallet). YA ARREGLADO:
   `assets/splash.png` regenerado con el monograma OG sobre `#010D0E`.
2. **La G no pide micrófono y no escucha**: entraba por el teclado. Se instaló
   `expo-speech-recognition@3.1.3` (la última antes del salto a SDK 56) con su
   plugin y los textos de permiso en español. NEXUS debe: pedir permiso al
   tocarlo, escuchar de verdad, enseñar lo que oye MIENTRAS habla (parciales),
   y ejecutar al terminar.
3. **GENESIS → NEXUS** en todo (asistente, textos, voz, icono flotante).
4. **Núcleo 3D**: el tablero principal deja de ser una lista. Fondo negro con
   NEURONAS en movimiento (como el cerebro), y cada nodo grande es una app:
   **Chat · Veta Wallet · MyTokenPay · Genesis ID · Ajustes**.
   **Cobrar con QR NO va ahí** (vive dentro de MyTokenPay).
5. **Icono flotante mejor**: más tech, no una bola plana.

## Reglas que siguen vigentes
- NEXUS prepara, la persona firma. Nunca transmite dinero.
- Chat solo con Genesis ID aprobado.
- Monto y destinatario salen de la libreta/chat, jamás se inventan.
- Todo movimiento pasa por el MAPA de `src/og/rutas.js`.

## Estado
- v2 entregado (build b0174daf). OTA activo. Relevo con adjuntos en producción.
- Ya hecho en esta tanda: splash nativo OG, expo-speech-recognition instalado
  con plugin y permisos.
