# Orden Global v2 — la fusión completa (spec aprobada por José, 14-ago)

Pedido textual: misma Expo; fusionar el MyTokenPay último (el que funciona
con Genesis ID) como SECCIÓN; login solo "Orden Global"; arquitectura de
secciones (Veta Wallet y MyTokenPay son opciones del menú, las pestañas de
abajo cambian según la app en la que estás); asistente reorganizado con
estados claros (cuándo hablar / me escuchó / ejecutó), botón FLOTANTE
bonito, órdenes: «enviar mensaje a tal», «enviar tanto ORIGEN a tal»,
«hacer reporte de mi veta wallet»; chat probado, agregar persona con
Genesis ID desde otro teléfono, y mensajería tipo WhatsApp con imágenes,
videos y archivos; Genesis ID login único; rediseño primer nivel con
animaciones.

## Arquitectura de secciones (el corazón del v2)

`App.js` gana estado `seccion: 'og' | 'veta' | 'pay'`:
- TABS por sección:
  - og:   [ecosistema, chat, cobrar?, settings]  → identidad Orden Global
  - veta: [home, card, swap, activity, settings] → la wallet tal cual era
  - pay:  [pay-panel, pay-cobrar, pay-actividad] → MyTokenPay
- El hub (ecosistema) y el asistente cambian de sección: «abre veta wallet»
  → seccion 'veta'; «abre mytokenpay» → 'pay' (con candado Genesis).
- Botón/encabezado para volver a Orden Global desde cualquier sección.
- rutas.js: MAPA gana 'seccion' opcional por entrada; abrir() la aplica vía
  nav.seccion(x) que App.js provee.

## Reparto de trabajo (disjunto, para agentes en paralelo)

1. **src/og/pay/** — la sección MyTokenPay nativa (NUEVOS ficheros):
   PanelPay.js (mi negocio: nombre, ventas del día — datos del backend MTP
   si alcanza; si no, estructura con estados vacíos honestos),
   CobrarPay.js (reusa CobrarOG), ActividadPay.js (cobros recibidos =
   transfers entrantes de la wallet filtrados). Referencia de diseño:
   mytokenpay-app/mobile/app/(tabs)/*.tsx (Expo 51 — NO importar, portar).
2. **src/og/AsistenteOG.js** — el asistente flotante: burbuja dorada
   arrastrable SIEMPRE visible (reemplaza la barra fija), al tocarla abre
   hoja inferior con 4 estados visibles: ESCUCHANDO (pulso + "dime") /
   ENTENDÍ (frase + og:// + botones) / EJECUTANDO / HECHO (palomita).
   Intent nuevo 'wallet/reporte': lee en voz alta saldo + últimos
   movimientos + estado genesis (datos de useAccount + walletApi.balance) y
   los enseña en tarjeta. Frases: reporte|resumen|como va mi (billetera|
   veta wallet|cuenta)|report|summary.
   Intent 'chat/mensaje': «envía(le) un mensaje a X: hola» → abre hilo con
   texto pre-escrito (param txt en chat/abrir).
3. **Chat multimedia** — src/og/ChatOG.js + infra/mensajes/servidor.py:
   servidor: POST /subir {correo,llave,nombre,tipo,datos(base64,≤8MB)} →
   {id}; GET /archivo/<id> público (id aleatorio largo = capability URL);
   mensajes ganan {tipo:'imagen'|'video'|'archivo', archivo:id, nombre}.
   cliente: expo-image-picker (imagen/video) + expo-document-picker
   (archivo); imágenes inline (Image + tocar = pantalla completa), video y
   archivo como tarjeta que abre con Linking. Enviar = subir + mensaje.
   DEPLOY del relevo: python3 infra/mensajes/desplegar-mensajes.py
   (necesita scratchpad/aws_llaves.json).
4. **Integración App.js + login** (hacer al final, con 1-3 listos):
   secciones + tabs dinámicos, quitar "Veta Wallet" del Auth/Splash (logo
   OG + "Orden Global"; buscar strings en Auth.js/Splash.js del fork),
   FlotanteOG montado global (no solo tabs), quitar BarraOG fija.

## Reglas que no se negocian (ya vigentes)
- GENESIS prepara, la persona firma. Nunca transmite dinero.
- Chat solo con Genesis ID aprobado.
- El monto y el destinatario salen de la libreta/chat, jamás se inventan.
- Todo movimiento pasa por el MAPA de src/og/rutas.js.

## Estado al escribir esto
- Fusión v1 compilada y entregada (build a3ebf4d9). OTA activo (canal
  preview). EAS: cuenta ordenglobal, proyecto orden-global 3017e984….
- Token Expo en scratchpad/expo_token.txt (José lo revoca al final).
- Relevo del chat vivo en cerebro.ordenscan.com/mensajes (v2: buscar,
  conversaciones, leido).
- deps ya presentes: qrcode-svg, camera, secure-store, speech, updates.
  FALTAN para media: expo-image-picker, expo-document-picker (versiones
  SDK 54: ~17.x / ~14.x — verificar con npx expo install).

## Al terminar
expo export limpio → commit → eas build preview → entregar enlace. Si solo
cambió JS respecto al APK anterior: eas update --branch preview también
sirve, pero image-picker/document-picker son NATIVOS → build nuevo.
