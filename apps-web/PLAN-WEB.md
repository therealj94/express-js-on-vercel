# La web al nivel de la app · plan

## La medida del trabajo, contada

| | |
|---|---|
| Pantallas en la app | **51** |
| Vistas en la web hoy | **18** |
| Faltan | **33** |

La web tiene la billetera y sus alrededores. Le falta **todo lo demás**:

| Bloque | Pantallas | Qué es |
|---|---|---|
| **AURO CHAT** | chat · auro-grupo · auro-nuevo · auro-ajustes | mensajería, grupos, pagos en el hilo, adjuntos |
| **MyTokenPay** | pay-inicio · panel · cobro · pagar · explorar · negocio · bonos · actividad · notificaciones · negocio-panel · negocio-detalle | el negocio entero: cobrar, pagar, directorio |
| **El Núcleo** | ecosistema · lista | el tablero de neuronas que abre las apps |
| **NEXUS** | (flotante) | el asistente por voz |
| **Wallet que falta** | swap · token · seedview · privatekey · passport · watchOnly · reporte · cobrar · notifs | |
| **Entrada** | onboarding · help · about · blocked | |

## Lo que decide cómo se hace

**No todo puede viajar a la web tal cual, y conviene decirlo antes que después:**

- **NEXUS por voz**: el navegador tiene reconocimiento de voz, pero no en todos
  (Safari de iPhone es irregular). Se puede hacer con caja de texto siempre y
  micrófono cuando el navegador lo dé.
- **El lector del documento (KYC)**: en la app lo lee ML Kit nativo. En la web
  no existe. Por eso la verificación web ya funciona **sin** leer el documento:
  datos + foto + selfie, y una persona revisa.
- **Notificaciones con la app cerrada**: en web solo con permiso del navegador y
  no en iPhone salvo que se instale como aplicación. Conviene no prometerlo.
- **Sonidos y hápticos**: el navegador los da a medias. Se pueden imitar.

Todo lo demás —chat, grupos, cobros, QR, directorio, el Núcleo— **sí se puede
hacer igual de bien en web**.

## El orden que propongo

Por lo que la gente usa, no por lo que es fácil:

1. **Enviar cualquier token** (hoy la web solo manda ORIGEN). Es lo que más
   duele y es media jornada.
2. **AURO CHAT** completo. Es lo que hace comunidad.
3. **MyTokenPay**: cobrar con QR y pagar. Es lo que da dinero a los comercios.
4. **El Núcleo** como portada, con las apps.
5. **El resto de la wallet** (swap, reporte, pasaporte, observadas).
6. **NEXUS**, al final: es lo más frágil en navegador.

## Cómo debe verse

La web de hoy es **un solo fichero sin compilar** (index.html + app.js + i18n +
cadena + qr), y eso hay que conservarlo: se despliega en segundos, no tiene
dependencias que se rompan y cabe en el CDN ajeno que sirve `www`.

- **Móvil primero**: la mayoría entra desde el teléfono. Barra inferior como en
  la app, pantallas a una columna, botones grandes.
- **Escritorio**: no estirar el móvil. Dos columnas —lista a la izquierda,
  detalle a la derecha— en chat, actividad y directorio.
- **El mismo lenguaje visual que la app**: verde profundo, oro, Cinzel para los
  títulos. Que se note que es la misma casa.

## Antes de escribir una línea

Falta una decisión de José: **¿la web debe poder hacer TODO, o es el sitio donde
se mira y se cobra, y lo delicado (semilla, llave privada, borrar cuenta) se
queda solo en la app?** Lo segundo es más seguro y quita tres pantallas de
riesgo. Yo recomiendo eso.
